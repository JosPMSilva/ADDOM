import useAppStore from '../store/useAppStore.js'
import useChatStore from '../store/useChatStore.js'
import useVaultStore from '../store/useVaultStore.js'
import useWorkspaceStore from '../store/useWorkspaceStore.js'
import { providerHasCredential } from '../../common/api-clients/provider-credential-state.mjs'

let cleanupRendererStateSync = null

function syncProviderSelectionState() {
  const vaultState = useVaultStore.getState()
  const chatState = useChatStore.getState()

  const providers = Array.isArray(vaultState.providers) ? vaultState.providers : []
  chatState.setProviders(providers)

  const currentSelectedProvider = String(useChatStore.getState().selectedProvider || '').trim()
  const selectedProviderRow = providers.find(
    (row) => String(row?.id || '').trim() === currentSelectedProvider,
  ) || null

  if (!selectedProviderRow) {
    const firstConfiguredProvider = providers.find((row) => providerHasCredential(row))
    if (firstConfiguredProvider) {
      chatState.setSelectedProvider(firstConfiguredProvider.id)
    }
  }
}

export function initializeRendererStateSync() {
  if (cleanupRendererStateSync) return cleanupRendererStateSync

  let previousProviders = useVaultStore.getState().providers
  let previousSelectedProvider = useChatStore.getState().selectedProvider
  let previousProjectFolder = useAppStore.getState().projectFolder
  const workspaceApi = window?.addom?.workspace

  syncProviderSelectionState()

  const unsubscribeVault = useVaultStore.subscribe((state) => {
    if (state.providers === previousProviders) return
    previousProviders = state.providers
    syncProviderSelectionState()
  })

  const unsubscribeChat = useChatStore.subscribe((state) => {
    if (state.selectedProvider === previousSelectedProvider) return
    previousSelectedProvider = state.selectedProvider
    syncProviderSelectionState()
  })

  const unsubscribeApp = useAppStore.subscribe((state) => {
    if (state.projectFolder === previousProjectFolder) return
    previousProjectFolder = state.projectFolder
  })

  const unsubscribeWorkspaceActivation = typeof workspaceApi?.onActiveProjectChanged === 'function'
    ? workspaceApi.onActiveProjectChanged((payload = {}) => {
      void useWorkspaceStore.getState().syncExternalProjectActivation?.(payload)
    })
    : null

  cleanupRendererStateSync = () => {
    unsubscribeVault()
    unsubscribeChat()
    unsubscribeApp()
    unsubscribeWorkspaceActivation?.()
    cleanupRendererStateSync = null
  }

  return cleanupRendererStateSync
}
