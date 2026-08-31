import React from 'react'
import { formatDateTime } from '../../i18n/formatters.mjs'
import { sourceLabel, revisionProvenanceLabel } from './artifact-panel-labels.mjs'

export function FileRow({ file, onDelete, onOpenInEditor, onSelect, selected, t }) {
  const [hover, setHover] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState({ left: 8, top: 30 })
  const rootRef = React.useRef(null)
  const revisionCount = Number(file.total_revisions || 0)

  React.useEffect(() => {
    if (!menuOpen || typeof window === 'undefined') return undefined
    const onPointerDown = (event) => {
      const root = rootRef.current
      if (!root || root.contains(event.target)) return
      setMenuOpen(false)
    }
    const onEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onEscape)
    }
  }, [menuOpen])

  const openContextMenu = React.useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    const rowRect = rootRef.current?.getBoundingClientRect?.()
    if (rowRect) {
      const menuWidth = 164
      const menuHeight = 44
      const nextLeft = Math.max(8, Math.min(
        Math.round(event.clientX - rowRect.left),
        Math.max(8, Math.round(rowRect.width - menuWidth - 8)),
      ))
      const nextTop = Math.max(6, Math.min(
        Math.round(event.clientY - rowRect.top),
        Math.max(6, Math.round(rowRect.height - menuHeight - 6)),
      ))
      setMenuPosition({ left: nextLeft, top: nextTop })
    } else {
      setMenuPosition({ left: 8, top: 30 })
    }
    setMenuOpen(true)
  }, [])

  return (
    <div
      ref={rootRef}
      className={[
        'group relative flex items-start justify-between px-2 py-2 rounded text-xs font-mono transition-colors cursor-pointer',
        selected ? 'bg-surface-panel text-text-primary' : 'text-text-muted hover:bg-surface-panel-alt hover:text-text-primary',
      ].join(' ')}
      onClick={onSelect}
      onContextMenu={openContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate flex-1" title={file.file_path}>{file.file_path}</span>
          {file.latest_source === 'ai_suggestion' && (
            <span className="shrink-0 text-warning-soft text-[10px] font-semibold px-1 py-0.5 rounded bg-warning-bg/30 leading-none">
              {t('artifacts.suggestionBadge', { defaultValue: 'suggestion' })}
            </span>
          )}
        </div>
        <span className="text-text-tertiary block">
          {t(revisionCount === 1 ? 'artifacts.revisionCountOne' : 'artifacts.revisionCountOther', {
            defaultValue: revisionCount === 1 ? '{{count}} rev' : '{{count}} revs',
            count: revisionCount,
          })}
        </span>
      </div>
      {hover && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen(false)
            onDelete()
          }}
          title={t('artifacts.deleteFileHistoryTitle', { defaultValue: 'Delete all history for this file' })}
          className="shrink-0 ml-1 mt-0.5 text-danger hover:text-danger-soft transition-colors opacity-70 hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      )}
      {menuOpen && (
        <div
          role="menu"
          aria-label={t('artifacts.fileRow.menuTitle', { defaultValue: 'File actions' })}
          className="absolute z-20 min-w-40 rounded-md border border-surface-border bg-surface-raised p-1 shadow-[0_12px_20px_rgb(var(--theme-shadow-rgb)_/_0.35)]"
          style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen(false)
              onOpenInEditor?.()
            }}
            className="w-full rounded px-2 py-1.5 text-left text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary"
          >
            {t('artifacts.fileRow.openInEditor', { defaultValue: 'Open in editor' })}
          </button>
        </div>
      )}
    </div>
  )
}

export function FooterActions({ applying, baseRevId, headRevId, onApply, onRollback, revisions, rolling, t }) {
  const headRev = revisions.find((revision) => revision.id === headRevId)
  const baseRev = revisions.find((revision) => revision.id === baseRevId)
  const headIsSuggestion = headRev?.source === 'ai_suggestion'

  return (
    <div className="flex items-center gap-3">
      {headIsSuggestion ? (
        <>
          <p className="text-xs text-warning-soft">
            {t('artifacts.footer.suggestionPending', { defaultValue: 'This revision has not been written to disk yet' })}
          </p>
          <button onClick={onApply} disabled={!headRevId || applying} className="px-4 py-1.5 text-sm bg-success text-surface font-semibold rounded-lg hover:bg-success-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {applying ? t('artifacts.footer.applying', { defaultValue: 'Applying...' }) : t('artifacts.footer.apply', { defaultValue: 'Apply to disk' })}
          </button>
        </>
      ) : (
        <>
          {baseRevId && baseRevId !== '__empty__' && (
            <p className="text-xs text-text-tertiary">
              {t('artifacts.footer.rollbackNotice', { defaultValue: 'Rollback will restore rev {{rev}} to disk', rev: baseRev?.rev ?? '?' })}
            </p>
          )}
          <button onClick={onRollback} disabled={!baseRevId || baseRevId === '__empty__' || rolling} className="px-4 py-1.5 text-sm bg-warning text-surface font-semibold rounded-lg hover:bg-warning-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {rolling ? t('artifacts.footer.rollingBack', { defaultValue: 'Rolling back...' }) : t('artifacts.footer.rollback', { defaultValue: 'Rollback to base' })}
          </button>
        </>
      )}
    </div>
  )
}

export function RevPicker({ exclude, label, locale, onChange, revisions, t, value }) {
  return (
    <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} className="bg-surface-panel border border-surface-border text-text-primary text-xs rounded px-2 py-1 outline-none focus:border-accent/50">
      <option value="">{t('artifacts.picker.placeholder', { defaultValue: '- {{label}} -', label })}</option>
      <option value="__empty__">{t('artifacts.picker.empty', { defaultValue: '- new file (empty) -' })}</option>
      {revisions.filter((revision) => revision.id !== exclude).map((revision) => {
        const notOnDisk = revision.source === 'ai_suggestion' ? ` - ${t('artifacts.picker.notOnDisk', { defaultValue: 'not on disk' })}` : ''
        const provenance = revisionProvenanceLabel(t, revision, locale)
        const date = formatDateTime(revision.created_at, { locale, fallback: '', dateStyle: 'medium', timeStyle: 'short' })
        return (
          <option key={revision.id} value={revision.id}>
            {t(provenance ? 'artifacts.picker.optionWithProvenance' : 'artifacts.picker.option', {
              defaultValue: provenance ? 'rev {{rev}} - {{source}}{{notOnDisk}} - {{date}} · {{provenance}}' : 'rev {{rev}} - {{source}}{{notOnDisk}} - {{date}}',
              rev: revision.rev,
              source: sourceLabel(t, revision.source),
              notOnDisk,
              date,
              provenance,
            })}
          </option>
        )
      })}
    </select>
  )
}
