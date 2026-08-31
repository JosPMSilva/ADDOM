import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  clearOpenAIAccountSessionData,
  ensureOpenAIAccountStorage,
  readOpenAIAccountActiveLogin,
  readOpenAIAccountSessionSummary,
  resolveOpenAIAccountStoragePaths,
  writeOpenAIAccountActiveLogin,
  writeOpenAIAccountSessionSummary,
} from './openai-account-storage.mjs'
import { createOpenAIAccountRuntimeManager } from './openai-account-runtime-manager.mjs'
import {
  createOpenAIAccountBridge,
  buildOpenAIAccountBridgeRuntimeConfigSignature,
  openOpenAIAccountExternalUrl,
} from './openai-account-bridge.mjs'
import {
  asOptionalNumber,
  asTrimmedString,
  cloneJson,
  delay,
  firstNonEmptyString,
} from './openai-account-auth-normalization.mjs'
import {
  asAvailability,
  buildAvailabilityFromRuntimeState,
  buildDefaultSessionSummary,
  buildSessionSummaryFromBridge,
  normalizeSessionSummary,
  selectPreferredCollaborationModeId,
} from './openai-account-auth-session-summary.mjs'
import {
  LOGIN_COMPLETION_REFRESH_ATTEMPTS,
  LOGIN_COMPLETION_REFRESH_DELAY_MS,
  buildBrowserLaunchResult,
  buildFailedLogin,
  buildTimedOutLogin,
  isPendingLogin,
  normalizeActiveLogin,
  sanitizeActiveLoginForPersistence,
  shouldTimeOutLogin,
} from './openai-account-auth-login-lifecycle.mjs'
import {
  isRetryableLoginConfirmationState,
  mapBridgeError,
  resolveLoginConfirmationFailure,
} from './openai-account-auth-bridge-errors.mjs'
import { refreshOpenAIAccountServiceState } from './openai-account-auth-refresh-state.mjs'
import { getSettings } from '../settings.mjs'

export class OpenAIAccountAuthService extends EventEmitter {
  constructor({
    userDataPath = '',
    bridge = null,
    bridgeFactory = null,
    runtimeManager = null,
    runtimeManagerFactory = null,
    bridgeSupported = null,
    unavailableReason = '',
    unavailableMessage = '',
    openExternalUrl = null,
    now = () => Date.now(),
    sleep = delay,
  } = {}) {
    super()
    this.userDataPath = asTrimmedString(userDataPath)
    this.now = typeof now === 'function' ? now : () => Date.now()
    this.openExternalUrl = typeof openExternalUrl === 'function' ? openExternalUrl : openOpenAIAccountExternalUrl
    this.bridge = bridge || null
    this.injectedBridge = !!bridge
    this.bridgeExecutablePath = ''
    this.bridgeRuntimeConfigSignature = ''
    this.bridgeFactory = typeof bridgeFactory === 'function'
      ? bridgeFactory
      : ({ userDataPath: nextUserDataPath, codexExecutablePath = '', runtimeSettings = null }) => createOpenAIAccountBridge({
        userDataPath: nextUserDataPath,
        codexExecutablePath,
        runtimeSettings,
      })
    this.runtimeManager = runtimeManager || null
    this.runtimeManagerFactory = typeof runtimeManagerFactory === 'function'
      ? runtimeManagerFactory
      : ({ userDataPath: nextUserDataPath }) => createOpenAIAccountRuntimeManager({ userDataPath: nextUserDataPath })
    this.bridgeEventsRegistered = false
    this.bridgeEventSource = null
    this.bridgeEventBindings = null
    this.availabilityOverride = typeof bridgeSupported === 'boolean'
      ? {
        supported: bridgeSupported,
        reason: asTrimmedString(unavailableReason),
        message: asTrimmedString(unavailableMessage),
      }
      : null
    this.sleep = typeof sleep === 'function' ? sleep : delay
    this.sessionSummary = buildDefaultSessionSummary(this.getAvailability())
    this.activeLogin = null
    this.refreshStatePromise = null
    this.loaded = false
    this.registerBridgeEvents()
    this.registerRuntimeManagerEvents()
  }

  registerBridgeEvents() {
    if (!this.bridge || typeof this.bridge.on !== 'function') return
    if (this.bridgeEventsRegistered && this.bridgeEventSource === this.bridge) return
    this.unregisterBridgeEvents()
    const sourceBridge = this.bridge
    const onAvailabilityChanged = (availability = {}) => {
      if (sourceBridge !== this.bridge) return
      const normalizedAvailability = asAvailability(availability)
      this.syncAvailability(normalizedAvailability, { emit: true })
      if (normalizedAvailability.supported !== true) {
        this.failPendingLogin({
          errorCode: normalizedAvailability.reason || 'bridge_unavailable',
          errorMessage: normalizedAvailability.message || 'OpenAI account login could not continue because the local account bridge became unavailable.',
        })
      }
    }
    const onLoginCompleted = (payload = {}) => {
      if (sourceBridge !== this.bridge) return
      void this.handleLoginCompleted(payload)
    }
    const onAccountUpdated = () => {
      if (sourceBridge !== this.bridge) return
      void this.refreshState()
    }
    const onRateLimitsUpdated = () => {
      if (sourceBridge !== this.bridge) return
      void this.refreshState()
    }
    sourceBridge.on('availability-changed', onAvailabilityChanged)
    sourceBridge.on('account/login/completed', onLoginCompleted)
    sourceBridge.on('account/updated', onAccountUpdated)
    sourceBridge.on('account/rateLimits/updated', onRateLimitsUpdated)
    this.bridgeEventSource = sourceBridge
    this.bridgeEventBindings = {
      onAvailabilityChanged,
      onLoginCompleted,
      onAccountUpdated,
      onRateLimitsUpdated,
    }
    this.bridgeEventsRegistered = true
  }

  unregisterBridgeEvents(bridge = this.bridgeEventSource) {
    if (!bridge || typeof bridge.off !== 'function' || !this.bridgeEventBindings) {
      this.bridgeEventsRegistered = false
      this.bridgeEventSource = null
      this.bridgeEventBindings = null
      return
    }
    bridge.off('availability-changed', this.bridgeEventBindings.onAvailabilityChanged)
    bridge.off('account/login/completed', this.bridgeEventBindings.onLoginCompleted)
    bridge.off('account/updated', this.bridgeEventBindings.onAccountUpdated)
    bridge.off('account/rateLimits/updated', this.bridgeEventBindings.onRateLimitsUpdated)
    this.bridgeEventsRegistered = false
    this.bridgeEventSource = null
    this.bridgeEventBindings = null
  }

  failPendingLogin({
    errorCode = 'login_failed',
    errorMessage = 'OpenAI account login failed.',
  } = {}) {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    if (!isPendingLogin(this.activeLogin)) return false
    this.setActiveLogin(buildFailedLogin(this.activeLogin, {
      now: this.now(),
      errorCode,
      errorMessage,
    }))
    return true
  }

  getAvailability() {
    if (this.availabilityOverride) {
      return asAvailability(this.availabilityOverride)
    }
    if (this.bridge && typeof this.bridge.getAvailability === 'function') {
      return asAvailability(this.bridge.getAvailability())
    }
    return asAvailability({
      supported: false,
      reason: 'bridge_not_checked',
      message: 'OpenAI account bridge availability has not been checked yet.',
    })
  }

  getStoragePaths() {
    return resolveOpenAIAccountStoragePaths(this.userDataPath)
  }

  registerRuntimeManagerEvents() {
    const runtimeManager = this.runtimeManager
    if (!runtimeManager || typeof runtimeManager.on !== 'function' || runtimeManager.__addomEventsRegistered === true) return
    runtimeManager.on('state-updated', (runtimeState = null) => {
      const storage = { ...this.getStoragePaths(), runtime: runtimeState || runtimeManager.getState?.() || {}, availability: this.getAvailability() }
      this.emit('storage-updated', cloneJson(storage))
    })
    runtimeManager.__addomEventsRegistered = true
  }
  getRuntimeManager() {
    if (this.runtimeManager) {
      this.registerRuntimeManagerEvents()
      return this.runtimeManager
    }
    this.runtimeManager = this.runtimeManagerFactory({ userDataPath: this.userDataPath })
    this.registerRuntimeManagerEvents()
    return this.runtimeManager
  }

  getBridge() {
    if (this.injectedBridge && this.bridge) {
      this.registerBridgeEvents()
      return this.bridge
    }
    const executablePath = asTrimmedString(this.getRuntimeManager()?.getState?.().executablePath)
    const runtimeSettings = getSettings()?.providerRuntimeSettings?.openai
    const runtimeConfigSignature = buildOpenAIAccountBridgeRuntimeConfigSignature(runtimeSettings)
    if (
      this.bridge
      && this.bridgeExecutablePath === executablePath
      && this.bridgeRuntimeConfigSignature === runtimeConfigSignature
    ) {
      this.registerBridgeEvents()
      return this.bridge
    }
    const previousBridge = this.bridge
    if (previousBridge) {
      this.unregisterBridgeEvents(previousBridge)
    }
    if (previousBridge && typeof previousBridge.stop === 'function') {
      void previousBridge.stop().catch(() => {})
    }
    this.bridge = this.bridgeFactory({
      userDataPath: this.userDataPath,
      codexExecutablePath: executablePath,
      runtimeSettings,
    })
    this.bridgeExecutablePath = executablePath
    this.bridgeRuntimeConfigSignature = runtimeConfigSignature
    this.registerBridgeEvents()
    return this.bridge || null
  }

  ensureLoaded() {
    if (this.loaded) return
    this.reloadFromDisk({ emit: false })
  }

  getState() {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: false })
    const runtimeState = this.getRuntimeManager().refreshState()
    const availability = this.getAvailability()
    const sessionSummary = normalizeSessionSummary(this.sessionSummary, availability)
    return {
      sessionSummary: cloneJson(sessionSummary),
      activeLogin: this.activeLogin ? cloneJson(this.activeLogin) : null,
      storage: {
        ...this.getStoragePaths(),
        runtime: runtimeState,
        availability,
      },
    }
  }

  syncAvailability(availability = asAvailability(), { emit = false } = {}) {
    const previous = JSON.stringify(this.sessionSummary)
    this.sessionSummary = normalizeSessionSummary(this.sessionSummary, availability)
    if (emit && JSON.stringify(this.sessionSummary) !== previous) {
      writeOpenAIAccountSessionSummary(this.sessionSummary, this.userDataPath)
      this.emit('session-updated', cloneJson(this.sessionSummary))
    }
  }

  async probeBridgeAvailability({ prepareRuntime = false } = {}) {
    if (this.availabilityOverride) {
      return this.getAvailability()
    }
    const runtimeManager = this.getRuntimeManager()
    const runtimeState = prepareRuntime === true
      ? await runtimeManager.ensureRuntimeReady()
      : runtimeManager.refreshState()
    const runtimeAvailability = buildAvailabilityFromRuntimeState(runtimeState)
    if (runtimeAvailability.supported !== true) {
      this.syncAvailability(runtimeAvailability, { emit: true })
      return runtimeAvailability
    }
    const bridge = this.getBridge()
    const probeFn = bridge && typeof bridge.probeCompatibility === 'function'
      ? bridge.probeCompatibility.bind(bridge)
      : (bridge && typeof bridge.probeAvailability === 'function'
          ? bridge.probeAvailability.bind(bridge)
          : null)
    if (!probeFn) {
      return this.getAvailability()
    }
    const availability = asAvailability(await probeFn())
    this.syncAvailability(availability, { emit: true })
    return availability
  }

  reloadFromDisk({ emit = false } = {}) {
    const previousSession = JSON.stringify(this.sessionSummary)
    const previousLogin = JSON.stringify(this.activeLogin)
    const availability = this.getAvailability()
    const nextSession = normalizeSessionSummary(
      readOpenAIAccountSessionSummary(this.userDataPath),
      availability,
    )
    const loadedLogin = normalizeActiveLogin(readOpenAIAccountActiveLogin(this.userDataPath))
    const now = this.now()
    const nextLogin = buildTimedOutLogin(loadedLogin, now)
    const timedOut = !!nextLogin && nextLogin.phase === 'timed_out' && loadedLogin?.phase !== 'timed_out'

    if (timedOut && nextLogin) {
      writeOpenAIAccountActiveLogin(nextLogin, this.userDataPath)
    }

    this.sessionSummary = nextSession
    this.activeLogin = nextLogin
    this.loaded = true

    if (!emit) return
    if (JSON.stringify(this.sessionSummary) !== previousSession) {
      this.emit('session-updated', cloneJson(this.sessionSummary))
    }
    if (JSON.stringify(this.activeLogin) !== previousLogin) {
      this.emit('login-updated', this.activeLogin ? cloneJson(this.activeLogin) : null)
    }
  }

  setSessionSummary(summary = null) {
    this.ensureLoaded()
    const normalized = normalizeSessionSummary(summary, this.getAvailability())
    this.sessionSummary = normalized
    writeOpenAIAccountSessionSummary(normalized, this.userDataPath)
    this.emit('session-updated', cloneJson(this.sessionSummary))
    return this.getState()
  }

  clearSessionSummary() {
    this.ensureLoaded()
    this.sessionSummary = buildDefaultSessionSummary(this.getAvailability())
    writeOpenAIAccountSessionSummary(null, this.userDataPath)
    this.emit('session-updated', cloneJson(this.sessionSummary))
    return this.getState()
  }

  setActiveLogin(login = null) {
    this.ensureLoaded()
    const normalized = normalizeActiveLogin(login)
    this.activeLogin = normalized
    writeOpenAIAccountActiveLogin(sanitizeActiveLoginForPersistence(normalized), this.userDataPath)
    this.emit('login-updated', normalized ? cloneJson(normalized) : null)
    return this.getState()
  }

  reconcileTimedOutLogin({ emit = false } = {}) {
    this.ensureLoaded()
    const nextLogin = buildTimedOutLogin(this.activeLogin, this.now())
    const changed = JSON.stringify(nextLogin) !== JSON.stringify(this.activeLogin)
    if (!changed) return this.activeLogin
    this.activeLogin = nextLogin
    writeOpenAIAccountActiveLogin(sanitizeActiveLoginForPersistence(nextLogin), this.userDataPath)
    if (emit) {
      this.emit('login-updated', nextLogin ? cloneJson(nextLogin) : null)
    }
    return this.activeLogin
  }

  async refreshState() {
    if (this.refreshStatePromise) return this.refreshStatePromise
    this.refreshStatePromise = this.refreshStateOnce()
    try {
      return await this.refreshStatePromise
    } finally {
      this.refreshStatePromise = null
    }
  }

  async refreshStateOnce() {
    return refreshOpenAIAccountServiceState(this)
  }

  async prepareRuntime(options = {}) {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    const runtimeState = await this.getRuntimeManager().ensureRuntimeReady({
      force: options?.force === true,
    })
    const runtimeAvailability = buildAvailabilityFromRuntimeState(runtimeState)
    this.syncAvailability(runtimeAvailability, { emit: true })
    this.emit('storage-updated', cloneJson(this.getState().storage))
    return this.getState()
  }

  async checkRuntimeUpdate() {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    await this.getRuntimeManager().checkForUpdates()
    this.emit('storage-updated', cloneJson(this.getState().storage))
    return this.getState()
  }

  async installRuntimeUpdate() {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    const runtimeState = await this.getRuntimeManager().installLatestRuntime()
    const runtimeAvailability = buildAvailabilityFromRuntimeState(runtimeState)
    this.syncAvailability(runtimeAvailability, { emit: true })
    this.emit('storage-updated', cloneJson(this.getState().storage))
    return this.getState()
  }

  async resolveNativeCollaborationModeId({ forceReload = false } = {}) {
    this.ensureLoaded()
    const sessionSummary = this.sessionSummary && typeof this.sessionSummary === 'object'
      ? this.sessionSummary
      : buildDefaultSessionSummary(this.getAvailability())
    const cachedModeId = selectPreferredCollaborationModeId(
      sessionSummary.collaborationModes,
      sessionSummary.defaultCollaborationModeId,
    )
    if (!forceReload && cachedModeId) return cachedModeId
    if (sessionSummary.hasSession !== true) return ''
    const bridge = this.getBridge()
    if (!bridge || typeof bridge.listCollaborationModes !== 'function') return cachedModeId
    try {
      const collaborationModes = await bridge.listCollaborationModes({ forceReload })
      const nextSummary = normalizeSessionSummary({
        ...sessionSummary,
        collaborationModes,
        defaultCollaborationModeId: selectPreferredCollaborationModeId(collaborationModes),
        updatedAt: this.now(),
      }, this.getAvailability())
      this.sessionSummary = nextSummary
      writeOpenAIAccountSessionSummary(nextSummary, this.userDataPath)
      this.emit('session-updated', cloneJson(this.sessionSummary))
      return asTrimmedString(nextSummary.defaultCollaborationModeId)
    } catch {
      return cachedModeId
    }
  }

  async confirmCompletedLogin() {
    let latestState = this.getState()
    for (let attempt = 0; attempt < LOGIN_COMPLETION_REFRESH_ATTEMPTS; attempt += 1) {
      latestState = await this.refreshState()
      if (latestState?.sessionSummary?.hasSession === true) {
        return {
          ok: true,
          state: latestState,
        }
      }
      if (!isRetryableLoginConfirmationState(latestState) || attempt >= LOGIN_COMPLETION_REFRESH_ATTEMPTS - 1) {
        break
      }
      await this.sleep(LOGIN_COMPLETION_REFRESH_DELAY_MS)
    }
    return {
      ok: false,
      state: latestState,
      ...resolveLoginConfirmationFailure(latestState),
    }
  }

  async startLogin() {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    const now = this.now()
    if (isPendingLogin(this.activeLogin)) {
      return {
        ok: true,
        reused: true,
        ...this.getState(),
      }
    }

    ensureOpenAIAccountStorage(this.userDataPath)
    const loginId = `openai_login_${crypto.randomBytes(8).toString('hex')}`
    const startingLogin = {
      loginId,
      phase: 'starting',
      authUrl: '',
      browserOpened: false,
      startedAt: asOptionalNumber(now),
      updatedAt: asOptionalNumber(now),
      completedAt: 0,
      errorCode: '',
      errorMessage: '',
    }
    this.setActiveLogin(startingLogin)

    const runtimeState = await this.getRuntimeManager().ensureRuntimeReady()
    const runtimeAvailability = buildAvailabilityFromRuntimeState(runtimeState)
    if (runtimeAvailability.supported !== true) {
      const failedLogin = buildFailedLogin(startingLogin, {
        now: this.now(),
        errorCode: runtimeAvailability.reason || 'runtime_missing',
        errorMessage: runtimeAvailability.message || 'Pinned Codex runtime is unavailable.',
      })
      this.syncAvailability(runtimeAvailability, { emit: true })
      this.setActiveLogin(failedLogin)
      return {
        ok: false,
        reused: false,
        ...this.getState(),
      }
    }

    const availability = await this.probeBridgeAvailability({ prepareRuntime: false })
    const bridge = availability.supported === true ? this.getBridge() : null
    if (availability.supported !== true || !bridge || typeof bridge.startLogin !== 'function') {
      const failedLogin = buildFailedLogin(startingLogin, {
        now: this.now(),
        errorCode: availability.reason || 'bridge_unavailable',
        errorMessage: availability.message || 'OpenAI account login is unavailable in this build.',
      })
      this.setActiveLogin(failedLogin)
      return {
        ok: false,
        reused: false,
        ...this.getState(),
      }
    }

    try {
      const bridgeLogin = await bridge.startLogin({ type: 'chatgpt' })
      const bridgeLoginId = firstNonEmptyString(bridgeLogin?.loginId, startingLogin.loginId)
      const authUrl = firstNonEmptyString(bridgeLogin?.authUrl)
      if (!authUrl) {
        const failedLogin = buildFailedLogin({
          ...startingLogin,
          loginId: bridgeLoginId,
        }, {
          now: this.now(),
          errorCode: 'missing_auth_url',
          errorMessage: 'OpenAI account login could not continue because the local account bridge did not return a browser URL.',
        })
        this.setActiveLogin(failedLogin)
        return {
          ok: false,
          reused: false,
          ...this.getState(),
        }
      }
      const pendingLogin = {
        ...startingLogin,
        loginId: bridgeLoginId,
        authUrl,
        phase: 'waiting_for_browser',
        updatedAt: asOptionalNumber(this.now()),
      }
      this.setActiveLogin(pendingLogin)
      await this.reopenLoginBrowser(bridgeLoginId)
      return {
        ok: true,
        reused: false,
        ...this.getState(),
      }
    } catch (error) {
      const mapped = mapBridgeError(error, 'login_failed', 'OpenAI account login failed.')
      const failedLogin = buildFailedLogin(this.activeLogin || startingLogin, {
        now: this.now(),
        errorCode: mapped.reason,
        errorMessage: mapped.message,
      })
      this.setActiveLogin(failedLogin)
      return {
        ok: false,
        reused: false,
        ...this.getState(),
      }
    }
  }

  async reopenLoginBrowser(loginId = '') {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    if (!isPendingLogin(this.activeLogin)) {
      return {
        ok: false,
        opened: false,
        reason: 'login_not_pending',
        ...this.getState(),
      }
    }
    const normalizedLoginId = asTrimmedString(loginId)
    if (normalizedLoginId && normalizedLoginId !== this.activeLogin?.loginId) {
      return {
        ok: false,
        opened: false,
        reason: 'login_mismatch',
        ...this.getState(),
      }
    }
    const authUrl = firstNonEmptyString(this.activeLogin?.authUrl)
    if (!authUrl || !this.openExternalUrl) {
      this.setActiveLogin(buildBrowserLaunchResult(this.activeLogin, {
        now: this.now(),
        browserOpened: false,
        errorCode: 'missing_auth_url',
        errorMessage: 'OpenAI account login cannot reopen because the browser URL is no longer available.',
      }))
      return {
        ok: false,
        opened: false,
        reason: 'missing_auth_url',
        ...this.getState(),
      }
    }
    let browserOpened = false
    try {
      browserOpened = (await Promise.resolve(this.openExternalUrl(authUrl))) !== false
    } catch {
      browserOpened = false
    }
    this.setActiveLogin(buildBrowserLaunchResult(this.activeLogin, {
      now: this.now(),
      browserOpened,
      errorCode: 'browser_open_failed',
      errorMessage: 'ADDOM could not open the OpenAI account login page in the browser.',
    }))
    return {
      ok: browserOpened,
      opened: browserOpened,
      reason: browserOpened ? '' : 'browser_open_failed',
      ...this.getState(),
    }
  }

  async handleLoginCompleted(payload = {}) {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    const loginId = asTrimmedString(payload?.loginId)
    if (!loginId || loginId !== this.activeLogin?.loginId) return
    if (!isPendingLogin(this.activeLogin)) return
    const success = payload?.success === true
    if (success) {
      const completedLogin = { ...this.activeLogin }
      const confirmation = await this.confirmCompletedLogin()
      if (confirmation.ok === true) {
        await this.resolveNativeCollaborationModeId()
        this.setActiveLogin({
          ...completedLogin,
          phase: 'succeeded',
          authUrl: '',
          updatedAt: asOptionalNumber(this.now()),
          completedAt: asOptionalNumber(this.now()),
          errorCode: '',
          errorMessage: '',
        })
        return
      }
      this.setActiveLogin(buildFailedLogin(completedLogin, {
        now: this.now(),
        errorCode: confirmation.errorCode,
        errorMessage: confirmation.errorMessage,
      }))
      return
    }
    const mapped = mapBridgeError(payload?.error, 'login_failed', 'OpenAI account login failed.')
    this.setActiveLogin(buildFailedLogin(this.activeLogin, {
      now: this.now(),
      errorCode: mapped.reason,
      errorMessage: mapped.message,
    }))
  }

  async cancelLogin(loginId = '') {
    this.ensureLoaded()
    this.reconcileTimedOutLogin({ emit: true })
    if (!isPendingLogin(this.activeLogin)) {
      return {
        ok: true,
        cancelled: false,
        ...this.getState(),
      }
    }
    const normalizedLoginId = asTrimmedString(loginId)
    if (normalizedLoginId && normalizedLoginId !== this.activeLogin?.loginId) {
      return {
        ok: false,
        cancelled: false,
        ...this.getState(),
      }
    }
    const bridge = this.bridge
    if (bridge && typeof bridge.cancelLogin === 'function') {
      try {
        await bridge.cancelLogin(this.activeLogin?.loginId || normalizedLoginId)
      } catch {
        // Best effort only; local state still transitions to cancelled.
      }
    }
    this.setActiveLogin({
      ...this.activeLogin,
      phase: 'cancelled',
      authUrl: '',
      updatedAt: asOptionalNumber(this.now()),
      completedAt: asOptionalNumber(this.now()),
      errorCode: '',
      errorMessage: '',
    })
    return {
      ok: true,
      cancelled: true,
      ...this.getState(),
    }
  }

  async disconnect() {
    this.ensureLoaded()
    const bridge = this.bridge
    if (bridge && typeof bridge.logout === 'function') {
      try {
        await bridge.logout()
      } catch {
        // Best effort. Local storage cleanup still runs.
      }
    }
    if (bridge && typeof bridge.stop === 'function') {
      try {
        await bridge.stop()
      } catch {
        // Best effort bridge stop only.
      }
    }
    clearOpenAIAccountSessionData(this.userDataPath)
    this.sessionSummary = buildDefaultSessionSummary(this.getAvailability())
    this.activeLogin = null
    this.emit('session-updated', cloneJson(this.sessionSummary))
    this.emit('login-updated', null)
    this.emit('storage-updated', cloneJson(this.getState().storage))
    return this.getState()
  }
}

export function createOpenAIAccountAuthService(options = {}) {
  return new OpenAIAccountAuthService(options)
}

let openAIAccountAuthServiceSingleton = null

export function getOpenAIAccountAuthService() {
  if (!openAIAccountAuthServiceSingleton) {
    openAIAccountAuthServiceSingleton = createOpenAIAccountAuthService()
  }
  return openAIAccountAuthServiceSingleton
}

export const __testOpenAIAccountInternals = Object.freeze({
  normalizeSessionSummary,
  normalizeActiveLogin,
  buildDefaultSessionSummary,
  buildSessionSummaryFromBridge,
  isPendingLogin,
  shouldTimeOutLogin,
  mapBridgeError,
  resetSingleton() {
    openAIAccountAuthServiceSingleton = null
  },
})
