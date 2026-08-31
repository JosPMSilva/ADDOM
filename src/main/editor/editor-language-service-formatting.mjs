import {
  cleanString,
  createJavaProjectContextMessage,
  isJavaLanguage,
  normalizeLanguageId,
} from './editor-language-service-manager-shared.mjs'

export function createEditorLanguageServiceFormattingRequester(context = {}) {
  const {
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
  } = context

  async function requestFormatting(document = null) {
    const doc = document && typeof document === 'object' ? document : null
    if (!doc) return { ok: false, error: 'document_not_found' }
    const language = normalizeLanguageId(doc.language, doc.filePath)
    const isFormatOnly = isFormatOnlyLanguageFn(doc.filePath, language)
    const supportsBiomeFormatting = supportsBiomeFormatFn(doc.filePath, language)
    const supportsClangFormatting = supportsClangFormatFn(doc.filePath, language)
    const supportsCSharpFormatting = supportsCSharpierFormatFn(doc.filePath, language)
    const supportsMarkupFormatting = supportsMarkupFormatFn(doc.filePath, language)
    const supportsPrettierStyleFormatting = supportsPrettierStyleFormatFn(doc.filePath, language)
    const supportsDataConfigFormatting = supportsDataConfigFormatFn(doc.filePath, language)
    const supportsRuffFormatting = supportsRuffFormatFn(doc.filePath, language)
    const isJava = isJavaLanguage(language)

    if (isJava) {
      const javaProjectRoot = detectNearestJavaProjectRootFn(doc.projectFolder, doc.filePath)
      if (!javaProjectRoot) {
        return {
          ok: true,
          available: false,
          source: 'jdtls',
          reason: 'real_provider_missing',
          message: createJavaProjectContextMessage('Formatting'),
          serviceState: buildServiceState(doc),
        }
      }

      const provider = await ensureProviderSession('jdtls', doc)
      if (!provider.ok || !provider.session) {
        return {
          ok: true,
          available: false,
          source: 'jdtls',
          reason: cleanString(provider?.resolution?.reason) || 'provider_unavailable',
          message: cleanString(provider?.message || provider?.resolution?.message) || 'jdtls is unavailable.',
          serviceState: buildServiceState(doc),
        }
      }

      try {
        const result = await provider.session.requestFormatting(doc)
        setProviderHealth('jdtls', {
          status: 'healthy',
          root: javaProjectRoot,
          source: cleanString(provider.resolution?.source) || 'jdtls',
          message: 'jdtls formatting is healthy.',
        })
        return {
          ok: true,
          available: true,
          source: 'jdtls',
          changed: result?.changed === true,
          formatted: typeof result?.formatted === 'string' ? result.formatted : doc.content,
          serviceState: buildServiceState(doc),
        }
      } catch (error) {
        const failureMessage = cleanString(error?.message || 'jdtls formatting failed.')
        setProviderHealth('jdtls', {
          status: 'degraded',
          root: javaProjectRoot,
          source: cleanString(provider.resolution?.source) || 'jdtls',
          message: failureMessage,
        })
        logProviderFailure('jdtls', failureMessage, { filePath: doc.filePath })
        return {
          ok: true,
          available: false,
          source: 'jdtls',
          reason: 'provider_request_failed',
          message: failureMessage,
          serviceState: buildServiceState(doc),
        }
      }
    }

    if (supportsBiomeFormatting) {
      const biomeRoot = detectNearestBiomeConfigRootFn(doc.projectFolder, doc.filePath)
      if (!biomeRoot) {
        const message = 'Formatting requires a project Biome config.'
        if (!isFormatOnly) {
          setProviderHealth('biome', {
            status: 'unavailable',
            root: doc.projectFolder,
            source: 'biome',
            message,
          })
        }
        return {
          ok: true,
          available: false,
          reason: 'real_provider_missing',
          message,
          serviceState: buildServiceState(doc),
        }
      }

      const result = await formatTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language: doc.language,
      })

      if (result?.ok && result?.available && !result?.formattingError) {
        if (!isFormatOnly) {
          setProviderHealth('biome', {
            status: 'healthy',
            root: biomeRoot,
            source: 'biome',
            message: 'Biome formatter is healthy.',
          })
        }
        return {
          ok: true,
          available: true,
          source: cleanString(result.source) || 'biome',
          changed: result.changed === true,
          formatted: typeof result.formatted === 'string' ? result.formatted : doc.content,
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message) || 'Biome formatter is unavailable.'
      if (!isFormatOnly) {
        setProviderHealth('biome', {
          status: result?.available === false ? 'unavailable' : 'degraded',
          root: biomeRoot,
          source: 'biome',
          message: failureMessage,
        })
      }
      if (!isFormatOnly && result?.formattingError) {
        logProviderFailure('biome', failureMessage, { filePath: doc.filePath })
      }
      return {
        ok: true,
        available: false,
        reason: cleanString(result?.reason) || 'formatter_unavailable',
        message: failureMessage,
        serviceState: buildServiceState(doc),
      }
    }

    if (supportsMarkupFormatting || supportsPrettierStyleFormatting || supportsDataConfigFormatting) {
      const result = await formatTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language: doc.language,
      })

      if (result?.ok) {
        return {
          ok: true,
          available: result?.available === true,
          reason: cleanString(result?.reason),
          source: cleanString(result?.source),
          message: cleanString(result?.message),
          changed: result?.changed === true,
          formatted: typeof result?.formatted === 'string' ? result.formatted : doc.content,
          serviceState: buildServiceState(doc),
        }
      }

      return {
        ok: false,
        error: cleanString(result?.error) || 'format_request_failed',
        serviceState: buildServiceState(doc),
      }
    }

    if (supportsRuffFormatting) {
      const ruffRoot = detectNearestRuffConfigRootFn(doc.projectFolder, doc.filePath)
      if (!ruffRoot) {
        return {
          ok: true,
          available: false,
          reason: 'real_provider_missing',
          message: 'Formatting requires a project Ruff config.',
          serviceState: buildServiceState(doc),
        }
      }

      const ruffAvailability = getRuffFormatterAvailabilityFn(doc.projectFolder, doc.filePath)
      if (!ruffAvailability?.available) {
        setProviderHealth('ruff', {
          status: 'unavailable',
          root: ruffRoot,
          source: cleanString(ruffAvailability?.source) || 'ruff',
          message: cleanString(ruffAvailability?.message) || 'Ruff formatter is unavailable.',
        })
        return {
          ok: true,
          available: false,
          reason: cleanString(ruffAvailability?.reason) || 'ruff_not_installed',
          message: cleanString(ruffAvailability?.message) || 'Ruff formatter is unavailable.',
          serviceState: buildServiceState(doc),
        }
      }

      const result = await formatTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language: doc.language,
      })

      if (result?.ok && result?.available && !result?.formattingError) {
        setProviderHealth('ruff', {
          status: 'healthy',
          root: ruffRoot,
          source: cleanString(result.source) || 'ruff',
          message: 'Ruff formatter is healthy.',
        })
        return {
          ok: true,
          available: true,
          source: cleanString(result.source) || 'ruff',
          changed: result.changed === true,
          formatted: typeof result.formatted === 'string' ? result.formatted : doc.content,
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message) || 'Ruff formatter is unavailable.'
      setProviderHealth('ruff', {
        status: result?.available === false ? 'unavailable' : 'degraded',
        root: ruffRoot,
        source: cleanString(result?.source) || 'ruff',
        message: failureMessage,
      })
      if (result?.formattingError) {
        logProviderFailure('ruff', failureMessage, { filePath: doc.filePath })
      }
      return {
        ok: true,
        available: false,
        reason: cleanString(result?.reason) || 'formatter_unavailable',
        message: failureMessage,
        serviceState: buildServiceState(doc),
      }
    }

    if (supportsClangFormatting) {
      const clangFormatRoot = detectNearestClangFormatConfigRootFn(doc.projectFolder, doc.filePath)
      if (!clangFormatRoot) {
        return {
          ok: true,
          available: false,
          source: 'clang-format',
          reason: 'real_provider_missing',
          message: 'Formatting requires a project .clang-format or _clang-format config.',
          serviceState: buildServiceState(doc),
        }
      }

      const clangFormatAvailability = getClangFormatAvailabilityFn(doc.projectFolder, doc.filePath)
      if (!clangFormatAvailability?.available) {
        setProviderHealth('clang-format', {
          status: 'unavailable',
          root: clangFormatRoot,
          source: cleanString(clangFormatAvailability?.source) || 'clang-format',
          message: cleanString(clangFormatAvailability?.message) || 'clang-format is unavailable.',
        })
        return {
          ok: true,
          available: false,
          source: cleanString(clangFormatAvailability?.source) || 'clang-format',
          reason: cleanString(clangFormatAvailability?.reason) || 'clang_format_not_installed',
          message: cleanString(clangFormatAvailability?.message) || 'clang-format is unavailable.',
          serviceState: buildServiceState(doc),
        }
      }

      const result = await formatTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language: doc.language,
      })

      if (result?.ok && result?.available && !result?.formattingError) {
        setProviderHealth('clang-format', {
          status: 'healthy',
          root: clangFormatRoot,
          source: cleanString(result.source) || 'clang-format',
          message: 'clang-format is healthy.',
        })
        return {
          ok: true,
          available: true,
          source: cleanString(result.source) || 'clang-format',
          changed: result.changed === true,
          formatted: typeof result.formatted === 'string' ? result.formatted : doc.content,
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message) || 'clang-format is unavailable.'
      setProviderHealth('clang-format', {
        status: result?.available === false ? 'unavailable' : 'degraded',
        root: clangFormatRoot,
        source: cleanString(result?.source) || 'clang-format',
        message: failureMessage,
      })
      if (result?.formattingError) {
        logProviderFailure('clang-format', failureMessage, { filePath: doc.filePath })
      }
      return {
        ok: true,
        available: false,
        source: cleanString(result?.source) || 'clang-format',
        reason: cleanString(result?.reason) || 'formatter_unavailable',
        message: failureMessage,
        serviceState: buildServiceState(doc),
      }
    }

    if (supportsCSharpFormatting) {
      const csharpProjectRoot = detectNearestCSharpProjectRootFn(doc.projectFolder, doc.filePath)
      if (!csharpProjectRoot) {
        return {
          ok: true,
          available: false,
          source: 'csharpier',
          reason: 'real_provider_missing',
          message: 'Formatting requires a real .csproj or .sln context.',
          serviceState: buildServiceState(doc),
        }
      }

      const csharpierAvailability = getCSharpierAvailabilityFn(doc.projectFolder, doc.filePath)
      if (!csharpierAvailability?.available) {
        setProviderHealth('csharpier', {
          status: 'unavailable',
          root: csharpProjectRoot,
          source: cleanString(csharpierAvailability?.source) || 'csharpier',
          message: cleanString(csharpierAvailability?.message) || 'CSharpier is unavailable.',
        })
        return {
          ok: true,
          available: false,
          source: cleanString(csharpierAvailability?.source) || 'csharpier',
          reason: cleanString(csharpierAvailability?.reason) || 'csharpier_not_installed',
          message: cleanString(csharpierAvailability?.message) || 'CSharpier is unavailable.',
          serviceState: buildServiceState(doc),
        }
      }

      const result = await formatTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language: doc.language,
      })

      if (result?.ok && result?.available && !result?.formattingError) {
        setProviderHealth('csharpier', {
          status: 'healthy',
          root: csharpProjectRoot,
          source: cleanString(result.source) || 'csharpier',
          message: 'CSharpier is healthy.',
        })
        return {
          ok: true,
          available: true,
          source: cleanString(result.source) || 'csharpier',
          changed: result.changed === true,
          formatted: typeof result.formatted === 'string' ? result.formatted : doc.content,
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message) || 'CSharpier is unavailable.'
      setProviderHealth('csharpier', {
        status: result?.available === false ? 'unavailable' : 'degraded',
        root: csharpProjectRoot,
        source: cleanString(result?.source) || 'csharpier',
        message: failureMessage,
      })
      if (result?.formattingError) {
        logProviderFailure('csharpier', failureMessage, { filePath: doc.filePath })
      }
      return {
        ok: true,
        available: false,
        source: cleanString(result?.source) || 'csharpier',
        reason: cleanString(result?.reason) || 'formatter_unavailable',
        message: failureMessage,
        serviceState: buildServiceState(doc),
      }
    }

    const fallbackFormattingRouteAvailability = getFormattingRouteAvailabilityFn(doc.filePath, language, {
      content: typeof doc.content === 'string' ? doc.content : '',
      projectFolder: doc.projectFolder,
    })
    if (fallbackFormattingRouteAvailability?.supported) {
      return {
        ok: true,
        available: fallbackFormattingRouteAvailability.available === true,
        reason: cleanString(fallbackFormattingRouteAvailability?.reason),
        source: cleanString(fallbackFormattingRouteAvailability?.source),
        message: cleanString(fallbackFormattingRouteAvailability?.message),
        changed: false,
        formatted: typeof doc.content === 'string' ? doc.content : '',
        serviceState: buildServiceState(doc),
      }
    }

    return {
      ok: true,
      available: false,
      reason: 'unsupported_file',
      message: 'No formatter is configured for this file type.',
      serviceState: buildServiceState(doc),
    }
  }



  return requestFormatting
}
