import React, { useCallback, useEffect, useState } from 'react'
import { flattenOutlineRows, normalizeOutlineState } from './editor-monaco-helpers.mjs'
import { buildLocalizedEditorCapabilityMessage } from './editor-setup-hints.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import {
  EDITOR_OUTLINE_PANEL_COLLAPSED_WIDTH,
  EDITOR_OUTLINE_PANEL_WIDTH,
  countProblemsBySeverity,
  problemMatchesFilter,
  problemSeverityMeta,
  readProblemsPanelDefaultCollapsed,
  writeProblemsPanelDefaultCollapsed,
} from './editor-diagnostics-panel-utils.mjs'

const EDITOR_OUTLINE_FILTER_INPUT_ID = 'editor-outline-filter-input'

export function ProblemsPanel({
  filePath,
  problems = [],
  onSelectProblem,
  collapsed: controlledCollapsed,
  onToggleCollapsed,
}) {
  const { t } = useRendererTranslation(['core'])
  const [defaultCollapsed, setDefaultCollapsed] = useState(readProblemsPanelDefaultCollapsed)
  const [internalCollapsed, setInternalCollapsed] = useState(readProblemsPanelDefaultCollapsed)
  const collapsed = typeof controlledCollapsed === 'boolean' ? controlledCollapsed : internalCollapsed
  const setCollapsed = useCallback((valueOrUpdater) => {
    const next = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(collapsed)
      : !!valueOrUpdater
    if (typeof onToggleCollapsed === 'function') {
      onToggleCollapsed(next)
      return
    }
    setInternalCollapsed(next)
  }, [collapsed, onToggleCollapsed])
  const [filter, setFilter] = useState('all')
  const counts = countProblemsBySeverity(problems)
  const total = counts.total
  const fileName = filePath?.split(/[\\/]/).pop() || t('editor.diagnostics.currentFile', { defaultValue: 'Current file' })
  const filteredProblems = problems.filter(problem => problemMatchesFilter(problem, filter))
  const filters = [
    { id: 'all', label: t('editor.diagnostics.filters.all', { defaultValue: 'All' }), count: total },
    { id: 'error', label: t('editor.diagnostics.filters.errors', { defaultValue: 'Errors' }), count: counts.error },
    { id: 'warning', label: t('editor.diagnostics.filters.warnings', { defaultValue: 'Warnings' }), count: counts.warning },
    { id: 'info', label: t('editor.diagnostics.filters.info', { defaultValue: 'Info' }), count: counts.info },
  ]
  const localizeSeverityLabel = useCallback((label = '') => {
    const normalized = String(label || '').trim().toLowerCase()
    if (normalized === 'error') return t('editor.diagnostics.severity.error', { defaultValue: 'Error' })
    if (normalized === 'warning') return t('editor.diagnostics.severity.warning', { defaultValue: 'Warning' })
    if (normalized === 'info') return t('editor.diagnostics.severity.info', { defaultValue: 'Info' })
    if (normalized === 'hint') return t('editor.diagnostics.severity.hint', { defaultValue: 'Hint' })
    return label
  }, [t])

  useEffect(() => {
    writeProblemsPanelDefaultCollapsed(defaultCollapsed)
  }, [defaultCollapsed])

  return (
    <div className="shrink-0 border-t border-surface-border bg-surface">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary shrink-0">
            {t('editor.diagnostics.problems.title', { defaultValue: 'Problems' })}
          </p>
          <span className="text-xs text-text-muted truncate" title={filePath || undefined}>{fileName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          {counts.error > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-danger-border bg-danger-bg text-danger-soft">
              {t('editor.diagnostics.problems.errorCount', {
                defaultValue: '{{count}} error{{suffix}}',
                count: counts.error,
                suffix: counts.error === 1 ? '' : 's',
              })}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-warning-border bg-warning-bg text-warning-soft">
              {t('editor.diagnostics.problems.warningCount', {
                defaultValue: '{{count}} warning{{suffix}}',
                count: counts.warning,
                suffix: counts.warning === 1 ? '' : 's',
              })}
            </span>
          )}
          {counts.info > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-info-border bg-info-bg text-info-soft">
              {t('editor.diagnostics.problems.infoCount', {
                defaultValue: '{{count}} info',
                count: counts.info,
              })}
            </span>
          )}
          {total === 0 && (
            <span className="px-1.5 py-0.5 rounded border border-surface-border bg-surface-panel text-text-muted">
              {t('editor.diagnostics.problems.none', { defaultValue: 'No problems' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-surface-border bg-surface-panel text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
            aria-expanded={!collapsed}
            title={collapsed
              ? t('editor.diagnostics.problems.expandTitle', { defaultValue: 'Expand Problems panel' })
              : t('editor.diagnostics.problems.collapseTitle', { defaultValue: 'Collapse Problems panel' })}
          >
            <span>{collapsed
              ? t('editor.diagnostics.common.expand', { defaultValue: 'Expand' })
              : t('editor.diagnostics.common.collapse', { defaultValue: 'Collapse' })}</span>
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`w-2.5 h-2.5 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            >
              <polyline points="3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setDefaultCollapsed((prev) => {
                const next = !prev
                setCollapsed(next)
                return next
              })
            }}
            aria-pressed={defaultCollapsed}
            title={t('editor.diagnostics.problems.setDefaultStateTitle', {
              defaultValue: 'Set Problems panel default state',
            })}
            className={[
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
              defaultCollapsed
                ? 'border-accent-muted bg-accent-muted/12 text-accent-soft'
                : 'border-surface-border bg-surface-panel text-text-muted hover:text-text-primary hover:border-border-hover',
            ].join(' ')}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${defaultCollapsed ? 'bg-accent-soft' : 'bg-surface-border'}`} />
            <span>{t('editor.diagnostics.problems.defaultCollapsed', { defaultValue: 'Default collapsed' })}</span>
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="border-t border-surface-border">
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-surface-border">
            {filters.map((item) => {
              const active = filter === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  aria-pressed={active}
                  className={[
                    'text-[10px] px-2 py-1 rounded-md border transition-colors',
                    active
                      ? 'border-accent-muted bg-accent-muted/12 text-accent-soft'
                      : 'border-surface-border bg-surface-panel text-text-muted hover:text-text-primary hover:border-border-hover',
                  ].join(' ')}
                >
                  {item.label} {item.count}
                </button>
              )
            })}
          </div>
          {total > 0 ? (
            <div className="max-h-40 overflow-y-auto">
              <div className="divide-y divide-surface-border">
                {filteredProblems.length > 0 ? (
                  filteredProblems.map((problem) => {
                    const sev = problemSeverityMeta(problem.severity)
                    return (
                      <button
                        key={problem.id}
                        type="button"
                        onClick={() => onSelectProblem?.(problem)}
                        className="w-full text-left px-3 py-2 hover:bg-surface-panel transition-colors"
                        title={`${problem.source}${problem.code ? ` (${problem.code})` : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${sev.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className={`text-[10px] uppercase tracking-wide ${sev.text}`}>{localizeSeverityLabel(sev.label)}</span>
                              <span className="text-[10px] text-text-tertiary font-mono">
                                L{problem.startLineNumber}:C{problem.startColumn}
                              </span>
                              {(problem.source || problem.code) && (
                                <span className="text-[10px] text-text-tertiary truncate">
                                  {problem.source}{problem.code ? ` - ${problem.code}` : ''}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-text-secondary leading-relaxed line-clamp-2">
                              {problem.message}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="px-3 py-3 text-xs text-text-tertiary">
                    {t('editor.diagnostics.problems.noMatch', { defaultValue: 'No problems match the current filter.' })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-text-tertiary">
              {t('editor.diagnostics.problems.noneInFile', { defaultValue: 'No problems in this file.' })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function OutlinePanel({
  filePath,
  outline,
  onSelectSymbol,
  collapsed: controlledCollapsed,
  onToggleCollapsed,
  setupHints = [],
  onDismissSetupHint,
}) {
  const { t } = useRendererTranslation(['core'])
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = typeof controlledCollapsed === 'boolean' ? controlledCollapsed : internalCollapsed
  const setCollapsed = useCallback((valueOrUpdater) => {
    const next = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(collapsed)
      : !!valueOrUpdater
    if (typeof onToggleCollapsed === 'function') {
      onToggleCollapsed(next)
      return
    }
    setInternalCollapsed(next)
  }, [collapsed, onToggleCollapsed])
  const [filter, setFilter] = useState('')
  const state = normalizeOutlineState(outline)
  const fileName = filePath?.split(/[\\/]/).pop() || t('editor.diagnostics.currentFile', { defaultValue: 'Current file' })
  const allRows = flattenOutlineRows(state.items)
  const query = filter.trim().toLowerCase()
  const rows = query
    ? allRows.filter((row) => (
      row.name.toLowerCase().includes(query)
      || String(row.kindLabel || '').toLowerCase().includes(query)
      || String(row.kind || '').toLowerCase().includes(query)
    ))
    : allRows
  const visibleSetupHints = Array.isArray(setupHints) ? setupHints : []
  const localizeSetupActionLabel = useCallback((hint = {}) => {
    if (String(hint?.capabilityKey || '').trim() === 'codeActions') {
      return t('editor.tabBar.fix', { defaultValue: 'Fix' })
    }
    return t('editor.tabBar.format', { defaultValue: 'Format' })
  }, [t])
  const localizeSymbolLabel = useCallback((label = '') => (
    label || t('editor.diagnostics.outline.symbolFallback', { defaultValue: 'Symbol' })
  ), [t])
  const localizeSetupHintMessage = useCallback((hint = {}) => (
    buildLocalizedEditorCapabilityMessage({
      t,
      capabilityKey: hint?.capabilityKey,
      capability: hint,
    }) || hint?.message || ''
  ), [t])
  const localizeOutlineStateMessage = useCallback((nextState = {}) => (
    buildLocalizedEditorCapabilityMessage({
      t,
      capabilityKey: 'symbols',
      capability: nextState,
      context: 'outline',
    }) || nextState?.message || ''
  ), [t])

  const outlinePanelWidth = collapsed ? EDITOR_OUTLINE_PANEL_COLLAPSED_WIDTH : EDITOR_OUTLINE_PANEL_WIDTH

  return (
    <div
      className="shrink-0 border-l border-surface-border bg-surface flex flex-col overflow-hidden transition-[width] duration-150"
      style={{ width: `${outlinePanelWidth}px` }}
    >
      <div className={`flex items-center gap-2 px-2.5 py-2 border-b border-surface-border shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">
              {t('editor.diagnostics.outline.title', { defaultValue: 'Outline' })}
            </p>
            <p className="text-[10px] text-text-muted truncate" title={filePath || undefined}>{fileName}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="inline-flex items-center justify-center w-6 h-6 rounded border border-surface-border bg-surface-panel text-text-muted hover:text-text-primary hover:border-border-hover transition-colors shrink-0"
          title={collapsed
            ? t('editor.diagnostics.outline.expandTitle', { defaultValue: 'Expand outline' })
            : t('editor.diagnostics.outline.collapseTitle', { defaultValue: 'Collapse outline' })}
          aria-label={collapsed
            ? t('editor.diagnostics.outline.expandTitle', { defaultValue: 'Expand outline' })
            : t('editor.diagnostics.outline.collapseTitle', { defaultValue: 'Collapse outline' })}
          aria-expanded={!collapsed}
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-180'}`}>
            <polyline points="4.25 2.5 7.75 6 4.25 9.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="px-2.5 py-2 border-b border-surface-border shrink-0">
            <label htmlFor={EDITOR_OUTLINE_FILTER_INPUT_ID} className="sr-only">
              {t('editor.diagnostics.outline.filterSymbols', { defaultValue: 'Filter symbols' })}
            </label>
            <input
              id={EDITOR_OUTLINE_FILTER_INPUT_ID}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('editor.diagnostics.outline.filterSymbols', { defaultValue: 'Filter symbols' })}
              aria-label={t('editor.diagnostics.outline.filterSymbols', { defaultValue: 'Filter symbols' })}
              className="w-full h-7 rounded-md border border-surface-border bg-surface-panel px-2 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
            />
          </div>
          <div className="px-2.5 py-2 border-b border-surface-border text-[10px] text-text-tertiary shrink-0 flex items-center justify-between gap-2">
            <span>{t('editor.diagnostics.outline.symbolCount', {
              defaultValue: '{{count}} symbol{{suffix}}',
              count: rows.length,
              suffix: rows.length === 1 ? '' : 's',
            })}</span>
            {state.loading && <span className="text-accent-soft">{t('editor.diagnostics.outline.refreshing', { defaultValue: 'Refreshing...' })}</span>}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {visibleSetupHints.length > 0 && (
              <div className="px-2.5 py-2 border-b border-surface-border">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                    {t('editor.diagnostics.outline.setupTitle', { defaultValue: 'Setup' })}
                  </p>
                  <span className="text-[10px] text-text-tertiary">{t('editor.diagnostics.outline.hintCount', {
                    defaultValue: '{{count}} hint{{suffix}}',
                    count: visibleSetupHints.length,
                    suffix: visibleSetupHints.length === 1 ? '' : 's',
                  })}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {visibleSetupHints.map((hint) => (
                    <div
                      key={hint.id}
                      className="rounded-lg border border-info-border bg-info-bg px-2.5 py-2"
                    >
                      {(() => {
                        const actionLabel = localizeSetupActionLabel(hint)
                        const dismissSetupHintTitle = t('editor.diagnostics.outline.dismissSetupHintTitle', {
                          defaultValue: `Dismiss ${actionLabel.toLowerCase()} setup hint`,
                          actionLabel: actionLabel.toLowerCase(),
                        })
                        return (
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-wide text-info-soft">{actionLabel}</span>
                            <span className="rounded border border-surface-border bg-surface-panel px-1.5 py-0.5 text-[10px] text-text-secondary">
                              {hint.providerLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-text-secondary leading-relaxed">
                            {localizeSetupHintMessage(hint)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDismissSetupHint?.(hint)}
                          className="shrink-0 rounded border border-surface-border bg-surface-panel px-1.5 py-0.5 text-[10px] text-text-muted hover:border-border-hover hover:text-text-primary transition-colors"
                          title={dismissSetupHintTitle}
                        >
                          {t('editor.panel.dismiss', { defaultValue: 'Dismiss' })}
                        </button>
                      </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!state.supported ? (
              <div className="px-3 py-3 text-xs text-text-tertiary leading-relaxed">
                {localizeOutlineStateMessage(state) || t('editor.diagnostics.outline.unavailableForFileType', {
                  defaultValue: 'Outline is not available for this file type yet.',
                })}
              </div>
            ) : !state.available && state.loading ? (
              <div className="px-3 py-3 text-xs text-text-tertiary">
                {t('editor.diagnostics.outline.loadingSymbols', { defaultValue: 'Loading symbols...' })}
              </div>
            ) : !state.available ? (
              <div className="px-3 py-3 text-xs text-text-tertiary leading-relaxed">
                {localizeOutlineStateMessage(state) || t('editor.diagnostics.outline.noneAvailable', { defaultValue: 'No outline available.' })}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-3 py-3 text-xs text-text-tertiary">
                {query
                  ? t('editor.diagnostics.outline.noMatch', { defaultValue: 'No symbols match the current filter.' })
                  : t('editor.diagnostics.outline.noneDetected', { defaultValue: 'No symbols detected in this file.' })}
              </div>
            ) : (
              <div className="py-1">
                {rows.map((row) => {
                  const active = row.id === state.activeId
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onSelectSymbol?.(row)}
                      className={[
                        'w-full text-left pr-2 py-1.5 transition-colors',
                        active
                          ? 'bg-accent-muted/12 text-accent-soft'
                          : 'text-text-secondary hover:bg-surface-panel hover:text-text-primary',
                      ].join(' ')}
                      style={{ paddingLeft: `${10 + row.depth * 14}px` }}
                      title={`${localizeSymbolLabel(row.kindLabel)} - L${row.selectionLineNumber || row.startLineNumber}:C${row.selectionColumn || row.startColumn}`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className={`mt-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded border text-[9px] uppercase font-semibold leading-none shrink-0 ${row.kindBadge?.className || 'border-surface-border bg-surface-panel text-text-muted'}`}>
                          {row.kindBadge?.label || 's'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs truncate">{row.name}</span>
                            {Array.isArray(row.modifiers) && row.modifiers.includes('export') && (
                              <span className="text-[9px] px-1 py-0.5 rounded border border-info-border bg-info-bg text-info-soft shrink-0">
                                export
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-tertiary">
                            <span>{localizeSymbolLabel(row.kindLabel)}</span>
                            <span className="font-mono">L{row.startLineNumber}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
