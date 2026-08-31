import { createLspProviderSession } from './editor-lsp-provider-session.mjs'

export function createJdtlsProviderSession(resolution = {}, {
  workspaceRoot = '',
  onFailure = null,
  spawnProcess,
} = {}) {
  return createLspProviderSession(resolution, {
    providerLabel: 'jdtls',
    workspaceRoot,
    onFailure,
    spawnProcess,
    getLanguageId() {
      return 'java'
    },
    configurationSettings: {
      java: {
        format: {
          enabled: true,
        },
      },
    },
  })
}
