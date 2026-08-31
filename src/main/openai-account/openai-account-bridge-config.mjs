import fs from 'node:fs'
import path from 'node:path'
import { ensureOpenAIAccountStorage } from './openai-account-storage.mjs'
import { ensureManagedOpenAIAccountCodexHomeAssets } from './openai-account-codex-home-assets.mjs'
import { normalizeId } from './openai-account-bridge-shared.mjs'

const DEFAULT_LOG_FILE_NAME = 'codex-app-server.log'
const BRIDGE_ENV_ALLOWLIST = Object.freeze([
  'APPDATA',
  'COLORTERM',
  'CI',
  'ComSpec',
  'COMSPEC',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LOCALAPPDATA',
  'NODE_EXTRA_CA_CERTS',
  'NO_COLOR',
  'NO_PROXY',
  'no_proxy',
  'OS',
  'Path',
  'PATH',
  'PATHEXT',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'windir',
  'WINDIR',
])

export function buildBridgeLaunchEnv(env = {}, {
  codexHomePath = '',
  configPath = '',
} = {}) {
  const source = env && typeof env === 'object' ? env : {}
  const launchEnv = {}
  for (const key of BRIDGE_ENV_ALLOWLIST) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    const value = source[key]
    if (value === undefined || value === null || value === '') continue
    launchEnv[key] = value
  }
  launchEnv.CODEX_HOME = normalizeId(codexHomePath)
  if (configPath) launchEnv.CODEX_CONFIG = normalizeId(configPath)
  return launchEnv
}

function toTomlString(value = '') {
  return `"${String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')}"`
}

function normalizeAccountCompactionTokenLimit(value = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.min(2_000_000, Math.max(4_096, Math.round(numeric)))
}

function normalizeAccountCompactionInstructions(value = '') {
  return normalizeId(value).slice(0, 4_000)
}

export function normalizeOpenAIAccountBridgeRuntimeSettings(runtimeSettings = null) {
  const source = runtimeSettings && typeof runtimeSettings === 'object' ? runtimeSettings : {}
  const tokenLimit = normalizeAccountCompactionTokenLimit(source.codexAutoThreadCompactionTokenLimit)
  const instructions = normalizeAccountCompactionInstructions(source.codexAutoThreadCompactionInstructions)
  const enabled = source.codexAutoThreadCompactionEnabled === true
  return {
    codexAutoThreadCompactionEnabled: enabled,
    codexAutoThreadCompactionTokenLimit: enabled ? tokenLimit : 0,
    codexAutoThreadCompactionInstructions: enabled ? instructions : '',
  }
}

export function buildOpenAIAccountBridgeRuntimeConfigSignature(runtimeSettings = null) {
  return JSON.stringify(normalizeOpenAIAccountBridgeRuntimeSettings(runtimeSettings))
}

export function writeBridgeConfigFile({ codexHomePath = '', logsPath = '', runtimeSettings = null } = {}) {
  const safeCodexHomePath = normalizeId(codexHomePath)
  const safeLogsPath = normalizeId(logsPath)
  if (!safeCodexHomePath) return ''
  const normalizedRuntimeSettings = normalizeOpenAIAccountBridgeRuntimeSettings(runtimeSettings)
  fs.mkdirSync(safeCodexHomePath, { recursive: true })
  const configPath = path.join(safeCodexHomePath, 'config.toml')
  const lines = [
    'check_for_update_on_startup = false',
    'history.persistence = "none"',
    'cli_auth_credentials_store = "file"',
    'mcp_oauth_credentials_store = "file"',
  ]
  if (safeLogsPath) lines.push(`log_dir = ${toTomlString(safeLogsPath)}`)
  if (
    normalizedRuntimeSettings.codexAutoThreadCompactionEnabled === true
    && normalizedRuntimeSettings.codexAutoThreadCompactionTokenLimit > 0
  ) {
    lines.push(`model_auto_compact_token_limit = ${normalizedRuntimeSettings.codexAutoThreadCompactionTokenLimit}`)
    if (normalizedRuntimeSettings.codexAutoThreadCompactionInstructions) {
      lines.push(`compact_prompt = ${toTomlString(normalizedRuntimeSettings.codexAutoThreadCompactionInstructions)}`)
    }
  }
  fs.writeFileSync(configPath, `${lines.join('\n')}\n`, 'utf8')
  return configPath
}

export function buildOpenAIAccountBridgeLaunchSpec({
  userDataPath = '',
  codexExecutablePath = '',
  runtimeSettings = null,
  env = process.env,
  platform = process.platform,
} = {}) {
  const paths = ensureOpenAIAccountStorage(userDataPath)
  ensureManagedOpenAIAccountCodexHomeAssets(paths.codexHomePath)
  const command = normalizeId(codexExecutablePath) || normalizeId(env.ADDOM_CODEX_EXECUTABLE) || 'codex'
  const args = ['app-server', '--listen', 'stdio://']
  const logFilePath = path.join(paths.logsPath, DEFAULT_LOG_FILE_NAME)
  const normalizedRuntimeSettings = normalizeOpenAIAccountBridgeRuntimeSettings(runtimeSettings)
  const configPath = writeBridgeConfigFile({
    codexHomePath: paths.codexHomePath,
    logsPath: paths.logsPath,
    runtimeSettings: normalizedRuntimeSettings,
  })
  const launchEnv = buildBridgeLaunchEnv(env, {
    codexHomePath: paths.codexHomePath,
    configPath,
  })
  return {
    command,
    args,
    cwd: paths.userDataPath,
    env: launchEnv,
    windowsHide: platform === 'win32',
    paths,
    configPath,
    runtimeSettings: normalizedRuntimeSettings,
    configSignature: buildOpenAIAccountBridgeRuntimeConfigSignature(normalizedRuntimeSettings),
    logFilePath,
  }
}
