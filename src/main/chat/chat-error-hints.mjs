import {
  getProviderErrorStatusCode,
  getProviderRetryAfterSeconds,
  isProviderQuotaExceededError,
} from '../api-clients/provider-policy.mjs'

import { formatRuntimeDiagnosticsDetail } from './chat-runtime-diagnostics.mjs'

const GENERIC_PROVIDER_ERROR_PATTERNS = [
  /\bno output generated\b/i,
  /\bcheck the stream for errors\b/i,
  /^\s*request failed\.?\s*$/i,
  /^\s*unknown error\.?\s*$/i,
  /^\s*provider[_\s-]?error\.?\s*$/i,
  /^\s*error\.?\s*$/i,
]

function sanitizeErrorMessage(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.length > 4000 ? `${text.slice(0, 4000)}...` : text
}

function parseStructuredErrorMessage(raw) {
  if (!raw) return ''
  const source = typeof raw === 'string' ? raw : ''
  const trimmed = source.trim()
  if (!trimmed) return ''
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return ''
  try {
    const parsed = JSON.parse(trimmed)
    return sanitizeErrorMessage(
      parsed?.error?.message
      || parsed?.message
      || parsed?.error_description
      || '',
    )
  } catch {
    return ''
  }
}

function appendUniqueMessage(target, value) {
  const message = sanitizeErrorMessage(value)
  if (!message) return
  const normalized = message.toLowerCase()
  if (target._seen.has(normalized)) return
  target._seen.add(normalized)
  target.items.push(message)
}

function collectNestedProviderMessages(err, target, depth = 0) {
  if (!err || depth > 4) return
  if (typeof err !== 'object') {
    appendUniqueMessage(target, err)
    return
  }
  if (target._visited.has(err)) return
  target._visited.add(err)

  appendUniqueMessage(target, err?.data?.error?.message)
  appendUniqueMessage(target, err?.message)
  appendUniqueMessage(target, parseStructuredErrorMessage(err?.responseBody))

  const nestedErrors = Array.isArray(err?.errors) ? err.errors : []
  for (const item of nestedErrors.slice(0, 6)) {
    collectNestedProviderMessages(item, target, depth + 1)
  }
  collectNestedProviderMessages(err?.lastError, target, depth + 1)
  collectNestedProviderMessages(err?.cause, target, depth + 1)
}

function isGenericProviderMessage(message = '') {
  const text = String(message || '').trim()
  if (!text) return true
  return GENERIC_PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

function flattenProviderErrorText(err) {
  return [
    err?.message,
    err?.data?.error?.message,
    err?.responseBody,
    err?.cause?.message,
    err?.cause?.data?.error?.message,
    err?.cause?.responseBody,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n')
}

function collectHeaderEntries(headers = null) {
  if (!headers || typeof headers !== 'object') return []
  if (typeof headers.forEach === 'function') {
    const entries = []
    try {
      headers.forEach((value, key) => {
        entries.push([key, value])
      })
      return entries
    } catch {
      return []
    }
  }
  return Object.entries(headers)
}

function normalizeHeadersMap(headers = null) {
  const out = {}
  for (const [rawKey, rawValue] of collectHeaderEntries(headers)) {
    const key = String(rawKey || '').trim().toLowerCase()
    if (!key) continue
    out[key] = Array.isArray(rawValue) ? String(rawValue[0] || '') : String(rawValue || '')
  }
  return out
}

function getProviderErrorHeaders(err = null) {
  const headers = {}
  for (const source of [
    err?.responseHeaders,
    err?.headers,
    err?.response?.headers,
    err?.cause?.responseHeaders,
    err?.cause?.headers,
    err?.cause?.response?.headers,
  ]) {
    Object.assign(headers, normalizeHeadersMap(source))
  }
  return headers
}

function normalizeHeaderInteger(value = '') {
  const n = Number(String(value || '').trim())
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0
}

function extractAnthropicRateLimitHeaderDetails(err = null) {
  const headers = getProviderErrorHeaders(err)
  const inputTokenLimit = normalizeHeaderInteger(
    headers['anthropic-ratelimit-input-tokens-limit']
    || headers['anthropic-ratelimit-tokens-limit'],
  )
  const inputTokensRemaining = normalizeHeaderInteger(
    headers['anthropic-ratelimit-input-tokens-remaining']
    || headers['anthropic-ratelimit-tokens-remaining'],
  )
  const retryAfterSeconds = getProviderRetryAfterSeconds(err)
  return {
    inputTokenLimit,
    inputTokensRemaining,
    retryAfterSeconds,
  }
}

function formatAnthropicRateLimitHeaderHint(err = null) {
  const {
    inputTokenLimit,
    inputTokensRemaining,
    retryAfterSeconds,
  } = extractAnthropicRateLimitHeaderDetails(err)
  const parts = []
  if (inputTokenLimit > 0) parts.push(`input-token limit ${inputTokenLimit}`)
  if (inputTokensRemaining > 0 || inputTokenLimit > 0) parts.push(`remaining input tokens ${inputTokensRemaining}`)
  if (retryAfterSeconds > 0) parts.push(`retry in about ${retryAfterSeconds}s`)
  return parts.length > 0 ? ` Anthropic rate-limit headers: ${parts.join(', ')}.` : ''
}

/**
 * Walk the error cause chain to find the deepest non-generic message.
 * Returns the first meaningful message from a nested cause, or '' if
 * only generic / "no output generated" messages are found.
 */
function extractNestedRootCauseMessage(err) {
  const seen = new Set()
  let current = err
  const candidates = []
  while (current && !seen.has(current)) {
    seen.add(current)
    // Check data.error.message first (provider-structured error bodies)
    const dataMsg = String(current?.data?.error?.message ?? '').trim()
    if (dataMsg && !isGenericProviderMessage(dataMsg) && !/no output generated/i.test(dataMsg)) {
      candidates.push(dataMsg)
    }
    const msg = String(current?.message ?? '').trim()
    if (msg && !isGenericProviderMessage(msg) && !/no output generated/i.test(msg)) {
      candidates.push(msg)
    }
    current = current?.cause
  }
  // Return the deepest (most specific) candidate, trimmed
  const best = candidates.length > 0 ? candidates[candidates.length - 1] : ''
  if (!best) return ''
  const firstLine = best.split('\n').map((l) => l.trim()).find(Boolean) || best
  return firstLine.length > 400 ? `${firstLine.slice(0, 400)}...` : firstLine
}

export function extractProviderErrorDetail(err) {
  const target = {
    items: [],
    _seen: new Set(),
    _visited: new Set(),
  }
  collectNestedProviderMessages(err, target)
  for (const message of target.items) {
    if (!isGenericProviderMessage(message)) return message
  }
  return target.items[0] || ''
}

export function resolveRunbookErrorDetailMode(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {}
  const commandSafety = source.commandSafety && typeof source.commandSafety === 'object'
    ? source.commandSafety
    : source
  return commandSafety.showDeveloperOptions === true ? 'advanced' : 'basic'
}

function normalizePositiveInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

function asHeadline(value, fallback = 'No output generated.') {
  const first = String(value || '')
    .split('\n')
    .map((line) => String(line || '').trim())
    .find(Boolean) || ''
  return first || fallback
}

function classifyProviderErrorCategory(err, providerDetail = '', summarizedMessage = '', diagnostics = {}) {
  const extractionAttempted = diagnostics?.conversion_attempted === true
  const extractionFailed = (
    Number(diagnostics?.failed_count || 0) > 0
    || String(diagnostics?.failure_reason_code || '').trim().length > 0
    || String(diagnostics?.failure_message_sanitized || '').trim().length > 0
  )
  if (extractionAttempted && extractionFailed) {
    return 'attachment_extraction'
  }
  const text = [
    flattenProviderErrorText(err),
    providerDetail,
    summarizedMessage,
  ].join('\n').toLowerCase()
  if (err?.localPromptBudgetBlocked === true || String(err?.code || '').trim().toLowerCase() === 'prompt_budget_hard_limit_exceeded') {
    return 'local_prompt_budget'
  }
  if (!text) return 'generic'
  if (
    text.includes('tool choice is none')
    && text.includes('model called a tool')
  ) {
    return 'tool_choice_none_model_called_tool'
  }
  if (
    isProviderQuotaExceededError(err)
    || text.includes('rate limit')
    || text.includes('tokens per minute')
    || text.includes('requests per minute')
  ) {
    return 'rate_limit'
  }
  if (
    text.includes('messages[')
    && text.includes('content must be a string')
  ) {
    return 'payload_shape'
  }
  if (text.includes('no output generated')) return 'no_output'
  return 'generic'
}

function buildCategoryExplanation(category) {
  switch (category) {
    case 'attachment_extraction':
      return 'Local attachment text extraction fallback failed before model call.'
    case 'local_prompt_budget':
      return 'ADDOM blocked this request locally because the estimated prompt would exceed the provider/profile input budget.'
    case 'rate_limit':
      return 'Provider quota/rate limits rejected this request.'
    case 'payload_shape':
      return 'Provider rejected this request payload shape for the selected endpoint/model.'
    case 'tool_choice_none_model_called_tool':
      return 'This turn entered a no-tools request path, but the model still attempted a tool call.'
    case 'no_output':
      return 'The provider returned no assistant text for this turn.'
    default:
      return 'The provider request failed before producing assistant output.'
  }
}

function buildCategoryNextSteps(category, { retryAfterSeconds = 0, nextActionHint = '' } = {}) {
  const retryHint = retryAfterSeconds > 0
    ? `Wait about ${retryAfterSeconds}s and retry.`
    : 'Retry once.'
  switch (category) {
    case 'attachment_extraction':
      return [
        nextActionHint || 'Verify local MarkItDown runtime is installed and ready if fallback extraction is enabled.',
        'Remove unsupported file attachments from this turn or switch to a model/provider with native file support.',
        'Retry once after adjusting attachments/runtime setup.',
      ]
    case 'local_prompt_budget':
      return [
        'Start a fresh thread or ask to summarize older context before retrying.',
        'Remove or reduce old tool-heavy results, attachments, memory, or continuity context.',
        'Use fewer active tool families for this turn or switch to a provider/profile with a larger input budget.',
      ]
    case 'rate_limit':
      return [
        retryHint,
        'Reduce request size: shorter thread context, fewer attachments, fewer tool-heavy turns.',
        'Switch model/provider or increase provider quota/billing.',
      ]
    case 'payload_shape':
      return [
        'Keep this turn as plain text only (remove non-text content parts/attachments).',
        'Start a fresh thread if the current thread carries incompatible content history.',
        'Switch to a provider/model endpoint that supports your attachment/content type.',
      ]
    case 'tool_choice_none_model_called_tool':
      return [
        'Retry once.',
        'If it repeats, start a fresh thread (current thread likely has incompatible tool-call state).',
        'For plain-text requests, temporarily avoid tool-heavy workflows on this provider/model.',
      ]
    case 'no_output':
      return [
        retryHint,
        'Start a fresh thread if this model keeps returning no output in the current thread.',
        'Switch model/provider if repeats persist.',
      ]
    default:
      return [
        retryHint,
        'Check provider key/billing/model availability and retry.',
      ]
  }
}

function buildDiagnosticLines({
  providerId = '',
  model = '',
  retryAfterSeconds = 0,
  diagnostics = {},
} = {}) {
  const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}
  const runtimeDiagnostics = { ...source }
  if (providerId) runtimeDiagnostics.providerId = providerId
  if (model) runtimeDiagnostics.model = model

  const lines = formatRuntimeDiagnosticsDetail(runtimeDiagnostics)
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
  const mode = String(source.mode || '').trim().toLowerCase()
  if (mode) lines.push(`mode: ${mode}`)
  const round = normalizePositiveInt(source.round)
  if (round > 0) lines.push(`round: ${round}`)
  const historyCount = normalizePositiveInt(source.historyMessageCount)
  if (historyCount > 0) lines.push(`history_messages: ${historyCount}`)
  const preCall = normalizePositiveInt(source.preCallOccupancyEstimateTokens)
  if (preCall > 0) lines.push(`pre_call_occupancy_tokens: ${preCall}`)
  const prompt = normalizePositiveInt(source.promptOccupancyEstimateTokens)
  if (prompt > 0) lines.push(`prompt_occupancy_tokens: ${prompt}`)
  const rolling = normalizePositiveInt(source.rollingTotalTokens)
  if (rolling > 0) lines.push(`turn_rolling_tokens: ${rolling}`)
  const packetTokens = normalizePositiveInt(source.continuityPacketTokens)
  const sourceRefs = normalizePositiveInt(source.continuitySourceRefs)
  if (packetTokens > 0 || sourceRefs > 0) {
    lines.push(`continuity_packet_tokens_refs: ${packetTokens}/${sourceRefs}`)
  }
  if (normalizePositiveInt(retryAfterSeconds) > 0) {
    lines.push(`provider_retry_after_s: ${normalizePositiveInt(retryAfterSeconds)}`)
  }
  if (source.conversion_attempted === true) {
    lines.push('conversion_attempted: true')
    lines.push(`converted_count: ${normalizePositiveInt(source.converted_count)}`)
    lines.push(`skipped_count: ${normalizePositiveInt(source.skipped_count)}`)
    lines.push(`failed_count: ${normalizePositiveInt(source.failed_count)}`)
    const reasonCode = String(source.failure_reason_code || '').trim()
    if (reasonCode) lines.push(`failure_reason_code: ${reasonCode}`)
    const failureMessage = sanitizeErrorMessage(source.failure_message_sanitized || '')
    if (failureMessage) lines.push(`failure_message_sanitized: ${failureMessage}`)
    const nextHint = sanitizeErrorMessage(source.next_action_hint || '')
    if (nextHint) lines.push(`next_action_hint: ${nextHint}`)
  }
  return lines
}

export function buildRunbookErrorReason({
  err = null,
  providerId = '',
  model = '',
  summarizedMessage = '',
  providerDetail = '',
  detailMode = 'advanced',
  diagnostics = {},
} = {}) {
  const detail = sanitizeErrorMessage(providerDetail || '')
  const summary = sanitizeErrorMessage(summarizedMessage || '')
  const diagnosticsInput = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}
  const category = classifyProviderErrorCategory(err, detail, summary, diagnosticsInput)
  const retryAfterSeconds = getProviderRetryAfterSeconds(err)
  const nextActionHint = sanitizeErrorMessage(diagnosticsInput.next_action_hint || '')
  const explanation = buildCategoryExplanation(category)
  const nextSteps = buildCategoryNextSteps(category, { retryAfterSeconds, nextActionHint })
  const diagnosticLines = buildDiagnosticLines({
    providerId,
    model,
    retryAfterSeconds,
    diagnostics: diagnosticsInput,
  })
  const headline = asHeadline(summary, 'No output generated.')
  const compactMode = String(detailMode || '').trim().toLowerCase() === 'basic'

  if (compactMode) {
    return [
      `Error: ${headline}`,
      `Why it failed: ${explanation}`,
      'What to do next:',
      ...nextSteps.slice(0, 3).map((step, index) => `${index + 1}. ${step}`),
    ].filter(Boolean).join('\n')
  }

  return [
    `Error: ${headline}`,
    detail ? `Provider detail: ${detail}` : '',
    `Why it failed: ${explanation}`,
    'What to do next:',
    ...nextSteps.map((step, index) => `${index + 1}. ${step}`),
    diagnosticLines.length > 0 ? 'Diagnostics:' : '',
    ...diagnosticLines.map((line) => `- ${line}`),
  ].filter(Boolean).join('\n')
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) return m
  }
  return null
}

function normalizeDependencyName(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const name = raw.replace(/^['"`]+|['"`]+$/g, '')
  if (!name) return ''
  if (name.startsWith('.') || name.startsWith('/') || /^[A-Za-z]:[\\/]/.test(name)) return ''
  if (name.length > 120) return ''
  return name
}

export function buildMissingDependencyInstallHint(toolInput, err) {
  const errorText = String(err?.message ?? '')
  if (!errorText) return ''

  const missingCommandMatch = firstMatch(errorText, [
    /(?:'|")?([A-Za-z0-9_.:-]+)(?:'|")?\s+is not recognized as an internal or external command/i,
    /(?:'|")?([A-Za-z0-9_.:-]+)(?:'|")?\s+is not recognized as the name of a cmdlet/i,
    /(?:^|\n)\s*([A-Za-z0-9_.:-]+):\s+command not found\b/i,
    /\bcommand not found:\s*([A-Za-z0-9_.:-]+)/i,
  ])
  const missingNodeModuleMatch = firstMatch(errorText, [
    /cannot find module\s+['"`]([^'"`]+)['"`]/i,
    /cannot find package\s+['"`]([^'"`]+)['"`]/i,
    /err_module_not_found[\s\S]*?['"`]([^'"`]+)['"`]/i,
  ])
  const missingPythonModuleMatch = firstMatch(errorText, [
    /modulenotfounderror:\s+no module named\s+['"`]([^'"`]+)['"`]/i,
    /no module named\s+['"`]([^'"`]+)['"`]/i,
  ])

  let ecosystem = ''
  let depName = ''

  if (missingPythonModuleMatch) {
    ecosystem = 'python'
    depName = normalizeDependencyName(missingPythonModuleMatch[1])
  } else if (missingNodeModuleMatch) {
    ecosystem = 'node'
    depName = normalizeDependencyName(missingNodeModuleMatch[1])
  } else if (missingCommandMatch) {
    depName = normalizeDependencyName(missingCommandMatch[1])
    const attempted = String(toolInput?.command ?? '').trim().toLowerCase()
    if (
      attempted.startsWith('python ')
      || attempted.startsWith('python3 ')
      || attempted.startsWith('py ')
      || attempted.startsWith('pip ')
      || attempted.startsWith('uv ')
      || attempted.startsWith('poetry ')
    ) {
      ecosystem = 'python'
    } else if (attempted.startsWith('node ') || attempted.startsWith('npm ') || attempted.startsWith('npx ') || attempted.startsWith('pnpm ') || attempted.startsWith('yarn ') || attempted.startsWith('bun ')) {
      ecosystem = 'node'
    }
  } else {
    return ''
  }

  const attemptedCommand = String(toolInput?.command ?? '').trim()
  const installCmd = ecosystem === 'python'
    ? `python -m pip install ${depName || '<package>'}`
    : ecosystem === 'node'
      ? `npm install ${depName || '<package>'}`
      : 'the appropriate package manager command'

  return [
    'Potential missing dependency/module detected.',
    'Ask the user whether they want ADDOM to install it before running any install command.',
    `If approved, install it (for example: \`${installCmd}\`) and retry \`${attemptedCommand || 'the original command'}\`.`,
  ].join(' ')
}

export function withModelSelectionHint(message, providerId, model) {
  const base = String(message ?? '').trim()
  if (!base) return base

  const looksModelSelectionIssue = /\b(?:unknown|invalid|unsupported|unavailable)\s+model\b|\bmodel\b.{0,80}\b(?:not found|does not exist|unknown|invalid|unsupported|unavailable|not available)\b/i.test(base)
  if (!looksModelSelectionIssue) return base

  const safeProvider = String(providerId ?? '').trim() || 'selected provider'
  const safeModel = String(model ?? '').trim() || 'selected model'
  return [
    base,
    '',
    `Hint: The selected model "${safeModel}" may be unavailable for ${safeProvider}.`,
    'Refresh curated provider/model options and select an available model, then retry.',
  ].join('\n')
}

export function withAttachmentSupportHint(message, providerId, model) {
  const base = String(message ?? '').trim()
  if (!base) return base

  const text = base.toLowerCase()
  const looksAttachmentIssue = (
    text.includes('unable to process input image')
    || text.includes('unsupported mime')
    || (text.includes('file') && text.includes('not supported'))
    || (text.includes('pdf') && (text.includes('not supported') || text.includes('unsupported') || text.includes('invalid_argument')))
  )
  if (!looksAttachmentIssue) return base

  const safeProvider = String(providerId ?? '').trim() || 'selected provider'
  const safeModel = String(model ?? '').trim() || 'selected model'
  return [
    base,
    '',
    `Hint: "${safeModel}" on ${safeProvider} may not accept PDF/file attachments for this endpoint.`,
    'Try a model/provider with document support (or remove PDF attachments) and retry.',
  ].join('\n')
}

export function formatProviderErrorForUser(err, providerId = '', model = '') {
  const provider = String(providerId ?? '').trim().toLowerCase()
  const modelId = String(model ?? '').trim()
  const raw = String(err?.message ?? err ?? '').trim()
  const flattened = flattenProviderErrorText(err)
  const normalized = String(flattened || raw).toLowerCase()
  if (!raw) return 'Request failed.'

  if (err?.localPromptBudgetBlocked === true || String(err?.code || '').trim().toLowerCase() === 'prompt_budget_hard_limit_exceeded') {
    return raw
  }

  const statusCode = getProviderErrorStatusCode(err)
  const looksRateLimited = (
    statusCode === 429
    || normalized.includes('rate limit')
    || normalized.includes('tokens per minute')
    || normalized.includes('too many requests')
    || isProviderQuotaExceededError(err)
  )
  if (looksRateLimited) {
    const retryAfterSeconds = getProviderRetryAfterSeconds(err)
    const retryHint = retryAfterSeconds > 0
      ? ` Retry in about ${retryAfterSeconds}s.`
      : ''
    const scopedTarget = modelId
      ? `${provider || 'selected provider'}/${modelId}`
      : (provider || 'selected provider')
    const anthropicHeaderHint = provider === 'anthropic'
      ? formatAnthropicRateLimitHeaderHint(err)
      : ''
    return [
      `Quota or rate limit reached for ${scopedTarget}.`,
      anthropicHeaderHint,
      `${retryHint} Reduce prompt size, switch model/provider, or update quota/billing for this provider.`,
    ].join('')
  }

  const contentShapeIssue = (
    /messages\[\d+\]\.content must be a string/i.test(flattened)
    || (normalized.includes('content must be a string') && normalized.includes('messages['))
  )
  if (contentShapeIssue) {
    const scopedTarget = modelId
      ? `${provider || 'selected provider'}/${modelId}`
      : (provider || 'selected provider')
    return [
      `Request format rejected by ${scopedTarget}: message content must be plain text for this endpoint.`,
      'Remove non-text attachments/content parts from this turn (or start a fresh thread) or switch to a model/provider with multimodal content support.',
    ].join(' ')
  }

  // Detect authentication / API-key errors — these may be nested inside a
  // generic "no output generated" wrapper from the AI SDK, so check the full
  // flattened text (which includes cause chains) before the generic branch.
  const isAuthError = (
    /\b(invalid.api.key|incorrect.api.key|unauthorized|authentication|401)\b/i.test(normalized)
    || Number(err?.statusCode || err?.status || 0) === 401
  )
  if (isAuthError) {
    const scopedTarget = modelId
      ? `${provider || 'selected provider'}/${modelId}`
      : (provider || 'selected provider')
    return `Authentication failed for ${scopedTarget}. Check that your API key is correct and active.`
  }

  if (normalized.includes('no output generated')) {
    // Try to extract the original root-cause error from the cause chain so the
    // user sees a meaningful message instead of the generic "No output was returned"
    // wrapper that the AI SDK produces.
    const rootCause = extractNestedRootCauseMessage(err)
    const scopedTarget = modelId
      ? `${provider || 'selected provider'}/${modelId}`
      : (provider || 'selected provider')
    if (rootCause) {
      return `Error from ${scopedTarget}: ${rootCause}`
    }
    return [
      `No output was returned by ${scopedTarget}.`,
      'Retry once. If this keeps happening, start a fresh thread or switch model/provider.',
    ].join(' ')
  }

  const firstLine = raw.split('\n').map((line) => String(line || '').trim()).find(Boolean) || raw
  return firstLine.length > 900 ? `${firstLine.slice(0, 900)}...` : firstLine
}
