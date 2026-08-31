export const SYSTEM_UI_LOCALE = 'system'
export const DEFAULT_UI_LOCALE = 'en'
export const FALLBACK_UI_LOCALE = 'en'
export const PSEUDO_UI_LOCALE = 'en-XA'

const CANONICAL_UI_LOCALE_DEFINITIONS = Object.freeze([
  Object.freeze({ code: 'en', label: 'English', shipped: true, exposed: true }),
  Object.freeze({ code: PSEUDO_UI_LOCALE, label: 'Pseudo (Accented)', shipped: true, exposed: false, validationOnly: true }),
  Object.freeze({ code: 'es', label: 'Spanish', shipped: true, exposed: true }),
  Object.freeze({ code: 'pt-BR', label: 'Portuguese (Brazil)', shipped: true, exposed: true }),
  Object.freeze({ code: 'fr', label: 'French', shipped: true, exposed: true }),
  Object.freeze({ code: 'de', label: 'German', shipped: true, exposed: true }),
  Object.freeze({ code: 'ja', label: 'Japanese', shipped: true, exposed: true }),
  Object.freeze({ code: 'zh-CN', label: 'Chinese (Simplified)', shipped: true, exposed: true }),
  Object.freeze({ code: 'ko', label: 'Korean', shipped: true, exposed: true }),
  Object.freeze({ code: 'it', label: 'Italian', shipped: true, exposed: true }),
  Object.freeze({ code: 'nl', label: 'Dutch', shipped: true, exposed: true }),
  Object.freeze({ code: 'pl', label: 'Polish', shipped: true, exposed: true }),
  Object.freeze({ code: 'tr', label: 'Turkish', shipped: true, exposed: true }),
  Object.freeze({ code: 'uk', label: 'Ukrainian', shipped: true, exposed: true }),
  Object.freeze({ code: 'id', label: 'Indonesian', shipped: true, exposed: true }),
  Object.freeze({ code: 'vi', label: 'Vietnamese', shipped: true, exposed: true }),
])

const SYSTEM_UI_LOCALE_DEFINITION = Object.freeze({
  code: SYSTEM_UI_LOCALE,
  label: 'System default',
  shipped: false,
  exposed: true,
})

const UI_LOCALE_SETTING_DEFINITIONS = Object.freeze([
  SYSTEM_UI_LOCALE_DEFINITION,
  ...CANONICAL_UI_LOCALE_DEFINITIONS,
])

export const CANONICAL_UI_LOCALES = Object.freeze(
  CANONICAL_UI_LOCALE_DEFINITIONS.map((entry) => entry.code),
)

export const UI_LOCALE_SETTING_VALUES = Object.freeze(
  UI_LOCALE_SETTING_DEFINITIONS.map((entry) => entry.code),
)

export const SHIPPED_UI_LOCALES = Object.freeze(
  CANONICAL_UI_LOCALE_DEFINITIONS
    .filter((entry) => entry.shipped === true)
    .map((entry) => entry.code),
)

export const EXPOSED_UI_LOCALES = Object.freeze(
  CANONICAL_UI_LOCALE_DEFINITIONS
    .filter((entry) => entry.exposed === true)
    .map((entry) => entry.code),
)

const CANONICAL_UI_LOCALE_SET = new Set(CANONICAL_UI_LOCALES)
const SHIPPED_UI_LOCALE_SET = new Set(SHIPPED_UI_LOCALES)
const EXPOSED_UI_LOCALE_SET = new Set(EXPOSED_UI_LOCALES)
const UI_LOCALE_DEFINITION_LOOKUP = new Map(
  UI_LOCALE_SETTING_DEFINITIONS.map((entry) => [entry.code, entry]),
)

const CANONICAL_UI_LOCALE_LOOKUP = new Map()
const BASE_LANGUAGE_TO_CANONICAL = new Map()

function normalizeLocaleToken(value) {
  return String(value ?? '').trim().replace(/_/g, '-')
}

function normalizeLocaleLookupKey(value) {
  return normalizeLocaleToken(value).toLowerCase()
}

function getBaseLanguage(value) {
  const normalized = normalizeLocaleToken(value)
  if (!normalized) return ''
  return normalized.split('-')[0].toLowerCase()
}

for (const locale of CANONICAL_UI_LOCALE_DEFINITIONS) {
  const canonicalCode = locale.code
  const lowerCanonicalCode = normalizeLocaleLookupKey(canonicalCode)
  const baseLanguage = getBaseLanguage(canonicalCode)

  CANONICAL_UI_LOCALE_LOOKUP.set(lowerCanonicalCode, canonicalCode)
  CANONICAL_UI_LOCALE_LOOKUP.set(baseLanguage, CANONICAL_UI_LOCALE_LOOKUP.get(baseLanguage) || canonicalCode)

  if (!BASE_LANGUAGE_TO_CANONICAL.has(baseLanguage)) {
    BASE_LANGUAGE_TO_CANONICAL.set(baseLanguage, canonicalCode)
  }
}

function normalizeUiLocaleFallback(fallback = DEFAULT_UI_LOCALE) {
  const normalizedFallback = normalizeLocaleLookupKey(fallback)
  if (!normalizedFallback) return ''
  if (normalizedFallback === SYSTEM_UI_LOCALE) return SYSTEM_UI_LOCALE
  const canonicalFallback = CANONICAL_UI_LOCALE_LOOKUP.get(normalizedFallback)
  return canonicalFallback || DEFAULT_UI_LOCALE
}

function resolveCanonicalUiLocale(value) {
  const lookupKey = normalizeLocaleLookupKey(value)
  if (!lookupKey) return ''
  if (lookupKey === SYSTEM_UI_LOCALE) return SYSTEM_UI_LOCALE

  const directMatch = CANONICAL_UI_LOCALE_LOOKUP.get(lookupKey)
  if (directMatch) return directMatch

  const baseLanguage = getBaseLanguage(lookupKey)
  return BASE_LANGUAGE_TO_CANONICAL.get(baseLanguage) || ''
}

export function normalizeUiLocale(value, fallback = DEFAULT_UI_LOCALE) {
  const resolved = resolveCanonicalUiLocale(value)
  if (resolved) return resolved
  return normalizeUiLocaleFallback(fallback)
}

export function isCanonicalUiLocale(value) {
  return CANONICAL_UI_LOCALE_SET.has(normalizeUiLocale(value, ''))
}

export function isShippedUiLocale(value) {
  return SHIPPED_UI_LOCALE_SET.has(normalizeUiLocale(value, ''))
}

export function isExposedUiLocale(value) {
  return EXPOSED_UI_LOCALE_SET.has(normalizeUiLocale(value, ''))
}

export function listUiLocaleOptions({ includeHidden = false, includeUnshipped = false } = {}) {
  return UI_LOCALE_SETTING_DEFINITIONS
    .filter((entry) => {
      if (entry.code === SYSTEM_UI_LOCALE) return true
      if (includeHidden !== true && entry.exposed !== true) return false
      if (includeUnshipped !== true && entry.shipped !== true) return false
      return true
    })
    .map((entry) => ({
      ...entry,
      shipped: entry.code !== SYSTEM_UI_LOCALE && SHIPPED_UI_LOCALE_SET.has(entry.code),
      exposed: entry.code === SYSTEM_UI_LOCALE || EXPOSED_UI_LOCALE_SET.has(entry.code),
    }))
}

export function getUiLocaleDefinition(value, fallback = DEFAULT_UI_LOCALE) {
  const normalized = normalizeUiLocale(value, fallback)
  return UI_LOCALE_DEFINITION_LOOKUP.get(normalized)
    || UI_LOCALE_DEFINITION_LOOKUP.get(DEFAULT_UI_LOCALE)
    || SYSTEM_UI_LOCALE_DEFINITION
}

export function resolveSystemUiLocale({ language = '', languages = [] } = {}) {
  const candidates = []
  if (Array.isArray(languages)) {
    for (const entry of languages) candidates.push(entry)
  }
  if (!candidates.length && language) candidates.push(language)

  for (const candidate of candidates) {
    const normalized = resolveCanonicalUiLocale(candidate)
    if (normalized && normalized !== SYSTEM_UI_LOCALE) return normalized
  }

  return DEFAULT_UI_LOCALE
}

export function resolveRendererUiLocale(uiLocale, systemLocaleOptions = {}) {
  const normalizedUiLocale = normalizeUiLocale(uiLocale, DEFAULT_UI_LOCALE)
  const requestedLocale = normalizedUiLocale === SYSTEM_UI_LOCALE
    ? resolveSystemUiLocale(systemLocaleOptions)
    : normalizedUiLocale

  return SHIPPED_UI_LOCALE_SET.has(requestedLocale)
    ? requestedLocale
    : FALLBACK_UI_LOCALE
}

export function getUiLocaleFallbackChain(uiLocale, systemLocaleOptions = {}) {
  const resolvedUiLocale = resolveRendererUiLocale(uiLocale, systemLocaleOptions)
  return Array.from(new Set([resolvedUiLocale, FALLBACK_UI_LOCALE]))
}
