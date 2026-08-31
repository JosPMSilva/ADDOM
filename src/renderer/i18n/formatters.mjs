import React from 'react'
import i18n from 'i18next'
import { DEFAULT_UI_LOCALE } from '../../common/i18n/locale-config.mjs'
import { resolveActiveRendererUiLocale } from './init.mjs'
import useSettingsStore from '../store/useSettingsStore.js'

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

const dateTimeFormatterCache = new Map()
const numberFormatterCache = new Map()
const relativeTimeFormatterCache = new Map()

function normalizeLocale(value = '') {
  return String(value || '').trim().replace(/_/g, '-') || DEFAULT_UI_LOCALE
}

function normalizeFormatterOptions(options = {}) {
  return Object.fromEntries(
    Object.entries(options && typeof options === 'object' ? options : {})
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function buildFormatterCacheKey(locale, options = {}) {
  return `${normalizeLocale(locale)}:${JSON.stringify(normalizeFormatterOptions(options))}`
}

function getCachedFormatter(cache, locale, options, factory) {
  const resolvedLocale = normalizeLocale(locale)
  const normalizedOptions = normalizeFormatterOptions(options)
  const cacheKey = buildFormatterCacheKey(resolvedLocale, normalizedOptions)
  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, factory(resolvedLocale, normalizedOptions))
  }
  return cache.get(cacheKey)
}

function getDateTimeFormatter(locale, options = {}) {
  return getCachedFormatter(
    dateTimeFormatterCache,
    locale,
    options,
    (resolvedLocale, resolvedOptions) => new Intl.DateTimeFormat(resolvedLocale, resolvedOptions),
  )
}

function getNumberFormatter(locale, options = {}) {
  return getCachedFormatter(
    numberFormatterCache,
    locale,
    options,
    (resolvedLocale, resolvedOptions) => new Intl.NumberFormat(resolvedLocale, resolvedOptions),
  )
}

function getRelativeTimeFormatter(locale, options = {}) {
  return getCachedFormatter(
    relativeTimeFormatterCache,
    locale,
    options,
    (resolvedLocale, resolvedOptions) => new Intl.RelativeTimeFormat(resolvedLocale, resolvedOptions),
  )
}

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime()
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function pickRelativeUnit(deltaMs) {
  const absDeltaMs = Math.abs(deltaMs)
  if (absDeltaMs < MINUTE_MS) return ['second', Math.round(deltaMs / SECOND_MS)]
  if (absDeltaMs < HOUR_MS) return ['minute', Math.round(deltaMs / MINUTE_MS)]
  if (absDeltaMs < DAY_MS) return ['hour', Math.round(deltaMs / HOUR_MS)]
  if (absDeltaMs < WEEK_MS) return ['day', Math.round(deltaMs / DAY_MS)]
  if (absDeltaMs < MONTH_MS) return ['week', Math.round(deltaMs / WEEK_MS)]
  if (absDeltaMs < YEAR_MS) return ['month', Math.round(deltaMs / MONTH_MS)]
  return ['year', Math.round(deltaMs / YEAR_MS)]
}

function getStartOfLocalDay(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function formatWithDateTimeFormatter(value, locale, fallback, defaultOptions, intlOptions = {}) {
  const timestamp = toTimestamp(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return fallback

  try {
    const nextOptions = Object.keys(normalizeFormatterOptions(intlOptions)).length > 0
      ? intlOptions
      : defaultOptions
    return getDateTimeFormatter(locale, nextOptions).format(new Date(timestamp))
  } catch {
    return fallback
  }
}

export function resolveRendererFormattingLocale(locale = '') {
  const explicitLocale = String(locale || '').trim()
  if (explicitLocale) return normalizeLocale(explicitLocale)
  return normalizeLocale(i18n?.resolvedLanguage || i18n?.language || DEFAULT_UI_LOCALE)
}

export function useRendererFormattingLocale() {
  const uiLocale = useSettingsStore((state) => state.uiLocale)
  return React.useMemo(
    () => resolveActiveRendererUiLocale(uiLocale),
    [uiLocale],
  )
}

export function formatNumber(value, { locale = '', fallback = '-', ...intlOptions } = {}) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback

  try {
    return getNumberFormatter(
      resolveRendererFormattingLocale(locale),
      intlOptions,
    ).format(numericValue)
  } catch {
    return fallback
  }
}

export function formatDateTime(value, { locale = '', fallback = '-', ...intlOptions } = {}) {
  return formatWithDateTimeFormatter(
    value,
    resolveRendererFormattingLocale(locale),
    fallback,
    { dateStyle: 'medium', timeStyle: 'short' },
    intlOptions,
  )
}

export function formatDate(value, { locale = '', fallback = '-', ...intlOptions } = {}) {
  return formatWithDateTimeFormatter(
    value,
    resolveRendererFormattingLocale(locale),
    fallback,
    { dateStyle: 'medium' },
    intlOptions,
  )
}

export function formatTime(value, { locale = '', fallback = '-', ...intlOptions } = {}) {
  return formatWithDateTimeFormatter(
    value,
    resolveRendererFormattingLocale(locale),
    fallback,
    { timeStyle: 'short' },
    intlOptions,
  )
}

export function formatRelativeUnit(
  value,
  unit,
  { locale = '', fallback = '', style = 'short', numeric = 'auto' } = {},
) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback

  try {
    return getRelativeTimeFormatter(
      resolveRendererFormattingLocale(locale),
      { style, numeric },
    ).format(numericValue, unit)
  } catch {
    return fallback
  }
}

export function formatRelativeTime(
  value,
  { locale = '', fallback = '', now = Date.now(), style = 'short', numeric = 'auto' } = {},
) {
  const timestamp = toTimestamp(value)
  const nowTimestamp = toTimestamp(now)
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(nowTimestamp)) return fallback

  const [unit, relativeValue] = pickRelativeUnit(timestamp - nowTimestamp)
  return formatRelativeUnit(relativeValue, unit, {
    locale,
    fallback,
    style,
    numeric,
  })
}

export function formatRelativeCalendarDate(
  value,
  {
    locale = '',
    fallback = '',
    now = Date.now(),
    maxRelativeDays = 6,
    relativeStyle = 'short',
    numeric = 'auto',
    ...dateOptions
  } = {},
) {
  const timestamp = toTimestamp(value)
  const nowTimestamp = toTimestamp(now)
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(nowTimestamp)) return fallback

  const dayDiff = Math.round((getStartOfLocalDay(timestamp) - getStartOfLocalDay(nowTimestamp)) / DAY_MS)
  if (Math.abs(dayDiff) <= Math.max(0, Number(maxRelativeDays || 0))) {
    return formatRelativeUnit(dayDiff, 'day', {
      locale,
      fallback,
      style: relativeStyle,
      numeric,
    })
  }

  const nextDateOptions = Object.keys(normalizeFormatterOptions(dateOptions)).length > 0
    ? dateOptions
    : { month: 'short', day: 'numeric' }

  return formatDate(timestamp, {
    locale,
    fallback,
    ...nextDateOptions,
  })
}

export function formatDurationMs(
  value,
  { locale = '', fallback = '-', maxParts = 3 } = {},
) {
  const durationMs = Number(value)
  if (!Number.isFinite(durationMs) || durationMs < 0) return fallback

  const totalSeconds = Math.floor(durationMs / SECOND_MS)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const parts = []

  if (hours > 0) parts.push(['hour', hours])
  if (minutes > 0 || hours > 0) parts.push(['minute', minutes])
  parts.push(['second', seconds])

  const safeLocale = resolveRendererFormattingLocale(locale)
  const safeMaxParts = Math.max(1, Math.round(Number(maxParts || 0)) || 3)

  try {
    return parts
      .slice(0, safeMaxParts)
      .map(([unit, unitValue]) => getNumberFormatter(safeLocale, {
        style: 'unit',
        unit,
        unitDisplay: 'narrow',
      }).format(unitValue))
      .join(' ')
  } catch {
    return fallback
  }
}
