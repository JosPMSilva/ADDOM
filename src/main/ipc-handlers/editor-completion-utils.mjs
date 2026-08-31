const MAX_PROVIDER_ID_CHARS = 64
const MAX_MODEL_ID_CHARS = 180
const MAX_FILE_PATH_CHARS = 512
const MAX_LANGUAGE_ID_CHARS = 64
const MAX_PREFIX_CHARS = 4_000
const MAX_SUFFIX_CHARS = 1_200
const MAX_INSERT_CHARS = 900
const NULL_CHAR = String.fromCharCode(0)

const LOCAL_PROVIDER_IDS = new Set(['ollama', 'lmstudio'])

function clampString(value, maxChars) {
  return String(value ?? '').slice(0, Math.max(0, Number(maxChars || 0) || 0))
}

function normalizeLineEndings(text = '') {
  return String(text || '').replace(/\r\n?/g, '\n')
}

function stripCodeFenceWrappers(text = '') {
  let next = String(text || '')
  next = next.replace(/^\s*```[a-z0-9_-]*\s*\n?/i, '')
  next = next.replace(/\n?\s*```\s*$/i, '')
  return next
}

function trimRepeatedPrefixTail(text = '', prefix = '') {
  const normalizedText = String(text || '')
  const normalizedPrefix = String(prefix || '')
  if (!normalizedText || !normalizedPrefix) return normalizedText

  const tailWindow = Math.min(160, normalizedPrefix.length)
  const prefixTail = normalizedPrefix.slice(normalizedPrefix.length - tailWindow)
  if (!prefixTail) return normalizedText
  if (!normalizedText.startsWith(prefixTail)) return normalizedText
  return normalizedText.slice(prefixTail.length)
}

function trimRepeatedSuffix(text = '', suffix = '') {
  const normalizedText = String(text || '')
  const normalizedSuffix = String(suffix || '')
  if (!normalizedText || !normalizedSuffix) return normalizedText
  if (!normalizedText.endsWith(normalizedSuffix)) return normalizedText
  return normalizedText.slice(0, normalizedText.length - normalizedSuffix.length)
}

export function isLocalProviderId(providerId = '') {
  return LOCAL_PROVIDER_IDS.has(String(providerId || '').trim().toLowerCase())
}

export function normalizeInlineCompletionPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const providerId = clampString(String(source.providerId || '').trim().toLowerCase(), MAX_PROVIDER_ID_CHARS)
  const model = clampString(String(source.model || '').trim(), MAX_MODEL_ID_CHARS)
  const project = String(source.project || '').trim()
  const filePath = clampString(String(source.filePath || '').trim(), MAX_FILE_PATH_CHARS)
  const language = clampString(String(source.language || '').trim().toLowerCase(), MAX_LANGUAGE_ID_CHARS)
  const cursorLineNumber = Math.max(1, Number(source.cursorLineNumber || 1) || 1)
  const cursorColumn = Math.max(1, Number(source.cursorColumn || 1) || 1)
  const prefix = normalizeLineEndings(clampString(source.prefix ?? '', MAX_PREFIX_CHARS))
  const suffix = normalizeLineEndings(clampString(source.suffix ?? '', MAX_SUFFIX_CHARS))

  if (!providerId) return { ok: false, error: 'provider_required' }
  if (!model) return { ok: false, error: 'model_required' }
  if (!prefix && !suffix) return { ok: false, error: 'context_required' }

  return {
    ok: true,
    value: {
      providerId,
      model,
      project,
      filePath,
      language,
      prefix,
      suffix,
      cursorLineNumber,
      cursorColumn,
    },
  }
}

export function buildInlineCompletionMessages({
  filePath = '',
  language = '',
  prefix = '',
  suffix = '',
  cursorLineNumber = 1,
  cursorColumn = 1,
} = {}) {
  const safeFilePath = String(filePath || '').trim() || 'untitled'
  const safeLanguage = String(language || '').trim() || 'plaintext'
  const safePrefix = normalizeLineEndings(String(prefix || ''))
  const safeSuffix = normalizeLineEndings(String(suffix || ''))
  const safeLine = Math.max(1, Number(cursorLineNumber || 1) || 1)
  const safeColumn = Math.max(1, Number(cursorColumn || 1) || 1)

  const systemPrompt = [
    'You are an inline code completion engine for a desktop editor.',
    'Return only the exact text to insert at the cursor.',
    'Do not return markdown, code fences, explanations, bullets, or surrounding text.',
    'Prefer short, deterministic continuations that fit local style.',
    'If completion is uncertain, return an empty response.',
  ].join('\n')

  const userPrompt = [
    `File: ${safeFilePath}`,
    `Language: ${safeLanguage}`,
    `Cursor: line ${safeLine}, column ${safeColumn}`,
    '',
    '<before_cursor>',
    safePrefix,
    '</before_cursor>',
    '<after_cursor>',
    safeSuffix,
    '</after_cursor>',
  ].join('\n')

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

export function sanitizeInlineCompletionText(rawText = '', { prefix = '', suffix = '' } = {}) {
  let text = normalizeLineEndings(String(rawText || ''))
  if (!text) return ''

  text = stripCodeFenceWrappers(text).split(NULL_CHAR).join('')
  text = trimRepeatedPrefixTail(text, prefix)
  text = trimRepeatedSuffix(text, suffix)
  text = clampString(text, MAX_INSERT_CHARS)

  // Keep leading whitespace for indentation; trim trailing noise.
  return text.trimEnd()
}

export const INLINE_COMPLETION_LIMITS = Object.freeze({
  MAX_PREFIX_CHARS,
  MAX_SUFFIX_CHARS,
  MAX_INSERT_CHARS,
})
