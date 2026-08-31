import {
  ESLINT_CONFIG_FILES,
  cleanString,
  createJavaProjectContextMessage,
  createUnsupportedResponse,
  detectNearestConfigRoot,
  isJavaLanguage,
  isJavaScriptOrTypeScript,
  isPythonLanguage,
  normalizeLanguageId,
} from './editor-language-service-manager-shared.mjs'

export function createEditorLanguageServiceCodeActionsRequester(context = {}) {
  const {
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
  } = context

  async function requestCodeActions(document = null) {
    const doc = document && typeof document === 'object' ? document : null
    if (!doc) return { ok: false, error: 'document_not_found' }

    const language = normalizeLanguageId(doc.language, doc.filePath)
    if (isJavaLanguage(language)) {
      const javaProjectRoot = detectNearestJavaProjectRootFn(doc.projectFolder, doc.filePath)
      if (!javaProjectRoot) {
        return {
          ok: true,
          available: false,
          source: 'jdtls',
          reason: 'real_provider_missing',
          message: createJavaProjectContextMessage('Code actions'),
          actions: [],
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
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      try {
        const actions = await provider.session.requestCodeActions(doc)
        setProviderHealth('jdtls', {
          status: 'healthy',
          root: javaProjectRoot,
          source: cleanString(provider.resolution?.source) || 'jdtls',
          message: 'jdtls code actions are healthy.',
        })
        return {
          ok: true,
          available: true,
          source: 'jdtls',
          actions: Array.isArray(actions) ? actions : [],
          serviceState: buildServiceState(doc),
        }
      } catch (error) {
        const failureMessage = cleanString(error?.message || 'jdtls code actions failed.')
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
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }
    }

    if (isPythonLanguage(language)) {
      const ruffRoot = detectNearestRuffConfigRootFn(doc.projectFolder, doc.filePath)
      if (!ruffRoot) {
        return {
          ok: true,
          available: false,
          reason: 'real_provider_missing',
          message: 'Code actions require a project Ruff config.',
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      const ruffAvailability = getRuffFixAvailabilityFn(doc.projectFolder, doc.filePath)
      if (!ruffAvailability?.available) {
        setProviderHealth('ruff', {
          status: 'unavailable',
          root: ruffRoot,
          source: cleanString(ruffAvailability?.source) || 'ruff',
          message: cleanString(ruffAvailability?.message) || 'Ruff is unavailable.',
        })
        return {
          ok: true,
          available: false,
          reason: cleanString(ruffAvailability?.reason) || 'ruff_not_installed',
          message: cleanString(ruffAvailability?.message) || 'Ruff is unavailable.',
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      const result = await fixPythonTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language,
      })

      if (result?.ok && result?.available && !result?.fixingError) {
        setProviderHealth('ruff', {
          status: 'healthy',
          root: ruffRoot,
          source: cleanString(result.source) || 'ruff',
          message: 'Ruff fix-all is healthy.',
        })
        const fixedContent = typeof result.fixedContent === 'string' ? result.fixedContent : doc.content
        const actions = result.changed
          ? [{
              id: 'ruff.fixAll',
              title: 'Fix auto-fixable issues',
              kind: 'source.fixAll.ruff',
              isPreferred: true,
              edit: {
                fullText: fixedContent,
              },
            }]
          : []
        return {
          ok: true,
          available: true,
          source: cleanString(result.source) || 'ruff',
          actions,
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message) || 'Ruff fixes are unavailable.'
      setProviderHealth('ruff', {
        status: result?.available === false ? 'unavailable' : 'degraded',
        root: ruffRoot,
        source: cleanString(result?.source) || 'ruff',
        message: failureMessage,
      })
      if (result?.fixingError) {
        logProviderFailure('ruff', failureMessage, { filePath: doc.filePath })
      }
      return {
        ok: true,
        available: false,
        reason: cleanString(result?.reason) || 'provider_unavailable',
        message: failureMessage,
        actions: [],
        serviceState: buildServiceState(doc),
      }
    }

    if (supportsClangTidyFixFn(doc.filePath, language)) {
      const clangTidyConfigRoot = detectNearestClangTidyConfigRootFn(doc.projectFolder, doc.filePath)
      if (!clangTidyConfigRoot) {
        return {
          ok: true,
          available: false,
          source: 'clang-tidy',
          reason: 'real_provider_missing',
          message: 'Code actions require a project .clang-tidy config.',
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      const clangCompileContext = detectNearestClangCompileContextFn(doc.projectFolder, doc.filePath)
      if (!clangCompileContext?.path) {
        return {
          ok: true,
          available: false,
          source: 'clang-tidy',
          reason: 'real_provider_missing',
          message: 'Code actions require compile_commands.json or compile_flags.txt.',
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      const clangTidyAvailability = getClangTidyFixAvailabilityFn(doc.projectFolder, doc.filePath)
      if (!clangTidyAvailability?.available) {
        setProviderHealth('clang-tidy', {
          status: 'unavailable',
          root: cleanString(clangCompileContext?.root) || clangTidyConfigRoot,
          source: cleanString(clangTidyAvailability?.source) || 'clang-tidy',
          message: cleanString(clangTidyAvailability?.message) || 'clang-tidy is unavailable.',
        })
        return {
          ok: true,
          available: false,
          source: cleanString(clangTidyAvailability?.source) || 'clang-tidy',
          reason: cleanString(clangTidyAvailability?.reason) || 'clang_tidy_not_installed',
          message: cleanString(clangTidyAvailability?.message) || 'clang-tidy is unavailable.',
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      const result = await fixClangTidyTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language,
      })

      if (result?.ok && result?.available && !result?.fixingError) {
        setProviderHealth('clang-tidy', {
          status: 'healthy',
          root: cleanString(clangCompileContext?.root) || clangTidyConfigRoot,
          source: cleanString(result.source) || 'clang-tidy',
          message: 'clang-tidy fix-all is healthy.',
        })
        const fixedContent = typeof result.fixedContent === 'string' ? result.fixedContent : doc.content
        const actions = result.changed
          ? [{
              id: 'clang-tidy.fixAll',
              title: 'Fix auto-fixable issues',
              kind: 'source.fixAll.clang-tidy',
              isPreferred: true,
              edit: {
                fullText: fixedContent,
              },
            }]
          : []
        return {
          ok: true,
          available: true,
          source: cleanString(result.source) || 'clang-tidy',
          actions,
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message) || 'clang-tidy fixes are unavailable.'
      setProviderHealth('clang-tidy', {
        status: result?.available === false ? 'unavailable' : 'degraded',
        root: cleanString(clangCompileContext?.root) || clangTidyConfigRoot,
        source: cleanString(result?.source) || 'clang-tidy',
        message: failureMessage,
      })
      if (result?.fixingError) {
        logProviderFailure('clang-tidy', failureMessage, { filePath: doc.filePath })
      }
      return {
        ok: true,
        available: false,
        source: cleanString(result?.source) || 'clang-tidy',
        reason: cleanString(result?.reason) || 'provider_unavailable',
        message: failureMessage,
        actions: [],
        serviceState: buildServiceState(doc),
      }
    }

    if (supportsDotnetFormatFixFn(doc.filePath, language)) {
      const csharpProjectRoot = detectNearestCSharpProjectRootFn(doc.projectFolder, doc.filePath)
      if (!csharpProjectRoot) {
        return {
          ok: true,
          available: false,
          source: 'dotnet-format',
          reason: 'real_provider_missing',
          message: 'Code actions require a real .csproj or .sln context.',
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      const dotnetFormatAvailability = getDotnetFormatFixAvailabilityFn(doc.projectFolder, doc.filePath)
      if (!dotnetFormatAvailability?.available) {
        setProviderHealth('dotnet-format', {
          status: 'unavailable',
          root: csharpProjectRoot,
          source: cleanString(dotnetFormatAvailability?.source) || 'dotnet-format',
          message: cleanString(dotnetFormatAvailability?.message) || 'dotnet format is unavailable.',
        })
        return {
          ok: true,
          available: false,
          source: cleanString(dotnetFormatAvailability?.source) || 'dotnet-format',
          reason: cleanString(dotnetFormatAvailability?.reason) || 'dotnet_format_not_installed',
          message: cleanString(dotnetFormatAvailability?.message) || 'dotnet format is unavailable.',
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }

      const result = await fixDotnetFormatTextWithRouterFn({
        project: doc.projectFolder,
        filePath: doc.filePath,
        content: doc.content,
        language,
      })

      if (result?.ok && result?.available && !result?.fixingError) {
        setProviderHealth('dotnet-format', {
          status: 'healthy',
          root: csharpProjectRoot,
          source: cleanString(result.source) || 'dotnet-format',
          message: 'dotnet format fix-all is healthy.',
        })
        const fixedContent = typeof result.fixedContent === 'string' ? result.fixedContent : doc.content
        const actions = result.changed
          ? [{
              id: 'dotnet-format.fixAll',
              title: 'Fix auto-fixable issues',
              kind: 'source.fixAll.dotnet-format',
              isPreferred: true,
              edit: {
                fullText: fixedContent,
              },
            }]
          : []
        return {
          ok: true,
          available: true,
          source: cleanString(result.source) || 'dotnet-format',
          actions,
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message) || 'dotnet format fixes are unavailable.'
      setProviderHealth('dotnet-format', {
        status: result?.available === false ? 'unavailable' : 'degraded',
        root: csharpProjectRoot,
        source: cleanString(result?.source) || 'dotnet-format',
        message: failureMessage,
      })
      if (result?.fixingError) {
        logProviderFailure('dotnet-format', failureMessage, { filePath: doc.filePath })
      }
      return {
        ok: true,
        available: false,
        source: cleanString(result?.source) || 'dotnet-format',
        reason: cleanString(result?.reason) || 'provider_unavailable',
        message: failureMessage,
        actions: [],
        serviceState: buildServiceState(doc),
      }
    }

    const fallbackCodeActionRouteAvailability = getCodeActionRouteAvailabilityFn(doc.filePath, language, {
      content: typeof doc.content === 'string' ? doc.content : '',
      projectFolder: doc.projectFolder,
    })
    if (!isJavaScriptOrTypeScript(language)) {
      if (fallbackCodeActionRouteAvailability?.supported) {
        return {
          ok: true,
          available: fallbackCodeActionRouteAvailability.available === true,
          source: cleanString(fallbackCodeActionRouteAvailability?.source),
          reason: cleanString(fallbackCodeActionRouteAvailability?.reason),
          message: cleanString(fallbackCodeActionRouteAvailability?.message),
          actions: [],
          serviceState: buildServiceState(doc),
        }
      }
      return {
        ...createUnsupportedResponse('codeActions', 'Code actions are only wired for project-configured ESLint in v1.'),
        serviceState: buildServiceState(doc),
        actions: [],
      }
    }

    const eslintRoot = detectNearestConfigRoot(doc.projectFolder, doc.filePath, ESLINT_CONFIG_FILES)
    if (!eslintRoot) {
      setProviderHealth('eslint', {
        status: 'unavailable',
        root: doc.projectFolder,
        source: 'syntax-only',
        message: 'Code actions require a project-configured ESLint provider.',
      })
      return {
        ok: true,
        available: false,
        reason: 'real_provider_missing',
        message: 'Code actions require a project-configured ESLint provider.',
        actions: [],
        serviceState: buildServiceState(doc),
      }
    }

    const result = await fixTextViaWorkerFn({
      project: eslintRoot,
      filePath: doc.filePath,
      content: doc.content,
      language,
    })

    if (result?.ok && result?.available && result?.source === 'project-config') {
      setProviderHealth('eslint', {
        status: 'healthy',
        root: eslintRoot,
        source: 'project-config',
        message: 'Project-configured ESLint fixes are healthy.',
      })
      const fixedContent = typeof result.fixedContent === 'string' ? result.fixedContent : doc.content
      const actions = result.changed
        ? [{
            id: 'eslint.fixAll',
            title: 'Fix auto-fixable issues',
            kind: 'source.fixAll.eslint',
            isPreferred: true,
            edit: {
              fullText: fixedContent,
            },
          }]
        : []
      return {
        ok: true,
        available: true,
        source: 'eslint-project-config',
        actions,
        serviceState: buildServiceState(doc),
      }
    }

    const failureMessage = cleanString(result?.message)
      || (result?.source === 'addom-fallback'
        ? 'Fallback lint output is not treated as a real code-action provider.'
        : 'Project-configured ESLint code actions are unavailable.')
    setProviderHealth('eslint', {
      status: 'degraded',
      root: eslintRoot,
      source: cleanString(result?.source) || 'project-config',
      message: failureMessage,
    })
    if (result?.source !== 'addom-fallback') {
      logProviderFailure('eslint', failureMessage, { filePath: doc.filePath })
    }
    return {
      ok: true,
      available: false,
      reason: cleanString(result?.reason) || 'provider_unavailable',
      message: failureMessage,
      actions: [],
      serviceState: buildServiceState(doc),
    }
  }



  return requestCodeActions
}
