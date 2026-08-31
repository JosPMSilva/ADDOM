import {
  createAvailableCapability,
  createUnavailableCapability,
} from './editor-language-service-contract.mjs'
import {
  ESLINT_CONFIG_FILES,
  buildProviderDescriptor,
  cleanString,
  createBaseCapabilityMap,
  createContextualProviderCapability,
  createFormatOnlyCapability,
  createJavaProjectContextMessage,
  createMonacoNativeOwnership,
  createProviderHealthCapability,
  createProviderOwnership,
  createSyntaxOnlyOwnership,
  detectNearestConfigRoot,
  inferOverallHealthStatus,
  isCOrCppLanguage,
  isCSharpLanguage,
  isJavaLanguage,
  isJavaScriptOrTypeScript,
  isMonacoNativeDiagnosticLanguage,
  isPythonLanguage,
  normalizeLanguageId,
  normalizeWorkspaceRoot,
} from './editor-language-service-manager-shared.mjs'

export function createEditorLanguageServiceStateBuilder(context = {}) {
  const {
    providerHealth,
    getActiveWorkspaceRoot,
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
  } = context

  function buildServiceState(document = null) {
    const doc = document && typeof document === 'object' ? document : null
    const workspaceRoot = normalizeWorkspaceRoot(doc?.projectFolder || getActiveWorkspaceRoot())
    const language = normalizeLanguageId(doc?.language, doc?.filePath)
    const isFormatOnly = isFormatOnlyLanguageFn(doc?.filePath, language)
    const isNativeDiagnostics = !isFormatOnly && isMonacoNativeDiagnosticLanguage(language)
    const isJsTs = isJavaScriptOrTypeScript(language)
    const isPython = isPythonLanguage(language)
    const isCpp = isCOrCppLanguage(language)
    const isCSharp = isCSharpLanguage(language)
    const isJava = isJavaLanguage(language)
    const supportsBiomeFormatting = supportsBiomeFormatFn(doc?.filePath, language)
    const supportsCSharpFormatting = supportsCSharpierFormatFn(doc?.filePath, language)
    const supportsClangFormatting = supportsClangFormatFn(doc?.filePath, language)
    const supportsMarkupFormatting = supportsMarkupFormatFn(doc?.filePath, language)
    const supportsPrettierStyleFormatting = supportsPrettierStyleFormatFn(doc?.filePath, language)
    const supportsDataConfigFormatting = supportsDataConfigFormatFn(doc?.filePath, language)
    const supportsRuffFormatting = supportsRuffFormatFn(doc?.filePath, language)
    const supportsRuffCodeActions = supportsRuffFixFn(doc?.filePath, language)
    const supportsClangTidyCodeActions = supportsClangTidyFixFn(doc?.filePath, language)
    const supportsCSharpCodeActions = supportsDotnetFormatFixFn(doc?.filePath, language)
    const fallbackFormattingRouteAvailability = (!supportsBiomeFormatting && !supportsMarkupFormatting && !supportsPrettierStyleFormatting && !supportsDataConfigFormatting && !supportsRuffFormatting && !supportsClangFormatting && !supportsCSharpFormatting && !isJava)
      ? getFormattingRouteAvailabilityFn(doc?.filePath, language, {
          content: typeof doc?.content === 'string' ? doc.content : '',
          projectFolder: workspaceRoot,
        })
      : null
    const fallbackCodeActionRouteAvailability = (!isJsTs && !isPython && !isJava && !supportsClangTidyCodeActions && !supportsCSharpCodeActions)
      ? getCodeActionRouteAvailabilityFn(doc?.filePath, language, {
          content: typeof doc?.content === 'string' ? doc.content : '',
          projectFolder: workspaceRoot,
        })
      : null
    const eslintRoot = isJsTs ? detectNearestConfigRoot(workspaceRoot, doc?.filePath, ESLINT_CONFIG_FILES) : ''
    const biomeRoot = supportsBiomeFormatting
      ? detectNearestBiomeConfigRootFn(workspaceRoot, doc?.filePath)
      : ''
    const clangFormatRoot = supportsClangFormatting
      ? detectNearestClangFormatConfigRootFn(workspaceRoot, doc?.filePath)
      : ''
    const clangTidyConfigRoot = supportsClangTidyCodeActions
      ? detectNearestClangTidyConfigRootFn(workspaceRoot, doc?.filePath)
      : ''
    const clangCompileContext = (supportsClangTidyCodeActions || isCpp)
      ? detectNearestClangCompileContextFn(workspaceRoot, doc?.filePath)
      : null
    const csharpProjectRoot = (supportsCSharpFormatting || supportsCSharpCodeActions || isCSharp)
      ? detectNearestCSharpProjectRootFn(workspaceRoot, doc?.filePath)
      : ''
    const javaProjectRoot = isJava
      ? detectNearestJavaProjectRootFn(workspaceRoot, doc?.filePath)
      : ''
    const formatOnlyRouteAvailability = (supportsMarkupFormatting || supportsPrettierStyleFormatting || supportsDataConfigFormatting)
      ? getFormattingRouteAvailabilityFn(doc?.filePath, language, {
          content: typeof doc?.content === 'string' ? doc.content : '',
          projectFolder: workspaceRoot,
        })
      : null
    const ruffRoot = (supportsRuffFormatting || supportsRuffCodeActions)
      ? detectNearestRuffConfigRootFn(workspaceRoot, doc?.filePath)
      : ''
    const biomeAvailability = supportsBiomeFormatting ? getBiomeFormatterAvailabilityFn() : null
    const csharpierAvailability = supportsCSharpFormatting ? getCSharpierAvailabilityFn(workspaceRoot, doc?.filePath) : null
    const clangFormatAvailability = supportsClangFormatting ? getClangFormatAvailabilityFn(workspaceRoot, doc?.filePath) : null
    const clangTidyAvailability = supportsClangTidyCodeActions ? getClangTidyFixAvailabilityFn(workspaceRoot, doc?.filePath) : null
    const dotnetFormatAvailability = supportsCSharpCodeActions ? getDotnetFormatFixAvailabilityFn(workspaceRoot, doc?.filePath) : null
    const ruffAvailability = supportsRuffFormatting ? getRuffFormatterAvailabilityFn(workspaceRoot, doc?.filePath) : null
    const ruffFixAvailability = supportsRuffCodeActions ? getRuffFixAvailabilityFn(workspaceRoot, doc?.filePath) : null
    const clangdResolution = isCpp ? getProviderResolution('clangd', doc) : null
    const csharpLsResolution = isCSharp ? getProviderResolution('csharp-ls', doc) : null
    const jdtlsResolution = isJava ? getProviderResolution('jdtls', doc) : null
    const tsResolution = isJsTs ? getProviderResolution('tsserver', doc) : null
    const pyrightResolution = isPython ? getProviderResolution('pyright', doc) : null
    const clangdProvider = isCpp && clangCompileContext?.path
      ? (providerHealth.get('clangd') || buildDefaultProviderDescriptor('clangd', doc, clangdResolution))
      : null
    const csharpLsProvider = isCSharp && csharpProjectRoot
      ? (providerHealth.get('csharp-ls') || buildDefaultProviderDescriptor('csharp-ls', doc, csharpLsResolution))
      : null
    const jdtlsProvider = isJava && javaProjectRoot
      ? (providerHealth.get('jdtls') || buildDefaultProviderDescriptor('jdtls', doc, jdtlsResolution))
      : null
    const tsProvider = isJsTs ? (providerHealth.get('tsserver') || buildDefaultProviderDescriptor('tsserver', doc, tsResolution)) : null
    const eslintProvider = isJsTs
      ? (providerHealth.get('eslint') || buildProviderDescriptor({
          id: 'eslint',
          status: eslintRoot ? 'ready' : 'unavailable',
          root: eslintRoot || workspaceRoot,
          source: eslintRoot ? 'project-config' : 'syntax-only',
          message: eslintRoot
            ? 'Project-configured ESLint is ready.'
            : 'Project-configured ESLint was not found. Editing remains syntax-only for diagnostics.',
        }))
      : null
    const pyrightProvider = isPython ? (providerHealth.get('pyright') || buildDefaultProviderDescriptor('pyright', doc, pyrightResolution)) : null
    const biomeProvider = supportsBiomeFormatting
      ? (providerHealth.get('biome') || buildProviderDescriptor({
          id: 'biome',
          status: !biomeRoot
            ? 'unavailable'
            : biomeAvailability.available
              ? 'ready'
              : 'unavailable',
          root: biomeRoot,
          source: 'biome',
          message: !biomeRoot
            ? 'Formatting requires a project Biome config.'
            : biomeAvailability.available
              ? 'Project-configured Biome formatter is ready.'
              : 'Project-configured Biome formatter is unavailable.',
        }))
      : null
    const clangFormatProvider = supportsClangFormatting
      ? (!clangFormatRoot
          ? buildProviderDescriptor({
              id: 'clang-format',
              status: 'idle',
              root: workspaceRoot,
              source: 'clang-format',
              message: '',
            })
          : (providerHealth.get('clang-format') || buildProviderDescriptor({
              id: 'clang-format',
              status: clangFormatAvailability?.available
                ? 'ready'
                : 'unavailable',
              root: clangFormatRoot,
              source: cleanString(clangFormatAvailability?.source) || 'clang-format',
              message: clangFormatAvailability?.available
                ? 'Project-configured clang-format is available for this file.'
                : (cleanString(clangFormatAvailability?.message) || 'Project-configured clang-format is unavailable.'),
            })))
      : null
    const clangTidyProvider = supportsClangTidyCodeActions
      ? (!clangTidyConfigRoot || !clangCompileContext?.root
          ? buildProviderDescriptor({
              id: 'clang-tidy',
              status: 'idle',
              root: workspaceRoot,
              source: 'clang-tidy',
              message: '',
            })
          : (providerHealth.get('clang-tidy') || buildProviderDescriptor({
              id: 'clang-tidy',
              status: clangTidyAvailability?.available
                ? 'ready'
                : 'unavailable',
              root: cleanString(clangCompileContext?.root) || clangTidyConfigRoot,
              source: cleanString(clangTidyAvailability?.source) || 'clang-tidy',
              message: clangTidyAvailability?.available
                ? 'Project-configured clang-tidy fix-all is available for this file.'
                : (cleanString(clangTidyAvailability?.message) || 'Project-configured clang-tidy fix-all is unavailable.'),
            })))
      : null
    const csharpierProvider = supportsCSharpFormatting
      ? (!csharpProjectRoot
          ? buildProviderDescriptor({
              id: 'csharpier',
              status: 'idle',
              root: workspaceRoot,
              source: 'csharpier',
              message: '',
            })
          : (providerHealth.get('csharpier') || buildProviderDescriptor({
              id: 'csharpier',
              status: csharpierAvailability?.available
                ? 'ready'
                : 'unavailable',
              root: csharpProjectRoot,
              source: cleanString(csharpierAvailability?.source) || 'csharpier',
              message: csharpierAvailability?.available
                ? 'Project-configured CSharpier is available for this file.'
                : (cleanString(csharpierAvailability?.message) || 'Project-configured CSharpier is unavailable.'),
            })))
      : null
    const dotnetFormatProvider = supportsCSharpCodeActions
      ? (!csharpProjectRoot
          ? buildProviderDescriptor({
              id: 'dotnet-format',
              status: 'idle',
              root: workspaceRoot,
              source: 'dotnet-format',
              message: '',
            })
          : (providerHealth.get('dotnet-format') || buildProviderDescriptor({
              id: 'dotnet-format',
              status: dotnetFormatAvailability?.available
                ? 'ready'
                : 'unavailable',
              root: csharpProjectRoot,
              source: cleanString(dotnetFormatAvailability?.source) || 'dotnet-format',
              message: dotnetFormatAvailability?.available
                ? 'Project-configured dotnet format fix-all is available for this file.'
                : (cleanString(dotnetFormatAvailability?.message) || 'Project-configured dotnet format fix-all is unavailable.'),
            })))
      : null
    const ruffRuntimeAvailability = ruffAvailability || ruffFixAvailability
    const ruffProvider = (supportsRuffFormatting || supportsRuffCodeActions)
      ? (!ruffRoot
          ? buildProviderDescriptor({
              id: 'ruff',
              status: 'idle',
              root: workspaceRoot,
              source: 'ruff',
              message: '',
            })
          : (providerHealth.get('ruff') || buildProviderDescriptor({
              id: 'ruff',
              status: ruffRuntimeAvailability?.available
                ? 'ready'
                : 'unavailable',
              root: ruffRoot,
              source: cleanString(ruffRuntimeAvailability?.source) || 'ruff',
              message: ruffRuntimeAvailability?.available
                ? 'Project-configured Ruff is available for this file.'
                : (cleanString(ruffRuntimeAvailability?.message) || 'Project-configured Ruff is unavailable.'),
            })))
      : null

    const capabilities = createBaseCapabilityMap()
    let diagnosticOwnership = isFormatOnly
      ? createSyntaxOnlyOwnership('Format-only languages keep diagnostics and semantic editor features unavailable.')
      : createSyntaxOnlyOwnership()

    if (isFormatOnly) {
      capabilities.diagnostics = createFormatOnlyCapability('diagnostics')
      capabilities.hover = createFormatOnlyCapability('hover')
      capabilities.definition = createFormatOnlyCapability('definition')
      capabilities.references = createFormatOnlyCapability('references')
      capabilities.symbols = createFormatOnlyCapability('symbols')
      capabilities.codeActions = createFormatOnlyCapability('codeActions')
    } else if (isNativeDiagnostics) {
      capabilities.diagnostics = createAvailableCapability({
        source: 'monaco-native',
        message: 'Monaco native diagnostics remain enabled for this language in v1.',
      })
      diagnosticOwnership = createMonacoNativeOwnership(capabilities.diagnostics.message)
    } else if (isJsTs) {
      capabilities.hover = createProviderHealthCapability(tsResolution, tsProvider, 'tsserver')
      capabilities.definition = createProviderHealthCapability(tsResolution, tsProvider, 'tsserver')
      capabilities.references = createProviderHealthCapability(tsResolution, tsProvider, 'tsserver')
      capabilities.symbols = createProviderHealthCapability(tsResolution, tsProvider, 'tsserver')

      if (eslintRoot) {
        if (eslintProvider?.status === 'degraded' || eslintProvider?.status === 'unavailable') {
          capabilities.diagnostics = createUnavailableCapability({
            source: 'eslint-project-config',
            supported: true,
            reason: eslintProvider.status === 'degraded' ? 'provider_degraded' : 'provider_unavailable',
            message: eslintProvider.message || 'Project-configured ESLint is unavailable. Semantic diagnostics stay off.',
          })
          capabilities.codeActions = createUnavailableCapability({
            source: 'eslint-project-config',
            supported: true,
            reason: eslintProvider.status === 'degraded' ? 'provider_degraded' : 'provider_unavailable',
            message: eslintProvider.message || 'Project-configured ESLint fixes are unavailable.',
          })
          diagnosticOwnership = createSyntaxOnlyOwnership(capabilities.diagnostics.message)
        } else {
          capabilities.diagnostics = createAvailableCapability({
            source: 'eslint-project-config',
            message: 'Project-configured ESLint diagnostics are available.',
          })
          capabilities.codeActions = createAvailableCapability({
            source: 'eslint-project-config',
            message: 'Project-configured ESLint fixes are available.',
          })
          diagnosticOwnership = createProviderOwnership('eslint-project-config', capabilities.diagnostics.message)
        }
      } else {
        capabilities.diagnostics = createUnavailableCapability({
          source: 'syntax-only',
          supported: true,
          reason: 'real_provider_missing',
          message: 'Project-configured ESLint was not found. Semantic diagnostics stay off.',
        })
        capabilities.codeActions = createUnavailableCapability({
          source: 'syntax-only',
          supported: true,
          reason: 'real_provider_missing',
          message: 'Code actions require a project-configured ESLint provider.',
        })
        diagnosticOwnership = createSyntaxOnlyOwnership(capabilities.diagnostics.message)
      }
    } else if (isPython) {
      capabilities.diagnostics = createProviderHealthCapability(pyrightResolution, pyrightProvider, 'pyright')
      capabilities.hover = createProviderHealthCapability(pyrightResolution, pyrightProvider, 'pyright')
      capabilities.definition = createProviderHealthCapability(pyrightResolution, pyrightProvider, 'pyright')
      capabilities.references = createProviderHealthCapability(pyrightResolution, pyrightProvider, 'pyright')
      capabilities.symbols = createProviderHealthCapability(pyrightResolution, pyrightProvider, 'pyright')
      capabilities.codeActions = ruffRoot && ruffFixAvailability?.available && ruffProvider?.status !== 'degraded' && ruffProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'ruff',
            message: 'Project-configured Ruff fixes are available for this file.',
          })
        : createUnavailableCapability({
            supported: true,
            source: 'ruff',
            reason: !ruffRoot
              ? 'real_provider_missing'
              : ruffProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(ruffFixAvailability?.reason) || 'ruff_not_installed'),
            message: ruffRoot
              ? (ruffProvider?.message || 'Project-configured Ruff fixes are unavailable.')
              : 'Code actions require a project Ruff config.',
          })
      diagnosticOwnership = pyrightResolution?.available && pyrightProvider?.status !== 'degraded' && pyrightProvider?.status !== 'unavailable'
        ? createProviderOwnership('pyright', capabilities.diagnostics.message)
        : createSyntaxOnlyOwnership(capabilities.diagnostics.message)
    } else if (isCpp) {
      const missingContextMessage = 'Semantic editor features require compile_commands.json or compile_flags.txt.'
      capabilities.hover = createContextualProviderCapability({
        providerId: 'clangd',
        resolution: clangdResolution,
        providerDescriptor: clangdProvider,
        contextAvailable: !!clangCompileContext?.path,
        missingContextMessage,
        availableMessage: 'clangd semantic features are available for this file.',
      })
      capabilities.definition = createContextualProviderCapability({
        providerId: 'clangd',
        resolution: clangdResolution,
        providerDescriptor: clangdProvider,
        contextAvailable: !!clangCompileContext?.path,
        missingContextMessage,
        availableMessage: 'clangd definitions are available for this file.',
      })
      capabilities.references = createContextualProviderCapability({
        providerId: 'clangd',
        resolution: clangdResolution,
        providerDescriptor: clangdProvider,
        contextAvailable: !!clangCompileContext?.path,
        missingContextMessage,
        availableMessage: 'clangd references are available for this file.',
      })
      capabilities.symbols = createContextualProviderCapability({
        providerId: 'clangd',
        resolution: clangdResolution,
        providerDescriptor: clangdProvider,
        contextAvailable: !!clangCompileContext?.path,
        missingContextMessage,
        availableMessage: 'clangd symbols are available for this file.',
      })
    } else if (isCSharp) {
      const missingContextMessage = 'Semantic editor features require a real .csproj or .sln context.'
      capabilities.hover = createContextualProviderCapability({
        providerId: 'csharp-ls',
        resolution: csharpLsResolution,
        providerDescriptor: csharpLsProvider,
        contextAvailable: !!csharpProjectRoot,
        missingContextMessage,
        availableMessage: 'csharp-ls semantic features are available for this file.',
      })
      capabilities.definition = createContextualProviderCapability({
        providerId: 'csharp-ls',
        resolution: csharpLsResolution,
        providerDescriptor: csharpLsProvider,
        contextAvailable: !!csharpProjectRoot,
        missingContextMessage,
        availableMessage: 'csharp-ls definitions are available for this file.',
      })
      capabilities.references = createContextualProviderCapability({
        providerId: 'csharp-ls',
        resolution: csharpLsResolution,
        providerDescriptor: csharpLsProvider,
        contextAvailable: !!csharpProjectRoot,
        missingContextMessage,
        availableMessage: 'csharp-ls references are available for this file.',
      })
      capabilities.symbols = createContextualProviderCapability({
        providerId: 'csharp-ls',
        resolution: csharpLsResolution,
        providerDescriptor: csharpLsProvider,
        contextAvailable: !!csharpProjectRoot,
        missingContextMessage,
        availableMessage: 'csharp-ls symbols are available for this file.',
      })
    } else if (isJava) {
      const missingSemanticContextMessage = createJavaProjectContextMessage('Semantic editor features')
      capabilities.hover = createContextualProviderCapability({
        providerId: 'jdtls',
        resolution: jdtlsResolution,
        providerDescriptor: jdtlsProvider,
        contextAvailable: !!javaProjectRoot,
        missingContextMessage: missingSemanticContextMessage,
        availableMessage: 'jdtls semantic features are available for this file.',
      })
      capabilities.definition = createContextualProviderCapability({
        providerId: 'jdtls',
        resolution: jdtlsResolution,
        providerDescriptor: jdtlsProvider,
        contextAvailable: !!javaProjectRoot,
        missingContextMessage: missingSemanticContextMessage,
        availableMessage: 'jdtls definitions are available for this file.',
      })
      capabilities.references = createContextualProviderCapability({
        providerId: 'jdtls',
        resolution: jdtlsResolution,
        providerDescriptor: jdtlsProvider,
        contextAvailable: !!javaProjectRoot,
        missingContextMessage: missingSemanticContextMessage,
        availableMessage: 'jdtls references are available for this file.',
      })
      capabilities.symbols = createContextualProviderCapability({
        providerId: 'jdtls',
        resolution: jdtlsResolution,
        providerDescriptor: jdtlsProvider,
        contextAvailable: !!javaProjectRoot,
        missingContextMessage: missingSemanticContextMessage,
        availableMessage: 'jdtls symbols are available for this file.',
      })
      capabilities.formatting = createContextualProviderCapability({
        providerId: 'jdtls',
        resolution: jdtlsResolution,
        providerDescriptor: jdtlsProvider,
        contextAvailable: !!javaProjectRoot,
        missingContextMessage: createJavaProjectContextMessage('Formatting'),
        availableMessage: 'Java formatting is available through jdtls.',
      })
      capabilities.codeActions = createContextualProviderCapability({
        providerId: 'jdtls',
        resolution: jdtlsResolution,
        providerDescriptor: jdtlsProvider,
        contextAvailable: !!javaProjectRoot,
        missingContextMessage: createJavaProjectContextMessage('Code actions'),
        availableMessage: 'Java code actions are available through jdtls.',
      })
    } else if (supportsClangTidyCodeActions) {
      capabilities.codeActions = clangTidyConfigRoot && clangCompileContext?.path && clangTidyAvailability?.available && clangTidyProvider?.status !== 'degraded' && clangTidyProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'clang-tidy',
            message: 'Project-configured clang-tidy fix-all is available for this file.',
          })
        : createUnavailableCapability({
            supported: true,
            source: 'clang-tidy',
            reason: !clangTidyConfigRoot || !clangCompileContext?.path
              ? 'real_provider_missing'
              : clangTidyProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(clangTidyAvailability?.reason) || 'clang_tidy_not_installed'),
            message: !clangTidyConfigRoot
              ? 'Code actions require a project .clang-tidy config.'
              : !clangCompileContext?.path
                ? 'Code actions require compile_commands.json or compile_flags.txt.'
                : (clangTidyProvider?.message || 'Project-configured clang-tidy fix-all is unavailable.'),
          })
    } else if (supportsCSharpCodeActions) {
      capabilities.codeActions = csharpProjectRoot && dotnetFormatAvailability?.available && dotnetFormatProvider?.status !== 'degraded' && dotnetFormatProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'dotnet-format',
            message: 'Project-configured dotnet format fix-all is available for this file.',
          })
        : createUnavailableCapability({
            supported: true,
            source: 'dotnet-format',
            reason: !csharpProjectRoot
              ? 'real_provider_missing'
              : dotnetFormatProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(dotnetFormatAvailability?.reason) || 'dotnet_format_not_installed'),
            message: csharpProjectRoot
              ? (dotnetFormatProvider?.message || 'Project-configured dotnet format fix-all is unavailable.')
              : 'Code actions require a real .csproj or .sln context.',
          })
    }

    if (isCpp && supportsClangTidyCodeActions) {
      capabilities.codeActions = clangTidyConfigRoot && clangCompileContext?.path && clangTidyAvailability?.available && clangTidyProvider?.status !== 'degraded' && clangTidyProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'clang-tidy',
            message: 'Project-configured clang-tidy fix-all is available for this file.',
          })
        : createUnavailableCapability({
            supported: true,
            source: 'clang-tidy',
            reason: !clangTidyConfigRoot || !clangCompileContext?.path
              ? 'real_provider_missing'
              : clangTidyProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(clangTidyAvailability?.reason) || 'clang_tidy_not_installed'),
            message: !clangTidyConfigRoot
              ? 'Code actions require a project .clang-tidy config.'
              : !clangCompileContext?.path
                ? 'Code actions require compile_commands.json or compile_flags.txt.'
                : (clangTidyProvider?.message || 'Project-configured clang-tidy fix-all is unavailable.'),
          })
    }

    if (isCSharp && supportsCSharpCodeActions) {
      capabilities.codeActions = csharpProjectRoot && dotnetFormatAvailability?.available && dotnetFormatProvider?.status !== 'degraded' && dotnetFormatProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'dotnet-format',
            message: 'Project-configured dotnet format fix-all is available for this file.',
          })
        : createUnavailableCapability({
            supported: true,
            source: 'dotnet-format',
            reason: !csharpProjectRoot
              ? 'real_provider_missing'
              : dotnetFormatProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(dotnetFormatAvailability?.reason) || 'dotnet_format_not_installed'),
            message: csharpProjectRoot
              ? (dotnetFormatProvider?.message || 'Project-configured dotnet format fix-all is unavailable.')
              : 'Code actions require a real .csproj or .sln context.',
          })
    }

    if (!isFormatOnly && !isJsTs && !isPython && fallbackCodeActionRouteAvailability?.supported) {
      capabilities.codeActions = fallbackCodeActionRouteAvailability.available
        ? createAvailableCapability({
            source: cleanString(fallbackCodeActionRouteAvailability?.source),
            message: cleanString(fallbackCodeActionRouteAvailability?.message) || 'Code actions are available for this file.',
          })
        : createUnavailableCapability({
            supported: true,
            source: cleanString(fallbackCodeActionRouteAvailability?.source),
            reason: cleanString(fallbackCodeActionRouteAvailability?.reason) || 'provider_unavailable',
            message: cleanString(fallbackCodeActionRouteAvailability?.message) || 'Code actions are unavailable for this file.',
          })
    }

    if (supportsBiomeFormatting) {
      capabilities.formatting = biomeRoot && biomeAvailability.available && biomeProvider?.status !== 'degraded' && biomeProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'biome',
            message: 'Project-configured Biome formatting is available for this file.',
          })
        : createUnavailableCapability({
            source: 'biome',
            supported: true,
            reason: !biomeRoot
              ? 'real_provider_missing'
              : biomeProvider?.status === 'degraded'
              ? 'provider_degraded'
              : (biomeAvailability.reason || 'biome_not_installed'),
            message: biomeProvider?.message || 'Formatting requires a project Biome config.',
          })
    } else if (supportsMarkupFormatting || supportsPrettierStyleFormatting || supportsDataConfigFormatting) {
      capabilities.formatting = formatOnlyRouteAvailability?.available
        ? createAvailableCapability({
            source: cleanString(formatOnlyRouteAvailability?.source) || 'format-only',
            message: cleanString(formatOnlyRouteAvailability?.message) || 'Request-driven formatting is available for this file.',
          })
        : createUnavailableCapability({
            source: cleanString(formatOnlyRouteAvailability?.source) || 'format-only',
            supported: formatOnlyRouteAvailability?.supported === true,
            reason: cleanString(formatOnlyRouteAvailability?.reason) || 'formatter_unavailable',
            message: cleanString(formatOnlyRouteAvailability?.message) || 'No formatter is configured for this file type.',
          })
    } else if (supportsRuffFormatting) {
      capabilities.formatting = ruffRoot && ruffAvailability?.available && ruffProvider?.status !== 'degraded' && ruffProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'ruff',
            message: 'Project-configured Ruff formatting is available for this file.',
          })
        : createUnavailableCapability({
            source: 'ruff',
            supported: true,
            reason: !ruffRoot
              ? 'real_provider_missing'
              : ruffProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(ruffAvailability?.reason) || 'ruff_not_installed'),
            message: ruffRoot
              ? (ruffProvider?.message || 'Project-configured Ruff formatter is unavailable.')
              : 'Formatting requires a project Ruff config.',
          })
    } else if (supportsClangFormatting) {
      capabilities.formatting = clangFormatRoot && clangFormatAvailability?.available && clangFormatProvider?.status !== 'degraded' && clangFormatProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'clang-format',
            message: 'Project-configured clang-format formatting is available for this file.',
          })
        : createUnavailableCapability({
            source: 'clang-format',
            supported: true,
            reason: !clangFormatRoot
              ? 'real_provider_missing'
              : clangFormatProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(clangFormatAvailability?.reason) || 'clang_format_not_installed'),
            message: clangFormatRoot
              ? (clangFormatProvider?.message || 'Project-configured clang-format is unavailable.')
              : 'Formatting requires a project .clang-format or _clang-format config.',
          })
    } else if (supportsCSharpFormatting) {
      capabilities.formatting = csharpProjectRoot && csharpierAvailability?.available && csharpierProvider?.status !== 'degraded' && csharpierProvider?.status !== 'unavailable'
        ? createAvailableCapability({
            source: 'csharpier',
            message: 'Project-configured CSharpier formatting is available for this file.',
          })
        : createUnavailableCapability({
            source: 'csharpier',
            supported: true,
            reason: !csharpProjectRoot
              ? 'real_provider_missing'
              : csharpierProvider?.status === 'degraded'
                ? 'provider_degraded'
                : (cleanString(csharpierAvailability?.reason) || 'csharpier_not_installed'),
            message: csharpProjectRoot
              ? (csharpierProvider?.message || 'Project-configured CSharpier is unavailable.')
              : 'Formatting requires a real .csproj or .sln context.',
          })
    } else if (fallbackFormattingRouteAvailability?.supported) {
      capabilities.formatting = fallbackFormattingRouteAvailability.available
        ? createAvailableCapability({
            source: cleanString(fallbackFormattingRouteAvailability?.source),
            message: cleanString(fallbackFormattingRouteAvailability?.message) || 'Formatting is available for this file.',
          })
        : createUnavailableCapability({
            source: cleanString(fallbackFormattingRouteAvailability?.source),
            supported: true,
            reason: cleanString(fallbackFormattingRouteAvailability?.reason) || 'formatter_unavailable',
            message: cleanString(fallbackFormattingRouteAvailability?.message) || 'Formatting is unavailable for this file.',
          })
    }

    const providers = []
    if (isJsTs) {
      providers.push(tsProvider)
      providers.push(eslintProvider)
    } else if (isCpp && clangdProvider && providerHealth.has('clangd')) {
      providers.push(clangdProvider)
    } else if (isCSharp && csharpLsProvider && providerHealth.has('csharp-ls')) {
      providers.push(csharpLsProvider)
    } else if (isJava && jdtlsProvider && providerHealth.has('jdtls')) {
      providers.push(jdtlsProvider)
    } else if (isPython) {
      providers.push(pyrightProvider)
    }
    if (supportsBiomeFormatting && !isFormatOnly) {
      providers.push(biomeProvider)
    }
    if ((supportsRuffFormatting || supportsRuffCodeActions) && ruffProvider?.status !== 'idle') {
      providers.push(ruffProvider)
    }
    if (supportsClangFormatting && clangFormatProvider?.status !== 'idle') {
      providers.push(clangFormatProvider)
    }
    if (supportsClangTidyCodeActions && clangTidyProvider?.status !== 'idle') {
      providers.push(clangTidyProvider)
    }
    if (supportsCSharpFormatting && csharpierProvider?.status !== 'idle') {
      providers.push(csharpierProvider)
    }
    if (supportsCSharpCodeActions && dotnetFormatProvider?.status !== 'idle') {
      providers.push(dotnetFormatProvider)
    }

    const health = {
      status: inferOverallHealthStatus(providers),
      message: providers.find((provider) => provider.status === 'degraded' || provider.status === 'unavailable')?.message || '',
      providers,
    }

    return {
      ok: true,
      workspace: {
        root: workspaceRoot,
      },
      document: doc
        ? {
            uri: doc.uri,
            filePath: doc.filePath,
            language,
            version: Math.max(1, Number(doc.version || 1) || 1),
          }
        : null,
      diagnosticOwnership,
      capabilities,
      health,
    }
  }



  return buildServiceState
}
