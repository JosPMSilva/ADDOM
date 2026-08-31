import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { getUserDataPath } from './platform/electron-app.mjs'

const SECURITY_PATHS = Object.freeze([
  'commandSafety.installSandboxEnabled',
  'commandSafety.installSandboxIgnoreScriptsFirstPass',
  'commandSafety.preferredBackend',
  'commandSafety.sandboxNetworkEnforcementMode',
  'commandSafety.registryAllowlist',
  'commandSafety.cacheDirs',
  'continuityPolicy.providerChainCompactionEnabled',
  'continuityPolicy.providerTruncationEnabled',
  'continuityPolicy.providerCompactionAllowlist',
  'providerRuntimeSettings.anthropic.useContextManagementCompaction',
  'providerRuntimeSettings.anthropic.contextManagementCompactionThresholdTokens',
  'providerRuntimeSettings.moonshot.remoteToolsEnabled',
  'providerRuntimeSettings.moonshot.enabledFormulaUris',
  'providerRuntimeSettings.openai.enabledHostedTools',
  'providerRuntimeSettings.openai.hostedToolsEnabled',
  'providerRuntimeSettings.openai.useServerSideCompaction',
  'providerRuntimeSettings.openai.useResponseCompaction',
  'providerRuntimeSettings.openai.providerTruncationSoftTriggerPercent',
  'providerRuntimeSettings.openai.codexAutoThreadCompactionEnabled',
  'providerRuntimeSettings.openai.allowPromptCompactionCommands',
  'providerRuntimeSettings.openai.allowPromptCompactionThresholdOverride',
  'providerRuntimeSettings.openai.webSearchApproximateLocationEnabled',
  'agentSettings.enabled',
  'agentSettings.defaultProfile',
  'agentSettings.fanoutConfirmationThreshold',
  'agentSettings.limits.maxLiveAgents',
  'agentSettings.limits.maxDepth',
  'agentSettings.limits.maxDescendants',
  'agentSettings.limits.maxTotalTokens',
  'agentSettings.limits.maxCostUsd',
  'agentSettings.limits.maxDurationMs',
])

let lastAdvancedSecuritySnapshot = null
let lastAdvancedSecurityHash = ''
let pendingAdvancedConfigSecurityWarning = null
let lastAdvancedSecurityWarningFingerprint = ''
let advancedSecurityWarningSequence = 0

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value))
}

function getDottedValue(source, dottedPath) {
  return String(dottedPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current == null ? undefined : current[key]), source)
}

function setDottedValue(target, dottedPath, value) {
  const segments = String(dottedPath || '').split('.').filter(Boolean)
  let current = target
  for (let index = 0; index < segments.length; index += 1) {
    const key = segments[index]
    if (index === segments.length - 1) {
      current[key] = value
    } else {
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {}
      current = current[key]
    }
  }
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
    try { fs.unlinkSync(tempPath) } catch { /* best-effort cleanup */ }
  }
}

function getAdvancedConfigSecurityAuditFilePath() {
  return path.join(getUserDataPath(), 'advanced-config-security-audit.json')
}

export function extractAdvancedConfigSecurityFields(overlay = {}) {
  const out = {}
  for (const dottedPath of SECURITY_PATHS) {
    const value = getDottedValue(overlay, dottedPath)
    if (value !== undefined) setDottedValue(out, dottedPath, value)
  }
  return out
}

export function hashAdvancedConfigSecurityFields(securityFields = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(securityFields))
    .digest('hex')
}

function readAdvancedConfigSecurityAudit() {
  const auditPath = getAdvancedConfigSecurityAuditFilePath()
  try {
    if (!fs.existsSync(auditPath)) return null
    const parsed = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const securityFields = parsed.securityFields && typeof parsed.securityFields === 'object'
      ? parsed.securityFields
      : {}
    const securityHash = hashAdvancedConfigSecurityFields(securityFields)
    const storedSecurityHash = String(parsed.securityHash || '').trim().toLowerCase()
    return {
      auditPath,
      securityFields,
      securityHash,
      storedSecurityHash,
      requiresRewrite: securityHash !== storedSecurityHash,
    }
  } catch {
    return null
  }
}

function writeAdvancedConfigSecurityAudit(securityFields, securityHash) {
  const auditPath = getAdvancedConfigSecurityAuditFilePath()
  atomicWriteTextFile(auditPath, JSON.stringify({
    schemaVersion: 1,
    updatedAt: Date.now(),
    source: 'advanced.toml',
    securityHash,
    securityFields,
  }, null, 2))
}

function detectChangedTopLevelFields(previousSecurity = {}, currentSecurity = {}) {
  const keys = new Set([
    ...Object.keys(previousSecurity || {}),
    ...Object.keys(currentSecurity || {}),
  ])
  const changed = []
  for (const key of keys) {
    if (JSON.stringify(previousSecurity?.[key] ?? null) !== JSON.stringify(currentSecurity?.[key] ?? null)) {
      changed.push(key)
    }
  }
  return changed
}

function queueAdvancedConfigSecurityWarning({
  reason = 'unexpected_advanced_config_security_change',
  changedFields = [],
  previousSecurity = null,
  currentSecurity = null,
  auditHash = '',
  currentHash = '',
} = {}) {
  const fingerprint = JSON.stringify({
    reason,
    changedFields,
    auditHash,
    currentHash,
  })
  if (fingerprint === lastAdvancedSecurityWarningFingerprint) return
  pendingAdvancedConfigSecurityWarning = {
    id: `advanced_config_security_warning_${Date.now()}_${(++advancedSecurityWarningSequence).toString(36)}`,
    detectedAt: Date.now(),
    reason,
    changedFields,
    sourcePath: path.join(getUserDataPath(), 'advanced.toml'),
    auditPath: getAdvancedConfigSecurityAuditFilePath(),
    auditHash,
    currentHash,
    previousSecurity: previousSecurity ? cloneJsonSafe(previousSecurity) : null,
    currentSecurity: currentSecurity ? cloneJsonSafe(currentSecurity) : null,
  }
  lastAdvancedSecurityWarningFingerprint = fingerprint
}

export function observeAdvancedConfigSecurity(overlay = {}, { valid = true } = {}) {
  if (!valid) return null

  const currentSecurity = extractAdvancedConfigSecurityFields(overlay)
  const currentHash = hashAdvancedConfigSecurityFields(currentSecurity)
  const audit = readAdvancedConfigSecurityAudit()
  const auditHash = String(audit?.securityHash || '').trim().toLowerCase()
  const auditSecurity = audit?.securityFields && typeof audit.securityFields === 'object'
    ? audit.securityFields
    : null
  const baselineSecurity = lastAdvancedSecuritySnapshot || auditSecurity
  const baselineHash = lastAdvancedSecurityHash || auditHash
  const changedFields = baselineSecurity
    ? detectChangedTopLevelFields(baselineSecurity, currentSecurity)
    : []

  if ((baselineHash && baselineHash !== currentHash) || changedFields.length > 0) {
    queueAdvancedConfigSecurityWarning({
      reason: 'unexpected_advanced_config_security_change',
      changedFields,
      previousSecurity: baselineSecurity,
      currentSecurity,
      auditHash,
      currentHash,
    })
  }

  lastAdvancedSecuritySnapshot = currentSecurity
  lastAdvancedSecurityHash = currentHash

  if (!auditHash || audit?.requiresRewrite === true) {
    writeAdvancedConfigSecurityAudit(currentSecurity, currentHash)
  }

  return {
    auditPath: getAdvancedConfigSecurityAuditFilePath(),
    securityHash: currentHash,
    securityFields: cloneJsonSafe(currentSecurity),
  }
}

export function consumePendingAdvancedConfigSecurityWarning() {
  const warning = pendingAdvancedConfigSecurityWarning
  pendingAdvancedConfigSecurityWarning = null
  return warning ? cloneJsonSafe(warning) : null
}
