const ADVANCED_SHADOW_ROOTS = Object.freeze([
  'commandSafety',
  'continuityPolicy',
  'customPipelinesEnabled',
  'editorLanguageServicePlatform',
  'moaBudgetPolicy',
  'moaPolicy',
  'providerRuntimeSettings',
])

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function mergeAdvancedOverlaySettings(base = {}, overlay = {}) {
  const out = {
    ...(isPlainObject(base) ? base : {}),
  }
  if (!isPlainObject(overlay)) return out
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value)) {
      out[key] = mergeAdvancedOverlaySettings(out[key], value)
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => (isPlainObject(item) ? mergeAdvancedOverlaySettings({}, item) : item))
    } else {
      out[key] = value
    }
  }
  return out
}

export function collectSettingsLeafPaths(source, prefix = []) {
  if (!isPlainObject(source)) return []
  const out = []
  for (const [key, value] of Object.entries(source)) {
    const next = [...prefix, key]
    if (isPlainObject(value)) {
      out.push(...collectSettingsLeafPaths(value, next))
    } else {
      out.push(next.join('.'))
    }
  }
  return out.sort()
}

function getDottedValue(source, dottedPath) {
  return String(dottedPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current == null ? undefined : current[key]), source)
}

export function collectShadowedSettingsJsonPaths(rawSettings = {}, overlay = {}) {
  const shadowed = []
  for (const dottedPath of collectSettingsLeafPaths(overlay)) {
    const root = dottedPath.split('.')[0] || ''
    if (!ADVANCED_SHADOW_ROOTS.includes(root) && !dottedPath.startsWith('memoryCompression')) continue
    if (getDottedValue(rawSettings, dottedPath) !== undefined) {
      shadowed.push(dottedPath)
    }
  }
  return shadowed.sort()
}
