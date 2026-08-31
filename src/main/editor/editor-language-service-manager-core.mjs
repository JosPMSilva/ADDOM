import {
  EDITOR_SERVICE_CAPABILITY_KEYS,
  EDITOR_SERVICE_REQUEST_KINDS,
  EDITOR_SERVICE_SYNC_EVENTS,
} from './editor-language-service-contract.mjs'
import {
  buildAbsoluteFilePath,
  buildDocumentUri,
  buildProviderDescriptor,
  cleanString,
  createBaseCapabilityMap,
  createUnsupportedResponse,
  detectNearestConfigRoot,
  isJavaScriptOrTypeScript,
  isMonacoNativeDiagnosticLanguage,
  normalizeLanguageId,
  normalizeWorkspaceRoot,
  normalizeWorkspaceRelativeFilePath,
  samePath,
} from './editor-language-service-manager-shared.mjs'
import {
  lintTextViaWorker,
  fixTextViaWorker,
  resetEditorLintWorker,
} from '../ipc-handlers/editor-lint.mjs'
import {
  detectNearestBiomeConfigRoot,
  detectNearestClangCompileContext,
  detectNearestCSharpProjectRoot,
  detectNearestJavaProjectRoot,
  detectNearestClangFormatConfigRoot,
  detectNearestClangTidyConfigRoot,
  detectNearestRuffConfigRoot,
  fixClangTidyTextWithRouter,
  fixDotnetFormatTextWithRouter,
  fixPythonTextWithRouter,
  formatTextWithRouter,
  getBiomeFormatterAvailability,
  getCSharpierAvailability,
  getClangFormatAvailability,
  getClangTidyFixAvailability,
  getDotnetFormatFixAvailability,
  getCodeActionRouteAvailability,
  getFormattingRouteAvailability,
  getRuffFixAvailability,
  getRuffFormatterAvailability,
  isFormatOnlyLanguage,
  resetFormatterCommandCaches,
  supportsBiomeFormat,
  supportsCSharpierFormat,
  supportsClangFormat,
  supportsClangTidyFix,
  supportsDotnetFormatFix,
  supportsDataConfigFormat,
  supportsMarkupFormat,
  supportsPrettierStyleFormat,
  supportsRuffFix,
  supportsRuffFormat,
} from '../ipc-handlers/editor-format.mjs'
import {
  resolveClangdRuntime,
  resolveCSharpLsRuntime,
  resolveJdtlsRuntime,
  resolvePyrightRuntime,
  resolveTsServerRuntime,
} from './editor-provider-discovery.mjs'
import { createClangdProviderSession } from './editor-clangd-provider.mjs'
import { createCSharpLsProviderSession } from './editor-csharp-ls-provider.mjs'
import { createJdtlsProviderSession } from './editor-jdtls-provider.mjs'
import { createPyrightProviderSession } from './editor-pyright-provider.mjs'
import { createTsServerProviderSession } from './editor-tsserver-provider.mjs'
import { createEditorLanguageServiceCodeActionsRequester } from './editor-language-service-code-actions.mjs'
import { createEditorLanguageServiceDiagnosticsRequester } from './editor-language-service-diagnostics.mjs'
import { createEditorLanguageServiceFormattingRequester } from './editor-language-service-formatting.mjs'
import { createEditorLanguageServiceProviderLifecycle } from './editor-language-service-provider-lifecycle.mjs'
import { createEditorLanguageServiceSemanticRequester } from './editor-language-service-semantic-requests.mjs'
import { createEditorLanguageServiceStateBuilder } from './editor-language-service-state-builder.mjs'

export function createEditorLanguageServiceManager(dependencies = {}) {
  const lintTextViaWorkerFn = dependencies.lintTextViaWorker || lintTextViaWorker
  const fixClangTidyTextWithRouterFn = dependencies.fixClangTidyTextWithRouter || fixClangTidyTextWithRouter
  const fixDotnetFormatTextWithRouterFn = dependencies.fixDotnetFormatTextWithRouter || fixDotnetFormatTextWithRouter
  const fixTextViaWorkerFn = dependencies.fixTextViaWorker || fixTextViaWorker
  const fixPythonTextWithRouterFn = dependencies.fixPythonTextWithRouter || fixPythonTextWithRouter
  const formatTextWithRouterFn = dependencies.formatTextWithRouter || formatTextWithRouter
  const detectNearestBiomeConfigRootFn = dependencies.detectNearestBiomeConfigRoot || detectNearestBiomeConfigRoot
  const detectNearestClangCompileContextFn = dependencies.detectNearestClangCompileContext || detectNearestClangCompileContext
  const detectNearestCSharpProjectRootFn = dependencies.detectNearestCSharpProjectRoot || detectNearestCSharpProjectRoot
  const detectNearestJavaProjectRootFn = dependencies.detectNearestJavaProjectRoot || detectNearestJavaProjectRoot
  const detectNearestClangFormatConfigRootFn = dependencies.detectNearestClangFormatConfigRoot || detectNearestClangFormatConfigRoot
  const detectNearestClangTidyConfigRootFn = dependencies.detectNearestClangTidyConfigRoot || detectNearestClangTidyConfigRoot
  const getBiomeFormatterAvailabilityFn = dependencies.getBiomeFormatterAvailability || getBiomeFormatterAvailability
  const getCSharpierAvailabilityFn = dependencies.getCSharpierAvailability || getCSharpierAvailability
  const getClangFormatAvailabilityFn = dependencies.getClangFormatAvailability || getClangFormatAvailability
  const getClangTidyFixAvailabilityFn = dependencies.getClangTidyFixAvailability || getClangTidyFixAvailability
  const getDotnetFormatFixAvailabilityFn = dependencies.getDotnetFormatFixAvailability || getDotnetFormatFixAvailability
  const getCodeActionRouteAvailabilityFn = dependencies.getCodeActionRouteAvailability || getCodeActionRouteAvailability
  const getFormattingRouteAvailabilityFn = dependencies.getFormattingRouteAvailability || getFormattingRouteAvailability
  const isFormatOnlyLanguageFn = dependencies.isFormatOnlyLanguage || isFormatOnlyLanguage
  const supportsBiomeFormatFn = dependencies.supportsBiomeFormat || supportsBiomeFormat
  const supportsCSharpierFormatFn = dependencies.supportsCSharpierFormat || supportsCSharpierFormat
  const supportsClangFormatFn = dependencies.supportsClangFormat || supportsClangFormat
  const supportsClangTidyFixFn = dependencies.supportsClangTidyFix || supportsClangTidyFix
  const supportsDotnetFormatFixFn = dependencies.supportsDotnetFormatFix || supportsDotnetFormatFix
  const supportsDataConfigFormatFn = dependencies.supportsDataConfigFormat || supportsDataConfigFormat
  const supportsMarkupFormatFn = dependencies.supportsMarkupFormat || supportsMarkupFormat
  const supportsPrettierStyleFormatFn = dependencies.supportsPrettierStyleFormat || supportsPrettierStyleFormat
  const detectNearestRuffConfigRootFn = dependencies.detectNearestRuffConfigRoot || detectNearestRuffConfigRoot
  const getRuffFixAvailabilityFn = dependencies.getRuffFixAvailability || dependencies.getRuffFormatterAvailability || getRuffFixAvailability
  const getRuffFormatterAvailabilityFn = dependencies.getRuffFormatterAvailability || getRuffFormatterAvailability
  const supportsRuffFixFn = dependencies.supportsRuffFix || dependencies.supportsRuffFormat || supportsRuffFix
  const supportsRuffFormatFn = dependencies.supportsRuffFormat || supportsRuffFormat
  const resolveClangdRuntimeFn = dependencies.resolveClangdRuntime || resolveClangdRuntime
  const resolveCSharpLsRuntimeFn = dependencies.resolveCSharpLsRuntime || resolveCSharpLsRuntime
  const resolveJdtlsRuntimeFn = dependencies.resolveJdtlsRuntime || resolveJdtlsRuntime
  const resolveTsServerRuntimeFn = dependencies.resolveTsServerRuntime || resolveTsServerRuntime
  const resolvePyrightRuntimeFn = dependencies.resolvePyrightRuntime || resolvePyrightRuntime
  const createClangdProviderSessionFn = dependencies.createClangdProviderSession || createClangdProviderSession
  const createCSharpLsProviderSessionFn = dependencies.createCSharpLsProviderSession || createCSharpLsProviderSession
  const createJdtlsProviderSessionFn = dependencies.createJdtlsProviderSession || createJdtlsProviderSession
  const createTsServerProviderSessionFn = dependencies.createTsServerProviderSession || createTsServerProviderSession
  const createPyrightProviderSessionFn = dependencies.createPyrightProviderSession || createPyrightProviderSession
  const resetFormatterCommandCachesFn = dependencies.resetFormatterCommandCaches || resetFormatterCommandCaches
  const documents = new Map()
  const providerHealth = new Map()
  const providerResolutionCache = new Map()
  const providerSessions = new Map()
  const lastLoggedFailureByProvider = new Map()
  let activeWorkspaceRoot = ''

  function setProviderHealth(providerId, nextState = {}) {
    const normalizedProviderId = cleanString(providerId)
    if (!normalizedProviderId) return
    providerHealth.set(normalizedProviderId, buildProviderDescriptor({
      id: normalizedProviderId,
      ...nextState,
    }))
  }

  function logProviderFailure(providerId, message = '', context = {}) {
    const normalizedProviderId = cleanString(providerId)
    const normalizedMessage = cleanString(message)
    if (!normalizedProviderId || !normalizedMessage) return
    const filePath = cleanString(context.filePath)
    const logKey = `${normalizedProviderId}:${normalizedMessage}:${filePath}`
    if (lastLoggedFailureByProvider.get(normalizedProviderId) === logKey) return
    lastLoggedFailureByProvider.set(normalizedProviderId, logKey)
    console.warn(
      `[editor-service] ${normalizedProviderId} failed${filePath ? ` for ${filePath}` : ''}: ${normalizedMessage}`,
    )
  }

  const {
    getProviderResolution,
    buildDefaultProviderDescriptor,
    ensureProviderSession,
    syncProviderDocumentIfRunning,
    stopAllProviderSessions,
  } = createEditorLanguageServiceProviderLifecycle({
    providerResolutionCache,
    providerSessions,
    resolveClangdRuntimeFn,
    resolveCSharpLsRuntimeFn,
    resolveJdtlsRuntimeFn,
    resolveTsServerRuntimeFn,
    resolvePyrightRuntimeFn,
    createClangdProviderSessionFn,
    createCSharpLsProviderSessionFn,
    createJdtlsProviderSessionFn,
    createTsServerProviderSessionFn,
    createPyrightProviderSessionFn,
    setProviderHealth,
    logProviderFailure,
  })

  function clearRuntimeProviderState() {
    resetFormatterCommandCachesFn()
    providerResolutionCache.clear()
    for (const providerId of ['biome', 'clang-format', 'clang-tidy', 'clangd', 'csharp-ls', 'csharpier', 'dotnet-format', 'jdtls', 'pyright', 'ruff', 'tsserver']) {
      providerHealth.delete(providerId)
      lastLoggedFailureByProvider.delete(providerId)
    }
  }

  function resetWorkspaceSession(nextWorkspaceRoot = '') {
    const normalizedNextRoot = normalizeWorkspaceRoot(nextWorkspaceRoot)
    documents.clear()
    providerHealth.clear()
    providerResolutionCache.clear()
    lastLoggedFailureByProvider.clear()
    void stopAllProviderSessions()
    activeWorkspaceRoot = normalizedNextRoot
    resetEditorLintWorker()
  }

  function ensureWorkspaceSession(projectFolder = '') {
    const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
    if (!workspaceRoot) return ''
    if (!activeWorkspaceRoot) {
      activeWorkspaceRoot = workspaceRoot
      return workspaceRoot
    }
    if (!samePath(activeWorkspaceRoot, workspaceRoot)) {
      resetWorkspaceSession(workspaceRoot)
    }
    return workspaceRoot
  }

  function normalizeDocumentPayload(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {}
    const projectFolder = normalizeWorkspaceRoot(source.projectFolder || source.project || '')
    const filePath = normalizeWorkspaceRelativeFilePath(projectFolder, source.filePath || '')
    const uri = buildDocumentUri(projectFolder, filePath, source.uri)
    const language = normalizeLanguageId(source.language, filePath)
    const content = typeof source.content === 'string' ? source.content : null
    const version = Math.max(0, Number(source.version || 0) || 0)
    const absoluteFilePath = buildAbsoluteFilePath(projectFolder, filePath)
    if (!projectFolder || !filePath || !uri) return null
    return {
      projectFolder,
      filePath,
      absoluteFilePath,
      uri,
      language,
      content,
      version,
    }
  }

  function getDocumentRecord(payload = {}) {
    const normalized = normalizeDocumentPayload(payload)
    if (!normalized) return null
    const existing = documents.get(normalized.uri)
    if (existing) {
      return {
        ...existing,
        projectFolder: normalized.projectFolder || existing.projectFolder,
        filePath: normalized.filePath || existing.filePath,
        absoluteFilePath: normalized.absoluteFilePath || existing.absoluteFilePath,
        uri: normalized.uri || existing.uri,
        language: normalized.language || existing.language,
        content: normalized.content != null ? normalized.content : existing.content,
        version: normalized.version > 0 ? normalized.version : existing.version,
      }
    }
    return {
      ...normalized,
      content: normalized.content != null ? normalized.content : '',
      version: normalized.version > 0 ? normalized.version : 1,
    }
  }

  const buildServiceState = createEditorLanguageServiceStateBuilder({
    providerHealth,
    getActiveWorkspaceRoot: () => activeWorkspaceRoot,
    isFormatOnlyLanguageFn,
    supportsBiomeFormatFn,
    supportsCSharpierFormatFn,
    supportsClangFormatFn,
    supportsClangTidyFixFn,
    supportsDotnetFormatFixFn,
    supportsDataConfigFormatFn,
    supportsMarkupFormatFn,
    supportsPrettierStyleFormatFn,
    supportsRuffFixFn,
    supportsRuffFormatFn,
    getFormattingRouteAvailabilityFn,
    getCodeActionRouteAvailabilityFn,
    detectNearestBiomeConfigRootFn,
    detectNearestClangFormatConfigRootFn,
    detectNearestClangTidyConfigRootFn,
    detectNearestClangCompileContextFn,
    detectNearestCSharpProjectRootFn,
    detectNearestJavaProjectRootFn,
    detectNearestRuffConfigRootFn,
    getBiomeFormatterAvailabilityFn,
    getCSharpierAvailabilityFn,
    getClangFormatAvailabilityFn,
    getClangTidyFixAvailabilityFn,
    getDotnetFormatFixAvailabilityFn,
    getRuffFormatterAvailabilityFn,
    getRuffFixAvailabilityFn,
    getProviderResolution,
    buildDefaultProviderDescriptor,
  })
  const requestDiagnostics = createEditorLanguageServiceDiagnosticsRequester({
    isFormatOnlyLanguageFn,
    lintTextViaWorkerFn,
    ensureProviderSession,
    setProviderHealth,
    logProviderFailure,
    buildServiceState,
  })
  const requestFormatting = createEditorLanguageServiceFormattingRequester({
    isFormatOnlyLanguageFn,
    supportsBiomeFormatFn,
    supportsClangFormatFn,
    supportsCSharpierFormatFn,
    supportsMarkupFormatFn,
    supportsPrettierStyleFormatFn,
    supportsDataConfigFormatFn,
    supportsRuffFormatFn,
    detectNearestJavaProjectRootFn,
    detectNearestBiomeConfigRootFn,
    detectNearestRuffConfigRootFn,
    detectNearestClangFormatConfigRootFn,
    detectNearestCSharpProjectRootFn,
    getRuffFormatterAvailabilityFn,
    getClangFormatAvailabilityFn,
    getCSharpierAvailabilityFn,
    formatTextWithRouterFn,
    ensureProviderSession,
    setProviderHealth,
    logProviderFailure,
    getFormattingRouteAvailabilityFn,
    buildServiceState,
  })
  const requestCodeActions = createEditorLanguageServiceCodeActionsRequester({
    detectNearestJavaProjectRootFn,
    detectNearestRuffConfigRootFn,
    getRuffFixAvailabilityFn,
    fixPythonTextWithRouterFn,
    supportsClangTidyFixFn,
    detectNearestClangTidyConfigRootFn,
    detectNearestClangCompileContextFn,
    getClangTidyFixAvailabilityFn,
    fixClangTidyTextWithRouterFn,
    supportsDotnetFormatFixFn,
    detectNearestCSharpProjectRootFn,
    getDotnetFormatFixAvailabilityFn,
    fixDotnetFormatTextWithRouterFn,
    getCodeActionRouteAvailabilityFn,
    fixTextViaWorkerFn,
    ensureProviderSession,
    setProviderHealth,
    logProviderFailure,
    buildServiceState,
  })
  const requestSemanticProvider = createEditorLanguageServiceSemanticRequester({
    detectNearestClangCompileContextFn,
    detectNearestCSharpProjectRootFn,
    detectNearestJavaProjectRootFn,
    ensureProviderSession,
    setProviderHealth,
    logProviderFailure,
    buildServiceState,
  })

  return {
    handleActiveWorkspaceChanged(projectFolder = '') {
      const nextWorkspaceRoot = normalizeWorkspaceRoot(projectFolder)
      if (!activeWorkspaceRoot && nextWorkspaceRoot) {
        activeWorkspaceRoot = nextWorkspaceRoot
        return
      }
      if (!nextWorkspaceRoot) {
        resetWorkspaceSession('')
        return
      }
      if (!samePath(activeWorkspaceRoot, nextWorkspaceRoot)) {
        resetWorkspaceSession(nextWorkspaceRoot)
      }
    },

    syncDocument(payload = {}) {
      const input = payload && typeof payload === 'object' ? payload : {}
      const event = cleanString(input.event).toLowerCase()
      if (!EDITOR_SERVICE_SYNC_EVENTS.includes(event)) {
        return { ok: false, error: 'invalid_sync_event' }
      }

      const document = normalizeDocumentPayload(input)
      if (!document) {
        return { ok: false, error: 'invalid_document_payload' }
      }

      ensureWorkspaceSession(document.projectFolder)

      if (event === 'close') {
        documents.delete(document.uri)
        void syncProviderDocumentIfRunning(event, document)
        return {
          ok: true,
          event,
          document: {
            uri: document.uri,
            filePath: document.filePath,
            language: document.language,
          },
          serviceState: buildServiceState(document),
        }
      }

      const existing = documents.get(document.uri)
      const nextVersion = document.version > 0
        ? document.version
        : Math.max(1, Number(existing?.version || 0) + (event === 'change' ? 1 : 0))

      const nextRecord = {
        ...(existing || {}),
        ...document,
        content: document.content != null ? document.content : String(existing?.content || ''),
        version: nextVersion,
        lastEvent: event,
      }
      documents.set(document.uri, nextRecord)
      void syncProviderDocumentIfRunning(event, nextRecord)

      return {
        ok: true,
        event,
        document: {
          uri: nextRecord.uri,
          filePath: nextRecord.filePath,
          language: nextRecord.language,
          version: nextRecord.version,
        },
        serviceState: buildServiceState(nextRecord),
      }
    },

    async request(payload = {}) {
      const input = payload && typeof payload === 'object' ? payload : {}
      const kind = cleanString(input.kind)
      if (!EDITOR_SERVICE_REQUEST_KINDS.includes(kind)) {
        return { ok: false, error: 'invalid_request_kind' }
      }

      const document = getDocumentRecord(input)
      if (!document) {
        return { ok: false, error: 'document_not_found' }
      }
      ensureWorkspaceSession(document.projectFolder)

      if (kind === 'diagnostics') return requestDiagnostics(document)
      if (kind === 'formatting') return requestFormatting(document)
      if (kind === 'codeActions') return requestCodeActions(document)
      if (kind === 'hover' || kind === 'definition' || kind === 'references' || kind === 'symbols') {
        return requestSemanticProvider(kind, document, input)
      }
      return {
        ...createUnsupportedResponse(kind),
        serviceState: buildServiceState(document),
      }
    },

    refreshRuntimeAvailability(payload = {}) {
      clearRuntimeProviderState()
      const document = getDocumentRecord(payload || {})
      return {
        ok: true,
        serviceState: buildServiceState(document),
      }
    },

    __inspect() {
      return {
        activeWorkspaceRoot,
        documents: Array.from(documents.values()).map((document) => ({
          uri: document.uri,
          filePath: document.filePath,
          language: document.language,
          version: document.version,
        })),
        providerHealth: Array.from(providerHealth.values()),
        providerSessions: Array.from(providerSessions.entries()).map(([id, provider]) => ({
          id,
          resolutionKey: String(provider?.resolutionKey || ''),
        })),
      }
    },

    async dispose() {
      documents.clear()
      providerHealth.clear()
      providerResolutionCache.clear()
      lastLoggedFailureByProvider.clear()
      activeWorkspaceRoot = ''
      resetEditorLintWorker()
      await stopAllProviderSessions()
    },
  }
}

let editorLanguageServiceManager = null

export function getEditorLanguageServiceManager() {
  if (!editorLanguageServiceManager) {
    editorLanguageServiceManager = createEditorLanguageServiceManager()
  }
  return editorLanguageServiceManager
}

export const __testEditorLanguageServiceManagerInternals = Object.freeze({
  createEditorLanguageServiceManager,
  createBaseCapabilityMap,
  normalizeWorkspaceRelativeFilePath,
  detectNearestConfigRoot,
  normalizeLanguageId,
  isMonacoNativeDiagnosticLanguage,
  isJavaScriptOrTypeScript,
  buildDocumentUri,
  buildAbsoluteFilePath,
  EDITOR_SERVICE_CAPABILITY_KEYS,
})
