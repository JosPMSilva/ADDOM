import { normalizeApplyPatchInput } from '../tools/apply-patch-core.mjs'
import { isLikelyLongRunningCommand } from '../tools/command-tools-core.mjs'

export const TOOL_CALL_LINT_DECISIONS = Object.freeze({
  PASS: 'pass',
  WARN: 'warn',
  REJECT: 'reject',
})

export const TOOL_CALL_LINT_CODES = Object.freeze({
  APPLY_PATCH_EMPTY_DIFF: 'apply_patch_empty_diff',
  APPLY_PATCH_MISSING_HUNK: 'apply_patch_missing_hunk',
  EDIT_FILE_NO_OP: 'edit_file_no_op',
  EDIT_FILE_OLD_TEXT_TOO_SHORT: 'edit_file_old_text_too_short',
  RUN_COMMAND_APPLY_PATCH_TOOL_MISUSE: 'run_command_apply_patch_tool_misuse',
  RUN_COMMAND_FILE_WRITE_WORKAROUND: 'run_command_file_write_workaround',
  RUN_COMMAND_LONG_RUNNING_FOREGROUND: 'run_command_long_running_foreground',
  RUN_COMMAND_PLAYWRIGHT_TEST_RUNNER_MISUSE: 'run_command_playwright_test_runner_misuse',
  RUN_COMMAND_PLAYWRIGHT_BROWSER_INSTALL_MISUSE: 'run_command_playwright_browser_install_misuse',
  RUN_COMMAND_PLAYWRIGHT_CLI_BROWSER_MISUSE: 'run_command_playwright_cli_browser_misuse',
  RUN_COMMAND_PLAYWRIGHT_PACKAGE_INSTALL_AMBIGUOUS: 'run_command_playwright_package_install_ambiguous',
  BROWSER_ACTION_FETCH_PAGE_PREFERRED: 'browser_action_fetch_page_preferred',
})

export const TOOL_CALL_FAILURE_CLASSES = Object.freeze({
  MALFORMED_PATCH_SYNTAX: 'MALFORMED_PATCH_SYNTAX',
  PATCH_USED_FOR_FULL_REWRITE: 'PATCH_USED_FOR_FULL_REWRITE',
  EXACT_TEXT_NO_MATCH: 'EXACT_TEXT_NO_MATCH',
  COMMAND_POLICY_BLOCKED: 'COMMAND_POLICY_BLOCKED',
  BROWSER_TIMEOUT: 'BROWSER_TIMEOUT',
})

export const TOOL_CALL_LINT_SEVERITIES = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
})

function buildLintResult({
  decision = TOOL_CALL_LINT_DECISIONS.PASS,
  lintCode = '',
  failureClass = '',
  message = '',
  rerouteToolName = '',
  severity = '',
} = {}) {
  return {
    decision,
    lintCode: String(lintCode || '').trim(),
    failureClass: String(failureClass || '').trim(),
    message: String(message || '').trim(),
    rerouteToolName: String(rerouteToolName || '').trim(),
    severity: String(severity || '').trim(),
  }
}

function lintApplyPatch(toolInput = {}) {
  const patchText = String(toolInput?.patch || '')
  if (!patchText.trim()) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: TOOL_CALL_LINT_CODES.APPLY_PATCH_EMPTY_DIFF,
      failureClass: TOOL_CALL_FAILURE_CLASSES.MALFORMED_PATCH_SYNTAX,
      message: 'apply_patch requires one patch string using "*** Begin Patch" ... "*** End Patch".',
      rerouteToolName: 'write_file',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }

  try {
    normalizeApplyPatchInput({ toolInput })
    return buildLintResult()
  } catch (error) {
    const message = String(error?.message || '').trim()
    const lintCode = message.toLowerCase().includes('non-empty patch text')
      || message.toLowerCase().includes('requires a non-empty patch string')
      ? TOOL_CALL_LINT_CODES.APPLY_PATCH_EMPTY_DIFF
      : TOOL_CALL_LINT_CODES.APPLY_PATCH_MISSING_HUNK
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode,
      failureClass: TOOL_CALL_FAILURE_CLASSES.MALFORMED_PATCH_SYNTAX,
      message: `${message || 'Malformed apply_patch payload.'} Use write_file for full-file replacement or edit_file for exact-text replacement.`,
      rerouteToolName: 'write_file',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }
}

function lintEditFile(toolInput = {}) {
  const oldText = String(toolInput?.old_text || '')
  const newText = String(toolInput?.new_text || '')
  if (oldText === newText) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: TOOL_CALL_LINT_CODES.EDIT_FILE_NO_OP,
      message: 'edit_file old_text and new_text are identical. No file change would occur.',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }
  const compactOldText = oldText.trim()
  if (compactOldText && compactOldText.length < 10 && !compactOldText.includes('\n')) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.WARN,
      lintCode: TOOL_CALL_LINT_CODES.EDIT_FILE_OLD_TEXT_TOO_SHORT,
      message: 'edit_file old_text may be too short to match uniquely. Include more surrounding context from the current file content.',
      severity: TOOL_CALL_LINT_SEVERITIES.WARNING,
    })
  }
  return buildLintResult()
}

function looksLikeShellFileWriteWorkaround(command = '') {
  const text = String(command || '').trim()
  if (!text) return false
  const startsAsDirectEmitter = /^\s*(echo|printf|cat|type|set-content|add-content|out-file)\b/i.test(text)
  const looksLikeGeneratorOrToolchain = /^(npx|npm\s+exec|npm\s+run|pnpm\s+exec|pnpm\s+dlx|pnpm\s+run|yarn\s+dlx|yarn\s+run|bunx|bun\s+run|node|python|py|cargo\s+run|go\s+run|dotnet|tsx|uvx?)\b/i.test(text)
  const hasContentEmitter = /\b(echo|printf|cat|type|set-content|add-content|out-file)\b/i.test(text)
  const hasRedirect = /(^|[^0-9])>>?(?!=)/.test(text) || /\|\s*out-file\b/i.test(text)
  const hasExplicitContentWrite = /\b(set-content|add-content|out-file)\b/i.test(text)
  if (startsAsDirectEmitter) return hasExplicitContentWrite || hasRedirect
  if (looksLikeGeneratorOrToolchain) return false
  return hasExplicitContentWrite || (hasContentEmitter && hasRedirect)
}

function looksLikeShellApplyPatchInvocation(command = '') {
  const text = String(command || '')
  if (!text.trim()) return false
  return /(^|[|;&()\s])apply_patch(?=$|[|;&()\s])/i.test(text)
    || /\bget-command\s+apply_patch\b/i.test(text)
    || /\bwhere(?:\.exe)?\s+apply_patch\b/i.test(text)
}

function looksLikeGenericPlaywrightTestRunner(command = '') {
  const text = normalizePlaywrightCliInvocation(command)
  if (!text) return false
  const match = text.match(/^playwright\s+test(?:\s+(.+))?$/i)
  if (!match) return false
  const rest = String(match[1] || '').trim()
  if (!rest) return true
  const tokens = rest.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every((token) => token.startsWith('-') || /^[\w-]+=/.test(token))
}

function looksLikePlaywrightBrowserInstall(command = '') {
  const text = normalizePlaywrightCliInvocation(command)
  if (!text) return false
  const match = text.match(/^playwright\s+install(?:\s+(.+))?$/i)
  if (!match) return false
  const rest = String(match[1] || '').trim()
  if (!rest) return true
  const tokens = rest.split(/\s+/).filter(Boolean)
  return tokens.some((token) => !token.startsWith('-'))
}

function looksLikePlaywrightCliBrowserAutomation(command = '') {
  const text = normalizePlaywrightCliInvocation(command)
  if (!text) return false
  const match = text.match(/^playwright\s+(\S+)(?:\s+.*)?$/i)
  if (!match) return false
  const subcommand = String(match[1] || '').trim().toLowerCase()
  return new Set([
    'open',
    'codegen',
    'screenshot',
    'pdf',
    'cr',
    'chromium',
    'ff',
    'firefox',
    'wk',
    'webkit',
    'install-deps',
  ]).has(subcommand)
}

function normalizePlaywrightCliInvocation(command = '') {
  const text = String(command || '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  return text
    .replace(/^(?:npx|bunx)\s+playwright\b/i, 'playwright')
    .replace(/^(?:npm|pnpm)\s+(?:exec|x|dlx)\s+playwright\b/i, 'playwright')
    .replace(/^yarn\s+(?:dlx\s+)?playwright\b/i, 'playwright')
    .replace(/^pnpm\s+playwright\b/i, 'playwright')
}

function looksLikePlaywrightPackageInstall(command = '') {
  const text = String(command || '').trim().replace(/\s+/g, ' ')
  if (!text) return false
  const match = text.match(/^(npm\s+(?:install|i|add)|pnpm\s+add|yarn\s+add|bun\s+add)\s+(.+)$/i)
  if (!match) return false
  const packageArgs = String(match[2] || '')
    .split(/\s+/)
    .filter((token) => token && !token.startsWith('-'))
  return packageArgs.some((token) => {
    const normalized = token.replace(/^["']|["']$/g, '').replace(/@[^/@]+$/i, '').toLowerCase()
    return normalized === 'playwright'
      || normalized === '@playwright/test'
      || normalized === 'playwright-core'
      || normalized === 'puppeteer'
      || normalized === 'selenium-webdriver'
  })
}

function lintRunCommand(toolInput = {}) {
  const command = String(toolInput?.command || '')
  const background = toolInput?.background === true
  if (looksLikeGenericPlaywrightTestRunner(command)) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_TEST_RUNNER_MISUSE,
      failureClass: TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED,
      message: 'run_command was asked to run the generic Playwright test runner. ADDOM already provides browser automation through browser_action; use inspect or find_elements before interaction, list_options before unknown select values, and console_messages/network_errors for UI debugging. Only run Playwright tests when the user asked for tests and you have a specific test file, config, or project script.',
      rerouteToolName: 'browser_action',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }
  if (looksLikePlaywrightBrowserInstall(command)) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_BROWSER_INSTALL_MISUSE,
      failureClass: TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED,
      message: 'run_command was asked to install Playwright browsers directly. ADDOM browser_action manages its Playwright Chromium runtime internally; use browser_action for browser automation and npm run browser:prepare-runtime only when the user explicitly asks to repair or prepare ADDOM\'s managed runtime.',
      rerouteToolName: 'browser_action',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }
  if (looksLikePlaywrightCliBrowserAutomation(command)) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_CLI_BROWSER_MISUSE,
      failureClass: TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED,
      message: 'run_command was asked to use the Playwright CLI for browser automation. ADDOM exposes that workflow through browser_action; use inspect/find_elements before choosing targets, list_options before select_option when values are unknown, screenshot for visual evidence, and console_messages/network_errors for diagnostics. Only use Playwright CLI commands when the user explicitly asks for that external CLI workflow.',
      rerouteToolName: 'browser_action',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }
  if (looksLikePlaywrightPackageInstall(command)) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.WARN,
      lintCode: TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_PACKAGE_INSTALL_AMBIGUOUS,
      message: 'run_command is installing browser automation packages. ADDOM already provides browser_action for screenshots, inspect/find_elements/list_options discovery, interactions, and console/network diagnostics. Install Playwright/Puppeteer/Selenium packages only when the user explicitly asked to add or repair project dependencies.',
      rerouteToolName: 'browser_action',
      severity: TOOL_CALL_LINT_SEVERITIES.WARNING,
    })
  }
  if (!background && isLikelyLongRunningCommand(command)) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: TOOL_CALL_LINT_CODES.RUN_COMMAND_LONG_RUNNING_FOREGROUND,
      failureClass: TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED,
      message: 'run_command was asked to start a likely long-running server/watch command in the foreground. Prefer terminal_session_* for interactive shells, dev servers, TUIs, and prompt-driven workflows. Use background=true only when the user explicitly asks to run a server; otherwise run a bounded build/test command.',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }
  if (looksLikeShellApplyPatchInvocation(command)) {
    return buildLintResult({
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: TOOL_CALL_LINT_CODES.RUN_COMMAND_APPLY_PATCH_TOOL_MISUSE,
      failureClass: TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED,
      message: 'run_command cannot invoke apply_patch as a shell command. Call the apply_patch tool directly with a patch string, or use edit_file/write_file.',
      rerouteToolName: 'apply_patch',
      severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
    })
  }
  if (!looksLikeShellFileWriteWorkaround(command)) {
    return buildLintResult()
  }
  return buildLintResult({
    decision: TOOL_CALL_LINT_DECISIONS.REJECT,
    lintCode: TOOL_CALL_LINT_CODES.RUN_COMMAND_FILE_WRITE_WORKAROUND,
    message: 'run_command should not be used for obvious file-write workarounds. Use write_file, edit_file, or apply_patch instead.',
    rerouteToolName: 'write_file',
    severity: TOOL_CALL_LINT_SEVERITIES.ERROR,
  })
}

function lintBrowserAction(toolInput = {}) {
  const action = String(toolInput?.action || '').trim().toLowerCase()
  const url = String(toolInput?.url || '').trim().toLowerCase()
  if (action !== 'navigate' || !/^https?:\/\//.test(url)) {
    return buildLintResult()
  }
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return buildLintResult()
  }
  return buildLintResult({
    decision: TOOL_CALL_LINT_DECISIONS.WARN,
    lintCode: TOOL_CALL_LINT_CODES.BROWSER_ACTION_FETCH_PAGE_PREFERRED,
    message: 'browser_action is usually unnecessary for static public pages. Prefer fetch_page unless JavaScript rendering or interaction is required.',
    rerouteToolName: 'fetch_page',
    severity: TOOL_CALL_LINT_SEVERITIES.WARNING,
  })
}

export function buildLintBlockedResult({ toolName = '', lintResult = {} } = {}) {
  const lintCode = String(lintResult?.lintCode || '').trim()
  const message = String(lintResult?.message || '').trim() || 'Tool call blocked by pre-execution lint.'
  const rerouteToolName = String(lintResult?.rerouteToolName || '').trim()
  const codePrefix = lintCode ? ` [${lintCode}]` : ''
  const rerouteLine = rerouteToolName ? `\n\nSuggested tool: ${rerouteToolName}` : ''
  const toolLabel = String(toolName || '').trim()
  return `Tool error: pre-execution lint${codePrefix}: ${toolLabel ? `${toolLabel}: ` : ''}${message}${rerouteLine}`
}

export function lintToolCall({
  toolName = '',
  toolInput = {},
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  switch (normalizedToolName) {
    case 'apply_patch':
      return lintApplyPatch(toolInput)
    case 'edit_file':
      return lintEditFile(toolInput)
    case 'run_command':
      return lintRunCommand(toolInput)
    case 'browser_action':
      return lintBrowserAction(toolInput)
    default:
      return buildLintResult()
  }
}
