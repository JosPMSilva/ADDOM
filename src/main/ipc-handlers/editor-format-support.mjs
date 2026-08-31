import fs from 'fs'
import path from 'path'

const BIOME_FORMAT_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx',
  '.json', '.jsonc',
  '.css',
])

const BIOME_FORMAT_LANGS = new Set([
  'javascript', 'typescript',
  'json', 'jsonc',
  'css',
])

const RUFF_FORMAT_EXTS = new Set([
  '.py',
  '.pyw',
])

const RUFF_FORMAT_LANGS = new Set([
  'python',
])

const MARKUP_FORMAT_EXTS = new Set([
  '.md',
  '.markdown',
  '.html',
  '.htm',
])

const MARKUP_FORMAT_LANGS = new Set([
  'markdown',
  'md',
  'html',
])

const PRETTIER_STYLE_FORMAT_EXTS = new Set([
  '.scss',
  '.less',
])

const PRETTIER_STYLE_FORMAT_LANGS = new Set([
  'scss',
  'less',
])

const C_CPP_FORMAT_EXTS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.h',
  '.hh',
  '.hpp',
  '.hxx',
])

const C_CPP_FORMAT_LANGS = new Set([
  'c',
  'cpp',
])

const CSHARP_FORMAT_EXTS = new Set([
  '.cs',
])

const CSHARP_FORMAT_LANGS = new Set([
  'csharp',
])

const FORMAT_ONLY_FORMAT_EXTS = new Set([
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.less',
])

const FORMAT_ONLY_FORMAT_LANGS = new Set([
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'markdown',
  'md',
  'html',
  'css',
  'scss',
  'less',
])

export const FORMATTER_PROVIDER_FAMILY_IDS = Object.freeze({
  BIOME: 'biome',
  PYTHON: 'python',
  STYLE_PREPROCESSOR: 'style-preprocessor',
  MARKUP_PROSE: 'markup-prose',
  DATA_CONFIG: 'data-config',
  C_CPP_FORMAT: 'c-cpp-format',
  CSHARP_FORMAT: 'csharp-format',
})

export const CODE_ACTION_PROVIDER_FAMILY_IDS = Object.freeze({
  C_CPP_FIX: 'c-cpp-fix',
  CSHARP_FIX: 'csharp-fix',
})

const NORMALIZED_LANGUAGE_ALIASES = new Map([
  ['c#', 'csharp'],
  ['cs', 'csharp'],
  ['c++', 'cpp'],
  ['cc', 'cpp'],
  ['cxx', 'cpp'],
  ['h', 'cpp'],
  ['hh', 'cpp'],
  ['hpp', 'cpp'],
  ['hxx', 'cpp'],
])

export function safePath(projectRoot, filePath) {
  const abs = path.resolve(projectRoot, filePath)
  const rel = path.relative(projectRoot, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${filePath}" escapes the project root.`)
  }
  return abs
}

export function normalizeLanguage(language = '') {
  const normalizedLanguage = String(language || '').trim().toLowerCase()
  if (!normalizedLanguage) return ''
  return NORMALIZED_LANGUAGE_ALIASES.get(normalizedLanguage) || normalizedLanguage
}

export function normalizeProjectRoot(projectRoot = '') {
  const raw = String(projectRoot || '').trim()
  return raw ? path.resolve(raw) : ''
}

export function cleanString(value = '') {
  return String(value || '').trim()
}

export function matchesLanguageOrExtension(filePath = '', language = '', exts = new Set(), langs = new Set()) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (exts.has(ext)) return true
  return langs.has(normalizeLanguage(language))
}

export function supportsBiomeFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(filePath, language, BIOME_FORMAT_EXTS, BIOME_FORMAT_LANGS)
}

export function supportsRuffFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(filePath, language, RUFF_FORMAT_EXTS, RUFF_FORMAT_LANGS)
}

export function supportsRuffFix(filePath = '', language = '') {
  return supportsRuffFormat(filePath, language)
}

export function supportsMarkupFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(filePath, language, MARKUP_FORMAT_EXTS, MARKUP_FORMAT_LANGS)
}

export function supportsPrettierStyleFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(
    filePath,
    language,
    PRETTIER_STYLE_FORMAT_EXTS,
    PRETTIER_STYLE_FORMAT_LANGS,
  )
}

export function supportsClangFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(filePath, language, C_CPP_FORMAT_EXTS, C_CPP_FORMAT_LANGS)
}

export function supportsCSharpierFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(filePath, language, CSHARP_FORMAT_EXTS, CSHARP_FORMAT_LANGS)
}

export function supportsClangTidyFix(filePath = '', language = '') {
  return supportsClangFormat(filePath, language)
}

export function supportsDotnetFormatFix(filePath = '', language = '') {
  return supportsCSharpierFormat(filePath, language)
}

export function supportsYamlFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(
    filePath,
    language,
    new Set(['.yaml', '.yml']),
    new Set(['yaml', 'yml']),
  )
}

export function supportsTomlFormat(filePath = '', language = '') {
  return matchesLanguageOrExtension(
    filePath,
    language,
    new Set(['.toml']),
    new Set(['toml']),
  )
}

export function supportsDataConfigFormat(filePath = '', language = '') {
  return supportsYamlFormat(filePath, language) || supportsTomlFormat(filePath, language)
}

export function isFormatOnlyLanguage(filePath = '', language = '') {
  return matchesLanguageOrExtension(filePath, language, FORMAT_ONLY_FORMAT_EXTS, FORMAT_ONLY_FORMAT_LANGS)
}

export function fileExists(p) {
  try {
    return !!p && fs.existsSync(p)
  } catch {
    return false
  }
}


export function samePath(left = '', right = '') {
  const a = normalizeProjectRoot(left)
  const b = normalizeProjectRoot(right)
  if (!a || !b) return false
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

