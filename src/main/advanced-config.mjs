import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'

import { getUserDataPath } from './platform/electron-app.mjs'
import { observeAdvancedConfigSecurity } from './advanced-config-security-audit.mjs'
import { validateAdvancedConfigTomlObject } from './advanced-config-schema.mjs'

export const ADVANCED_CONFIG_FILE_NAME = 'advanced.toml'
export const ADVANCED_CONFIG_DIAGNOSTICS_FILE_NAME = 'advanced-config-diagnostics.json'

export const DEFAULT_ADVANCED_CONFIG_TOML = `# ADDOM advanced settings
# Uncomment only the keys you need. Invalid files are ignored as a whole.

[runtime]
# live_execution_stream_enabled = true
# per_thread_background_sessions = true

[memory]
# compression_enabled = true
# compression_threshold = 50
# compression_cooldown_ms = 120000
# compression_max_per_hour = 4
# compression_min_new_logs = 12
# include_global_memory_in_context = false

[terminal]
# scrollback = 5000
# paste_confirmation_line_threshold = 12

[continuity]
# enabled = true
# architecture = "hybrid_tiered"
# default_scope = "thread_only"
# active_profile = "balanced"
# latency_p95_target_ms = 300
# max_continuity_packet_tokens = 7000
# max_injected_facts = 18
# drift_guard_enabled = true
# invariant_checks_enabled = true
# contradiction_checks_enabled = true
# provider_chain_compaction_enabled = false
# provider_truncation_enabled = false
# provider_compaction_allowlist = ["openai"]

[continuity.profiles.balanced]
# packet_tokens_ratio = 0.14
# output_reserve_ratio = 0.20
# tool_reserve_ratio = 0.12
# max_injected_facts = 16
# max_source_refs = 18
# inject_every_round = false

[command_safety.install_sandbox]
# enabled = false
# ignore_scripts_first_pass = false
# preferred_backend = "auto"
# network_enforcement_mode = "strict"
# registry_allowlist = []
# cache_dirs = []

[providers.openai.runtime]
# transport_mode = "responses_auto"
# delegation_backend_preference = "auto"
# websocket_fallback_to_stream = true
# reasoning_summary = "auto"
# reasoning_effort = "provider_default"
# text_verbosity = "provider_default"
# service_tier = "auto"
# prompt_caching_enabled = true
# use_previous_response_id = true
# use_server_side_compaction = false
# server_side_compaction_threshold_tokens = 0
# codex_auto_thread_compaction_enabled = true
# codex_auto_thread_compaction_token_limit = 0
# allow_prompt_compaction_commands = false
# allow_prompt_compaction_threshold_override = false
# web_search_context_size = "medium"
# auto_create_project_vector_store = true
# auto_attach_project_vector_store = true
# file_search_max_num_results = 8

[providers.openai.hosted_tools]
# enabled = false
# enabled_tools = []

[providers.anthropic.runtime]
# thinking_type = "disabled"
# reasoning_effort = "provider_default"
# use_context_management_compaction = false
# context_management_compaction_threshold_tokens = 0

[providers.moonshot.runtime]
# remote_tools_enabled = false
# enabled_formula_uris = []

[attachment_text_extraction]
# enabled = false
# max_chars_per_attachment = 12000
# max_chars_per_turn = 60000
# max_attachments_per_turn = 4
# timeout_ms = 20000

[model_catalog.openrouter]
# default_visible = true

[model_catalog.openrouter.filters]
# reviewed_only = false
# tools_only = false
# reasoning_only = false
# vision_only = false

[agents]
# enabled = true
# default_profile = "balanced"
# max_live_agents = 8
# max_depth = 4
# max_descendants = 64
# max_total_tokens = 400000
# max_cost_usd = 75
# max_duration_ms = 1800000
# custom_pipelines_enabled = false
`

let advancedConfigCache = null
let advancedConfigCachePath = ''
let advancedConfigCacheMtimeMs = null
let advancedConfigCacheHash = ''
let lastAdvancedConfigDiagnostics = null

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value))
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

function sha256(value = '') {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex')
}

export function getAdvancedConfigPaths() {
  const userDataPath = getUserDataPath()
  return {
    userDataPath,
    advancedTomlPath: path.join(userDataPath, ADVANCED_CONFIG_FILE_NAME),
    diagnosticsPath: path.join(userDataPath, ADVANCED_CONFIG_DIAGNOSTICS_FILE_NAME),
  }
}

function createDiagnostics({
  ok = true,
  status = 'missing',
  sourcePath = '',
  diagnosticsPath = '',
  loadedAt = Date.now(),
  mtimeMs = null,
  hash = '',
  overlay = {},
  errors = [],
  warnings = [],
  created = false,
  securityAudit = null,
} = {}) {
  return {
    schemaVersion: 1,
    ok,
    status,
    sourcePath,
    diagnosticsPath,
    loadedAt,
    mtimeMs,
    hash,
    created,
    overlayKeys: collectLeafPaths(overlay),
    errors: Array.isArray(errors) ? errors : [],
    warnings: Array.isArray(warnings) ? warnings : [],
    securityAudit: securityAudit
      ? {
          auditPath: securityAudit.auditPath,
          securityHash: securityAudit.securityHash,
          securityKeys: collectLeafPaths(securityAudit.securityFields),
        }
      : null,
  }
}

function collectLeafPaths(source, prefix = []) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return []
  const out = []
  for (const [key, value] of Object.entries(source)) {
    const next = [...prefix, key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...collectLeafPaths(value, next))
    } else {
      out.push(next.join('.'))
    }
  }
  return out.sort()
}

function writeDiagnosticsFile(diagnostics) {
  try {
    atomicWriteTextFile(diagnostics.diagnosticsPath, JSON.stringify(diagnostics, null, 2))
  } catch (error) {
    console.warn('[advanced-config] failed to write diagnostics:', error?.message || error)
  }
}

function buildResult({
  overlay = {},
  diagnostics,
  sourcePath = '',
  mtimeMs = null,
  hash = '',
} = {}) {
  return {
    overlay: cloneJsonSafe(overlay),
    diagnostics: cloneJsonSafe(diagnostics),
    sourcePath,
    mtimeMs,
    hash,
  }
}

function ensureDefaultAdvancedConfigFile(advancedTomlPath) {
  if (fs.existsSync(advancedTomlPath)) return false
  atomicWriteTextFile(advancedTomlPath, DEFAULT_ADVANCED_CONFIG_TOML)
  return true
}

function parseAdvancedToml(sourceText, sourcePath) {
  try {
    return { parsed: parseToml(sourceText) || {}, errors: [] }
  } catch (error) {
    return {
      parsed: null,
      errors: [{
        path: '',
        code: 'parse_error',
        message: error?.message ? `Failed to parse ${path.basename(sourcePath)}: ${error.message}` : 'Failed to parse advanced.toml.',
      }],
    }
  }
}

export function reloadAdvancedConfig({ createIfMissing = true } = {}) {
  const paths = getAdvancedConfigPaths()
  const loadedAt = Date.now()
  let created = false

  try {
    fs.mkdirSync(paths.userDataPath, { recursive: true })
    if (!fs.existsSync(paths.advancedTomlPath)) {
      if (!createIfMissing) {
        const diagnostics = createDiagnostics({
          ok: true,
          status: 'missing',
          sourcePath: paths.advancedTomlPath,
          diagnosticsPath: paths.diagnosticsPath,
          loadedAt,
        })
        lastAdvancedConfigDiagnostics = diagnostics
        writeDiagnosticsFile(diagnostics)
        advancedConfigCache = buildResult({ overlay: {}, diagnostics, sourcePath: paths.advancedTomlPath })
        advancedConfigCachePath = paths.advancedTomlPath
        advancedConfigCacheMtimeMs = null
        advancedConfigCacheHash = ''
        return buildResult(advancedConfigCache)
      }
      created = ensureDefaultAdvancedConfigFile(paths.advancedTomlPath)
    }

    const sourceText = fs.readFileSync(paths.advancedTomlPath, 'utf8')
    const stat = fs.statSync(paths.advancedTomlPath)
    const mtimeMs = Number(stat?.mtimeMs || 0) || 0
    const hash = sha256(sourceText)
    const parsedResult = parseAdvancedToml(sourceText, paths.advancedTomlPath)
    if (parsedResult.errors.length > 0) {
      const diagnostics = createDiagnostics({
        ok: false,
        status: 'invalid',
        sourcePath: paths.advancedTomlPath,
        diagnosticsPath: paths.diagnosticsPath,
        loadedAt,
        mtimeMs,
        hash,
        errors: parsedResult.errors,
        warnings: [{ code: 'overlay_ignored', message: 'advanced.toml was ignored for this run.' }],
        created,
      })
      lastAdvancedConfigDiagnostics = diagnostics
      writeDiagnosticsFile(diagnostics)
      advancedConfigCache = buildResult({ overlay: {}, diagnostics, sourcePath: paths.advancedTomlPath, mtimeMs, hash })
      advancedConfigCachePath = paths.advancedTomlPath
      advancedConfigCacheMtimeMs = mtimeMs
      advancedConfigCacheHash = hash
      return buildResult(advancedConfigCache)
    }

    const validation = validateAdvancedConfigTomlObject(parsedResult.parsed)
    const securityAudit = validation.ok
      ? observeAdvancedConfigSecurity(validation.overlay, { valid: true })
      : null
    const diagnostics = createDiagnostics({
      ok: validation.ok,
      status: validation.ok ? (created ? 'created' : 'valid') : 'invalid',
      sourcePath: paths.advancedTomlPath,
      diagnosticsPath: paths.diagnosticsPath,
      loadedAt,
      mtimeMs,
      hash,
      overlay: validation.overlay,
      errors: validation.errors,
      warnings: validation.ok ? [] : [{ code: 'overlay_ignored', message: 'advanced.toml was ignored for this run.' }],
      created,
      securityAudit,
    })
    lastAdvancedConfigDiagnostics = diagnostics
    writeDiagnosticsFile(diagnostics)
    advancedConfigCache = buildResult({
      overlay: validation.ok ? validation.overlay : {},
      diagnostics,
      sourcePath: paths.advancedTomlPath,
      mtimeMs,
      hash,
    })
    advancedConfigCachePath = paths.advancedTomlPath
    advancedConfigCacheMtimeMs = mtimeMs
    advancedConfigCacheHash = hash
    return buildResult(advancedConfigCache)
  } catch (error) {
    const diagnostics = createDiagnostics({
      ok: false,
      status: 'error',
      sourcePath: paths.advancedTomlPath,
      diagnosticsPath: paths.diagnosticsPath,
      loadedAt,
      errors: [{
        path: '',
        code: 'io_error',
        message: error?.message || 'Failed to load advanced.toml.',
      }],
      warnings: [{ code: 'overlay_ignored', message: 'advanced.toml was ignored for this run.' }],
      created,
    })
    lastAdvancedConfigDiagnostics = diagnostics
    writeDiagnosticsFile(diagnostics)
    advancedConfigCache = buildResult({ overlay: {}, diagnostics, sourcePath: paths.advancedTomlPath })
    advancedConfigCachePath = paths.advancedTomlPath
    advancedConfigCacheMtimeMs = null
    advancedConfigCacheHash = ''
    return buildResult(advancedConfigCache)
  }
}

export function getAdvancedConfig({ createIfMissing = true } = {}) {
  const paths = getAdvancedConfigPaths()
  if (!fs.existsSync(paths.advancedTomlPath)) return reloadAdvancedConfig({ createIfMissing })
  try {
    const stat = fs.statSync(paths.advancedTomlPath)
    const mtimeMs = Number(stat?.mtimeMs || 0) || 0
    if (
      advancedConfigCache
      && advancedConfigCachePath === paths.advancedTomlPath
      && advancedConfigCacheMtimeMs === mtimeMs
    ) {
      const sourceText = fs.readFileSync(paths.advancedTomlPath, 'utf8')
      const hash = sha256(sourceText)
      if (hash === advancedConfigCacheHash) return buildResult(advancedConfigCache)
    }
  } catch {
    return reloadAdvancedConfig({ createIfMissing })
  }
  return reloadAdvancedConfig({ createIfMissing })
}

export function getAdvancedConfigDiagnostics({ createIfMissing = true } = {}) {
  if (!lastAdvancedConfigDiagnostics) {
    return getAdvancedConfig({ createIfMissing }).diagnostics
  }
  return cloneJsonSafe(lastAdvancedConfigDiagnostics)
}

export function ensureAdvancedConfigBootstrap() {
  return getAdvancedConfig({ createIfMissing: true }).diagnostics
}
