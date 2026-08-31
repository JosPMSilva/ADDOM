import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

function trimString(value = '') {
  return String(value || '').trim()
}

export const MODELS_DEV_PROVIDER_ID_MAP = Object.freeze({
  google: 'gemini',
  moonshotai: 'moonshot',
  xai: 'grok',
})

export function mapModelsDevProviderId(upstreamProviderId = '') {
  const normalized = trimString(upstreamProviderId).toLowerCase()
  return MODELS_DEV_PROVIDER_ID_MAP[normalized] || normalized
}

function escapeJsonControlChars(value = '') {
  return Array.from(String(value || ''), (char) => {
    const code = char.charCodeAt(0)
    if (code > 0x1f) return char
    switch (char) {
      case '\b': return '\\b'
      case '\f': return '\\f'
      case '\n': return '\\n'
      case '\r': return '\\r'
      case '\t': return '\\t'
      default: return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
    }
  }).join('')
}

function parsePortableTomlValue(rawValue = '') {
  const value = trimString(rawValue)
  if (!value) return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(escapeJsonControlChars(value))
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    if (/^\[\s*\{/.test(value)) {
      return Array.from(value.matchAll(/\{([^{}]*)\}/g), (match) => (
        parsePortableTomlAssignments(match[1])
      ))
    }
    return JSON.parse(escapeJsonControlChars(value.replace(/,\s*]/g, ']')))
  }
  if (/^-?[0-9][0-9_]*(\.[0-9_]+)?$/.test(value)) {
    return Number(value.replace(/_/g, ''))
  }
  return value
}

function parsePortableTomlAssignments(source = '') {
  const assignmentPattern = /([A-Za-z0-9_]+)\s*=\s*("(?:\\.|[^"])*"|\[(?:[^\]]*)\]|true|false|-?[0-9][0-9_]*(?:\.[0-9_]+)?)/g
  const out = {}
  let match
  while ((match = assignmentPattern.exec(source)) !== null) {
    out[match[1]] = parsePortableTomlValue(match[2])
  }
  return out
}

function setNestedTomlSection(target = {}, sectionName = '', sectionValue = {}) {
  const pathParts = trimString(sectionName)
    .split('.')
    .map((part) => trimString(part))
    .filter(Boolean)

  if (pathParts.length === 0) return target

  let cursor = target
  for (let index = 0; index < pathParts.length; index += 1) {
    const part = pathParts[index]
    const isLeaf = index === pathParts.length - 1
    if (isLeaf) {
      const existing = cursor[part] && typeof cursor[part] === 'object' && !Array.isArray(cursor[part])
        ? cursor[part]
        : {}
      cursor[part] = {
        ...existing,
        ...sectionValue,
      }
      continue
    }
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {}
    }
    cursor = cursor[part]
  }

  return target
}

export function parsePortableToml(contents = '') {
  const source = String(contents || '').trim()
  if (!source) return {}

  const sectionPattern = /\[([A-Za-z0-9_.]+)\]/g
  const sections = []
  let match
  while ((match = sectionPattern.exec(source)) !== null) {
    sections.push({
      name: match[1],
      start: match.index,
      end: sectionPattern.lastIndex,
    })
  }

  const topLevelEnd = sections[0]?.start ?? source.length
  const result = parsePortableTomlAssignments(source.slice(0, topLevelEnd))

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]
    const nextStart = sections[index + 1]?.start ?? source.length
    const sectionSource = source.slice(section.end, nextStart)
    setNestedTomlSection(result, section.name, parsePortableTomlAssignments(sectionSource))
  }

  return result
}

export async function readPortableTomlFile(filePath) {
  const contents = await readFile(filePath, 'utf8')
  return parsePortableToml(contents)
}

export async function listPortableModelsDevProviders(vendorRoot) {
  const entries = await readdir(vendorRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function listPortableModelFiles(modelsRoot, currentPath = modelsRoot) {
  const entries = await readdir(currentPath, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const nextPath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listPortableModelFiles(modelsRoot, nextPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.toml')) continue
    files.push(nextPath)
  }

  return files
}

function mergePortableToml(baseValue, overrideValue) {
  const baseIsObject = baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)
  const overrideIsObject = overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)
  if (!baseIsObject || !overrideIsObject) return overrideValue

  const merged = { ...baseValue }
  for (const [key, value] of Object.entries(overrideValue)) {
    merged[key] = key in merged ? mergePortableToml(merged[key], value) : value
  }
  return merged
}

function omitPortableTomlPath(target, fieldPath = '') {
  const parts = trimString(fieldPath).split('.').filter(Boolean)
  if (parts.length === 0) return
  let cursor = target
  for (const part of parts.slice(0, -1)) {
    if (!cursor?.[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) return
    cursor = cursor[part]
  }
  delete cursor[parts.at(-1)]
}

async function resolvePortableBaseModel(vendorRoot, providerModel) {
  const baseModelId = trimString(providerModel?.base_model)
  if (!baseModelId) return providerModel

  const baseModelPath = path.join(path.resolve(vendorRoot, '..', 'models'), ...baseModelId.split('/')) + '.toml'
  const baseModel = await readPortableTomlFile(baseModelPath)
  for (const fieldPath of Array.isArray(providerModel.base_model_omit) ? providerModel.base_model_omit : []) {
    omitPortableTomlPath(baseModel, fieldPath)
  }

  const resolved = mergePortableToml(baseModel, providerModel)
  delete resolved.base_model
  delete resolved.base_model_omit
  return resolved
}

export async function loadPortableModelsDevProvider(vendorRoot, upstreamProviderId) {
  const providerPath = path.join(vendorRoot, upstreamProviderId)
  const providerToml = await readPortableTomlFile(path.join(providerPath, 'provider.toml'))
  const modelsPath = path.join(providerPath, 'models')
  const modelFiles = await listPortableModelFiles(modelsPath)

  const models = []
  for (const filePath of modelFiles) {
    const parsed = await readPortableTomlFile(filePath)
    const relativeModelPath = path.relative(modelsPath, filePath).replace(/\\/g, '/')
    const resolved = await resolvePortableBaseModel(vendorRoot, parsed)
    models.push({
      id: relativeModelPath.replace(/\.toml$/i, ''),
      ...resolved,
      __sourceFile: filePath,
    })
  }

  return {
    upstreamProviderId,
    providerId: mapModelsDevProviderId(upstreamProviderId),
    sourcePath: providerPath,
    provider: {
      ...providerToml,
      __sourceFile: path.join(providerPath, 'provider.toml'),
    },
    models,
  }
}
