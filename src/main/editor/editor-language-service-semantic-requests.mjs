import {
  cleanString,
  createJavaProjectContextMessage,
  createUnsupportedResponse,
  isBenignSemanticMiss,
  isCOrCppLanguage,
  isCSharpLanguage,
  isJavaLanguage,
  isJavaScriptOrTypeScript,
  isPythonLanguage,
  normalizeLanguageId,
  selectHoverContents,
} from './editor-language-service-manager-shared.mjs'

export function createEditorLanguageServiceSemanticRequester(context = {}) {
  const {
    detectNearestClangCompileContextFn,
    detectNearestCSharpProjectRootFn,
    detectNearestJavaProjectRootFn,
    ensureProviderSession,
    setProviderHealth,
    logProviderFailure,
    buildServiceState,
  } = context

  async function requestSemanticProvider(kind = '', document = null, payload = {}) {
    const doc = document && typeof document === 'object' ? document : null
    if (!doc) return { ok: false, error: 'document_not_found' }

    const language = normalizeLanguageId(doc.language, doc.filePath)
    const lineNumber = Math.max(1, Number(payload.lineNumber || payload.line || 1) || 1)
    const column = Math.max(1, Number(payload.column || 1) || 1)

    let providerId = ''
    let missingContextMessage = ''
    if (isJavaScriptOrTypeScript(language)) providerId = 'tsserver'
    else if (isPythonLanguage(language)) providerId = 'pyright'
    else if (isCOrCppLanguage(language)) {
      providerId = 'clangd'
      if (!detectNearestClangCompileContextFn(doc.projectFolder, doc.filePath)?.path) {
        missingContextMessage = 'Semantic editor features require compile_commands.json or compile_flags.txt.'
      }
    } else if (isCSharpLanguage(language)) {
      providerId = 'csharp-ls'
      if (!detectNearestCSharpProjectRootFn(doc.projectFolder, doc.filePath)) {
        missingContextMessage = 'Semantic editor features require a real .csproj or .sln context.'
      }
    } else if (isJavaLanguage(language)) {
      providerId = 'jdtls'
      if (!detectNearestJavaProjectRootFn(doc.projectFolder, doc.filePath)) {
        missingContextMessage = createJavaProjectContextMessage('Semantic editor features')
      }
    } else {
      return {
        ...createUnsupportedResponse(kind, 'This file stays syntax-only because no real provider is available for this language.'),
        serviceState: buildServiceState(doc),
      }
    }

    if (missingContextMessage) {
      return {
        ok: true,
        available: false,
        reason: 'real_provider_missing',
        message: missingContextMessage,
        serviceState: buildServiceState(doc),
      }
    }

    const provider = await ensureProviderSession(providerId, doc)
    if (!provider.ok || !provider.session) {
      return {
        ok: true,
        available: false,
        reason: cleanString(provider?.resolution?.reason) || 'provider_unavailable',
        message: cleanString(provider?.resolution?.message) || `${providerId} is unavailable.`,
        serviceState: buildServiceState(doc),
      }
    }

    try {
      if (kind === 'hover') {
        const hover = await provider.session.requestHover(doc, lineNumber, column)
        return {
          ok: true,
          available: true,
          contents: selectHoverContents(hover),
          range: hover?.range || null,
          serviceState: buildServiceState(doc),
        }
      }
      if (kind === 'definition') {
        const locations = await provider.session.requestDefinition(doc, lineNumber, column)
        return {
          ok: true,
          available: true,
          locations: Array.isArray(locations) ? locations : [],
          serviceState: buildServiceState(doc),
        }
      }
      if (kind === 'references') {
        const locations = await provider.session.requestReferences(doc, lineNumber, column)
        return {
          ok: true,
          available: true,
          locations: Array.isArray(locations) ? locations : [],
          serviceState: buildServiceState(doc),
        }
      }
      if (kind === 'symbols') {
        const items = await provider.session.requestSymbols(doc)
        return {
          ok: true,
          available: true,
          outline: {
            supported: true,
            available: true,
            loading: false,
            reason: null,
            message: '',
            items: Array.isArray(items) ? items : [],
            activeId: null,
          },
          serviceState: buildServiceState(doc),
        }
      }
      return {
        ...createUnsupportedResponse(kind),
        serviceState: buildServiceState(doc),
      }
    } catch (error) {
      const failureMessage = cleanString(error?.message || `${providerId} request failed.`)
      if (isBenignSemanticMiss(providerId, kind, failureMessage)) {
        if (kind === 'hover') {
          return {
            ok: true,
            available: true,
            contents: [],
            range: null,
            serviceState: buildServiceState(doc),
          }
        }
      }
      setProviderHealth(providerId, {
        status: 'degraded',
        root: doc.projectFolder,
        source: provider.resolution.source,
        message: failureMessage,
      })
      logProviderFailure(providerId, failureMessage, { filePath: doc.filePath })
      return {
        ok: true,
        available: false,
        reason: 'provider_request_failed',
        message: failureMessage,
        serviceState: buildServiceState(doc),
      }
    }
  }



  return requestSemanticProvider
}
