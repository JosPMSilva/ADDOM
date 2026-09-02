import { isLikelyLongRunningCommand } from './command-tools-command-classifier.mjs'
import { createSanitizedChildProcessEnv } from './process-environment-policy.mjs'

export const DEFAULT_COMMAND_TIMEOUT_MS = 300_000
export const MAX_COMMAND_TIMEOUT_MS = 3_600_000
export const MAX_COMMAND_OUTPUT_CHARS = 200_000
export const MAX_BACKGROUND_STARTUP_OUTPUT_CHARS = 12_000
export const MAX_COMMAND_LENGTH = 4000
export const BACKGROUND_STARTUP_GRACE_MS = 1_200
export const MAX_COMMAND_CHAIN_OPERATORS = 24

// SECURITY: This blocklist is defense-in-depth only. Approval flow and execution
// profile gating remain the primary protection layers for risky commands.
const BLOCKED_COMMAND_PATTERNS = [
  { pattern: /\brm\s+-rf\s+\/(\s|$)/i, reason: 'Refusing destructive root delete commands.' },
  { pattern: /\brm\s+-rf\s+~(\s|$|[\\/])/i, reason: 'Refusing destructive delete commands targeting the home directory.' },
  { pattern: /\brm\s+-rf\s+(\$home|\$\{home\}|\$userprofile|\$env:userprofile|%userprofile%)(\s|$|[\\/])/i, reason: 'Refusing destructive delete commands targeting user-home paths.' },
  { pattern: /\brm\s+-rf\s+([a-z]:\\|\\\\)(\s|$)/i, reason: 'Refusing destructive absolute delete commands.', allowWithHostFullAccess: true },
  { pattern: /\brm\s+-rf\s+[a-z]:\\users\\[^\\\s]+/i, reason: 'Refusing destructive delete commands targeting user profile directories.', allowWithHostFullAccess: true },
  { pattern: /`[^`\r\n]*\brm\s+-rf\b[^`\r\n]*`/i, reason: 'Refusing backtick-escaped destructive delete commands.' },
  { pattern: /\$\([^)\r\n]*\brm\s+-rf\b[^)\r\n]*\)/i, reason: 'Refusing subshell-escaped destructive delete commands.' },
  { pattern: /\b(remove-item|ri)\b(?=[^\n\r]*\s-(recurse|r)\b)(?=[^\n\r]*\s-(force|fo)\b)[^\n\r]*?["']?(~|\$home\b|\$env:userprofile\b|%userprofile%)["']?([\\/]|(\s|$))/i, reason: 'Refusing destructive PowerShell delete commands targeting the home directory.' },
  { pattern: /\b(remove-item|ri)\b(?=[^\n\r]*\s-(recurse|r)\b)(?=[^\n\r]*\s-(force|fo)\b)[^\n\r]*?["']?([a-z]:\\|\\\\)/i, reason: 'Refusing destructive PowerShell absolute delete commands.', allowWithHostFullAccess: true },
  { pattern: /\b(remove-item|ri)\b(?=[^\n\r]*\s-(recurse|r)\b)(?=[^\n\r]*\s-(force|fo)\b)[^\n\r]*?["']?[a-z]:\\users\\[^\\\s"']+/i, reason: 'Refusing destructive PowerShell delete commands targeting user profile directories.', allowWithHostFullAccess: true },
  { pattern: /\b(del|erase)\b[^\n\r]*\s\/(s|q|f|a)\b/i, reason: 'Refusing destructive Windows delete commands.' },
  { pattern: /\b(del|erase)\b[^\n\r]*\s\/(s|q|f|a)\b[^\n\r]*\b(c:\\users\\|%userprofile%)/i, reason: 'Refusing destructive Windows delete commands targeting user-home paths.', allowWithHostFullAccess: true },
  { pattern: /\brd\b[^\n\r]*\s\/(s|q)\b[^\n\r]*\b(c:\\users\\|%userprofile%|\\users\\)/i, reason: 'Refusing destructive directory removal commands targeting user-home paths.', allowWithHostFullAccess: true },
  { pattern: /\b(format(?:\.com|\.exe)?(?!-)|diskpart|mkfs(?:\.[a-z0-9_]+)?)\b/i, reason: 'Refusing disk formatting commands.' },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/i, reason: 'Refusing host shutdown/reboot commands.' },
  { pattern: /\breg\s+delete\b/i, reason: 'Refusing Windows registry delete commands.' },
  { pattern: /\b(curl|wget)\b[^\n\r]*\|\s*(bash|sh|pwsh|powershell)\b/i, reason: 'Refusing remote script pipe-to-shell commands.' },
]

export function normalizeCommandPolicyText(commandText) {
  let normalized = String(commandText ?? '')
  try {
    normalized = normalized.normalize('NFKC')
  } catch {
    // Best-effort only.
  }
  return normalized.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
}

function maskQuotedCommandSegments(commandText) {
  const text = String(commandText ?? '')
  let masked = ''

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index]
    const next = text[index + 1] || ''

    if ((ch === '@' && next === '\'') || (ch === '@' && next === '"')) {
      const normalizedTerminator = `\n${next}@`
      const closingIndex = text.indexOf(normalizedTerminator, index + 2)
      if (closingIndex >= 0) {
        masked += '  '
        const spanLength = Math.max(0, (closingIndex + normalizedTerminator.length) - (index + 2))
        masked += ' '.repeat(spanLength)
        index = closingIndex + normalizedTerminator.length - 1
        continue
      }
    }

    if (ch === '\'' || ch === '"') {
      const quote = ch
      masked += ' '
      for (index += 1; index < text.length; index += 1) {
        const inner = text[index]
        if (quote === '"' && inner === '\\' && (index + 1) < text.length) {
          masked += '  '
          index += 1
          continue
        }
        if (quote === '\'' && inner === '\'' && text[index + 1] === '\'') {
          masked += '  '
          index += 1
          continue
        }
        masked += ' '
        if (inner === quote) break
      }
      continue
    }

    masked += ch
  }

  return masked
}

function countCommandChainOperators(commandText) {
  const masked = maskQuotedCommandSegments(commandText)
  const operators = masked.match(/&&|\|\||\|(?!\|)|;/g) || []
  return operators.length
}

function validateCommandComplexity(commandText) {
  const operatorCount = countCommandChainOperators(commandText)
  if (operatorCount > MAX_COMMAND_CHAIN_OPERATORS) {
    throw new Error('Command is too complex (too many pipes/chains).')
  }
}

export function normalizeTimeoutMs(timeoutMs) {
  const n = Number(timeoutMs)
  if (!Number.isFinite(n)) return DEFAULT_COMMAND_TIMEOUT_MS
  return Math.max(1_000, Math.min(MAX_COMMAND_TIMEOUT_MS, Math.round(n)))
}

export function createCommandEnv() {
  const filtered = createSanitizedChildProcessEnv(process.env)
  return {
    ...filtered,
    CI: filtered.CI || '1',
    DEBIAN_FRONTEND: filtered.DEBIAN_FRONTEND || 'noninteractive',
    PIP_DISABLE_PIP_VERSION_CHECK: filtered.PIP_DISABLE_PIP_VERSION_CHECK || '1',
  }
}

export function validateCommandPolicy(commandText, settings = {}) {
  if (!commandText) throw new Error('Command is required.')
  if (commandText.length > MAX_COMMAND_LENGTH) throw new Error(`Command exceeds max length (${MAX_COMMAND_LENGTH} chars).`)
  if (commandText.includes('\0')) throw new Error('Command contains unsupported null bytes.')
  const normalizedCommandText = normalizeCommandPolicyText(commandText)
  const normalizedSettings = settings && typeof settings === 'object' ? settings : {}
  const hostFullAccessApproved = normalizedSettings.allowHostFullAccessForThisCommand === true
    || normalizedSettings.hostFullAccessApproved === true
  validateCommandComplexity(normalizedCommandText)
  for (const rule of BLOCKED_COMMAND_PATTERNS) {
    if (rule.allowWithHostFullAccess === true && hostFullAccessApproved) continue
    if (rule.pattern.test(normalizedCommandText)) throw new Error(rule.reason)
  }
}

export function buildPermissionFailureHints({ command, output }) {
  const cmd = String(command ?? '').trim()
  const out = String(output ?? '')
  if (!out) return []
  const looksPermissionIssue = /\b(permission denied|access is denied|eacces|eperm|operation not permitted|requires elevation|administrator)\b/i.test(out)
  if (!looksPermissionIssue) return []
  const hints = ['Command appears to have failed due to permissions/elevation.']
  if (/^(npm|pnpm|yarn|bun)\b/i.test(cmd) && (/\s-g(\s|$)/i.test(cmd) || /\s--global(\s|$)/i.test(cmd))) {
    hints.push('Prefer a project-local install instead of global scope when possible (e.g. `npm install --save-dev <pkg>` then `npx --yes <pkg> ...`).')
  }
  if (process.platform === 'win32') hints.push('If this action requires system-level changes, run ADDOM from an elevated terminal (Run as Administrator).')
  return hints
}

export function isWindowsRelativeBrowserLaunchCommand(commandText) {
  if (process.platform !== 'win32') return false
  const cmd = String(commandText ?? '').trim()
  if (!cmd) return false
  const startsProcess = /\bstart-process\b/i.test(cmd) || /\bstart\b/i.test(cmd)
  const targetsBrowser = /\b(chrome|msedge|edge|firefox|brave|opera)(\.exe)?\b/i.test(cmd)
  const hasRelativePath = /(^|[\s"'`])\.[\\/][^\s"'`]+/i.test(cmd)
  const hasAbsoluteOrResolvedPath = /\bresolve-path\b/i.test(cmd) || /\bfile:\/\//i.test(cmd)
  return startsProcess && targetsBrowser && hasRelativePath && !hasAbsoluteOrResolvedPath
}

export function appendBrowserLaunchAdvisory(commandText, output) {
  const base = String(output ?? '')
  if (!isWindowsRelativeBrowserLaunchCommand(commandText)) return base
  return `${base}

Note: Browser launch used a relative path. This can report success but fail to open the intended local file in some shells/browser setups.
Prefer resolving an absolute path first, e.g.:
\`$file = (Resolve-Path .\\index.html).Path; Start-Process chrome -ArgumentList $file\`
Or default browser:
\`Start-Process -FilePath (Resolve-Path .\\index.html).Path\``
}

export function shouldTryNextShellCandidate({ shellPreference, runInBackground, commandText, err }) {
  if (shellPreference !== 'auto') return false
  const msg = String(err?.message ?? '').toLowerCase()
  if (!msg) return false
  if (
    msg.includes('command not found')
    || msg.includes('is not recognized as an internal or external command')
    || msg.includes('is not recognized as the name of a cmdlet')
    || msg.includes('no usable shell found')
    || msg.includes('enoent')
  ) {
    return true
  }
  if (runInBackground && isLikelyLongRunningCommand(commandText)) {
    if (
      msg.includes('background command exited')
      || msg.includes('did not stay running')
      || msg.includes('this shell may not have node/npm in path')
      || msg.includes('this shell may also miss python in path')
    ) return true
  }
  return false
}

export function classifyShellDialectMistake(commandText, { shell = 'auto', stderr = '' } = {}) {
  const cmd = String(commandText ?? '').trim()
  const err = String(stderr ?? '')
  const shellLower = String(shell || '').trim().toLowerCase()
  const shellLooksPowerShell = shellLower === 'powershell'
    || shellLower === 'pwsh'
    || shellLower === 'auto'
    || /getchilditem|microsoft\.powershell\.commands\.getchilditemcommand/i.test(err)

  if (shellLooksPowerShell && /^dir\s+\/a(\s|$)/i.test(cmd)) {
    if (/cannot find path '.*:\\a'/i.test(err) || /getchilditem/i.test(err) || !err) {
      return {
        code: 'powershell_dir_slash_a',
        hint: 'PowerShell `dir` uses named switches. Try `Get-ChildItem -Force` (or `dir -Force`) instead of `dir /a`.',
      }
    }
  }

  return null
}

export function buildShellDialectHints(commandText, { shell = 'auto', stderr = '', stdout = '' } = {}) {
  const hints = []
  const mistake = classifyShellDialectMistake(commandText, { shell, stderr })
  if (mistake?.hint) hints.push(String(mistake.hint))

  const shellLower = String(shell || '').trim().toLowerCase()
  const combined = `${String(stdout || '')}\n${String(stderr || '')}`
  if ((shellLower === 'powershell' || shellLower === 'pwsh') && /\b\/[a-z]\b/i.test(String(commandText || '')) && /getchilditem/i.test(combined)) {
    hints.push('On Windows PowerShell, prefer cmdlet-style flags (for example `-Force`) instead of CMD-style `/x` switches.')
  }

  return Array.from(new Set(hints))
}
