import { create } from 'zustand'
import { openAIAccountSessionCredentialChanged } from './openai-account-provider-hydration.mjs'

/**
 * useVaultStore - tracks provider manifests and provider credential configuration.
 */
let cleanupOpenAIAccountBridge = null

function normalizeOpenAIAccountState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    openAIAccountSession: source.sessionSummary && typeof source.sessionSummary === 'object'
      ? source.sessionSummary
      : null,
    activeOpenAIAccountLogin: source.activeLogin && typeof source.activeLogin === 'object'
      ? source.activeLogin
      : null,
    openAIAccountStorage: source.storage && typeof source.storage === 'object'
      ? source.storage
      : null,
  }
}

const useVaultStore = create((set, get) => ({
  providers: [],
  loaded: false,
  refreshing: false,
  openAIAccountSession: null,
  activeOpenAIAccountLogin: null,
  openAIAccountStorage: null,
  openAIAccountBridgeReady: false,
  openAIAccountBusy: false,

  resetOpenAIAccountBridgeState: () => {
    cleanupOpenAIAccountBridge?.()
    set({
      openAIAccountSession: null,
      activeOpenAIAccountLogin: null,
      openAIAccountStorage: null,
      openAIAccountBridgeReady: false,
      openAIAccountBusy: false,
    })
  },

  initializeOpenAIAccountBridge: () => {
    if (cleanupOpenAIAccountBridge) return cleanupOpenAIAccountBridge
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi) {
      set({ openAIAccountBridgeReady: false })
      return () => {}
    }
    const applyState = (nextState = {}) => {
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
      })
    }

    const refreshState = async () => {
      try {
        const nextState = await openAIAccountApi.refreshState()
        applyState(nextState)
      } catch {
        set({ openAIAccountBridgeReady: true })
      }
    }

    const unsubscribeSession = openAIAccountApi.onSessionUpdated((sessionSummary) => {
      // Rate-limit ticks keep hasSession stable; only credential flips must reload providers
      // (composer gates OpenAI on providers[].hasCredential from vault:getProviders).
      const nextSession = sessionSummary && typeof sessionSummary === 'object' ? sessionSummary : null
      const previousSession = get().openAIAccountSession
      set({ openAIAccountSession: nextSession })
      if (openAIAccountSessionCredentialChanged(previousSession, nextSession)) {
        void get().loadProviders(true)
      }
    })
    const unsubscribeLogin = openAIAccountApi.onLoginUpdated((activeLogin) => {
      set({ activeOpenAIAccountLogin: activeLogin && typeof activeLogin === 'object' ? activeLogin : null })
    })
    const unsubscribeStorage = typeof openAIAccountApi.onStorageUpdated === 'function'
      ? openAIAccountApi.onStorageUpdated((storage) => {
        set({ openAIAccountStorage: storage && typeof storage === 'object' ? storage : null })
      })
      : null

    void refreshState()

    cleanupOpenAIAccountBridge = () => {
      unsubscribeSession?.()
      unsubscribeLogin?.()
      unsubscribeStorage?.()
      cleanupOpenAIAccountBridge = null
    }
    return cleanupOpenAIAccountBridge
  },

  loadProvidersInFlight: null,

  loadProviders: async (forceRefresh = false) => {
    if (get().loadProvidersInFlight) {
      await get().loadProvidersInFlight
      if (!forceRefresh) return
    }
    set({ refreshing: true })
    const providerLoadPromise = (async () => {
      try {
        const providers = await window.addom.vault.getProviders(!!forceRefresh)
        set({ providers, loaded: true, refreshing: false })
      } catch {
        set({ loaded: true, refreshing: false })
      } finally {
        if (get().loadProvidersInFlight === providerLoadPromise) {
          set({ loadProvidersInFlight: null })
        }
      }
    })()
    set({ loadProvidersInFlight: providerLoadPromise })
    return providerLoadPromise
  },

  setKeyForProvider: async (providerId, apiKey) => {
    await window.addom.vault.setKey(providerId, apiKey)
    await get().loadProviders(true)
  },

  setAuthMethodForProvider: async (providerId, authMethod) => {
    const normalizedProviderId = String(providerId || '').trim().toLowerCase()
    if (!normalizedProviderId) return
    const normalizedAuthMethod = String(authMethod || '').trim().toLowerCase()
    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.setProviderAuthMethod !== 'function') {
      throw new Error('Provider auth settings API is unavailable.')
    }
    await settingsApi.setProviderAuthMethod(normalizedProviderId, normalizedAuthMethod)
    await get().loadProviders(true)
    if (normalizedProviderId === 'openai' && normalizedAuthMethod === 'account') {
      void get().prepareOpenAIAccountRuntime({ background: true })
    }
  },

  deleteKeyForProvider: async (providerId) => {
    await window.addom.vault.deleteKey(providerId)
    await get().loadProviders(true)
  },

  refreshOpenAIAccountState: async ({ refreshProviders = true, background = false } = {}) => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi) return null
    if (!background) {
      set({ openAIAccountBusy: true })
    }
    try {
      const nextState = await openAIAccountApi.refreshState()
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        ...(background ? {} : { openAIAccountBusy: false }),
      })
      if (refreshProviders) {
        await get().loadProviders(true)
      }
      return nextState
    } catch (error) {
      set({
        openAIAccountBridgeReady: true,
        ...(background ? {} : { openAIAccountBusy: false }),
      })
      throw error
    }
  },

  prepareOpenAIAccountRuntime: async ({ background = false, force = false } = {}) => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi || typeof openAIAccountApi.prepareRuntime !== 'function') return null
    if (!background) {
      set({ openAIAccountBusy: true })
    }
    try {
      const nextState = await openAIAccountApi.prepareRuntime({ force: force === true })
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        ...(background ? {} : { openAIAccountBusy: false }),
      })
      return nextState
    } catch (error) {
      if (!background) {
        set({ openAIAccountBusy: false, openAIAccountBridgeReady: true })
      }
      throw error
    }
  },

  checkOpenAIAccountRuntimeUpdate: async ({ background = false } = {}) => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi || typeof openAIAccountApi.checkRuntimeUpdate !== 'function') return null
    if (!background) {
      set({ openAIAccountBusy: true })
    }
    try {
      const nextState = await openAIAccountApi.checkRuntimeUpdate()
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        ...(background ? {} : { openAIAccountBusy: false }),
      })
      return nextState
    } catch (error) {
      if (!background) {
        set({ openAIAccountBusy: false, openAIAccountBridgeReady: true })
      }
      throw error
    }
  },

  installOpenAIAccountRuntimeUpdate: async () => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi || typeof openAIAccountApi.installRuntimeUpdate !== 'function') return null
    set({ openAIAccountBusy: true })
    try {
      const nextState = await openAIAccountApi.installRuntimeUpdate()
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        openAIAccountBusy: false,
      })
      await get().loadProviders(true)
      return nextState
    } catch (error) {
      set({ openAIAccountBusy: false, openAIAccountBridgeReady: true })
      throw error
    }
  },

  startOpenAIAccountLogin: async () => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi) return null
    set({ openAIAccountBusy: true })
    try {
      const nextState = await openAIAccountApi.startLogin()
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        openAIAccountBusy: false,
      })
      await get().loadProviders(true)
      return nextState
    } catch (error) {
      set({ openAIAccountBusy: false, openAIAccountBridgeReady: true })
      throw error
    }
  },

  reopenOpenAIAccountLoginBrowser: async (loginId = '') => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi || typeof openAIAccountApi.reopenLoginBrowser !== 'function') return null
    set({ openAIAccountBusy: true })
    try {
      const nextState = await openAIAccountApi.reopenLoginBrowser(loginId)
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        openAIAccountBusy: false,
      })
      return nextState
    } catch (error) {
      set({ openAIAccountBusy: false, openAIAccountBridgeReady: true })
      throw error
    }
  },

  cancelOpenAIAccountLogin: async (loginId = '') => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi) return null
    set({ openAIAccountBusy: true })
    try {
      const nextState = await openAIAccountApi.cancelLogin(loginId)
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        openAIAccountBusy: false,
      })
      await get().loadProviders(true)
      return nextState
    } catch (error) {
      set({ openAIAccountBusy: false, openAIAccountBridgeReady: true })
      throw error
    }
  },

  disconnectOpenAIAccount: async () => {
    const openAIAccountApi = window?.addom?.openaiAccount
    if (!openAIAccountApi) return null
    set({ openAIAccountBusy: true })
    try {
      const nextState = await openAIAccountApi.disconnect()
      set({
        ...normalizeOpenAIAccountState(nextState),
        openAIAccountBridgeReady: true,
        openAIAccountBusy: false,
      })
      await get().loadProviders(true)
      return nextState
    } catch (error) {
      set({ openAIAccountBusy: false, openAIAccountBridgeReady: true })
      throw error
    }
  },
}))

export default useVaultStore
