import React, { useEffect, useMemo, useRef, useState } from 'react'
import useToolStore from '../store/useToolStore.js'
import useAppStore from '../store/useAppStore.js'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import {
  getBrowserActionPolicyView,
  getRunCommandPolicyView,
  getTerminalSessionPolicyView,
} from './tool-approval-policy-view.mjs'
import { DIALOG_Z_ELEVATED } from './dialog-layering.mjs'
import { computeLineDiff } from './diff/line-diff.mjs'
import { DiffLine, DiffStats, DIFF_LINE_RAIL_TRACK } from './diff/DiffComponents.jsx'
import {
  ApprovalDetailsDisclosure,
  ApprovalIntentSummary,
} from './ToolApprovalOverlayDecisionDetails.jsx'
import ActionButton from './ui/ActionButton.jsx'
import { resolveApprovalKeyboardAction } from './tool-approval-keyboard.mjs'

/**
 * ToolApprovalOverlay — intercepts tool call requests from the AI and
 * presents them to the user for approval before anything touches the filesystem.
 *
 * For write_file: shows a line-by-line diff (old vs new) instead of raw content.
 * For other tools: shows the tool input args as before.
 *
 * Mounted globally in App.jsx so it's always available regardless of active panel.
 */
export default function ToolApprovalOverlay() {
  const { t } = useRendererTranslation(['core', 'settings'])
  const activeThreadId = useAppStore((s) => s.activeThreadId)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const pending = useToolStore((s) => s.getPendingForThread(activeThreadId))
  const approvalActionsById = useToolStore((s) => s.approvalActionsById)
  const setPending = useToolStore((s) => s.setPending)
  const clearPending = useToolStore((s) => s.clearPending)
  const approve = useToolStore((s) => s.approve)
  const approveForSession = useToolStore((s) => s.approveForSession)
  const approveHostInstallFallback = useToolStore((s) => s.approveHostInstallFallback)
  const approveHostFullAccess = useToolStore((s) => s.approveHostFullAccess)
  const approveHostFullAccessThisTurn = useToolStore((s) => s.approveHostFullAccessThisTurn)
  const approveWslCompatibility = useToolStore((s) => s.approveWslCompatibility)
  const deny = useToolStore((s) => s.deny)
  const addHistory = useToolStore((s) => s.addHistory)
  const [remainingMs, setRemainingMs] = useState(0)
  const keyboardActionLockedRef = useRef(false)
  const overlayDialogRef = useRef(null)
  const previousFocusedElementRef = useRef(null)

  useEffect(() => {
    const approvalApi = window?.addom?.tool
    if (!approvalApi || typeof approvalApi.onApprovalRequest !== 'function') return () => { }
    const unsub = approvalApi.onApprovalRequest((data) => {
      setPending(data)
    })
    return unsub
  }, [setPending])

  useEffect(() => {
    const chatApi = window?.addom?.chat
    if (!chatApi || typeof chatApi.onToolResult !== 'function') return () => { }
    const unsub = chatApi.onToolResult((data) => {
      addHistory(data)
      const approvalId = String(data?.approvalId ?? '').trim()
      if (!approvalId) return
      clearPending({
        approvalId,
        threadId: String(data?.threadId || '').trim(),
      })
    })
    return unsub
  }, [addHistory, clearPending])

  useEffect(() => {
    const chatApi = window?.addom?.chat
    if (!chatApi || typeof chatApi.onCancelled !== 'function') return () => { }
    const unsub = chatApi.onCancelled((data = {}) => {
      const approvalId = String(data?.approvalId || '').trim()
      const threadId = String(data?.threadId || '').trim()
      if (!approvalId && !threadId) {
        clearPending()
        return
      }
      clearPending({ approvalId, threadId })
    })
    return unsub
  }, [clearPending])

  useEffect(() => {
    if (!pending?.approvalId) {
      setRemainingMs(0)
      return undefined
    }
    const expiresAt = Number(pending?.expiresAt || 0)
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      setRemainingMs(0)
      return undefined
    }

    const tick = () => {
      const diff = Math.max(0, expiresAt - Date.now())
      setRemainingMs(diff)
    }
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [pending?.approvalId, pending?.expiresAt])

  useEffect(() => {
    keyboardActionLockedRef.current = false
  }, [pending?.approvalId])

  useEffect(() => {
    if (!pending?.approvalId) return undefined
    const previous = document?.activeElement
    previousFocusedElementRef.current = previous instanceof HTMLElement ? previous : null
    const timer = setTimeout(() => {
      try {
        overlayDialogRef.current?.focus?.()
      } catch {
        // Best effort focus only.
      }
    }, 0)
    return () => {
      clearTimeout(timer)
      try {
        previousFocusedElementRef.current?.focus?.()
      } catch {
        // Best effort restore only.
      }
    }
  }, [pending?.approvalId])

  useEffect(() => {
    if (!pending) return
    const { approvalId } = pending
    const runCommandPolicyView = getRunCommandPolicyView(pending, t)
    const browserActionPolicyView = getBrowserActionPolicyView(pending, t)
    const terminalSessionPolicyView = getTerminalSessionPolicyView(pending, t)
    const enterApprovalDisabled = !!(
      runCommandPolicyView?.actionsVariant?.requireExplicitHostFullAccess
      || runCommandPolicyView?.actionsVariant?.requireExplicitWslCompatibilityApproval
      || browserActionPolicyView?.actionsVariant?.requireExplicitHostFullAccess
      || browserActionPolicyView?.actionsVariant?.requireExplicitWslCompatibilityApproval
      || terminalSessionPolicyView?.actionsVariant?.requireExplicitHostFullAccess
      || terminalSessionPolicyView?.actionsVariant?.requireExplicitWslCompatibilityApproval
    )
    const isExpired = () => {
      const expiresAt = Number(pending?.expiresAt || 0)
      return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt
    }

    const onKeyDown = (e) => {
      const action = resolveApprovalKeyboardAction({
        event: e,
        expired: isExpired(),
        enterApprovalDisabled,
        keyboardLocked: keyboardActionLockedRef.current,
      })
      if (action === 'none') return
      e.preventDefault()
      keyboardActionLockedRef.current = true
      if (action === 'approve') {
        approve(approvalId)
      } else if (action === 'deny') {
        deny(approvalId)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending, approve, deny, t])

  if (!pending) return null

  const { approvalId, toolName, toolInput, meta, prevContent } = pending
  const approvalAction = approvalActionsById?.[approvalId] || null
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
  const remainingMin = Math.floor(remainingSec / 60)
  const remainingRemainder = remainingSec % 60
  const countdownText = `${remainingMin}:${String(remainingRemainder).padStart(2, '0')}`
  const approvalExpired = remainingSec <= 0 && Number(pending?.expiresAt || 0) > 0
  const countdownClass = remainingSec <= 30
    ? 'text-danger-soft'
    : remainingSec <= 60
      ? 'text-warning-soft'
      : 'text-text-muted'
  const isAccountFileChangeReview = (
    toolName === 'file_change'
    || Array.isArray(pending?.changes)
    || Array.isArray(toolInput?.changes)
  )
  const isDiffTool = (
    toolName === 'write_file'
    || toolName === 'apply_artifact_revision'
    || toolName === 'apply_patch'
    || isAccountFileChangeReview
  )
  const runCommandPolicyView = getRunCommandPolicyView(pending, t)
  const browserActionPolicyView = getBrowserActionPolicyView(pending, t)
  const terminalSessionPolicyView = getTerminalSessionPolicyView(pending, t)
  const openCommandSafetySettings = (id) => {
    try {
      setActivePanel?.('settings')
    } catch {
      // Non-fatal UI convenience action.
    }
    deny(id)
  }

  return (
    <ToolApprovalOverlayDialog
      pending={pending}
      remainingMs={remainingMs}
      approve={approve}
      approveForSession={approveForSession}
      approveHostInstallFallback={approveHostInstallFallback}
      approveHostFullAccess={approveHostFullAccess}
      approveHostFullAccessThisTurn={approveHostFullAccessThisTurn}
      approveWslCompatibility={approveWslCompatibility}
      deny={deny}
      openCommandSafetySettings={openCommandSafetySettings}
      toolName={toolName}
      toolInput={toolInput}
      meta={meta}
      prevContent={prevContent}
      approvalId={approvalId}
      approvalExpired={approvalExpired}
      approvalAction={approvalAction}
      countdownClass={countdownClass}
      countdownText={countdownText}
      isDiffTool={isDiffTool}
      isAccountFileChangeReview={isAccountFileChangeReview}
      runCommandPolicyView={runCommandPolicyView}
      browserActionPolicyView={browserActionPolicyView}
      terminalSessionPolicyView={terminalSessionPolicyView}
      overlayDialogRef={overlayDialogRef}
    />
  )
}

export function ToolApprovalOverlayDialog({
  pending,
  remainingMs,
  approve,
  approveForSession,
  approveHostInstallFallback,
  approveHostFullAccess,
  approveHostFullAccessThisTurn,
  approveWslCompatibility,
  deny,
  openCommandSafetySettings,
  toolName,
  toolInput,
  meta,
  prevContent,
  approvalId,
  approvalExpired,
  approvalAction,
  countdownClass,
  countdownText,
  isDiffTool,
  isAccountFileChangeReview,
  runCommandPolicyView,
  browserActionPolicyView,
  terminalSessionPolicyView,
  overlayDialogRef,
}) {
  const { t } = useRendererTranslation(['core'])
  void remainingMs
  const allowForSessionAvailable = Array.isArray(pending?.availableDecisions)
    && pending.availableDecisions.some((value) => String(value || '').trim().toLowerCase() === 'acceptforsession')
  const approvalSubmitting = String(approvalAction?.status || '').trim().toLowerCase() === 'submitting'
  const approvalFailedMessage = String(approvalAction?.status || '').trim().toLowerCase() === 'failed'
    ? String(approvalAction?.message || '').trim()
    : ''
  const allowDisabled = approvalExpired || approvalSubmitting || !!runCommandPolicyView?.actionsVariant?.disableDefaultAllow
  const allowLabel = runCommandPolicyView?.actionsVariant?.disableDefaultAllow
    ? t('core:toolApprovalOverlay.production.allowDisabled', { defaultValue: 'Choose explicit action' })
    : t('core:toolApprovalOverlay.production.allow', { defaultValue: 'Allow' })
  const allowTitle = runCommandPolicyView?.actionsVariant?.disableDefaultAllow
    ? (
      runCommandPolicyView?.actionsVariant?.requireExplicitWslCompatibilityApproval
        ? t('core:toolApprovalOverlay.actions.allowDisabledWslTitle', { defaultValue: 'Use explicit WSL compatibility approval for this command' })
        : t('core:toolApprovalOverlay.actions.allowDisabledHostTitle', { defaultValue: 'Use explicit host full access action for this command' })
    )
    : t('core:toolApprovalOverlay.actions.allowTitle', { defaultValue: 'Allow (Enter)' })

  return (
    <div className={`fixed inset-0 ${DIALOG_Z_ELEVATED} flex items-center justify-center bg-overlay-scrim px-4 backdrop-blur-sm`}>
      <div
        ref={overlayDialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={String(meta?.label || toolName || 'Tool approval')}
        data-ui="tool-approval-dialog"
        className="flex w-full max-w-md max-h-[85vh] flex-col rounded-2xl bg-surface-panel px-4 py-3.5 text-text-primary shadow-[0_22px_64px_rgb(var(--theme-shadow-rgb)_/_0.45)] focus:outline-none"
      >
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto">
          <ApprovalIntentSummary
            pending={pending}
            toolName={toolName}
            toolInput={toolInput}
            meta={meta}
            countdownText={countdownText}
            countdownClass={countdownClass}
            runCommandPolicyView={runCommandPolicyView}
            browserActionPolicyView={browserActionPolicyView}
            terminalSessionPolicyView={terminalSessionPolicyView}
          />
          {isDiffTool ? (
            isAccountFileChangeReview ? (
              <AccountFileChangeReviewView
                changes={pending?.changes || toolInput?.changes || []}
                grantRoot={pending?.grantRoot || toolInput?.grantRoot || ''}
              />
            ) : (
              <WriteDiffView
                filePath={toolInput.path || `revision:${String(toolInput.revision_id || 'unknown')}`}
                prevContent={prevContent}
                newContent={toolInput.content ?? ''}
              />
            )
          ) : null}
          <ApprovalDetailsDisclosure
            pending={pending}
            toolInput={toolInput}
            runCommandPolicyView={runCommandPolicyView}
            browserActionPolicyView={browserActionPolicyView}
            terminalSessionPolicyView={terminalSessionPolicyView}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1 shrink-0">
          {(approvalFailedMessage || approvalSubmitting || approvalExpired
            || runCommandPolicyView?.actionsVariant?.requireExplicitHostFullAccess
            || runCommandPolicyView?.actionsVariant?.requireExplicitWslCompatibilityApproval) && (
            <p className="mr-auto min-w-40 text-xs text-text-tertiary">
              {approvalFailedMessage
                ? approvalFailedMessage
                : approvalSubmitting
                  ? t('core:toolApprovalOverlay.footer.submitting', { defaultValue: 'Submitting approval...' })
                  : approvalExpired
                ? t('core:toolApprovalOverlay.footer.expired', { defaultValue: 'Approval expired' })
                : t('core:toolApprovalOverlay.production.explicitActionRequired', { defaultValue: 'Use an explicit approval action for this request.' })}
            </p>
          )}
          <ActionButton
            onClick={() => deny(approvalId)}
            disabled={approvalSubmitting}
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 border-transparent px-2.5 leading-none"
            title={t('core:toolApprovalOverlay.actions.deny', { defaultValue: 'Deny (Esc)' })}
          >
            <span className="leading-none">{t('core:toolApprovalOverlay.production.deny', { defaultValue: 'Deny' })}</span>
            <ApprovalShortcutEscChip />
          </ActionButton>
          {allowForSessionAvailable && (
            <ActionButton
              onClick={() => approveForSession(approvalId)}
              disabled={approvalExpired || approvalSubmitting}
              variant="ghost"
              size="sm"
              className="h-7 border-transparent px-2.5 leading-none"
              title={t('core:toolApprovalOverlay.actions.allowForSessionTitle', { defaultValue: 'Allow and remember this approval for the current app session when supported' })}
            >
              {t('core:toolApprovalOverlay.production.allowForSession', { defaultValue: 'Allow for session' })}
            </ActionButton>
          )}
          {runCommandPolicyView?.actionsVariant?.showHostInstallFallback && (
            <ActionButton
              onClick={() => openCommandSafetySettings?.(approvalId)}
              disabled={approvalExpired || approvalSubmitting}
              variant="ghost"
              size="sm"
              className="h-7 border-transparent px-2.5 leading-none"
              title={t('core:toolApprovalOverlay.actions.openGuardrailsTitle', { defaultValue: 'Cancel this approval and open Guardrails settings' })}
            >
              {t('core:toolApprovalOverlay.production.openGuardrails', { defaultValue: 'Settings' })}
            </ActionButton>
          )}
          {runCommandPolicyView?.actionsVariant?.showHostInstallFallback && (
            <ActionButton
              onClick={() => approveHostInstallFallback(approvalId)}
              disabled={approvalExpired || approvalSubmitting}
              variant="ghost"
              size="sm"
              className="h-7 border-transparent px-2.5 leading-none text-warning-soft hover:text-warning"
              title={t('core:toolApprovalOverlay.actions.allowHostFallbackTitle', { defaultValue: 'Allow host fallback (one-shot)' })}
            >
              {t('core:toolApprovalOverlay.production.allowHostFallback', { defaultValue: 'Host fallback' })}
            </ActionButton>
          )}
          {runCommandPolicyView?.actionsVariant?.showHostFullAccessApproval && (
            <>
              {runCommandPolicyView?.actionsVariant?.showHostFullAccessTurnApproval && (
                <ActionButton
                  onClick={() => approveHostFullAccessThisTurn(approvalId)}
                  disabled={approvalExpired || approvalSubmitting}
                  variant="ghost"
                  size="sm"
                  className="h-7 border-transparent px-2.5 leading-none text-warning-soft hover:text-warning"
                  title={t('core:toolApprovalOverlay.actions.allowHostFullAccessThisTurnTitle', { defaultValue: 'Allow host full access for the rest of this turn' })}
                >
                  {t('core:toolApprovalOverlay.production.allowHostFullAccessThisTurn', { defaultValue: 'Host this turn' })}
                </ActionButton>
              )}
              <ActionButton
                onClick={() => approveHostFullAccess(approvalId)}
                disabled={approvalExpired || approvalSubmitting}
                variant="ghost"
                size="sm"
                className="h-7 border-transparent px-2.5 leading-none text-warning-soft hover:text-warning"
                title={t('core:toolApprovalOverlay.actions.allowHostFullAccessTitle', { defaultValue: 'Allow host full access (one-shot)' })}
              >
                {t('core:toolApprovalOverlay.production.allowHostFullAccess', { defaultValue: 'Host once' })}
              </ActionButton>
            </>
          )}
          {runCommandPolicyView?.actionsVariant?.showWslCompatibilityApproval && (
            <ActionButton
              onClick={() => approveWslCompatibility(approvalId)}
              disabled={approvalExpired || approvalSubmitting}
              variant="ghost"
              size="sm"
              className="h-7 border-transparent px-2.5 leading-none text-warning-soft hover:text-warning"
              title={t('core:toolApprovalOverlay.actions.allowWslCompatibilityTitle', { defaultValue: 'Allow a one-shot WSL compatibility run' })}
            >
              {t('core:toolApprovalOverlay.production.allowWslCompatibility', { defaultValue: 'WSL once' })}
            </ActionButton>
          )}
          <ActionButton
            onClick={() => approve(approvalId)}
            disabled={allowDisabled}
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 border-transparent bg-surface-panel-muted-strong px-2.5 leading-none text-text-primary hover:bg-surface-panel"
            title={allowTitle}
          >
            <span className="leading-none">{allowLabel}</span>
            {runCommandPolicyView?.actionsVariant?.disableDefaultAllow ? null : <ApprovalShortcutEnterChip />}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function AccountFileChangeReviewView({ changes = [], grantRoot = '' }) {
  const { t } = useRendererTranslation(['core'])
  const rows = Array.isArray(changes)
    ? changes.filter((change) => change && typeof change === 'object')
    : []

  return (
    <div className="space-y-3">
      {grantRoot && (
        <div className="rounded-lg border border-surface-border bg-surface-panel-alt px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-text-tertiary">{t('core:toolApprovalOverlay.review.grantedRoot', { defaultValue: 'Granted Root' })}</p>
          <p className="mt-1 break-all font-mono text-xs text-text-primary">{grantRoot}</p>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-surface-border bg-surface-panel-alt px-3 py-3">
          <p className="text-sm text-text-secondary">{t('core:toolApprovalOverlay.review.empty', { defaultValue: 'No file changes were included in this approval request.' })}</p>
        </div>
      ) : rows.map((change, index) => (
        <div key={`${change.path || 'change'}:${index}`} className="rounded-xl border border-surface-border bg-surface-panel-alt p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-text-tertiary">{t('core:toolApprovalOverlay.review.file', { defaultValue: 'File' })}</p>
            <p className="break-all font-mono text-xs text-text-primary">{change.path || t('core:toolApprovalOverlay.review.unknownPath', { defaultValue: '(unknown path)' })}</p>
            <span className="rounded-full border border-surface-border bg-surface-panel px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
              {String(change.kind || 'modify')}
            </span>
          </div>
          <div className="rounded-lg border border-surface-border bg-surface-panel">
            {String(change.diff || '').trim()
              ? (
                <pre className="m-0 max-h-[38vh] overflow-auto px-3 py-3 text-xs leading-5 text-text-primary">
                  <code>{String(change.diff || '')}</code>
                </pre>
              )
              : (
                <p className="px-3 py-3 text-xs text-text-muted">{t('core:toolApprovalOverlay.review.noDiff', { defaultValue: 'No diff was provided for this file change.' })}</p>
              )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Diff viewer ───────────────────────────────────────────────────────────────

/**
 * Simple line-by-line Myers diff displayed inline.
 * Green lines = additions, red lines = removals, grey = unchanged.
 * Unchanged runs are collapsed to 3 context lines around changes.
 */
function WriteDiffView({ filePath, prevContent, newContent }) {
  const { t } = useRendererTranslation(['core'])
  const diff = useMemo(
    () => computeLineDiff(prevContent ?? '', newContent ?? ''),
    [prevContent, newContent]
  )

  const isNewFile = prevContent === null || prevContent === ''

  const rows = useMemo(() => {
    const result = []
    diff.forEach((seg, si) => {
      seg.lines.forEach((line, li) => {
        result.push({
          key: `${si}-${li}`,
          type: seg.type,
          oldLine: line.oldLine,
          newLine: line.newLine,
          text: line.text,
          expandable: seg.type === 'ellipsis' && Array.isArray(seg.hiddenLines) && seg.hiddenLines.length > 0,
        })
      })
    })
    return result
  }, [diff])

  const lineNumberDigits = useMemo(() => {
    let largest = 0
    for (const row of rows) {
      largest = Math.max(largest, Number(row.oldLine || 0) || 0, Number(row.newLine || 0) || 0)
    }
    return Math.max(2, String(largest || 0).length)
  }, [rows])

  const gridTemplate = useMemo(
    () => `calc(${lineNumberDigits}ch + 1.75rem) ${DIFF_LINE_RAIL_TRACK} minmax(0, 1fr)`,
    [lineNumberDigits],
  )

  return (
    <div>
      {/* File path + status */}
      <div className="flex items-center gap-2 mb-2">
        <p className="text-text-muted text-xs uppercase tracking-wider">{t('core:toolApprovalOverlay.diff.file', { defaultValue: 'file' })}</p>
        <p className="text-text-primary text-xs font-mono">{filePath}</p>
        {isNewFile && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success-bg text-success">
            {t('core:toolApprovalOverlay.diff.newFile', { defaultValue: 'new file' })}
          </span>
        )}
      </div>

      {/* Diff */}
      <div className="bg-surface rounded-lg border border-surface-border overflow-auto max-h-[45vh] font-mono text-xs leading-5">
        {diff.length === 0 ? (
          <p className="text-text-muted px-4 py-3">{t('core:toolApprovalOverlay.diff.noChanges', { defaultValue: 'No changes detected.' })}</p>
        ) : (
          <pre className="m-0 px-1 py-1">
            <code className="block font-mono">
              {rows.map((row) => (
                <DiffLine
                  key={row.key}
                  type={row.type}
                  oldLine={row.oldLine}
                  newLine={row.newLine}
                  text={row.text}
                  gridTemplate={gridTemplate}
                  changeLabel={row.type === 'added'
                    ? t('core:chat.diff.addedLine', { defaultValue: 'Added line' })
                    : row.type === 'removed'
                      ? t('core:chat.diff.removedLine', { defaultValue: 'Removed line' })
                      : ''}
                />
              ))}
            </code>
          </pre>
        )}
      </div>

      {/* Stats */}
      <DiffStats diff={diff} />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ApprovalShortcutEscChip() {
  return (
    <span
      data-ui="approval-shortcut-esc"
      aria-hidden="true"
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-surface px-1 font-mono text-[10px] font-medium leading-none tracking-wide text-text-tertiary"
    >
      esc
    </span>
  )
}

function ApprovalShortcutEnterChip() {
  return (
    <span
      data-ui="approval-shortcut-enter"
      aria-hidden="true"
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-surface px-1 text-text-secondary"
    >
      <svg
        viewBox="0 0 12 12"
        className="block h-[11px] w-[11px] -translate-x-px"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.5 2.5v4H3.75" />
        <path d="M5.5 4.75 3.5 6.5l2 1.75" />
      </svg>
    </span>
  )
}
