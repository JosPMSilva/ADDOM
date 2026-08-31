const EDITOR_SETUP_HINT_DISMISSALS_STORAGE_KEY = 'addom.editor.setupHints.dismissed'

const ACTIONABLE_SETUP_REASONS = new Set([
  'real_provider_missing',
  'missing_provider_binary',
  'biome_not_installed',
  'prettier_not_installed',
  'ruff_not_installed',
  'clang_format_not_installed',
  'clang_tidy_not_installed',
  'csharpier_not_installed',
  'dotnet_format_not_installed',
  'dotnet_not_installed',
  'java_not_installed',
])

const PROVIDER_METADATA = Object.freeze({
  biome: {
    id: 'biome',
    label: 'Biome',
  },
  clangd: {
    id: 'clangd',
    label: 'clangd',
  },
  prettier: {
    id: 'prettier',
    label: 'Prettier',
  },
  ruff: {
    id: 'ruff',
    label: 'Ruff',
  },
  'smol-toml': {
    id: 'smol-toml',
    label: 'smol-toml',
  },
  'clang-format': {
    id: 'clang-format',
    label: 'clang-format',
  },
  'csharp-ls': {
    id: 'csharp-ls',
    label: 'csharp-ls',
  },
  csharpier: {
    id: 'csharpier',
    label: 'CSharpier',
  },
  'eslint-project-config': {
    id: 'eslint-project-config',
    label: 'ESLint',
  },
  'clang-tidy': {
    id: 'clang-tidy',
    label: 'clang-tidy',
  },
  'dotnet-format': {
    id: 'dotnet-format',
    label: 'dotnet format',
  },
  jdtls: {
    id: 'jdtls',
    label: 'jdtls',
  },
  pyright: {
    id: 'pyright',
    label: 'Pyright',
  },
  tsserver: {
    id: 'tsserver',
    label: 'tsserver',
  },
})

function cleanString(value = '') {
  return String(value || '').trim()
}

function normalizeWorkspaceKey(projectFolder = '') {
  const normalized = cleanString(projectFolder)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
  if (!normalized) return 'workspace'
  return /^(?:[A-Z]:)/.test(normalized)
    ? normalized[0].toLowerCase() + normalized.slice(1)
    : normalized
}

function getCapabilityActionLabel(capabilityKey = '') {
  return cleanString(capabilityKey) === 'codeActions' ? 'Fix' : 'Format'
}

function getCapabilityFeatureLabel(capabilityKey = '') {
  return cleanString(capabilityKey) === 'codeActions' ? 'Code actions' : 'Formatting'
}

function getLocalizedCapabilityActionLabel(t, capabilityKey = '') {
  if (typeof t !== 'function') return getCapabilityActionLabel(capabilityKey)
  if (cleanString(capabilityKey) === 'codeActions') {
    return t('editor.tabBar.fix', { defaultValue: 'Fix' })
  }
  return t('editor.tabBar.format', { defaultValue: 'Format' })
}

function getLocalizedCapabilityFeatureLabel(t, capabilityKey = '') {
  if (typeof t !== 'function') return getCapabilityFeatureLabel(capabilityKey)
  if (cleanString(capabilityKey) === 'codeActions') {
    return t('editor.panel.fixUnavailableTitle', {
      defaultValue: 'Code actions are unavailable for the current file',
    })
  }
  return t('editor.panel.formatUnavailableTitle', {
    defaultValue: 'Formatting is unavailable for the current file',
  })
}

function inferProviderFromMessage(message = '', capabilityKey = '') {
  const text = cleanString(message)
  if (!text) return null

  if (/eslint/i.test(text)) return PROVIDER_METADATA['eslint-project-config']
  if (/clang-format|\.clang-format|_clang-format/i.test(text)) return PROVIDER_METADATA['clang-format']
  if (/clang-tidy|\.clang-tidy|compile_commands\.json|compile_flags\.txt/i.test(text)) return PROVIDER_METADATA['clang-tidy']
  if (/csharpier/i.test(text)) return PROVIDER_METADATA.csharpier
  if (/dotnet format|\.csproj|\.sln/i.test(text) && cleanString(capabilityKey) === 'codeActions') {
    return PROVIDER_METADATA['dotnet-format']
  }
  if (/jdtls|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|jdk|java/i.test(text)) {
    return PROVIDER_METADATA.jdtls
  }
  if (/ruff/i.test(text)) return PROVIDER_METADATA.ruff
  if (/biome/i.test(text)) return PROVIDER_METADATA.biome
  if (/prettier/i.test(text)) return PROVIDER_METADATA.prettier
  if (/toml/i.test(text)) return PROVIDER_METADATA['smol-toml']
  return null
}

export function resolveEditorCapabilityProvider(capabilityKey = '', capability = null) {
  const source = cleanString(capability?.source)
  if (source && PROVIDER_METADATA[source]) return PROVIDER_METADATA[source]
  return inferProviderFromMessage(capability?.message, capabilityKey)
}

export function getEditorProviderLabel(providerId = '', fallbackLabel = '') {
  const normalizedProviderId = cleanString(providerId)
  if (normalizedProviderId && PROVIDER_METADATA[normalizedProviderId]?.label) {
    return PROVIDER_METADATA[normalizedProviderId].label
  }
  return cleanString(fallbackLabel) || normalizedProviderId || 'provider'
}

function classifyEditorCapabilityMessage(capability = null) {
  const text = cleanString(capability?.message)
  if (!text) return ''

  if (/project-configured ESLint provider/i.test(text)) return 'eslintProjectRequired'
  if (/project Biome config/i.test(text)) return 'biomeConfigRequired'
  if (/project Ruff config/i.test(text)) return 'ruffConfigRequired'
  if (/(?:^|[\s(])(?:\.clang-format|_clang-format)\b/i.test(text)) return 'clangFormatConfigRequired'
  if (/project \.clang-tidy config/i.test(text)) return 'clangTidyConfigRequired'
  if (/compile_commands\.json|compile_flags\.txt/i.test(text)) return 'clangCompileContextRequired'
  if (/real \.csproj or \.sln context/i.test(text)) return 'dotnetProjectRequired'
  if (/Maven or Gradle project context/i.test(text)) return 'javaProjectContextRequired'
  if (/JAVA_HOME|usable JDK/i.test(text)) return 'javaNotInstalled'
  if (/dotnet was not found on PATH/i.test(text)) return 'dotnetNotInstalled'
  if (/not found(?: in this project)?(?: or on PATH)?|not installed|on PATH/i.test(text)) {
    return 'missingBinary'
  }

  return ''
}

function localizeSetupHintMessage({ t, capabilityKey = '', messageCode = '', providerLabel = '' } = {}) {
  const keyPrefix = `editor.diagnostics.setupHints.messages.${cleanString(capabilityKey) === 'codeActions' ? 'codeActions' : 'formatting'}`
  switch (messageCode) {
    case 'eslintProjectRequired':
      return t(`${keyPrefix}.eslintProjectRequired`, {
        defaultValue: 'Code actions require a project-configured ESLint provider.',
      })
    case 'biomeConfigRequired':
      return t(`${keyPrefix}.biomeConfigRequired`, {
        defaultValue: 'Formatting requires a project Biome config.',
      })
    case 'ruffConfigRequired':
      return t(`${keyPrefix}.ruffConfigRequired`, {
        defaultValue: cleanString(capabilityKey) === 'codeActions'
          ? 'Code actions require a project Ruff config.'
          : 'Formatting requires a project Ruff config.',
      })
    case 'clangFormatConfigRequired':
      return t(`${keyPrefix}.clangFormatConfigRequired`, {
        defaultValue: 'Formatting requires a project .clang-format or _clang-format config.',
      })
    case 'clangTidyConfigRequired':
      return t(`${keyPrefix}.clangTidyConfigRequired`, {
        defaultValue: 'Code actions require a project .clang-tidy config.',
      })
    case 'clangCompileContextRequired':
      return t(`${keyPrefix}.clangCompileContextRequired`, {
        defaultValue: 'Code actions require compile_commands.json or compile_flags.txt.',
      })
    case 'dotnetProjectRequired':
      return t(`${keyPrefix}.dotnetProjectRequired`, {
        defaultValue: cleanString(capabilityKey) === 'codeActions'
          ? 'Code actions require a real .csproj or .sln context.'
          : 'Formatting requires a real .csproj or .sln context.',
      })
    case 'javaProjectContextRequired':
      return t(`${keyPrefix}.javaProjectContextRequired`, {
        defaultValue: cleanString(capabilityKey) === 'codeActions'
          ? 'Code actions require a Maven or Gradle project context (pom.xml, build.gradle, build.gradle.kts, settings.gradle, settings.gradle.kts).'
          : 'Formatting requires a Maven or Gradle project context (pom.xml, build.gradle, build.gradle.kts, settings.gradle, settings.gradle.kts).',
      })
    case 'javaNotInstalled':
      return t(`${keyPrefix}.javaNotInstalled`, {
        defaultValue: 'A usable JDK was not found on PATH or JAVA_HOME. jdtls requires Java.',
      })
    case 'dotnetNotInstalled':
      return t(`${keyPrefix}.dotnetNotInstalled`, {
        defaultValue: 'dotnet was not found on PATH.',
      })
    case 'missingBinary':
      return t(`${keyPrefix}.missingBinary`, {
        defaultValue: '{{providerLabel}} was not found in this project or on PATH.',
        providerLabel,
      })
    default:
      return ''
  }
}

function classifyEditorCapabilityReason(reason = '') {
  switch (cleanString(reason)) {
    case 'biome_not_installed':
    case 'prettier_not_installed':
    case 'ruff_not_installed':
    case 'clang_format_not_installed':
    case 'clang_tidy_not_installed':
    case 'csharpier_not_installed':
    case 'dotnet_format_not_installed':
    case 'missing_provider_binary':
      return 'missingBinary'
    case 'java_not_installed':
      return 'javaNotInstalled'
    case 'dotnet_not_installed':
      return 'dotnetNotInstalled'
    default:
      return ''
  }
}

export function buildLocalizedEditorCapabilityMessage({
  t = null,
  capabilityKey = '',
  capability = null,
  context = 'setup',
} = {}) {
  const translate = typeof t === 'function' ? t : null
  const normalizedContext = cleanString(context)
  const normalizedCapabilityKey = cleanString(capabilityKey)
  const reason = cleanString(capability?.reason)
  const providerId = cleanString(capability?.providerId || capability?.source)
  const providerLabel = getEditorProviderLabel(providerId, capability?.providerLabel)
  const rawMessage = cleanString(capability?.message)
  const messageCode = classifyEditorCapabilityMessage(capability)
    || classifyEditorCapabilityReason(reason)

  if (translate && normalizedContext === 'outline') {
    switch (reason) {
      case 'service_unavailable':
        return translate('editor.diagnostics.outline.messages.serviceUnavailable', {
          defaultValue: 'Symbols are unavailable because the editor service is not ready.',
        })
      case 'load_failed':
        return translate('editor.diagnostics.outline.messages.loadFailed', {
          defaultValue: 'Failed to load symbols.',
        })
      case 'real_provider_missing':
        return translate('editor.diagnostics.outline.messages.realProviderMissing', {
          defaultValue: 'This file stays syntax-only because no real provider is available for this language.',
        })
      case 'format_only_language':
        return translate('editor.diagnostics.outline.messages.formatOnlyLanguage', {
          defaultValue: 'This language stays syntax-only in the editor right now.',
        })
      case 'missing_provider_binary':
        return translate('editor.diagnostics.outline.messages.missingBinary', {
          defaultValue: '{{providerLabel}} was not found in this project or on PATH.',
          providerLabel,
        })
      case 'provider_unavailable':
        return translate('editor.diagnostics.outline.messages.providerUnavailable', {
          defaultValue: '{{providerLabel}} is unavailable for symbols in this file.',
          providerLabel,
        })
      case 'provider_degraded':
        return translate('editor.diagnostics.outline.messages.providerDegraded', {
          defaultValue: '{{providerLabel}} is degraded for symbols in this file.',
          providerLabel,
        })
      case 'provider_request_failed':
        return translate('editor.diagnostics.outline.messages.providerRequestFailed', {
          defaultValue: '{{providerLabel}} failed while loading symbols for this file.',
          providerLabel,
        })
      case 'unsupported_file':
        return translate('editor.diagnostics.outline.messages.unsupportedFile', {
          defaultValue: 'Outline is unavailable for this file type.',
        })
      case 'unsupported':
        return translate('editor.diagnostics.outline.messages.unsupported', {
          defaultValue: 'Outline is unavailable for this file.',
        })
      default:
        break
    }
  }

  if (translate) {
    const setupHintMessage = localizeSetupHintMessage({
      t: translate,
      capabilityKey: normalizedCapabilityKey,
      messageCode,
      providerLabel,
    })
    if (setupHintMessage) return setupHintMessage

    switch (reason) {
      case 'missing_provider_binary':
        return translate(`editor.diagnostics.setupHints.messages.${normalizedCapabilityKey === 'codeActions' ? 'codeActions' : 'formatting'}.missingBinary`, {
          defaultValue: '{{providerLabel}} was not found in this project or on PATH.',
          providerLabel,
        })
      case 'provider_unavailable':
        return translate(`editor.diagnostics.setupHints.messages.${normalizedCapabilityKey === 'codeActions' ? 'codeActions' : 'formatting'}.providerUnavailable`, {
          defaultValue: '{{providerLabel}} is unavailable for this file.',
          providerLabel,
        })
      case 'provider_degraded':
        return translate(`editor.diagnostics.setupHints.messages.${normalizedCapabilityKey === 'codeActions' ? 'codeActions' : 'formatting'}.providerDegraded`, {
          defaultValue: '{{providerLabel}} is degraded for this file.',
          providerLabel,
        })
      case 'provider_request_failed':
        return translate(`editor.diagnostics.setupHints.messages.${normalizedCapabilityKey === 'codeActions' ? 'codeActions' : 'formatting'}.providerRequestFailed`, {
          defaultValue: '{{providerLabel}} failed while serving this file.',
          providerLabel,
        })
      case 'real_provider_missing':
        return translate(`editor.diagnostics.setupHints.messages.${normalizedCapabilityKey === 'codeActions' ? 'codeActions' : 'formatting'}.realProviderMissing`, {
          defaultValue: cleanString(capabilityKey) === 'codeActions'
            ? 'Code actions require a real provider for this file.'
            : 'Formatting requires a real provider for this file.',
        })
      case 'format_only_language':
        return translate(`editor.diagnostics.setupHints.messages.${normalizedCapabilityKey === 'codeActions' ? 'codeActions' : 'formatting'}.formatOnlyLanguage`, {
          defaultValue: 'This language is formatting-only right now.',
        })
      case 'unsupported_file':
        return getLocalizedCapabilityFeatureLabel(translate, normalizedCapabilityKey)
      default:
        break
    }
  }

  return rawMessage
}

export function buildLocalizedEditorServiceNotice({
  t = null,
  serviceState = null,
  optionalUnavailableProviderIds = null,
} = {}) {
  if (typeof t !== 'function') return null

  const skippedUnavailableProviders = optionalUnavailableProviderIds instanceof Set
    ? optionalUnavailableProviderIds
    : new Set()
  const providers = Array.isArray(serviceState?.health?.providers) ? serviceState.health.providers : []

  for (const provider of providers) {
    const status = cleanString(provider?.status)
    const providerId = cleanString(provider?.id || provider?.source)
    if (status !== 'degraded' && status !== 'unavailable') continue
    if (status === 'unavailable' && skippedUnavailableProviders.has(providerId)) continue

    const providerLabel = getEditorProviderLabel(providerId, provider?.label)
    return {
      id: `provider:${providerId || 'unknown'}:${status}`,
      text: status === 'degraded'
        ? t('editor.panel.serviceNotice.providerDegraded', {
          defaultValue: '{{providerLabel}} is degraded. Editor features may be limited.',
          providerLabel,
        })
        : t('editor.panel.serviceNotice.providerUnavailable', {
          defaultValue: '{{providerLabel}} is unavailable. Editor features may be limited.',
          providerLabel,
        }),
    }
  }

  const healthStatus = cleanString(serviceState?.health?.status)
  if (healthStatus === 'degraded' || healthStatus === 'unavailable') {
    return {
      id: `health:${healthStatus}`,
      text: t('editor.panel.serviceNotice.genericUnavailable', {
        defaultValue: 'Some editor services are unavailable right now.',
      }),
    }
  }

  return null
}

export function buildEditorCapabilityActionTitle({
  capabilityKey = '',
  capability = null,
  enabledTitle = '',
  disabledFallbackTitle = '',
  t = null,
} = {}) {
  if (capability?.available === true) return cleanString(enabledTitle)

  const actionLabel = getLocalizedCapabilityActionLabel(t, capabilityKey)
  if (typeof t !== 'function') {
    const rawMessage = cleanString(capability?.message)
    const provider = resolveEditorCapabilityProvider(capabilityKey, capability)
    if (!rawMessage) {
      return cleanString(disabledFallbackTitle) || `${actionLabel} unavailable for the current file`
    }
    if (!provider?.label) return `${actionLabel} unavailable: ${rawMessage}`
    return `${actionLabel} unavailable: uses ${provider.label}. ${rawMessage}`
  }

  const message = buildLocalizedEditorCapabilityMessage({
    t,
    capabilityKey,
    capability,
  })
  if (!message) {
    return cleanString(disabledFallbackTitle) || `${actionLabel} unavailable for the current file`
  }
  return message
}

export function isEditorSetupHintActionable(capabilityKey = '', capability = null) {
  if (!capability || capability.available === true) return false

  const reason = cleanString(capability.reason)
  if (!ACTIONABLE_SETUP_REASONS.has(reason)) return false

  return !!resolveEditorCapabilityProvider(capabilityKey, capability)
}

function buildEditorSetupHintId({
  projectFolder = '',
  capabilityKey = '',
  providerId = '',
  reason = '',
} = {}) {
  return [
    normalizeWorkspaceKey(projectFolder),
    cleanString(capabilityKey),
    cleanString(providerId),
    cleanString(reason),
  ].join('::')
}

export function buildEditorSetupHint({
  projectFolder = '',
  capabilityKey = '',
  capability = null,
} = {}) {
  if (!isEditorSetupHintActionable(capabilityKey, capability)) return null

  const provider = resolveEditorCapabilityProvider(capabilityKey, capability)
  const reason = cleanString(capability?.reason)
  const actionLabel = getCapabilityActionLabel(capabilityKey)
  const message = cleanString(capability?.message) || `${actionLabel} setup is incomplete for this file.`
  const providerLabel = cleanString(provider?.label) || 'provider'
  const providerId = cleanString(provider?.id) || cleanString(capability?.source)

  return {
    id: buildEditorSetupHintId({
      projectFolder,
      capabilityKey,
      providerId,
      reason,
    }),
    capabilityKey: cleanString(capabilityKey),
    actionLabel,
    providerId,
    providerLabel,
    reason,
    message,
    title: `${actionLabel} setup`,
    summary: `${actionLabel} uses ${providerLabel}.`,
  }
}

export function buildEditorSetupHints({
  projectFolder = '',
  capabilities = {},
  dismissedHintIds = {},
} = {}) {
  const dismissed = dismissedHintIds && typeof dismissedHintIds === 'object' ? dismissedHintIds : {}
  const hints = []

  for (const capabilityKey of ['formatting', 'codeActions']) {
    const hint = buildEditorSetupHint({
      projectFolder,
      capabilityKey,
      capability: capabilities?.[capabilityKey] ?? null,
    })
    if (!hint || dismissed[hint.id] === true) continue
    hints.push(hint)
  }

  return hints
}

export function readDismissedEditorSetupHintIds() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {}
    const raw = window.localStorage.getItem(EDITOR_SETUP_HINT_DISMISSALS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

export function writeDismissedEditorSetupHintIds(nextValue = {}) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const normalized = nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)
      ? nextValue
      : {}
    window.localStorage.setItem(EDITOR_SETUP_HINT_DISMISSALS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Ignore persistence failures in sandboxed renderer contexts.
  }
}

export const __testEditorSetupHintInternals = Object.freeze({
  ACTIONABLE_SETUP_REASONS,
  PROVIDER_METADATA,
  inferProviderFromMessage,
  normalizeWorkspaceKey,
})
