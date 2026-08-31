import React from 'react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import {
  BrowserActionPolicyPanel,
  RunCommandPolicyPanel,
  TerminalSessionPolicyPanel,
} from './ToolApprovalOverlayPolicyPanels.jsx'

function asText(value) {
  return String(value ?? '').trim()
}

function humanizeToolName(value = '') {
  return asText(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function commandFromInput(toolName, toolInput = {}) {
  if (asText(toolInput.command)) return asText(toolInput.command)
  const action = toolInput.action && typeof toolInput.action === 'object' ? toolInput.action : null
  if (Array.isArray(action?.command)) return action.command.map((part) => asText(part)).filter(Boolean).join(' ')
  if (asText(action?.command)) return asText(action.command)
  if (toolName === 'terminal_session_write' && asText(toolInput.data)) return asText(toolInput.data)
  return ''
}

function valueFromInput(toolInput = {}, keys = []) {
  for (const key of keys) {
    const value = asText(toolInput?.[key])
    if (value) return value
  }
  return ''
}

function getDecisionTitle({ toolName, meta, t }) {
  const label = asText(meta?.label)
  if (toolName === 'run_command') return t('core:toolApprovalOverlay.intent.runCommand', { defaultValue: 'Run command' })
  if (toolName === 'local_shell') return t('core:toolApprovalOverlay.intent.localShell', { defaultValue: 'Run local shell command' })
  if (toolName === 'terminal_session_open') return t('core:toolApprovalOverlay.intent.openTerminal', { defaultValue: 'Open terminal' })
  if (toolName?.startsWith?.('terminal_session_')) return t('core:toolApprovalOverlay.intent.useTerminal', { defaultValue: 'Use terminal' })
  if (toolName === 'browser_action') return t('core:toolApprovalOverlay.intent.useBrowser', { defaultValue: 'Use browser' })
  if (toolName === 'file_change') return t('core:toolApprovalOverlay.intent.reviewFileChanges', { defaultValue: 'Review file changes' })
  if (toolName === 'create_directory') return t('core:toolApprovalOverlay.intent.createDirectory', { defaultValue: 'Create directory' })
  return label || humanizeToolName(toolName)
}

function getPrimaryValue({ toolName, toolInput = {}, pending = null }) {
  const command = commandFromInput(toolName, toolInput)
  if (command) return command
  if (toolName === 'browser_action') return valueFromInput(toolInput, ['url', 'target', 'href']) || asText(toolInput.action)
  if (toolName === 'file_change') {
    const changes = Array.isArray(pending?.changes || toolInput?.changes) ? (pending?.changes || toolInput.changes) : []
    if (changes.length === 1) return asText(changes[0]?.path)
    if (changes.length > 1) return `${changes.length} files`
  }
  return valueFromInput(toolInput, ['path', 'cwd', 'workingDirectory', 'filePath', 'name'])
}

function getScopeText({ toolInput = {}, runCommandPolicyView, browserActionPolicyView, terminalSessionPolicyView, t }) {
  const runPolicy = runCommandPolicyView?.policy
  if (runPolicy?.executionTarget === 'install_sandbox' && runPolicy?.sandbox?.available === false) {
    return t('core:toolApprovalOverlay.intent.scopeSandboxUnavailable', { defaultValue: 'Sandbox unavailable; host fallback is available.' })
  }
  if (runPolicy?.executionTarget === 'install_sandbox') return t('core:toolApprovalOverlay.intent.scopeInstallSandbox', { defaultValue: 'Runs in the install sandbox.' })
  if (runPolicy?.executionTarget === 'host' && runPolicy?.elevationRequired) return t('core:toolApprovalOverlay.intent.scopeHostAccess', { defaultValue: 'Requires host access.' })
  if (runPolicy?.executionTarget === 'host') return t('core:toolApprovalOverlay.intent.scopeWorkspaceShell', { defaultValue: 'Runs in the workspace shell.' })

  const browserPolicy = browserActionPolicyView?.policy
  if (browserPolicy?.targetOrigin) return t('core:toolApprovalOverlay.intent.scopeBrowserTarget', { defaultValue: 'Target: {{target}}', target: browserPolicy.targetOrigin })
  if (browserPolicy?.targetHost) return t('core:toolApprovalOverlay.intent.scopeBrowserTarget', { defaultValue: 'Target: {{target}}', target: browserPolicy.targetHost })

  const terminalPolicy = terminalSessionPolicyView?.policy
  if (terminalPolicy?.hostAccessRequired) return t('core:toolApprovalOverlay.intent.scopeTerminalHostPath', { defaultValue: 'Opens against a host path.' })
  if (terminalPolicy?.resolvedCwd) return t('core:toolApprovalOverlay.intent.scopeWorkingDirectory', { defaultValue: 'Working directory: {{cwd}}', cwd: terminalPolicy.resolvedCwd })

  const cwd = asText(toolInput.cwd || toolInput.workingDirectory)
  return cwd ? t('core:toolApprovalOverlay.intent.scopeWorkingDirectory', { defaultValue: 'Working directory: {{cwd}}', cwd }) : ''
}

function getWarningText({ runCommandPolicyView, browserActionPolicyView, terminalSessionPolicyView, t }) {
  if (runCommandPolicyView?.actionsVariant?.requireExplicitHostFullAccess) {
    return t('core:toolApprovalOverlay.intent.warningExplicitHost', { defaultValue: 'This needs an explicit host access decision.' })
  }
  if (runCommandPolicyView?.actionsVariant?.requireExplicitWslCompatibilityApproval) {
    return t('core:toolApprovalOverlay.intent.warningExplicitWsl', { defaultValue: 'WSL can reach host files. Use the explicit WSL action only if that is intended.' })
  }
  if (runCommandPolicyView?.actionsVariant?.showHostInstallFallback) {
    return t('core:toolApprovalOverlay.intent.warningSandboxFallback', { defaultValue: 'The sandbox route is unavailable. Host fallback is a one-time exception.' })
  }
  if (browserActionPolicyView?.policy?.targetClass === 'private_network') {
    return t('core:toolApprovalOverlay.intent.warningPrivateNetwork', { defaultValue: 'This targets a local or private network address.' })
  }
  if (terminalSessionPolicyView?.policy?.hostAccessRequired) {
    return t('core:toolApprovalOverlay.intent.warningTerminalOutsideWorkspace', { defaultValue: 'This terminal opens outside the workspace.' })
  }
  const warnings = [
    ...(runCommandPolicyView?.warnings || []),
    ...(browserActionPolicyView?.warnings || []),
    ...(terminalSessionPolicyView?.warnings || []),
  ].map(asText).filter(Boolean)
  return warnings[0] || ''
}

function RawRequestDetails({ toolInput = {} }) {
  const { t } = useRendererTranslation(['core'])
  const entries = Object.entries(toolInput || {})
  if (entries.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-text-tertiary">
        {t('core:toolApprovalOverlay.production.requestData', { defaultValue: 'Request data' })}
      </p>
      {entries.map(([key, val]) => (
        <div key={key} className="grid gap-1 sm:grid-cols-[96px_minmax(0,1fr)]">
          <p className="text-[11px] text-text-tertiary">{key}</p>
          <pre className="m-0 max-h-36 overflow-auto rounded-md border border-surface-border/70 bg-surface px-2 py-1.5 text-xs leading-5 text-text-secondary">
            <code>{formatApprovalInputValue(val)}</code>
          </pre>
        </div>
      ))}
    </div>
  )
}

function ApprovalProvenanceBlock({ pending = null }) {
  const { t } = useRendererTranslation(['core'])
  const originLabel = asText(pending?.originLabel || pending?.originSurface)
  const threadId = asText(pending?.threadId)
  const turnId = asText(pending?.turnId)
  if (!originLabel && !threadId && !turnId) return null

  return (
    <div className="space-y-1 text-xs text-text-secondary">
      <p className="text-[11px] font-medium text-text-tertiary">
        {t('core:toolApprovalOverlay.provenance.title', { defaultValue: 'Approval provenance' })}
      </p>
      {originLabel && <p>{originLabel}</p>}
      {threadId && <p className="font-mono break-all">{threadId}</p>}
      {turnId && <p className="font-mono break-all">{turnId}</p>}
    </div>
  )
}

export function ApprovalIntentSummary({
  pending,
  toolName,
  toolInput,
  meta,
  countdownText = '',
  countdownClass = 'text-text-tertiary',
  runCommandPolicyView,
  browserActionPolicyView,
  terminalSessionPolicyView,
}) {
  const { t } = useRendererTranslation(['core'])
  const title = getDecisionTitle({ toolName, meta, t })
  const primaryValue = getPrimaryValue({ toolName, toolInput, pending })
  const scopeText = getScopeText({
    toolInput,
    runCommandPolicyView,
    browserActionPolicyView,
    terminalSessionPolicyView,
    t,
  })
  const warningText = getWarningText({
    runCommandPolicyView,
    browserActionPolicyView,
    terminalSessionPolicyView,
    t,
  })
  const timerText = asText(countdownText)

  return (
    <section className="space-y-2" data-ui="tool-approval-intent-summary">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[13px] font-semibold leading-tight text-text-primary">{title}</h2>
        {timerText ? (
          <p className={`shrink-0 font-mono text-xs tabular-nums ${countdownClass}`}>{timerText}</p>
        ) : null}
      </div>
      {scopeText && <p className="text-xs text-text-secondary">{scopeText}</p>}
      {primaryValue && (
        <div className="rounded bg-surface px-2.5 py-1.5">
          <p className="break-all font-mono text-xs leading-5 text-text-primary">{primaryValue}</p>
        </div>
      )}
      {warningText && (
        <p className="border-l-2 border-warning-border/55 pl-2.5 text-xs leading-5 text-warning-soft">
          {warningText}
        </p>
      )}
    </section>
  )
}

export function ApprovalDetailsDisclosure({
  pending,
  toolInput,
  runCommandPolicyView,
  browserActionPolicyView,
  terminalSessionPolicyView,
}) {
  const { t } = useRendererTranslation(['core'])
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-secondary focus-visible:text-text-primary">
        <span>{t('core:toolApprovalOverlay.production.details', { defaultValue: 'Details' })}</span>
      </summary>
      <div className="mt-3 space-y-3">
        {runCommandPolicyView && <RunCommandPolicyPanel view={runCommandPolicyView} />}
        {browserActionPolicyView && <BrowserActionPolicyPanel view={browserActionPolicyView} />}
        {terminalSessionPolicyView && <TerminalSessionPolicyPanel view={terminalSessionPolicyView} />}
        <RawRequestDetails toolInput={toolInput} />
        <ApprovalProvenanceBlock pending={pending} />
      </div>
    </details>
  )
}

function formatApprovalInputValue(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
