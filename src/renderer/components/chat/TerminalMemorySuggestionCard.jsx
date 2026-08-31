import React from 'react'
import ActionButton from '../ui/ActionButton.jsx'
import PromptSurface from '../ui/PromptSurface.jsx'

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function resolveArchiveLabel(archive = {}) {
  return asTrimmedString(
    archive?.sessionTitle
    || archive?.displayName
    || archive?.displayLabelPrimary
    || archive?.sessionId,
  ) || 'Terminal session'
}

export default function TerminalMemorySuggestionCard({
  archive = null,
  busy = false,
  onSave = async () => {},
  onDismiss = async () => {},
}) {
  const sessionId = asTrimmedString(archive?.sessionId)
  const summary = asTrimmedString(archive?.memoryCandidateSummary)
  const reason = asTrimmedString(archive?.memoryCandidateReason)
  if (!sessionId || !summary) return null

  return (
    <PromptSurface
      tone="decision"
      className="text-sm"
      aria-label="Terminal memory suggestion"
      data-ui="terminal-memory-suggestion-card"
    >
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase text-accent">
            Post-close suggestion
          </p>
          <h3 className="text-base font-semibold text-text-primary">
            Save this terminal insight to Memory?
          </h3>
          <p className="text-xs text-text-secondary">
            {resolveArchiveLabel(archive)}
          </p>
        </div>

        <div className="rounded-lg border border-surface-border bg-surface px-3 py-3">
          <p className="text-sm font-medium text-text-primary">
            {summary}
          </p>
          {reason && (
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {reason}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            type="button"
            variant="primary"
            size="md"
            disabled={busy}
            aria-label="Save terminal memory suggestion to thread memory"
            onClick={() => void onSave(sessionId, 'thread')}
          >
            Save to thread memory
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            size="md"
            disabled={busy}
            aria-label="Save terminal memory suggestion to project memory"
            onClick={() => void onSave(sessionId, 'project')}
          >
            Save to project memory
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            size="md"
            disabled={busy}
            aria-label="Dismiss terminal memory suggestion"
            onClick={() => void onDismiss(sessionId)}
          >
            Dismiss
          </ActionButton>
        </div>
      </div>
    </PromptSurface>
  )
}
