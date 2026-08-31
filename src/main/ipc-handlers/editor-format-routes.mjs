function createUnsupportedRouteResult(message = '', extra = {}) {
  return {
    ok: true,
    available: false,
    reason: 'unsupported_file',
    message,
    ...extra,
  }
}

export function createEditorFormatRoutes(dependencies = {}) {
  const {
    maxFormatTextChars = 500_000,
    normalizeLanguage,
    safePath,
    supportsBiomeFormat,
    supportsRuffFormat,
    supportsRuffFix,
    supportsMarkupFormat,
    supportsPrettierStyleFormat,
    supportsYamlFormat,
    supportsTomlFormat,
    supportsClangFormat,
    supportsCSharpierFormat,
    supportsClangTidyFix,
    supportsDotnetFormatFix,
    getBiomeFormatterAvailability,
    getRuffFormatterAvailability,
    getPrettierFormatterAvailability,
    getTomlFormatterAvailability,
    getClangFormatAvailability,
    getCSharpierAvailability,
    getClangTidyFixAvailability,
    getDotnetFormatFixAvailability,
    createUnavailableFormatterRouteResult,
    createUnavailableRouteAvailability,
    formatWithBiome,
    formatWithRuff,
    formatWithPrettier,
    formatWithSmolToml,
    formatWithClangFormat,
    formatWithCSharpier,
    fixWithRuff,
    fixWithClangTidy,
    fixWithDotnetFormat,
    formatterProviderFamilyIds,
    codeActionProviderFamilyIds,
  } = dependencies

  const formatterFamilyRoutes = [
    {
      id: 'biome',
      familyId: formatterProviderFamilyIds.BIOME,
      source: 'biome',
      canFormat: ({ relFilePath, language }) => supportsBiomeFormat(relFilePath, language),
      getAvailability: () => getBiomeFormatterAvailability(),
      format: formatWithBiome,
    },
    {
      id: 'ruff',
      familyId: formatterProviderFamilyIds.PYTHON,
      source: 'ruff',
      canFormat: ({ relFilePath, language }) => supportsRuffFormat(relFilePath, language),
      getAvailability: () => getRuffFormatterAvailability(),
      format: formatWithRuff,
    },
    {
      id: 'style-preprocessor',
      familyId: formatterProviderFamilyIds.STYLE_PREPROCESSOR,
      source: 'prettier',
      canFormat: ({ relFilePath, language }) => supportsPrettierStyleFormat(relFilePath, language),
      getAvailability: () => getPrettierFormatterAvailability(),
      format: formatWithPrettier,
    },
    {
      id: 'markup',
      familyId: formatterProviderFamilyIds.MARKUP_PROSE,
      source: 'prettier',
      canFormat: ({ relFilePath, language }) => supportsMarkupFormat(relFilePath, language),
      getAvailability: () => getPrettierFormatterAvailability(),
      format: formatWithPrettier,
    },
    {
      id: 'yaml',
      familyId: formatterProviderFamilyIds.DATA_CONFIG,
      source: 'prettier',
      canFormat: ({ relFilePath, language }) => supportsYamlFormat(relFilePath, language),
      getAvailability: () => getPrettierFormatterAvailability(),
      format: formatWithPrettier,
    },
    {
      id: 'toml',
      familyId: formatterProviderFamilyIds.DATA_CONFIG,
      source: 'smol-toml',
      canFormat: ({ relFilePath, language }) => supportsTomlFormat(relFilePath, language),
      getAvailability: ({ content } = {}) => getTomlFormatterAvailability({ content }),
      format: formatWithSmolToml,
    },
    {
      id: 'clang-format',
      familyId: formatterProviderFamilyIds.C_CPP_FORMAT,
      source: 'clang-format',
      canFormat: ({ relFilePath, language }) => supportsClangFormat(relFilePath, language),
      getAvailability: ({ projectFolder, filePath } = {}) => getClangFormatAvailability(projectFolder, filePath),
      format: formatWithClangFormat,
    },
    {
      id: 'csharpier',
      familyId: formatterProviderFamilyIds.CSHARP_FORMAT,
      source: 'csharpier',
      canFormat: ({ relFilePath, language }) => supportsCSharpierFormat(relFilePath, language),
      getAvailability: ({ projectFolder, filePath } = {}) => getCSharpierAvailability(projectFolder, filePath),
      format: formatWithCSharpier,
    },
  ]

  const codeActionFamilyRoutes = [
    {
      id: 'clang-tidy',
      familyId: codeActionProviderFamilyIds.C_CPP_FIX,
      source: 'clang-tidy',
      canApply: ({ relFilePath, language }) => supportsClangTidyFix(relFilePath, language),
      getAvailability: ({ projectFolder, filePath } = {}) => getClangTidyFixAvailability(projectFolder, filePath),
    },
    {
      id: 'dotnet-format',
      familyId: codeActionProviderFamilyIds.CSHARP_FIX,
      source: 'dotnet-format',
      canApply: ({ relFilePath, language }) => supportsDotnetFormatFix(relFilePath, language),
      getAvailability: ({ projectFolder, filePath } = {}) => getDotnetFormatFixAvailability(projectFolder, filePath),
    },
  ]

  function resolveFormatterRoute(filePath = '', language = '') {
    const relFilePath = String(filePath || '').trim()
    const lang = normalizeLanguage(language)
    for (const route of formatterFamilyRoutes) {
      if (route.canFormat({ relFilePath, language: lang })) return route
    }
    return null
  }

  function getFormattingRoute(filePath = '', language = '') {
    const route = resolveFormatterRoute(filePath, language)
    if (!route) return null
    return {
      id: route.id,
      familyId: route.familyId,
      source: route.source,
    }
  }

  function resolveCodeActionRoute(filePath = '', language = '') {
    const relFilePath = String(filePath || '').trim()
    const lang = normalizeLanguage(language)
    for (const route of codeActionFamilyRoutes) {
      if (route.canApply({ relFilePath, language: lang })) return route
    }
    return null
  }

  function getCodeActionRoute(filePath = '', language = '') {
    const route = resolveCodeActionRoute(filePath, language)
    if (!route) return null
    return {
      id: route.id,
      familyId: route.familyId,
      source: route.source,
    }
  }

  function getFormattingRouteAvailability(filePath = '', language = '', options = {}) {
    const route = resolveFormatterRoute(filePath, language)
    if (!route) {
      return {
        supported: false,
        available: false,
        source: '',
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
        routeId: '',
        familyId: '',
      }
    }

    const availability = typeof route.getAvailability === 'function'
      ? route.getAvailability({ filePath, language, ...(options && typeof options === 'object' ? options : {}) })
      : createUnavailableFormatterRouteResult({
          source: route.source,
          reason: 'formatter_unavailable',
          message: 'Formatter availability could not be determined.',
        })

    return {
      supported: true,
      available: availability.available === true,
      source: String(availability.source || route.source || '').trim(),
      reason: String(availability.reason || '').trim(),
      message: String(availability.message || '').trim(),
      routeId: route.id,
      familyId: route.familyId,
    }
  }

  function getCodeActionRouteAvailability(filePath = '', language = '', options = {}) {
    const route = resolveCodeActionRoute(filePath, language)
    if (!route) {
      return {
        supported: false,
        available: false,
        source: '',
        reason: 'unsupported_file',
        message: 'No code-action provider is configured for this file type.',
        routeId: '',
        familyId: '',
      }
    }

    const availability = typeof route.getAvailability === 'function'
      ? route.getAvailability({ filePath, language, ...(options && typeof options === 'object' ? options : {}) })
      : createUnavailableRouteAvailability({
          source: route.source,
          reason: 'provider_unavailable',
          message: 'Code-action provider availability could not be determined.',
          routeId: route.id,
          familyId: route.familyId,
        })

    return {
      supported: true,
      available: availability.available === true,
      source: String(availability.source || route.source || '').trim(),
      reason: String(availability.reason || '').trim(),
      message: String(availability.message || '').trim(),
      routeId: route.id,
      familyId: route.familyId,
    }
  }

  async function formatTextWithRouter({ project, filePath, content, language = '' } = {}) {
    const projectRoot = String(project || '').trim()
    const relFilePath = String(filePath || '').trim()
    const text = String(content ?? '')
    const lang = normalizeLanguage(language)

    if (!projectRoot || !relFilePath) {
      return { ok: false, error: 'project and filePath are required.' }
    }
    if (text.length > maxFormatTextChars) {
      return { ok: true, available: false, reason: 'file_too_large', message: 'File too large for formatter.' }
    }

    let absPath = ''
    try {
      absPath = safePath(projectRoot, relFilePath)
    } catch (err) {
      return { ok: false, error: String(err?.message || 'Invalid path') }
    }

    const route = resolveFormatterRoute(relFilePath, lang)
    if (route) {
      return route.format({
        adapterId: route.id,
        projectRoot,
        relFilePath,
        absPath,
        content: text,
        language: lang,
      })
    }

    return createUnsupportedRouteResult('No formatter is configured for this file type.')
  }

  async function fixPythonTextWithRouter({ project, filePath, content, language = '' } = {}) {
    const projectRoot = String(project || '').trim()
    const relFilePath = String(filePath || '').trim()
    const text = String(content ?? '')
    const lang = normalizeLanguage(language)

    if (!projectRoot || !relFilePath) {
      return { ok: false, error: 'project and filePath are required.' }
    }
    if (text.length > maxFormatTextChars) {
      return createUnsupportedRouteResult('File too large for Ruff fix-all.', { reason: 'file_too_large' })
    }
    if (!supportsRuffFix(relFilePath, lang)) {
      return createUnsupportedRouteResult('No Python fix provider is configured for this file type.')
    }

    let absPath = ''
    try {
      absPath = safePath(projectRoot, relFilePath)
    } catch (err) {
      return { ok: false, error: String(err?.message || 'Invalid path') }
    }

    return fixWithRuff({
      projectRoot,
      relFilePath,
      absPath,
      content: text,
      language: lang,
    })
  }

  async function fixClangTidyTextWithRouter({ project, filePath, content, language = '' } = {}) {
    const projectRoot = String(project || '').trim()
    const relFilePath = String(filePath || '').trim()
    const text = String(content ?? '')
    const lang = normalizeLanguage(language)

    if (!projectRoot || !relFilePath) {
      return { ok: false, error: 'project and filePath are required.' }
    }
    if (text.length > maxFormatTextChars) {
      return createUnsupportedRouteResult('File too large for clang-tidy fix-all.', { reason: 'file_too_large' })
    }
    if (!supportsClangTidyFix(relFilePath, lang)) {
      return createUnsupportedRouteResult('No C/C++ fix provider is configured for this file type.')
    }

    let absPath = ''
    try {
      absPath = safePath(projectRoot, relFilePath)
    } catch (err) {
      return { ok: false, error: String(err?.message || 'Invalid path') }
    }

    return fixWithClangTidy({
      projectRoot,
      relFilePath,
      absPath,
      content: text,
      language: lang,
    })
  }

  async function fixDotnetFormatTextWithRouter({ project, filePath, content, language = '' } = {}) {
    const projectRoot = String(project || '').trim()
    const relFilePath = String(filePath || '').trim()
    const text = String(content ?? '')
    const lang = normalizeLanguage(language)

    if (!projectRoot || !relFilePath) {
      return { ok: false, error: 'project and filePath are required.' }
    }
    if (text.length > maxFormatTextChars) {
      return createUnsupportedRouteResult('File too large for dotnet format fix-all.', { reason: 'file_too_large' })
    }
    if (!supportsDotnetFormatFix(relFilePath, lang)) {
      return createUnsupportedRouteResult('No C# fix provider is configured for this file type.')
    }

    let absPath = ''
    try {
      absPath = safePath(projectRoot, relFilePath)
    } catch (err) {
      return { ok: false, error: String(err?.message || 'Invalid path') }
    }

    return fixWithDotnetFormat({
      projectRoot,
      relFilePath,
      absPath,
      content: text,
      language: lang,
    })
  }

  return {
    getFormattingRoute,
    getCodeActionRoute,
    getFormattingRouteAvailability,
    getCodeActionRouteAvailability,
    formatTextWithRouter,
    fixPythonTextWithRouter,
    fixClangTidyTextWithRouter,
    fixDotnetFormatTextWithRouter,
  }
}
