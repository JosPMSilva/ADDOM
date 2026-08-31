import { createLspProviderSession } from './editor-lsp-provider-session.mjs'

export function createCSharpLsProviderSession(resolution = {}, {
  workspaceRoot = '',
  onFailure = null,
  spawnProcess,
} = {}) {
  return createLspProviderSession(resolution, {
    providerLabel: 'csharp-ls',
    workspaceRoot,
    onFailure,
    spawnProcess,
    getLanguageId() {
      return 'csharp'
    },
  })
}
