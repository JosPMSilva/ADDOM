import { createLspProviderSession } from './editor-lsp-provider-session.mjs'

function normalizeClangLanguageId(language = '', filePath = '') {
  const normalizedLanguage = String(language || '').trim().toLowerCase()
  if (normalizedLanguage === 'c') return 'c'
  if (normalizedLanguage === 'cpp' || normalizedLanguage === 'c++') return 'cpp'
  const normalizedFilePath = String(filePath || '').trim().toLowerCase()
  if (normalizedFilePath.endsWith('.c')) return 'c'
  return 'cpp'
}

export function createClangdProviderSession(resolution = {}, {
  workspaceRoot = '',
  onFailure = null,
  spawnProcess,
} = {}) {
  return createLspProviderSession(resolution, {
    providerLabel: 'clangd',
    workspaceRoot,
    onFailure,
    spawnProcess,
    getLanguageId(document = null) {
      return normalizeClangLanguageId(document?.language, document?.filePath)
    },
  })
}
