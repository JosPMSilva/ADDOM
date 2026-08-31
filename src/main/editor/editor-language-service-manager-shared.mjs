import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createAvailableCapability,
  createUnavailableCapability,
} from './editor-language-service-contract.mjs'

const MONACO_NATIVE_DIAGNOSTIC_LANGUAGES = new Set([
  'json',
  'jsonc',
  'css',
  'scss',
  'less',
  'html',
  'handlebars',
  'razor',
])

const JS_TS_LANGUAGES = new Set([
  'javascript',
  'typescript',
])

const PYTHON_LANGUAGES = new Set([
  'python',
])

const C_CPP_LANGUAGES = new Set([
  'c',
  'cpp',
])

const CSHARP_LANGUAGES = new Set([
  'csharp',
])

const JAVA_LANGUAGES = new Set([
  'java',
])

const JAVA_PROJECT_CONTEXT_FILE_NAMES = [
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
]

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

export const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
]

export function cleanString(value = '') {
  return String(value || '').trim()
}

export function normalizeWorkspaceRoot(projectFolder = '') {
  const raw = cleanString(projectFolder)
  if (!raw) return ''
  return path.resolve(raw)
}

function toForwardSlashes(value = '') {
  return String(value || '').replace(/\\/g, '/')
}

export function normalizeLanguageId(language = '', filePath = '') {
  const explicit = cleanString(language).toLowerCase()
  if (explicit) return NORMALIZED_LANGUAGE_ALIASES.get(explicit) || explicit
  const ext = path.extname(cleanString(filePath)).toLowerCase()
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript'
  if (ext === '.ts' || ext === '.tsx') return 'typescript'
  if (ext === '.py' || ext === '.pyw') return 'python'
  if (ext === '.c') return 'c'
  if (ext === '.cc' || ext === '.cpp' || ext === '.cxx' || ext === '.h' || ext === '.hh' || ext === '.hpp' || ext === '.hxx') return 'cpp'
  if (ext === '.cs') return 'csharp'
  if (ext === '.java') return 'java'
  if (ext === '.json') return 'json'
  if (ext === '.jsonc') return 'jsonc'
  if (ext === '.yaml' || ext === '.yml') return 'yaml'
  if (ext === '.toml') return 'toml'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (ext === '.css') return 'css'
  if (ext === '.scss' || ext === '.sass') return 'scss'
  if (ext === '.less') return 'less'
  if (ext === '.html' || ext === '.htm') return 'html'
  return 'plaintext'
}

export function normalizeWorkspaceRelativeFilePath(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const raw = cleanString(filePath)
  if (!workspaceRoot || !raw) return ''

  const absPath = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(workspaceRoot, raw)
  const relativePath = path.relative(workspaceRoot, absPath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return ''
  }
  return toForwardSlashes(relativePath)
}

export function buildDocumentUri(projectFolder = '', filePath = '', explicitUri = '') {
  const providedUri = cleanString(explicitUri)
  if (providedUri) {
    const normalizedExplicitUri = normalizeFileUri(providedUri)
    if (normalizedExplicitUri) return normalizedExplicitUri
    return providedUri
  }
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const relativeFilePath = normalizeWorkspaceRelativeFilePath(workspaceRoot, filePath)
  if (!workspaceRoot || !relativeFilePath) return ''
  return pathToFileURL(path.resolve(workspaceRoot, relativeFilePath)).href
}

function normalizeFileUri(uri = '') {
  const normalizedUri = cleanString(uri)
  if (!normalizedUri || !/^file:/i.test(normalizedUri)) return ''
  try {
    return pathToFileURL(path.resolve(fileURLToPath(normalizedUri))).href
  } catch {
    return ''
  }
}

export function buildAbsoluteFilePath(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const relativeFilePath = normalizeWorkspaceRelativeFilePath(workspaceRoot, filePath)
  if (!workspaceRoot || !relativeFilePath) return ''
  return path.resolve(workspaceRoot, relativeFilePath)
}

function fileExists(absPath = '') {
  try {
    return !!absPath && fs.existsSync(absPath)
  } catch {
    return false
  }
}

function hasConfigInDirectory(dirPath = '', fileNames = []) {
  if (!dirPath || !Array.isArray(fileNames) || fileNames.length === 0) return ''
  for (const fileName of fileNames) {
    const candidatePath = path.join(dirPath, fileName)
    if (fileExists(candidatePath)) return candidatePath
  }
  return ''
}

export function samePath(left = '', right = '') {
  const a = normalizeWorkspaceRoot(left)
  const b = normalizeWorkspaceRoot(right)
  if (!a || !b) return false
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

export function detectNearestConfigRoot(projectFolder = '', filePath = '', fileNames = []) {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const absoluteFilePath = buildAbsoluteFilePath(workspaceRoot, filePath)
  if (!workspaceRoot || !absoluteFilePath) return ''

  let currentDir = path.dirname(absoluteFilePath)
  while (currentDir && currentDir.startsWith(workspaceRoot)) {
    const matchedConfig = hasConfigInDirectory(currentDir, fileNames)
    if (matchedConfig) return currentDir
    if (samePath(currentDir, workspaceRoot)) break
    const parentDir = path.dirname(currentDir)
    if (!parentDir || samePath(parentDir, currentDir)) break
    currentDir = parentDir
  }

  return hasConfigInDirectory(workspaceRoot, fileNames) ? workspaceRoot : ''
}

export function isMonacoNativeDiagnosticLanguage(language = '') {
  return MONACO_NATIVE_DIAGNOSTIC_LANGUAGES.has(normalizeLanguageId(language))
}

export function isJavaScriptOrTypeScript(language = '') {
  return JS_TS_LANGUAGES.has(normalizeLanguageId(language))
}

export function isPythonLanguage(language = '') {
  return PYTHON_LANGUAGES.has(normalizeLanguageId(language))
}

export function isCOrCppLanguage(language = '') {
  return C_CPP_LANGUAGES.has(normalizeLanguageId(language))
}

export function isCSharpLanguage(language = '') {
  return CSHARP_LANGUAGES.has(normalizeLanguageId(language))
}

export function isJavaLanguage(language = '') {
  return JAVA_LANGUAGES.has(normalizeLanguageId(language))
}

function createMissingRealProviderCapability(source = '', message = '') {
  return createUnavailableCapability({
    supported: true,
    source,
    reason: 'real_provider_missing',
    message,
  })
}

export function createContextualProviderCapability({
  providerId = '',
  resolution = null,
  providerDescriptor = null,
  contextAvailable = true,
  missingContextMessage = '',
  availableMessage = '',
} = {}) {
  const normalizedProviderId = cleanString(providerId)
  if (!contextAvailable) {
    return createMissingRealProviderCapability(
      normalizedProviderId,
      cleanString(missingContextMessage) || `${normalizedProviderId} requires additional project context.`,
    )
  }
  if (!resolution?.available) {
    return createUnavailableCapability({
      supported: true,
      source: normalizedProviderId,
      reason: cleanString(resolution?.reason) || 'missing_provider_binary',
      message: cleanString(resolution?.message) || `${normalizedProviderId} is unavailable.`,
    })
  }
  if (providerDescriptor?.status === 'degraded' || providerDescriptor?.status === 'unavailable') {
    return createUnavailableCapability({
      supported: true,
      source: normalizedProviderId,
      reason: providerDescriptor.status === 'degraded' ? 'provider_degraded' : 'provider_unavailable',
      message: cleanString(providerDescriptor?.message) || `${normalizedProviderId} is unavailable.`,
    })
  }
  return createAvailableCapability({
    source: normalizedProviderId,
    message: cleanString(availableMessage) || cleanString(resolution?.message) || `${normalizedProviderId} is available.`,
  })
}

export function createJavaProjectContextMessage(featureLabel = 'Semantic editor features') {
  const prefix = cleanString(featureLabel) || 'Semantic editor features'
  return `${prefix} require a Maven or Gradle project context (${JAVA_PROJECT_CONTEXT_FILE_NAMES.join(', ')}).`
}

export function createBaseCapabilityMap() {
  return {
    diagnostics: createUnavailableCapability(),
    hover: createUnavailableCapability(),
    definition: createUnavailableCapability(),
    references: createUnavailableCapability(),
    symbols: createUnavailableCapability(),
    formatting: createUnavailableCapability(),
    codeActions: createUnavailableCapability(),
  }
}

export function createFormatOnlyCapability(kind = '', source = 'format-only') {
  const requestKind = cleanString(kind) || 'feature'
  return createUnavailableCapability({
    supported: false,
    source,
    reason: 'format_only_language',
    message: `${requestKind} stays unavailable for format-only languages.`,
  })
}

export function normalizeDiagnosticMessage(message = {}) {
  return {
    ruleId: cleanString(message.ruleId),
    message: cleanString(message.message) || 'Issue',
    severity: Math.max(0, Number(message.severity || 0) || 0),
    fatal: message.fatal === true,
    line: Math.max(1, Number(message.line || 1) || 1),
    column: Math.max(1, Number(message.column || 1) || 1),
    endLine: Math.max(1, Number(message.endLine || message.line || 1) || 1),
    endColumn: Math.max(1, Number(message.endColumn || (Number(message.column || 1) + 1)) || 1),
    source: cleanString(message.source) || 'editor-service',
    suggestionCount: Math.max(0, Number(message.suggestionCount || 0) || 0),
    hasFix: message.hasFix === true,
  }
}

function mapLspDiagnosticSeverity(severity = 0) {
  const normalized = Math.max(0, Number(severity || 0) || 0)
  if (normalized <= 1) return 2
  if (normalized === 2) return 1
  return 0
}

export function normalizeLspDiagnosticMessage(diagnostic = {}) {
  const startLine = Math.max(1, Number(diagnostic?.range?.start?.line ?? 0) + 1)
  const startColumn = Math.max(1, Number(diagnostic?.range?.start?.character ?? 0) + 1)
  const endLine = Math.max(1, Number(diagnostic?.range?.end?.line ?? diagnostic?.range?.start?.line ?? 0) + 1)
  const endColumn = Math.max(1, Number(diagnostic?.range?.end?.character ?? diagnostic?.range?.start?.character ?? 0) + 1)
  const codeValue = typeof diagnostic?.code === 'object'
    ? cleanString(diagnostic.code?.value)
    : cleanString(diagnostic?.code)
  const severity = mapLspDiagnosticSeverity(diagnostic?.severity)

  return {
    ruleId: codeValue,
    message: cleanString(diagnostic?.message) || 'Issue',
    severity,
    fatal: severity >= 2,
    line: startLine,
    column: startColumn,
    endLine,
    endColumn,
    source: cleanString(diagnostic?.source) || 'pyright',
    suggestionCount: 0,
    hasFix: false,
  }
}

export function createSyntaxOnlyOwnership(message = '') {
  return {
    mode: 'syntax-only',
    owner: 'syntax-only',
    summary: cleanString(message) || 'Editing remains available in syntax-only mode.',
  }
}

export function createMonacoNativeOwnership(message = '') {
  return {
    mode: 'monaco-native',
    owner: 'monaco-native',
    summary: cleanString(message) || 'Diagnostics stay on the Monaco native worker for this language.',
  }
}

export function createProviderOwnership(providerId = '', message = '') {
  const provider = cleanString(providerId) || 'provider'
  return {
    mode: 'provider',
    owner: provider,
    summary: cleanString(message) || `${provider} owns diagnostics for this file.`,
  }
}

export function createUnsupportedResponse(kind = '', message = '') {
  const requestKind = cleanString(kind) || 'request'
  return {
    ok: true,
    available: false,
    reason: 'unsupported',
    message: cleanString(message) || `${requestKind} is unavailable for this file.`,
  }
}

export function buildProviderDescriptor({
  id = '',
  status = 'idle',
  root = '',
  message = '',
  source = '',
} = {}) {
  return {
    id: cleanString(id),
    status: cleanString(status) || 'idle',
    root: cleanString(root),
    source: cleanString(source),
    message: cleanString(message),
  }
}

export function inferOverallHealthStatus(providers = []) {
  const list = Array.isArray(providers) ? providers : []
  if (list.some((provider) => provider.status === 'degraded')) return 'degraded'
  const anyHealthy = list.some((provider) => provider.status === 'ready' || provider.status === 'healthy')
  if (list.some((provider) => provider.status === 'unavailable') && anyHealthy) return 'degraded'
  if (anyHealthy) return 'healthy'
  if (list.some((provider) => provider.status === 'unavailable')) return 'unavailable'
  return 'idle'
}

export function createProviderRuntimeCapability(resolution = null, providerLabel = '') {
  if (resolution?.available) {
    return createAvailableCapability({
      source: `${cleanString(providerLabel)}:${cleanString(resolution.source)}`,
      message: cleanString(resolution.message) || `${providerLabel} is available.`,
    })
  }
  return createUnavailableCapability({
    supported: true,
    source: cleanString(providerLabel),
    reason: cleanString(resolution?.reason) || 'missing_provider_binary',
    message: cleanString(resolution?.message) || `${providerLabel} is unavailable.`,
  })
}

export function createProviderHealthCapability(resolution = null, providerDescriptor = null, providerLabel = '') {
  const descriptor = providerDescriptor && typeof providerDescriptor === 'object' ? providerDescriptor : null
  if (!resolution?.available) {
    return createUnavailableCapability({
      supported: true,
      source: cleanString(providerLabel),
      reason: cleanString(resolution?.reason) || 'missing_provider_binary',
      message: cleanString(resolution?.message) || `${providerLabel} is unavailable.`,
    })
  }
  if (descriptor?.status === 'degraded' || descriptor?.status === 'unavailable') {
    return createUnavailableCapability({
      supported: true,
      source: cleanString(providerLabel),
      reason: descriptor.status === 'degraded' ? 'provider_degraded' : 'provider_unavailable',
      message: cleanString(descriptor.message) || `${providerLabel} is unavailable.`,
    })
  }
  return createProviderRuntimeCapability(resolution, providerLabel)
}

export function selectHoverContents(result = null) {
  return Array.isArray(result?.contents) ? result.contents : []
}

export function isBenignSemanticMiss(providerId = '', kind = '', message = '') {
  const normalizedProviderId = cleanString(providerId)
  const normalizedKind = cleanString(kind).toLowerCase()
  const normalizedMessage = cleanString(message)
  if (!normalizedProviderId || !normalizedKind || !normalizedMessage) return false
  if (normalizedProviderId === 'tsserver' && normalizedKind === 'hover') {
    return /no content available\.?/i.test(normalizedMessage)
  }
  return false
}

export function isBenignProviderFailure(providerId = '', message = '') {
  const normalizedProviderId = cleanString(providerId)
  const normalizedMessage = cleanString(message)
  if (!normalizedProviderId || !normalizedMessage) return false
  if (normalizedProviderId === 'clangd') {
    const lines = normalizedMessage
      .split(/\r?\n/)
      .map((line) => cleanString(line))
      .filter(Boolean)
    if (lines.length > 0 && lines.every((line) => /^[IV]\[\d{2}:\d{2}:\d{2}\.\d{3}\]/.test(line))) {
      return true
    }
  }
  if (normalizedProviderId === 'tsserver') {
    return /no content available\.?/i.test(normalizedMessage)
  }
  return false
}
