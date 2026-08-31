import path from 'node:path'
import {
  buildProviderDescriptor,
  cleanString,
  isBenignProviderFailure,
  isCOrCppLanguage,
  isCSharpLanguage,
  isJavaLanguage,
  isJavaScriptOrTypeScript,
  isPythonLanguage,
  normalizeLanguageId,
  normalizeWorkspaceRoot,
} from './editor-language-service-manager-shared.mjs'

export function createEditorLanguageServiceProviderLifecycle(context = {}) {
  const {
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
  } = context

  async function stopAllProviderSessions() {
    const stopPromises = []
    for (const provider of providerSessions.values()) {
      if (typeof provider?.session?.stop === 'function') {
        stopPromises.push(Promise.resolve(provider.session.stop()))
      }
    }
    providerSessions.clear()
    if (stopPromises.length > 0) {
      await Promise.allSettled(stopPromises)
    }
  }



  function getProviderResolution(providerId = '', document = null) {
    const doc = document && typeof document === 'object' ? document : null
    const normalizedProviderId = cleanString(providerId)
    const cacheKey = `${normalizedProviderId}:${normalizeWorkspaceRoot(doc?.projectFolder)}:${path.dirname(cleanString(doc?.filePath || ''))}`
    if (providerResolutionCache.has(cacheKey)) {
      return providerResolutionCache.get(cacheKey)
    }

    let resolution = null
    if (normalizedProviderId === 'clangd') {
      resolution = resolveClangdRuntimeFn(doc?.projectFolder, doc?.filePath)
    } else if (normalizedProviderId === 'csharp-ls') {
      resolution = resolveCSharpLsRuntimeFn(doc?.projectFolder, doc?.filePath)
    } else if (normalizedProviderId === 'jdtls') {
      resolution = resolveJdtlsRuntimeFn(doc?.projectFolder, doc?.filePath)
    } else if (normalizedProviderId === 'tsserver') {
      resolution = resolveTsServerRuntimeFn(doc?.projectFolder, doc?.filePath)
    } else if (normalizedProviderId === 'pyright') {
      resolution = resolvePyrightRuntimeFn(doc?.projectFolder, doc?.filePath)
    }

    providerResolutionCache.set(cacheKey, resolution)
    return resolution
  }



  function buildDefaultProviderDescriptor(providerId = '', document = null, resolution = null) {
    const doc = document && typeof document === 'object' ? document : null
    if (resolution?.available) {
      return buildProviderDescriptor({
        id: providerId,
        status: 'ready',
        root: normalizeWorkspaceRoot(doc?.projectFolder),
        source: resolution.source,
        message: resolution.message,
      })
    }
    return buildProviderDescriptor({
      id: providerId,
      status: 'unavailable',
      root: normalizeWorkspaceRoot(doc?.projectFolder),
      source: resolution?.source || 'missing-provider-binary',
      message: resolution?.message || `${providerId} is unavailable.`,
    })
  }



  async function ensureProviderSession(providerId = '', document = null) {
    const doc = document && typeof document === 'object' ? document : null
    const resolution = getProviderResolution(providerId, doc)
    if (!resolution?.available) {
      setProviderHealth(providerId, buildDefaultProviderDescriptor(providerId, doc, resolution))
      return { ok: false, resolution, session: null }
    }

    const sessionKey = cleanString(providerId)
    const resolutionKey = `${resolution.source}:${resolution.executablePath || resolution.command}:${resolution.args.join(' ')}`
    const existing = providerSessions.get(sessionKey)
    if (existing && existing.resolutionKey !== resolutionKey) {
      await existing.session?.stop?.()
      providerSessions.delete(sessionKey)
    }

    let provider = providerSessions.get(sessionKey)
    if (!provider) {
      const onFailure = (message = '') => {
        if (isBenignProviderFailure(providerId, message)) return
        setProviderHealth(providerId, {
          status: 'degraded',
          root: normalizeWorkspaceRoot(doc?.projectFolder),
          source: resolution.source,
          message: cleanString(message) || `${providerId} failed.`,
        })
        logProviderFailure(providerId, message, { filePath: doc?.filePath })
      }
      let session = null
      if (sessionKey === 'clangd') {
        session = createClangdProviderSessionFn(resolution, { workspaceRoot: doc?.projectFolder, onFailure })
      } else if (sessionKey === 'csharp-ls') {
        session = createCSharpLsProviderSessionFn(resolution, { workspaceRoot: doc?.projectFolder, onFailure })
      } else if (sessionKey === 'jdtls') {
        session = createJdtlsProviderSessionFn(resolution, { workspaceRoot: doc?.projectFolder, onFailure })
      } else if (sessionKey === 'tsserver') {
        session = createTsServerProviderSessionFn(resolution, { workspaceRoot: doc?.projectFolder, onFailure })
      } else if (sessionKey === 'pyright') {
        session = createPyrightProviderSessionFn(resolution, { workspaceRoot: doc?.projectFolder, onFailure })
      }
      if (!session) {
        return { ok: false, resolution, session: null, message: `${providerId} session is unsupported.` }
      }
      provider = {
        resolutionKey,
        resolution,
        session,
      }
      providerSessions.set(sessionKey, provider)
    }

    try {
      await provider.session.start()
      setProviderHealth(providerId, {
        status: 'healthy',
        root: normalizeWorkspaceRoot(doc?.projectFolder),
        source: resolution.source,
        message: resolution.message,
      })
      return { ok: true, resolution, session: provider.session }
    } catch (error) {
      const failureMessage = cleanString(error?.message || `${providerId} failed to start.`)
      setProviderHealth(providerId, {
        status: 'degraded',
        root: normalizeWorkspaceRoot(doc?.projectFolder),
        source: resolution.source,
        message: failureMessage,
      })
      logProviderFailure(providerId, failureMessage, { filePath: doc?.filePath })
      return { ok: false, resolution, session: null, message: failureMessage }
    }
  }



  async function syncProviderDocumentIfRunning(event = '', document = null) {
    const doc = document && typeof document === 'object' ? document : null
    if (!doc) return
    const language = normalizeLanguageId(doc.language, doc.filePath)
    let providerId = ''
    if (isJavaScriptOrTypeScript(language)) providerId = 'tsserver'
    else if (isPythonLanguage(language)) providerId = 'pyright'
    else if (isCOrCppLanguage(language)) providerId = 'clangd'
    else if (isCSharpLanguage(language)) providerId = 'csharp-ls'
    else if (isJavaLanguage(language)) providerId = 'jdtls'
    if (!providerId) return

    const provider = providerSessions.get(providerId)
    if (!provider?.session) return

    try {
      if (event === 'close') {
        await provider.session.closeDocument(doc)
        return
      }
      if (event === 'save') {
        await provider.session.saveDocument?.(doc)
        return
      }
      await provider.session.updateDocument(doc)
    } catch (error) {
      const failureMessage = cleanString(error?.message || `${providerId} document sync failed.`)
      setProviderHealth(providerId, {
        status: 'degraded',
        root: normalizeWorkspaceRoot(doc?.projectFolder),
        source: cleanString(provider?.resolution?.source) || providerId,
        message: failureMessage,
      })
      logProviderFailure(providerId, failureMessage, { filePath: doc?.filePath })
    }
  }



  return {
    getProviderResolution,
    buildDefaultProviderDescriptor,
    ensureProviderSession,
    syncProviderDocumentIfRunning,
    stopAllProviderSessions,
  }
}
