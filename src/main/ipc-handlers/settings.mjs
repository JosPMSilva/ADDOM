import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { ipcMain, BrowserWindow } from '../electron-api.mjs'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import { normalizeRiskyActionPolicy } from '../../common/chat/risky-action-policy.mjs'
import {
  consumePendingSettingsSecurityWarning,
  getEffectiveSettingsDiagnostics,
  getSettings,
  setSettingsPatch,
  normalizeMoaRoles,
  normalizeCommandSafety,
} from '../settings.mjs'
import {
  normalizeComplianceMode,
  normalizeProviderTermsAcknowledgements,
} from '../../common/compliance/compliance-settings.mjs'
import { detectInstallSandboxBackend } from '../tools/command-tools-sandbox.mjs'
import {
  getGlobalRunCommandPolicyTelemetrySnapshot,
  clearGlobalRunCommandPolicyTelemetry,
  recordGlobalRunCommandPolicyTelemetryEvent,
} from '../chat/run-command-policy-telemetry.mjs'
import {
  getGlobalInlineCompletionTelemetrySnapshot,
  clearGlobalInlineCompletionTelemetry,
} from '../editor/inline-completion-telemetry.mjs'
import { sendVersioned } from '../ipc/ipc-versioning.mjs'
import { normalizeChatTypographySettings } from '../../common/chat/chat-typography-settings.mjs'
import { normalizeModelCatalogVisibility } from '../../common/api-clients/model-catalog-visibility.mjs'
import { normalizeUiScalingSettings } from '../../common/ui/ui-scaling-settings.mjs'
import { normalizeBackgroundToneSettings } from '../../common/ui/background-tone-settings.mjs'
import { normalizeAppearanceSettings } from '../../common/ui/appearance-settings.mjs'
import { normalizeUiLocale } from '../../common/i18n/locale-config.mjs'
import { normalizeAgentSettings } from '../../common/agents/agent-settings.mjs'
import { applyNativeAppearanceSettings } from '../native-appearance.mjs'

const NORMAL_SETTINGS_TOP_LEVEL_KEYS = new Set([
  'agentSettings',
  'attachmentTextExtraction',
  'backgroundTone',
  'appearance',
  'chatMode',
  'chatTypography',
  'complianceMode',
  'includeGlobalMemoryInContext',
  'inlineCompletionEnabled',
  'liveExecutionStreamEnabled',
  'memoryCompressionEnabled',
  'modelCatalogVisibility',
  'permissionMode',
  'providerTermsAcknowledgements',
  'riskyActionPolicy',
  'systemPromptAppendix',
  'terminal',
  'uiLocale',
  'uiScaling',
])

const TERMINAL_NORMAL_KEYS = new Set([
  'copyOnSelection',
  'defaultCwdBehavior',
  'defaultShell',
  'fontFamily',
  'fontSize',
])

function emitPendingSettingsSecurityWarning(sender) {
  const warning = consumePendingSettingsSecurityWarning()
  if (!warning || !sender || sender.isDestroyed?.()) return
  sendVersioned(sender, 'settings:security-warning', warning)
}

export function broadcastSettingsUpdate(payload = {}, windows) {
  const targets = Array.isArray(windows)
    ? windows
    : (typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [])
  for (const win of targets) {
    if (!win?.webContents || win.webContents.isDestroyed()) continue
    sendVersioned(win.webContents, 'settings:updated', payload)
  }
}

function normalizeProviderAuthMethod(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'account') return 'account'
  if (normalized === 'api_key') return 'api_key'
  throw new Error('Unsupported OpenAI auth method.')
}

function rejectAdvancedSettingsPatch(rejectedKeys = []) {
  const normalized = Array.from(new Set(
    rejectedKeys
      .map((key) => String(key || '').trim())
      .filter(Boolean),
  )).sort()
  const message = normalized.length > 0
    ? `settings:set cannot mutate advanced or dedicated settings: ${normalized.join(', ')}`
    : 'settings:set cannot mutate advanced or dedicated settings.'
  const error = new Error(message)
  error.code = 'settings_set_rejected_keys'
  error.rejectedKeys = normalized
  throw error
}

function collectRejectedTerminalKeys(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['terminal']
  return Object.keys(input)
    .filter((key) => !TERMINAL_NORMAL_KEYS.has(key))
    .map((key) => `terminal.${key}`)
}

function collectRejectedAttachmentTextExtractionKeys(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['attachmentTextExtraction']
  return Object.keys(input)
    .filter((key) => key !== 'enabled')
    .map((key) => `attachmentTextExtraction.${key}`)
}

export function sanitizeNormalSettingsPatch(input) {
  const patch = {}
  const rejectedKeys = []
  if (!input || typeof input !== 'object') return { patch, rejectedKeys }

  for (const key of Object.keys(input)) {
    if (!NORMAL_SETTINGS_TOP_LEVEL_KEYS.has(key)) rejectedKeys.push(key)
  }

  if ('terminal' in input) {
    rejectedKeys.push(...collectRejectedTerminalKeys(input.terminal))
  }
  if ('attachmentTextExtraction' in input) {
    rejectedKeys.push(...collectRejectedAttachmentTextExtractionKeys(input.attachmentTextExtraction))
  }

  if ('permissionMode' in input) {
    patch.permissionMode = normalizePermissionMode(input.permissionMode)
  }
  if ('uiLocale' in input) {
    patch.uiLocale = normalizeUiLocale(input.uiLocale)
  }
  if ('riskyActionPolicy' in input) {
    patch.riskyActionPolicy = normalizeRiskyActionPolicy(input.riskyActionPolicy)
  }
  if ('inlineCompletionEnabled' in input) {
    patch.inlineCompletionEnabled = !!input.inlineCompletionEnabled
  }
  if ('chatMode' in input) {
    patch.chatMode = input.chatMode === 'plan' || input.chatMode === 'thinking'
      ? input.chatMode
      : 'execute'
  }
  if ('systemPromptAppendix' in input) {
    patch.systemPromptAppendix = String(input.systemPromptAppendix ?? '')
  }
  if ('memoryCompressionEnabled' in input) {
    patch.memoryCompressionEnabled = !!input.memoryCompressionEnabled
  }
  if ('includeGlobalMemoryInContext' in input) {
    patch.includeGlobalMemoryInContext = !!input.includeGlobalMemoryInContext
  }
  if ('liveExecutionStreamEnabled' in input) {
    patch.liveExecutionStreamEnabled = !!input.liveExecutionStreamEnabled
  }
  if ('perThreadBackgroundSessions' in input) {
    patch.perThreadBackgroundSessions = !!input.perThreadBackgroundSessions
  }
  if ('complianceMode' in input) {
    patch.complianceMode = normalizeComplianceMode(input.complianceMode, '')
  }
  if ('providerTermsAcknowledgements' in input) {
    patch.providerTermsAcknowledgements = normalizeProviderTermsAcknowledgements(input.providerTermsAcknowledgements)
  }
  if ('attachmentTextExtraction' in input) {
    patch.attachmentTextExtraction = {
      enabled: input.attachmentTextExtraction?.enabled === true,
    }
  }
  if ('modelCatalogVisibility' in input && input.modelCatalogVisibility && typeof input.modelCatalogVisibility === 'object') {
    patch.modelCatalogVisibility = normalizeModelCatalogVisibility(input.modelCatalogVisibility)
  }
  if ('chatTypography' in input && input.chatTypography && typeof input.chatTypography === 'object') {
    patch.chatTypography = normalizeChatTypographySettings(input.chatTypography)
  }
  if ('uiScaling' in input && input.uiScaling && typeof input.uiScaling === 'object') {
    patch.uiScaling = normalizeUiScalingSettings(input.uiScaling)
  }
  if ('backgroundTone' in input && input.backgroundTone != null) {
    patch.backgroundTone = normalizeBackgroundToneSettings(input.backgroundTone)
  }
  if ('appearance' in input && input.appearance != null) {
    patch.appearance = normalizeAppearanceSettings(input.appearance)
  }
  if ('agentSettings' in input) {
    patch.agentSettings = normalizeAgentSettings(input.agentSettings)
  }
  if ('terminal' in input && input.terminal && typeof input.terminal === 'object') {
    const terminalPatch = {}
    for (const key of TERMINAL_NORMAL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input.terminal, key)) {
        terminalPatch[key] = input.terminal[key]
      }
    }
    patch.terminal = terminalPatch
  }

  return { patch, rejectedKeys }
}

export function registerSettingsHandlers() {
  handleVersioned(ipcMain, 'settings:get', (event) => {
    const settings = getSettings()
    emitPendingSettingsSecurityWarning(event?.sender)
    return settings
  })

  handleVersioned(ipcMain, 'settings:set', async (event, { patch } = {}) => {
    const { patch: safePatch, rejectedKeys } = sanitizeNormalSettingsPatch(patch)
    if (rejectedKeys.length > 0) rejectAdvancedSettingsPatch(rejectedKeys)
    const next = await setSettingsPatch(safePatch)
    if (Object.prototype.hasOwnProperty.call(safePatch, 'appearance')) {
      applyNativeAppearanceSettings(next.appearance)
    }
    emitPendingSettingsSecurityWarning(event?.sender)
    broadcastSettingsUpdate({
      changedKeys: Object.keys(safePatch),
      settings: next,
    })
    return next
  })

  handleVersioned(ipcMain, 'provider-auth:set-method', async (event, payload = {}) => {
    const source = payload && typeof payload === 'object' ? payload : {}
    const providerId = String(source.providerId || '').trim().toLowerCase()
    if (!['openai', 'cursor'].includes(providerId)) {
      throw new Error('Unsupported provider auth settings target.')
    }
    const authMethod = normalizeProviderAuthMethod(source.authMethod)
    const next = await setSettingsPatch({
      providerAuthSettings: {
        [providerId]: { authMethod },
      },
    })
    emitPendingSettingsSecurityWarning(event?.sender)
    broadcastSettingsUpdate({
      changedKeys: ['providerAuthSettings'],
      settings: next,
    })
    return next.providerAuthSettings[providerId]
  })

  handleVersioned(ipcMain, 'provider-runtime-settings:set', async (event, payload = {}) => {
    const source = payload && typeof payload === 'object' ? payload : {}
    const providerId = String(source.providerId || '').trim().toLowerCase()
    if (!['anthropic', 'moonshot', 'openai'].includes(providerId)) {
      throw new Error('Unsupported provider runtime settings target.')
    }
    if (!source.runtimeSettings || typeof source.runtimeSettings !== 'object' || Array.isArray(source.runtimeSettings)) {
      throw new Error('Provider runtime settings must be an object.')
    }
    const next = await setSettingsPatch({
      providerRuntimeSettings: {
        [providerId]: source.runtimeSettings,
      },
    })
    emitPendingSettingsSecurityWarning(event?.sender)
    broadcastSettingsUpdate({
      changedKeys: ['providerRuntimeSettings'],
      settings: next,
    })
    return next.providerRuntimeSettings[providerId]
  })

  handleVersioned(ipcMain, 'moa-roles:set', async (event, payload = {}) => {
    const source = payload && typeof payload === 'object' ? payload : {}
    const moaRoles = normalizeMoaRoles(source.moaRoles)
    const next = await setSettingsPatch({ moaRoles })
    emitPendingSettingsSecurityWarning(event?.sender)
    broadcastSettingsUpdate({
      changedKeys: ['moaRoles'],
      settings: next,
    })
    return { ok: true, moaRoles: next.moaRoles }
  })

  handleVersioned(ipcMain, 'settings:get-effective-source-diagnostics', () => getEffectiveSettingsDiagnostics())

  handleVersioned(ipcMain, 'settings:detect-install-sandbox-backend', async (_event, { commandSafety } = {}) => {
    const current = getSettings()
    const effectiveCommandSafety = normalizeCommandSafety(
      commandSafety && typeof commandSafety === 'object'
        ? {
            ...(current.commandSafety && typeof current.commandSafety === 'object' ? current.commandSafety : {}),
            ...commandSafety,
          }
        : current.commandSafety,
    )
    const status = await detectInstallSandboxBackend(effectiveCommandSafety)
    recordGlobalRunCommandPolicyTelemetryEvent('sandbox_backend_probe', {
      backend: String(status?.backend || 'none'),
      available: status?.available === true,
      preferredBackend: String(effectiveCommandSafety?.preferredBackend || 'auto'),
      source: 'settings_ipc',
      strictEgressRequested: String(effectiveCommandSafety?.sandboxNetworkEnforcementMode || 'best_effort') === 'strict',
    })
    return status
  })

  handleVersioned(ipcMain, 'settings:get-command-safety-telemetry', () => getGlobalRunCommandPolicyTelemetrySnapshot())
  handleVersioned(ipcMain, 'settings:clear-command-safety-telemetry', () => clearGlobalRunCommandPolicyTelemetry())
  handleVersioned(ipcMain, 'settings:get-inline-completion-telemetry', () => getGlobalInlineCompletionTelemetrySnapshot())
  handleVersioned(ipcMain, 'settings:clear-inline-completion-telemetry', () => clearGlobalInlineCompletionTelemetry())
}
