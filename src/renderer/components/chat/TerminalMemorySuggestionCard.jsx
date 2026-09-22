import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import PromptSurface from '../ui/PromptSurface.jsx'

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function resolveArchiveLabel(archive = {}, fallbackLabel = 'Terminal session') {
  return asTrimmedString(
    archive?.sessionTitle
    || archive?.displayName
    || archive?.displayLabelPrimary
    || archive?.sessionId,
  ) || fallbackLabel
}

export default function TerminalMemorySuggestionCard({
  archive = null,
  busy = false,
  onSave = async () => {},
  onDismiss = async () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  const sessionId = asTrimmedString(archive?.sessionId)
  const summary = asTrimmedString(archive?.memoryCandidateSummary)
  const [scope, setScope] = React.useState('thread')
  React.useEffect(() => setScope('thread'), [sessionId])
  if (!sessionId || !summary) return null

  return (
    <PromptSurface
      tone="decision"
      className="mb-2 px-3 py-2.5"
      aria-label={t('core:terminal.memorySuggestion.title', { defaultValue: 'Save terminal insight?' })}
      data-ui="terminal-memory-suggestion-card"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="font-display text-xs font-semibold text-text-primary">
              {t('core:terminal.memorySuggestion.title', { defaultValue: 'Save terminal insight?' })}
            </h3>
            <span className="truncate text-[11px] text-text-tertiary" title={resolveArchiveLabel(archive, t('core:terminal.common.terminalTitle', { defaultValue: 'Terminal' }))}>
              {resolveArchiveLabel(archive, t('core:terminal.common.terminalTitle', { defaultValue: 'Terminal' }))}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{summary}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor={`terminal-memory-scope-${sessionId}`}>
            {t('core:terminal.memorySuggestion.scopeLabel', { defaultValue: 'Memory scope' })}
          </label>
          <select
            id={`terminal-memory-scope-${sessionId}`}
            aria-label={t('core:terminal.memorySuggestion.scopeLabel', { defaultValue: 'Memory scope' })}
            value={scope}
            disabled={busy}
            onChange={(event) => setScope(event.target.value)}
            className="min-h-7 rounded-md border border-surface-border bg-surface-panel px-2 font-display text-xs text-text-secondary outline-none transition-colors hover:border-border-hover focus-visible:ring-1 focus-visible:ring-border-strong disabled:opacity-45"
          >
            <option value="thread">{t('core:terminal.dock.browser.actions.threadMemory', { defaultValue: 'Thread memory' })}</option>
            <option value="project">{t('core:terminal.memorySuggestion.projectMemory', { defaultValue: 'Project memory' })}</option>
          </select>
          <ActionButton
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void onSave(sessionId, scope)}
          >
            {t('core:terminal.memorySuggestion.save', { defaultValue: 'Save insight' })}
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void onDismiss(sessionId)}
          >
            {t('core:terminal.dock.browser.actions.dismiss', { defaultValue: 'Dismiss' })}
          </ActionButton>
        </div>
      </div>
    </PromptSurface>
  )
}
