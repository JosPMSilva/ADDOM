import { formatTokenCompact } from './chat-utils.js'
import i18n from '../../i18n/init.mjs'

export { formatTokenCompact }

function translateContextMeterText(key, defaultValue, options = {}) {
  if (i18n?.isInitialized === true) {
    const translated = i18n.t(key, { defaultValue, ...options })
    if (typeof translated === 'string' && translated && translated !== key) {
      return translated
    }
  }
  return String(defaultValue || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey) => {
    const value = options?.[String(rawKey || '').trim()]
    return value == null ? '' : String(value)
  })
}

function asOptionalTokenCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.max(0, Math.round(n)) : null
}

function resolveThreadOccupancyState(usage = {}) {
  const explicitThreadOccupancyTokens = asOptionalTokenCount(usage?.threadOccupancyTokens)
  const effectiveOccupancyTokens = asOptionalTokenCount(usage?.effectiveOccupancyTokens)
  const legacyContextOccupancyTokens = asOptionalTokenCount(usage?.contextOccupancyTokens)
  const resolvedThreadOccupancyTokens = explicitThreadOccupancyTokens ?? effectiveOccupancyTokens ?? legacyContextOccupancyTokens
  const explicitAvailability = typeof usage?.threadOccupancyAvailable === 'boolean'
    ? usage.threadOccupancyAvailable
    : (
        typeof usage?.occupancyAvailable === 'boolean'
          ? usage.occupancyAvailable
          : null
      )

  return {
    occupancyAvailable: explicitAvailability ?? (resolvedThreadOccupancyTokens !== null),
    threadOccupancyTokens: resolvedThreadOccupancyTokens ?? 0,
  }
}

function resolveEmptyThreadFallbackState(usage = {}, modelLimit = 0, occupancyAvailable = false) {
  return (
    usage?.emptyThreadContextLeftFallback === true
    && modelLimit > 0
    && occupancyAvailable !== true
  )
}

function normalizeContextLeftFallbackMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'empty_thread' || normalized === 'initial_turn') return normalized
  return 'none'
}

function formatWholePercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function buildContextMeterViewModel({
  usage = {},
  contextLeftFallbackMode = 'none',
  compact = false,
} = {}) {
  const modelLimit = Math.max(0, Math.round(Number(usage?.modelLimit || 0) || 0))
  const occupancy = resolveThreadOccupancyState(usage)
  const requestedFallbackMode = normalizeContextLeftFallbackMode(contextLeftFallbackMode)
  const recalculatingCompactionActive = String(usage?.usageRefreshState || '').trim().toLowerCase() === 'recalculating'
    && String(usage?.compactionScope || '').trim().toLowerCase() === 'thread_reset'
  const legacyEmptyThreadFallbackActive = resolveEmptyThreadFallbackState(
    usage,
    modelLimit,
    occupancy.occupancyAvailable,
  )
  const resolvedFallbackMode = recalculatingCompactionActive
    ? 'none'
    : modelLimit > 0 && occupancy.occupancyAvailable !== true
    ? (
        requestedFallbackMode !== 'none'
          ? requestedFallbackMode
          : (legacyEmptyThreadFallbackActive ? 'empty_thread' : 'none')
      )
    : 'none'
  const emptyThreadFallbackActive = resolvedFallbackMode === 'empty_thread'
  const initialTurnFallbackActive = resolvedFallbackMode === 'initial_turn'
  const fallbackActive = emptyThreadFallbackActive || initialTurnFallbackActive
  const occupancyVisible = occupancy.occupancyAvailable || fallbackActive
  const used = occupancyVisible && !fallbackActive
    ? Math.min(occupancy.threadOccupancyTokens, modelLimit || occupancy.threadOccupancyTokens)
    : 0
  const remaining = modelLimit > 0 && occupancyVisible
    ? Math.max(0, modelLimit - used)
    : 0
  const usedPercent = modelLimit > 0 && occupancyVisible
    ? formatWholePercent((used / modelLimit) * 100)
    : 0
  const remainingPercent = modelLimit > 0 && occupancyVisible
    ? Math.max(0, 100 - usedPercent)
    : 0
  const radius = compact ? 9 : 11
  const diameter = compact ? 24 : 28
  const circumference = 2 * Math.PI * radius
  const ringStyle = modelLimit > 0 && occupancyVisible
    ? (emptyThreadFallbackActive
        ? 'empty_thread_fallback'
        : (initialTurnFallbackActive ? 'initial_turn_fallback' : 'measured'))
    : 'unavailable'
  const tone = ringStyle === 'unavailable' ? 'text-text-muted' : 'text-accent-soft'
  const titleOptions = { used, remaining, modelLimit, usedPercent, remainingPercent }
  const contextWindowTitle = translateContextMeterText(
    'core:chat.contextMeter.title.contextWindow',
    'Context window: {{usedPercent}}% used ({{remainingPercent}}% left), {{used}}/{{modelLimit}} tokens used',
    titleOptions,
  )
  const fallbackTitle = translateContextMeterText(
    emptyThreadFallbackActive
      ? 'core:chat.contextMeter.title.contextWindowEmptyThread'
      : 'core:chat.contextMeter.title.contextWindowInitialTurn',
    emptyThreadFallbackActive
      ? 'Context window: 0% used (100% left), empty thread'
      : 'Context window: 0% used (100% left), first turn',
    titleOptions,
  )
  const unavailableTitle = modelLimit > 0
    ? translateContextMeterText(
        'core:chat.contextMeter.title.contextWindowUnavailable',
        'Context window unavailable ({{modelLimit}} token limit; thread occupancy unavailable)',
        { modelLimit },
      )
    : translateContextMeterText('core:chat.contextMeter.title.limitUnavailable', 'Context limit unavailable for this model')
  const recalculatingTitle = translateContextMeterText(
    'core:chat.contextMeter.title.contextWindowRecalculating',
    'Context window recalculating after compaction ({{modelLimit}} token limit)',
    { modelLimit },
  )
  const title = recalculatingCompactionActive
    ? recalculatingTitle
    : ringStyle === 'unavailable'
      ? unavailableTitle
      : (fallbackActive ? fallbackTitle : contextWindowTitle)

  return {
    modelLimit,
    used,
    remaining,
    percent: usedPercent,
    usedPercent,
    remainingPercent,
    ringPercent: usedPercent,
    occupancyAvailable: occupancy.occupancyAvailable,
    emptyThreadFallbackActive,
    initialTurnFallbackActive,
    recalculatingCompactionActive,
    radius,
    diameter,
    circumference,
    tone,
    ringStyle,
    title,
    ringAriaLabel: title,
    tooltipPercentLabel: ringStyle === 'unavailable'
      ? translateContextMeterText('core:chat.contextMeter.tooltipUnavailable', 'Unavailable')
      : translateContextMeterText(
          'core:chat.contextMeter.tooltipPercent',
          '{{usedPercent}}% used ({{remainingPercent}}% left)',
          { usedPercent, remainingPercent },
        ),
    tooltipTokensUsedLabel: ringStyle === 'unavailable'
      ? unavailableTitle
      : translateContextMeterText(
          'core:chat.contextMeter.tooltipTokensUsed',
          '{{used}} / {{modelLimit}} tokens used',
          {
            used: formatTokenCompact(used),
            modelLimit: formatTokenCompact(modelLimit),
          },
        ),
    tooltipCompactionLabel: '',
  }
}
