/**
 * merge-resolution.mjs — single-shot AI utility for generating a three-way
 * merge proposal from conflicting artifact revisions.
 *
 * Advisory only: the caller must present the result to the user for explicit
 * approval before any disk write occurs.
 */

import { createStreamWithTools } from '../api-clients/ai-provider.mjs'
import { isAbortError } from '../utils/abort-error.mjs'
import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'

const MAX_CONTENT_BYTES = 100_000
const SOFT_CONTENT_BYTES = 30_000

const MERGE_SYSTEM_PROMPT = [
  'You are a precise code merge assistant.',
  'You receive three versions of a file: a BASE (common ancestor), OURS (this thread\'s write), and THEIRS (another thread\'s write).',
  'Your task is to produce a single merged version that incorporates both sets of changes cleanly.',
  '',
  'Rules:',
  '1. Preserve the intent of both OURS and THEIRS changes relative to BASE.',
  '2. When changes overlap on the same lines, combine them logically if possible. If they are irreconcilable, include both with a clear inline comment marking the conflict region.',
  '3. Do NOT invent new code, remove unrelated lines, or reformat beyond what is necessary for the merge.',
  '4. Output the complete merged file content inside a single fenced code block (```). Do not include partial snippets.',
  '5. After the code block, add one sentence explaining what you merged and any unresolved conflict regions.',
].join('\n')

const MERGE_SYSTEM_PROMPT_NO_BASE = [
  'You are a precise code merge assistant.',
  'Two threads independently created the same file. You receive OURS and THEIRS — two independent versions with no common ancestor.',
  'Your task is to produce a single reconciled version that incorporates both contributions cleanly.',
  '',
  'Rules:',
  '1. Preserve the intent of both versions.',
  '2. When content overlaps or conflicts, combine logically. If irreconcilable, include both with a clear inline comment.',
  '3. Do NOT invent new code, remove unrelated content, or reformat beyond what is necessary.',
  '4. Output the complete reconciled file content inside a single fenced code block (```). Do not include partial snippets.',
  '5. After the code block, add one sentence explaining how you reconciled the two versions.',
].join('\n')

function buildMergePrompt(baseContent, oursContent, theirsContent, filePath) {
  const hasBase = typeof baseContent === 'string' && baseContent.length > 0
  const header = `File: ${filePath}\n`

  if (hasBase) {
    return [
      header,
      '=== BASE (common ancestor) ===',
      '```',
      baseContent,
      '```',
      '',
      '=== OURS (this thread\'s write) ===',
      '```',
      oursContent,
      '```',
      '',
      '=== THEIRS (another thread\'s write) ===',
      '```',
      theirsContent,
      '```',
      '',
      'Produce the merged file.',
    ].join('\n')
  }

  return [
    header,
    '=== OURS (first version) ===',
    '```',
    oursContent,
    '```',
    '',
    '=== THEIRS (second version) ===',
    '```',
    theirsContent,
    '```',
    '',
    'Reconcile these two independently created versions into one file.',
  ].join('\n')
}

/**
 * Extract the merged file content from the AI response text.
 *
 * The AI is instructed to wrap the entire file in a single fenced code block.
 * A naive non-greedy regex fails when the file itself contains fenced blocks
 * (e.g. Markdown with embedded code examples).  Instead, we match the first
 * opening fence and the *last* closing fence in the response, which encloses
 * the complete file even if it has inner ``` sequences.
 *
 * Returns the inner content or null if no block is found.
 */
function extractCodeBlock(text) {
  const raw = String(text ?? '')
  // Find the first opening fence: ```<optional-lang>\n
  const openMatch = raw.match(/```[^\n]*\n/)
  if (!openMatch) return null
  const contentStart = openMatch.index + openMatch[0].length

  // Find the last closing fence (``` at the start of a line or after a newline)
  const lastFenceIdx = raw.lastIndexOf('```')
  if (lastFenceIdx < 0 || lastFenceIdx <= openMatch.index) return null

  const content = raw.slice(contentStart, lastFenceIdx)
  // Guard: if we got nothing meaningful, fall back to null
  if (content.length === 0 && raw.trim().length > 0) return null
  return content
}

/**
 * Extract the explanation text that follows the last code block.
 */
function extractExplanation(text) {
  const raw = String(text ?? '')
  const lastClose = raw.lastIndexOf('```')
  if (lastClose < 0) return ''
  return raw.slice(lastClose + 3).trim()
}

/**
 * Check if any content block exceeds the hard byte limit.
 */
export function checkContentSize(baseContent, oursContent, theirsContent) {
  const sizes = [
    { label: 'base', bytes: Buffer.byteLength(String(baseContent ?? ''), 'utf8') },
    { label: 'ours', bytes: Buffer.byteLength(String(oursContent ?? ''), 'utf8') },
    { label: 'theirs', bytes: Buffer.byteLength(String(theirsContent ?? ''), 'utf8') },
  ]
  const exceedsHard = sizes.some((s) => s.bytes > MAX_CONTENT_BYTES)
  const exceedsSoft = sizes.some((s) => s.bytes > SOFT_CONTENT_BYTES)
  const totalBytes = sizes.reduce((sum, s) => sum + s.bytes, 0)
  return { exceedsHard, exceedsSoft, totalBytes, sizes }
}

/**
 * Generate a three-way merge proposal using a single-shot AI call.
 *
 * Returns:
 *   { ok: true, mergedContent: string, explanation: string }
 *   { ok: false, error: string }
 */
export async function generateMergeProposal({
  baseContent = '',
  oursContent = '',
  theirsContent = '',
  filePath = '',
  providerId = '',
  apiKey = '',
  model = '',
  abortSignal = null,
} = {}) {
  // --- Guard: provider must be configured ---------------------------------
  if (!providerId || !model) {
    return { ok: false, error: 'No AI provider or model configured.' }
  }
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const openAIExecutionAuth = normalizedProviderId === 'openai'
    ? resolveOpenAIExecutionAuth({ apiKey })
    : null
  const resolvedApiKey = normalizedProviderId === 'openai'
    ? String(openAIExecutionAuth?.apiKey || '')
    : String(apiKey || '')
    if (normalizedProviderId === 'openai' && openAIExecutionAuth?.ok !== true) {
      return {
        ok: false,
        error: String(
          openAIExecutionAuth?.userFacingBlockedMessage
          || openAIExecutionAuth?.blockedMessage
          || 'OpenAI authentication is unavailable for merge resolution.',
        ),
      }
    }
  if (!resolvedApiKey) {
    return { ok: false, error: 'No API key available for the selected provider.' }
  }

  // --- Guard: abort -------------------------------------------------------
  if (abortSignal?.aborted) {
    return { ok: false, error: 'Operation cancelled.' }
  }

  // --- Guard: identical content shortcut ----------------------------------
  if (oursContent === theirsContent) {
    return {
      ok: true,
      mergedContent: oursContent,
      explanation: 'Both changes are identical — no merge needed.',
    }
  }

  // --- Guard: file size ---------------------------------------------------
  const sizeCheck = checkContentSize(baseContent, oursContent, theirsContent)
  if (sizeCheck.exceedsHard) {
    return { ok: false, error: `File too large for AI merge (${Math.round(sizeCheck.totalBytes / 1024)}KB total). Resolve manually.` }
  }

  // --- Build prompt -------------------------------------------------------
  const hasBase = typeof baseContent === 'string' && baseContent.length > 0
  const systemPrompt = hasBase ? MERGE_SYSTEM_PROMPT : MERGE_SYSTEM_PROMPT_NO_BASE
  const userPrompt = buildMergePrompt(baseContent, oursContent, theirsContent, filePath)

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  // --- AI call ------------------------------------------------------------
  try {
    const result = await createStreamWithTools(
      providerId,
      resolvedApiKey,
      messages,
      { model, tools: {}, abortSignal },
      () => { },
      () => { },
    )

    if (abortSignal?.aborted) {
      return { ok: false, error: 'Operation cancelled.' }
    }

    const responseText = String(result?.text ?? '').trim()
    if (!responseText) {
      return { ok: false, error: 'AI returned an empty response.' }
    }

    // --- Parse response ---------------------------------------------------
    const mergedContent = extractCodeBlock(responseText)
    if (mergedContent == null) {
      return { ok: false, error: 'Could not parse merge result — no code block found in AI response.' }
    }

    const explanation = extractExplanation(responseText) || 'Merge completed.'

    return { ok: true, mergedContent, explanation }
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, error: 'Operation cancelled.' }
    }
    const message = String(err?.message || 'Unknown error').slice(0, 300)
    return { ok: false, error: `AI merge failed: ${message}` }
  }
}

// Exported for testing
export { buildMergePrompt, extractCodeBlock, extractExplanation }
export { MAX_CONTENT_BYTES, SOFT_CONTENT_BYTES }
