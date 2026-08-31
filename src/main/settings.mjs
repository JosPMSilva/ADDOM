import fs from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { DEFAULT_MOA_POLICY, normalizeMoaPolicy } from './moa/moa-policy.mjs'
import { DEFAULT_MOA_BUDGET_POLICY, normalizeMoaBudgetPolicy } from './moa/moa-budget-policy.mjs'
import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
} from '../common/agents/agent-settings.mjs'
import { DEFAULT_CONTINUITY_POLICY, normalizeContinuityPolicy } from './chat/continuity/continuity-policy.mjs'
import { inferMoaUserTier, enforceMoaTierGuardrails, enforceMoaProductionGuardrails, normalizeMoaUserTier } from '../common/moa/moa-tier-policy.mjs'
import {
  COMPLIANCE_MODE_WARN_ONLY,
  normalizeComplianceMode,
  normalizeProviderTermsAcknowledgements,
} from '../common/compliance/compliance-settings.mjs'
import {
  DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS,
  normalizeAttachmentTextExtractionSettings,
} from '../common/attachments/attachment-support-policy.mjs'
import {
  DEFAULT_MODEL_CATALOG_VISIBILITY,
  normalizeModelCatalogVisibility,
  normalizeOpenRouterModelCatalogVisibility,
} from '../common/api-clients/model-catalog-visibility.mjs'
import {
  DEFAULT_PERMISSION_MODE,
  resolvePermissionModeFromLegacySettings,
} from '../common/chat/permission-mode.mjs'
import {
  DEFAULT_RISKY_ACTION_POLICY,
  normalizeRiskyActionPolicy,
} from '../common/chat/risky-action-policy.mjs'
import { canonicalizeRegistryModelSelection } from './api-clients/model-registry.mjs'
import { DEFAULT_COMMAND_SAFETY, normalizeCommandSafety } from './settings-command-safety.mjs'
import { normalizeProviderAuthSettings } from './settings-provider-auth.mjs'
import { getUserDataPath } from './platform/electron-app.mjs'
import {
  DEFAULT_PROVIDER_RUNTIME_SETTINGS,
  normalizeProviderRuntimeSettings,
} from './api-clients/openai-runtime-types.mjs'
import { normalizePipeline } from './moa/pipeline-definitions.mjs'
import {
  DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
  normalizeChatTypographySettings,
} from '../common/chat/chat-typography-settings.mjs'
import {
  DEFAULT_UI_SCALING_SETTINGS,
  normalizeUiScalingSettings,
} from '../common/ui/ui-scaling-settings.mjs'
import {
  DEFAULT_BACKGROUND_TONE_SETTINGS,
  normalizeBackgroundToneSettings,
} from '../common/ui/background-tone-settings.mjs'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '../common/i18n/locale-config.mjs'
import { DEFAULT_APPEARANCE_SETTINGS, normalizeAppearanceSettings } from '../common/ui/appearance-settings.mjs'
import {
  DEFAULT_TERMINAL_SETTINGS,
  normalizeTerminalSettings,
} from '../common/terminal/terminal-settings.mjs'
import { applyUiSurfaceSettingsPatch } from './settings-ui-surface-patch.mjs'
import { getAdvancedConfig } from './advanced-config.mjs'
import {
  collectSettingsLeafPaths,
  collectShadowedSettingsJsonPaths,
  mergeAdvancedOverlaySettings,
} from './settings-effective-overlay.mjs'
import { collectMoaProductionDiagnostics, resolveMoaAdvancedOverlayState } from './moa/moa-production-diagnostics.mjs'

export { DEFAULT_COMMAND_SAFETY, normalizeCommandSafety } from './settings-command-safety.mjs'

const SECURITY_FIELDS = ['permissionMode', 'riskyActionPolicy', 'commandSafety']
const EDITOR_LANGUAGE_SERVICE_ROLLOUT_CHANNELS = new Set(['off', 'shadow', 'pilot'])

export const DEFAULT_EDITOR_LANGUAGE_SERVICE_PLATFORM = Object.freeze({
  enabled: true,
  rolloutChannel: 'pilot',
})

let settingsCache = null
let settingsCacheMtimeMs = null
let settingsCachePath = ''
let settingsWriteQueue = Promise.resolve()
let lastSecuritySnapshot = null
let lastSecurityHash = ''
let pendingSettingsSecurityWarning = null
let lastSettingsSecurityWarningFingerprint = ''
let settingsSecurityWarningSequence = 0
let lastEffectiveSettingsDiagnostics = null

function getSettingsFilePath() {
  return path.join(getUserDataPath(), 'settings.json')
}

function getSettingsSecurityAuditFilePath() {
  return path.join(getUserDataPath(), 'settings-security-audit.json')
}

export const DEFAULT_SETTINGS = Object.freeze({
  uiLocale: DEFAULT_UI_LOCALE,
  permissionMode: DEFAULT_PERMISSION_MODE,
  riskyActionPolicy: DEFAULT_RISKY_ACTION_POLICY,
  providerAuthSettings: {
    openai: {
      authMethod: 'account',
    },
    cursor: {
      authMethod: 'account',
    },
  },
  inlineCompletionEnabled: true,
  commandSafety: { ...DEFAULT_COMMAND_SAFETY },
  chatMode: 'execute',
  memoryCompressionEnabled: true,
  memoryCompressionThreshold: 50,
  memoryCompressionCooldownMs: 120_000,
  memoryCompressionMaxPerHour: 4,
  memoryCompressionMinNewLogs: 12,
  includeGlobalMemoryInContext: false,
  liveExecutionStreamEnabled: true,
  perThreadBackgroundSessions: true,
  moaUserTier: 'basic',
  systemPromptAppendix: '',
  moaRoles: [],
  customPipelines: [],
  customPipelinesEnabled: false,
  moaPolicy: { ...DEFAULT_MOA_POLICY },
  moaBudgetPolicy: { ...DEFAULT_MOA_BUDGET_POLICY },
  agentSettings: DEFAULT_AGENT_SETTINGS,
  continuityPolicy: { ...DEFAULT_CONTINUITY_POLICY },
  complianceMode: COMPLIANCE_MODE_WARN_ONLY,
  providerTermsAcknowledgements: {},
  providerRuntimeSettings: { ...DEFAULT_PROVIDER_RUNTIME_SETTINGS },
  attachmentTextExtraction: { ...DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS },
  editorLanguageServicePlatform: { ...DEFAULT_EDITOR_LANGUAGE_SERVICE_PLATFORM },
  modelCatalogVisibility: cloneJsonSafe(DEFAULT_MODEL_CATALOG_VISIBILITY),
  uiScaling: { ...DEFAULT_UI_SCALING_SETTINGS },
  backgroundTone: { ...DEFAULT_BACKGROUND_TONE_SETTINGS },
  appearance: { ...DEFAULT_APPEARANCE_SETTINGS },
  chatTypography: { ...DEFAULT_CHAT_TYPOGRAPHY_SETTINGS },
  terminal: { ...DEFAULT_TERMINAL_SETTINGS },
})

function clampCompressionThreshold(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.memoryCompressionThreshold
  return Math.min(500, Math.max(5, Math.round(n)))
}

function clampCompressionCooldownMs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.memoryCompressionCooldownMs
  return Math.min(86_400_000, Math.max(10_000, Math.round(n)))
}

function clampCompressionMaxPerHour(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.memoryCompressionMaxPerHour
  return Math.min(50, Math.max(1, Math.round(n)))
}

function clampCompressionMinNewLogs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.memoryCompressionMinNewLogs
  return Math.min(500, Math.max(1, Math.round(n)))
}

function normalizeEditorLanguageServiceRolloutChannel(value, fallback = 'off') {
  const normalizedFallback = EDITOR_LANGUAGE_SERVICE_ROLLOUT_CHANNELS.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : 'off'
  const normalized = String(value || '').trim().toLowerCase()
  return EDITOR_LANGUAGE_SERVICE_ROLLOUT_CHANNELS.has(normalized) ? normalized : normalizedFallback
}

export function normalizeEditorLanguageServicePlatform(raw = {}, fallback = DEFAULT_EDITOR_LANGUAGE_SERVICE_PLATFORM) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_EDITOR_LANGUAGE_SERVICE_PLATFORM
  const enabled = source.enabled == null
    ? base.enabled === true
    : source.enabled === true
  const baseChannel = normalizeEditorLanguageServiceRolloutChannel(base.rolloutChannel, 'off')
  const requestedChannel = normalizeEditorLanguageServiceRolloutChannel(
    source.rolloutChannel,
    enabled && baseChannel === 'off' ? 'shadow' : baseChannel,
  )
  return {
    enabled,
    rolloutChannel: enabled
      ? (requestedChannel === 'off' ? 'shadow' : requestedChannel)
      : 'off',
  }
}

export function normalizeMoaRoles(raw) {
  if (!Array.isArray(raw)) return []
  const roles = raw
    .filter((r) => r && typeof r === 'object')
    .filter((r) => {
      const id = String(r.id ?? '').trim()
      const name = String(r.name ?? '').trim()
      const providerId = String(r.providerId ?? '').trim()
      const model = String(r.model ?? '').trim()
      return id && name && providerId && model
    })
    .map((r) => {
      const normalizedProviderId = String(r.providerId).trim()
      const normalizedModel = String(r.model).trim()
      const primarySelection = canonicalizeRegistryModelSelection(normalizedProviderId, normalizedModel)
      const entry = {
        id: String(r.id).trim(),
        name: String(r.name).trim(),
        providerId: String(primarySelection.providerId || normalizedProviderId).trim(),
        model: String(primarySelection.modelId || normalizedModel).trim(),
        canWriteFiles: !!r.canWriteFiles,
      }
      const sp = String(r.systemPrompt ?? '').trim()
      if (sp) entry.systemPrompt = sp.slice(0, 2000)
      const templateId = String(r.templateId ?? '').trim()
      if (templateId) entry.templateId = templateId.slice(0, 80)
      const templateVersion = Number(r.templateVersion)
      if (Number.isFinite(templateVersion) && templateVersion > 0) {
        entry.templateVersion = Math.round(templateVersion)
      }
      const templateLabel = String(r.templateLabel ?? '').trim()
      if (templateLabel) entry.templateLabel = templateLabel.slice(0, 80)
      return entry
    })
  return roles.slice(0, 20)
}

export function normalizeCustomPipelines(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const row of raw) {
    if (out.length >= 50) break
    const normalized = normalizePipeline({ ...(row && typeof row === 'object' ? row : {}), source: 'custom' })
    const normalizedId = String(normalized?.id || '').trim().toLowerCase()
    if (!normalizedId || seen.has(normalizedId) || normalized.steps.length === 0) continue
    seen.add(normalizedId)
    out.push(normalized)
  }
  return out
}

function normalize(raw = {}, options = {}) {
  const allowAdvancedMoaPolicy = options?.allowAdvancedMoaPolicy === true
  const customPipelinesEnabled = options?.customPipelinesEnabled === true
  const uiLocale = normalizeUiLocale(raw.uiLocale, DEFAULT_UI_LOCALE)
  const permissionMode = resolvePermissionModeFromLegacySettings(raw, DEFAULT_PERMISSION_MODE)
  const chatMode = raw.chatMode === 'plan' || raw.chatMode === 'thinking'
    ? raw.chatMode
    : 'execute'
  const systemPromptAppendix = String(raw.systemPromptAppendix ?? '').trim().slice(0, 12_000)
  const normalizedMoaRoles = normalizeMoaRoles(raw.moaRoles)
  const normalizedMoaBudgetPolicy = normalizeMoaBudgetPolicy(raw.moaBudgetPolicy, DEFAULT_MOA_BUDGET_POLICY)
  const requestedMoaTier = allowAdvancedMoaPolicy ? normalizeMoaUserTier(raw.moaUserTier, '') : ''
  const moaUserTier = requestedMoaTier || (allowAdvancedMoaPolicy ? inferMoaUserTier({
    moaRoles: normalizedMoaRoles, moaBudgetPolicy: normalizedMoaBudgetPolicy,
  }) : 'basic')
  const normalizedMoaPolicy = normalizeMoaPolicy(raw.moaPolicy, DEFAULT_MOA_POLICY)
  const agentSettings = normalizeAgentSettings(raw.agentSettings)
  const guardedMoa = allowAdvancedMoaPolicy
    ? enforceMoaTierGuardrails(moaUserTier, { moaRoles: normalizedMoaRoles, moaPolicy: normalizedMoaPolicy, moaBudgetPolicy: normalizedMoaBudgetPolicy })
    : enforceMoaProductionGuardrails({ moaRoles: normalizedMoaRoles, moaPolicy: normalizedMoaPolicy, moaBudgetPolicy: normalizedMoaBudgetPolicy })
  const complianceMode = normalizeComplianceMode(raw.complianceMode, COMPLIANCE_MODE_WARN_ONLY)
  const providerTermsAcknowledgements = normalizeProviderTermsAcknowledgements(raw.providerTermsAcknowledgements)
  const commandSafety = normalizeCommandSafety(
    raw.commandSafety && typeof raw.commandSafety === 'object' ? raw.commandSafety : {},
    DEFAULT_COMMAND_SAFETY,
  )
  const providerRuntimeSettings = normalizeProviderRuntimeSettings(
    raw.providerRuntimeSettings,
    DEFAULT_PROVIDER_RUNTIME_SETTINGS,
  )
  const providerAuthSettings = normalizeProviderAuthSettings(
    raw.providerAuthSettings,
    DEFAULT_SETTINGS.providerAuthSettings,
  )
  const attachmentTextExtraction = normalizeAttachmentTextExtractionSettings(
    raw.attachmentTextExtraction,
    DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS,
  )
  const editorLanguageServicePlatform = normalizeEditorLanguageServicePlatform(
    raw.editorLanguageServicePlatform,
    DEFAULT_EDITOR_LANGUAGE_SERVICE_PLATFORM,
  )
  const modelCatalogVisibility = normalizeModelCatalogVisibility(raw.modelCatalogVisibility)
  const uiScaling = normalizeUiScalingSettings(
    raw.uiScaling,
    DEFAULT_UI_SCALING_SETTINGS,
  )
  const backgroundTone = normalizeBackgroundToneSettings(
    raw.backgroundTone,
    DEFAULT_BACKGROUND_TONE_SETTINGS,
  )
  const appearance = normalizeAppearanceSettings(raw.appearance, DEFAULT_APPEARANCE_SETTINGS)
  const chatTypography = normalizeChatTypographySettings(
    raw.chatTypography,
    DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
  )
  const terminal = normalizeTerminalSettings(raw.terminal, DEFAULT_TERMINAL_SETTINGS)
  return {
    uiLocale,
    permissionMode,
    riskyActionPolicy: normalizeRiskyActionPolicy(raw.riskyActionPolicy, DEFAULT_RISKY_ACTION_POLICY),
    inlineCompletionEnabled: raw.inlineCompletionEnabled !== false,
    commandSafety,
    chatMode,
    memoryCompressionEnabled: raw.memoryCompressionEnabled !== false,
    memoryCompressionThreshold: clampCompressionThreshold(raw.memoryCompressionThreshold),
    memoryCompressionCooldownMs: clampCompressionCooldownMs(raw.memoryCompressionCooldownMs),
    memoryCompressionMaxPerHour: clampCompressionMaxPerHour(raw.memoryCompressionMaxPerHour),
    memoryCompressionMinNewLogs: clampCompressionMinNewLogs(raw.memoryCompressionMinNewLogs),
    includeGlobalMemoryInContext: !!raw.includeGlobalMemoryInContext,
    liveExecutionStreamEnabled: raw.liveExecutionStreamEnabled !== false,
    perThreadBackgroundSessions: raw.perThreadBackgroundSessions !== false,
    moaUserTier,
    systemPromptAppendix,
    moaRoles: normalizeMoaRoles(guardedMoa.moaRoles),
    customPipelines: customPipelinesEnabled ? normalizeCustomPipelines(raw.customPipelines) : [],
    customPipelinesEnabled,
    moaPolicy: normalizeMoaPolicy(guardedMoa.moaPolicy, DEFAULT_MOA_POLICY),
    moaBudgetPolicy: normalizeMoaBudgetPolicy(guardedMoa.moaBudgetPolicy, DEFAULT_MOA_BUDGET_POLICY),
    agentSettings,
    continuityPolicy: normalizeContinuityPolicy(raw.continuityPolicy, DEFAULT_CONTINUITY_POLICY),
    complianceMode,
    providerTermsAcknowledgements,
    providerAuthSettings,
    providerRuntimeSettings,
    attachmentTextExtraction,
    editorLanguageServicePlatform,
    modelCatalogVisibility,
    uiScaling,
    backgroundTone,
    appearance,
    chatTypography,
    terminal,
  }
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value))
}

function extractSecurityCriticalSettings(settings = {}) {
  return {
    permissionMode: resolvePermissionModeFromLegacySettings(settings, DEFAULT_PERMISSION_MODE),
    riskyActionPolicy: normalizeRiskyActionPolicy(settings.riskyActionPolicy, DEFAULT_RISKY_ACTION_POLICY),
    commandSafety: normalizeCommandSafety(settings.commandSafety, DEFAULT_COMMAND_SAFETY),
  }
}

function hashSecurityCriticalSettings(securityFields = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(securityFields))
    .digest('hex')
}

function detectUnexpectedSecurityChanges(previousSettings = {}, nextSettings = {}) {
  const changed = []
  for (const field of SECURITY_FIELDS) {
    const prevValue = JSON.stringify(previousSettings?.[field] ?? null)
    const nextValue = JSON.stringify(nextSettings?.[field] ?? null)
    if (prevValue !== nextValue) changed.push(field)
  }
  return changed
}

function atomicWriteTextFile(targetPath, payload) {
  const safeTargetPath = String(targetPath || '').trim()
  if (!safeTargetPath) return
  const tempPath = `${safeTargetPath}.${crypto.randomBytes(8).toString('hex')}.tmp`
  fs.mkdirSync(path.dirname(safeTargetPath), { recursive: true })
  fs.writeFileSync(tempPath, String(payload ?? ''), 'utf8')
  try {
    fs.renameSync(tempPath, safeTargetPath)
  } catch {
    fs.writeFileSync(safeTargetPath, String(payload ?? ''), 'utf8')
    try { fs.unlinkSync(tempPath) } catch { /* best-effort temp file cleanup after fallback write */ }
  }
}

function readSettingsSecurityAudit() {
  const settingsSecurityAuditFilePath = getSettingsSecurityAuditFilePath()
  try {
    if (!fs.existsSync(settingsSecurityAuditFilePath)) return null
    const parsed = JSON.parse(fs.readFileSync(settingsSecurityAuditFilePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const securityFields = parsed.securityFields && typeof parsed.securityFields === 'object'
      ? extractSecurityCriticalSettings(parsed.securityFields)
      : null
    if (!securityFields) return null
    const storedSecurityHash = String(parsed.securityHash || '').trim().toLowerCase()
    const normalizedSecurityHash = hashSecurityCriticalSettings(securityFields)
    return {
      securityHash: normalizedSecurityHash,
      storedSecurityHash,
      securityFields,
      requiresRewrite: storedSecurityHash !== normalizedSecurityHash,
    }
  } catch {
    return null
  }
}

function writeSettingsSecurityAudit(securityFields, securityHash) {
  const settingsSecurityAuditFilePath = getSettingsSecurityAuditFilePath()
  const payload = JSON.stringify({
    schemaVersion: 1,
    updatedAt: Date.now(),
    securityHash,
    securityFields,
  }, null, 2)
  atomicWriteTextFile(settingsSecurityAuditFilePath, payload)
}

function queueSettingsSecurityWarning({
  reason = 'unexpected_security_change',
  changedFields = [],
  previousSecurity = null,
  currentSecurity = null,
  auditHash = '',
  currentHash = '',
} = {}) {
  const settingsFilePath = getSettingsFilePath()
  const settingsSecurityAuditFilePath = getSettingsSecurityAuditFilePath()
  const normalizedChangedFields = Array.from(new Set(
    (Array.isArray(changedFields) ? changedFields : [])
      .map((field) => String(field || '').trim())
      .filter(Boolean),
  ))
  const fingerprint = JSON.stringify({
    reason: String(reason || '').trim(),
    changedFields: normalizedChangedFields,
    auditHash: String(auditHash || '').trim().toLowerCase(),
    currentHash: String(currentHash || '').trim().toLowerCase(),
  })
  if (fingerprint === lastSettingsSecurityWarningFingerprint) return

  pendingSettingsSecurityWarning = {
    id: `settings_security_warning_${Date.now()}_${(++settingsSecurityWarningSequence).toString(36)}`,
    detectedAt: Date.now(),
    reason: String(reason || 'unexpected_security_change').trim() || 'unexpected_security_change',
    changedFields: normalizedChangedFields,
    settingsPath: settingsFilePath,
    auditPath: settingsSecurityAuditFilePath,
    auditHash: String(auditHash || '').trim().toLowerCase(),
    currentHash: String(currentHash || '').trim().toLowerCase(),
    previousSecurity: previousSecurity ? cloneJsonSafe(previousSecurity) : null,
    currentSecurity: currentSecurity ? cloneJsonSafe(currentSecurity) : null,
  }
  lastSettingsSecurityWarningFingerprint = fingerprint
}

function observeSettingsSecurity(settings) {
  const currentSecurity = extractSecurityCriticalSettings(settings)
  const currentHash = hashSecurityCriticalSettings(currentSecurity)
  const audit = readSettingsSecurityAudit()
  const auditHash = String(audit?.securityHash || '').trim().toLowerCase()
  const auditNeedsRewrite = audit?.requiresRewrite === true
  const auditSecurity = audit?.securityFields && typeof audit.securityFields === 'object'
    ? audit.securityFields
    : null
  const baselineSecurity = lastSecuritySnapshot || auditSecurity
  const baselineHash = lastSecurityHash || auditHash
  const changedFields = baselineSecurity
    ? detectUnexpectedSecurityChanges(baselineSecurity, currentSecurity)
    : []
  const hashMismatch = !!auditHash && auditHash !== currentHash

  if ((baselineHash && baselineHash !== currentHash) || hashMismatch || changedFields.length > 0) {
    queueSettingsSecurityWarning({
      reason: hashMismatch ? 'settings_integrity_mismatch' : 'unexpected_security_change',
      changedFields,
      previousSecurity: baselineSecurity,
      currentSecurity,
      auditHash,
      currentHash,
    })
  }

  lastSecuritySnapshot = currentSecurity
  lastSecurityHash = currentHash

  if (!auditHash) {
    try {
      writeSettingsSecurityAudit(currentSecurity, currentHash)
    } catch (error) {
      console.warn('[settings] failed to initialize settings security audit:', error?.message || error)
    }
  } else if (auditNeedsRewrite && !hashMismatch && changedFields.length === 0) {
    try {
      writeSettingsSecurityAudit(currentSecurity, currentHash)
    } catch (error) {
      console.warn('[settings] failed to refresh legacy settings security audit:', error?.message || error)
    }
  }
}

function readSettingsFile() {
  const settingsFilePath = getSettingsFilePath()
  try {
    if (!fs.existsSync(settingsFilePath)) {
      settingsCache = {}
      settingsCacheMtimeMs = null
      settingsCachePath = settingsFilePath
      return {}
    }
    const stat = fs.statSync(settingsFilePath)
    const mtimeMs = Number(stat?.mtimeMs || 0) || 0
    if (
      settingsCache
      && typeof settingsCache === 'object'
      && settingsCachePath === settingsFilePath
      && settingsCacheMtimeMs === mtimeMs
    ) {
      return { ...settingsCache }
    }
    const parsed = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'))
    const safeParsed = parsed && typeof parsed === 'object' ? parsed : {}
    settingsCache = { ...safeParsed }
    settingsCacheMtimeMs = mtimeMs
    settingsCachePath = settingsFilePath
    return { ...safeParsed }
  } catch {
    settingsCache = {}
    settingsCacheMtimeMs = null
    settingsCachePath = settingsFilePath
    return {}
  }
}

function writeSettingsFile(settings) {
  const safeSettings = settings && typeof settings === 'object' ? settings : {}
  const payload = JSON.stringify(safeSettings, null, 2)
  const securityFields = extractSecurityCriticalSettings(safeSettings)
  const securityHash = hashSecurityCriticalSettings(securityFields)
  const settingsFilePath = getSettingsFilePath()

  atomicWriteTextFile(settingsFilePath, payload)
  try {
    writeSettingsSecurityAudit(securityFields, securityHash)
  } catch (error) {
    console.warn('[settings] failed to persist settings security audit:', error?.message || error)
  }

  settingsCache = { ...safeSettings }
  settingsCachePath = settingsFilePath
  try {
    const stat = fs.statSync(settingsFilePath)
    settingsCacheMtimeMs = Number(stat?.mtimeMs || 0) || 0
  } catch {
    settingsCacheMtimeMs = null
  }
  lastSecuritySnapshot = securityFields
  lastSecurityHash = securityHash
  lastSettingsSecurityWarningFingerprint = ''
}

function areSettingsSnapshotsEqual(left = {}, right = {}) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

export function getPersistedSettings() {
  const rawSettings = readSettingsFile()
  const normalized = normalize(rawSettings)
  const next = { ...DEFAULT_SETTINGS, ...normalized }
  observeSettingsSecurity(next)
  return next
}

export function applyAdvancedOverlay(settings = {}, overlay = {}) {
  const base = settings && typeof settings === 'object' ? settings : {}
  const advancedOverlay = overlay && typeof overlay === 'object' ? overlay : {}
  if (Object.keys(advancedOverlay).length === 0) return normalize(base)
  const moaAdvanced = resolveMoaAdvancedOverlayState(advancedOverlay)
  return normalize(mergeAdvancedOverlaySettings(base, advancedOverlay), {
    allowAdvancedMoaPolicy: moaAdvanced.moaPolicyAdvanced,
    customPipelinesEnabled: moaAdvanced.customPipelinesEnabled,
  })
}

export function getEffectiveSettingsDiagnostics() {
  return lastEffectiveSettingsDiagnostics ? cloneJsonSafe(lastEffectiveSettingsDiagnostics) : {
    schemaVersion: 1,
    advancedOverlayApplied: false,
    advancedOverlayKeys: [],
    shadowedSettingsJsonPaths: [],
    moaProductionDiagnostics: collectMoaProductionDiagnostics(),
  }
}

export function getSettings() {
  const rawSettings = readSettingsFile()
  const persisted = getPersistedSettings()
  const advancedConfig = getAdvancedConfig()
  const overlay = advancedConfig?.overlay && typeof advancedConfig.overlay === 'object'
    ? advancedConfig.overlay
    : {}
  const moaAdvanced = resolveMoaAdvancedOverlayState(overlay)
  const effectiveBase = moaAdvanced.moaPolicyAdvanced || moaAdvanced.customPipelinesEnabled
    ? normalize(rawSettings, {
        allowAdvancedMoaPolicy: moaAdvanced.moaPolicyAdvanced,
        customPipelinesEnabled: moaAdvanced.customPipelinesEnabled,
      })
    : persisted
  const effective = applyAdvancedOverlay(effectiveBase, overlay)
  const overlayKeys = collectSettingsLeafPaths(overlay)
  lastEffectiveSettingsDiagnostics = {
    schemaVersion: 1,
    advancedOverlayApplied: overlayKeys.length > 0,
    advancedOverlayKeys: overlayKeys,
    shadowedSettingsJsonPaths: collectShadowedSettingsJsonPaths(rawSettings, overlay),
    advancedConfigStatus: String(advancedConfig?.diagnostics?.status || '').trim(),
    advancedConfigOk: advancedConfig?.diagnostics?.ok === true,
    advancedConfigSourcePath: String(advancedConfig?.diagnostics?.sourcePath || '').trim(),
    moaProductionDiagnostics: collectMoaProductionDiagnostics(rawSettings, overlay),
  }
  return effective
}

function applySettingsPatch(patch = {}) {
  const current = getPersistedSettings()
  const mergedPatch = { ...patch }
  if (patch?.commandSafety && typeof patch.commandSafety === 'object') {
    mergedPatch.commandSafety = {
      ...(current.commandSafety && typeof current.commandSafety === 'object'
        ? current.commandSafety
        : DEFAULT_COMMAND_SAFETY),
      ...patch.commandSafety,
    }
  }
  if (patch?.attachmentTextExtraction && typeof patch.attachmentTextExtraction === 'object') {
    mergedPatch.attachmentTextExtraction = {
      ...(current.attachmentTextExtraction && typeof current.attachmentTextExtraction === 'object'
        ? current.attachmentTextExtraction
        : DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS),
      ...patch.attachmentTextExtraction,
    }
  }
  if (patch?.providerAuthSettings && typeof patch.providerAuthSettings === 'object') {
    mergedPatch.providerAuthSettings = {
      ...(current.providerAuthSettings && typeof current.providerAuthSettings === 'object'
        ? current.providerAuthSettings
        : DEFAULT_SETTINGS.providerAuthSettings),
      ...patch.providerAuthSettings,
      openai: {
        ...(
          current.providerAuthSettings?.openai
          && typeof current.providerAuthSettings.openai === 'object'
            ? current.providerAuthSettings.openai
            : DEFAULT_SETTINGS.providerAuthSettings.openai
        ),
        ...(
          patch.providerAuthSettings?.openai
          && typeof patch.providerAuthSettings.openai === 'object'
            ? patch.providerAuthSettings.openai
            : {}
        ),
      },
      cursor: {
        ...(
          current.providerAuthSettings?.cursor
          && typeof current.providerAuthSettings.cursor === 'object'
            ? current.providerAuthSettings.cursor
            : DEFAULT_SETTINGS.providerAuthSettings.cursor
        ),
        ...(
          patch.providerAuthSettings?.cursor
          && typeof patch.providerAuthSettings.cursor === 'object'
            ? patch.providerAuthSettings.cursor
            : {}
        ),
      },
    }
  }
  if (patch?.providerRuntimeSettings && typeof patch.providerRuntimeSettings === 'object') {
    mergedPatch.providerRuntimeSettings = {
      ...(current.providerRuntimeSettings && typeof current.providerRuntimeSettings === 'object'
        ? current.providerRuntimeSettings
        : DEFAULT_PROVIDER_RUNTIME_SETTINGS),
      ...patch.providerRuntimeSettings,
      anthropic: {
        ...(
          current.providerRuntimeSettings?.anthropic
          && typeof current.providerRuntimeSettings.anthropic === 'object'
            ? current.providerRuntimeSettings.anthropic
            : DEFAULT_PROVIDER_RUNTIME_SETTINGS.anthropic
        ),
        ...(
          patch.providerRuntimeSettings?.anthropic
          && typeof patch.providerRuntimeSettings.anthropic === 'object'
            ? patch.providerRuntimeSettings.anthropic
            : {}
        ),
      },
      moonshot: {
        ...(
          current.providerRuntimeSettings?.moonshot
          && typeof current.providerRuntimeSettings.moonshot === 'object'
            ? current.providerRuntimeSettings.moonshot
            : DEFAULT_PROVIDER_RUNTIME_SETTINGS.moonshot
        ),
        ...(
          patch.providerRuntimeSettings?.moonshot
          && typeof patch.providerRuntimeSettings.moonshot === 'object'
            ? patch.providerRuntimeSettings.moonshot
            : {}
        ),
      },
      openai: {
        ...(
          current.providerRuntimeSettings?.openai
          && typeof current.providerRuntimeSettings.openai === 'object'
            ? current.providerRuntimeSettings.openai
            : DEFAULT_PROVIDER_RUNTIME_SETTINGS.openai
        ),
        ...(
          patch.providerRuntimeSettings?.openai
          && typeof patch.providerRuntimeSettings.openai === 'object'
            ? patch.providerRuntimeSettings.openai
            : {}
        ),
      },
    }
  }
  if (patch?.editorLanguageServicePlatform && typeof patch.editorLanguageServicePlatform === 'object') {
    mergedPatch.editorLanguageServicePlatform = {
      ...(current.editorLanguageServicePlatform && typeof current.editorLanguageServicePlatform === 'object'
        ? current.editorLanguageServicePlatform
        : DEFAULT_EDITOR_LANGUAGE_SERVICE_PLATFORM),
      ...patch.editorLanguageServicePlatform,
    }
  }
  if (patch?.modelCatalogVisibility && typeof patch.modelCatalogVisibility === 'object') {
    const currentVisibility = normalizeModelCatalogVisibility(current.modelCatalogVisibility)
    const rawVisibilityPatch = patch.modelCatalogVisibility
    mergedPatch.modelCatalogVisibility = {
      ...currentVisibility,
      ...(Object.prototype.hasOwnProperty.call(rawVisibilityPatch, 'openrouter')
        ? { openrouter: normalizeOpenRouterModelCatalogVisibility(rawVisibilityPatch.openrouter) }
        : {}),
    }
  }
  if (patch?.agentSettings && typeof patch.agentSettings === 'object') {
    mergedPatch.agentSettings = {
      ...(current.agentSettings && typeof current.agentSettings === 'object'
        ? current.agentSettings
        : DEFAULT_AGENT_SETTINGS),
      ...patch.agentSettings,
      limits: {
        ...(current.agentSettings?.limits || DEFAULT_AGENT_SETTINGS.limits),
        ...(patch.agentSettings?.limits && typeof patch.agentSettings.limits === 'object'
          ? patch.agentSettings.limits
          : {}),
      },
      providerConcurrencyCaps: Object.prototype.hasOwnProperty.call(
        patch.agentSettings,
        'providerConcurrencyCaps',
      )
        ? patch.agentSettings.providerConcurrencyCaps
        : current.agentSettings?.providerConcurrencyCaps,
    }
  }
  applyUiSurfaceSettingsPatch(mergedPatch, patch, current)
  const advancedConfig = getAdvancedConfig()
  const { customPipelinesEnabled } = resolveMoaAdvancedOverlayState(advancedConfig?.overlay)
  const next = normalize({ ...current, ...mergedPatch }, { customPipelinesEnabled })
  const forceCustomPipelineWrite = customPipelinesEnabled && Object.prototype.hasOwnProperty.call(mergedPatch, 'customPipelines')
  if (!forceCustomPipelineWrite && areSettingsSnapshotsEqual(current, next)) {
    return getSettings()
  }
  writeSettingsFile(next)
  return getSettings()
}

export function setSettingsPatch(patch = {}) {
  const safePatch = patch && typeof patch === 'object' ? patch : {}
  const run = () => applySettingsPatch(safePatch)
  const queued = settingsWriteQueue.then(run, run)
  settingsWriteQueue = queued.catch(() => {})
  return queued
}

export function consumePendingSettingsSecurityWarning() {
  const warning = pendingSettingsSecurityWarning
  pendingSettingsSecurityWarning = null
  return warning ? cloneJsonSafe(warning) : null
}
