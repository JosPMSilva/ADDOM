import { useEffect, useRef, useState } from 'react'
import ExecutionToolRowLabel from './ExecutionToolRowLabel.jsx'
import ProjectFileReferenceLink from './ProjectFileReferenceLink.jsx'
import Icon from '../ui/Icon.jsx'

const NAVIGABLE_FILE_TOOL_KINDS = new Set(['file_read', 'file_write', 'file_edit'])
const IDENTITY_TOOLTIP_HOVER_DELAY_MS = 900

function resolveEvidenceFileReference(item = {}) {
  const toolKind = String(item?.toolKind || '').trim().toLowerCase()
  if (!NAVIGABLE_FILE_TOOL_KINDS.has(toolKind)) return null
  const filePath = String(item?.expandedEvidence?.input || '').trim()
  if (!filePath) return null
  const leaf = filePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/(?::\d+|#L\d+)$/i, '') || ''
  if (!/^(?:[^/\s.][^/\s]*\.[a-z0-9][a-z0-9._-]*|\.[a-z0-9][a-z0-9._-]*)$/i.test(leaf)) return null
  return {
    filePath,
    label: String(item?.identity || leaf).trim() || leaf,
  }
}

function EvidenceToolRowLabel({ item = {}, fileReference = null }) {
  if (!fileReference) {
    return (
      <ExecutionToolRowLabel
        label={item.label}
        verb={item.verb}
        identity={item.identity}
      />
    )
  }
  return (
    <span className="chat-typo-exec-row-label min-w-0 truncate">
      <span className="chat-typo-exec-row-verb text-text-tertiary">{item.verb}</span>
      {' '}
      <ProjectFileReferenceLink
        filePath={fileReference.filePath}
        label={fileReference.label}
        className="chat-typo-exec-row-identity inline-block max-w-full cursor-pointer truncate rounded-sm align-bottom text-text-subtle underline decoration-transparent underline-offset-2 outline-none transition-colors hover:text-text-secondary hover:decoration-current focus-visible:text-text-primary focus-visible:decoration-current focus-visible:ring-1 focus-visible:ring-border-strong"
      >
        {fileReference.label}
      </ProjectFileReferenceLink>
    </span>
  )
}

export function EvidenceDetail({ sections = [] }) {
  if (!Array.isArray(sections) || sections.length === 0) return null
  return (
    <div className="ml-5 space-y-2 pb-2 pt-1 text-text-secondary" data-ui="execution-evidence-detail">
      {sections.map((section) => (
        <div key={String(section.key || section.label)} className="space-y-1">
          {section.label ? (
            <div className="chat-typo-exec-row-label text-text-tertiary">{section.label}</div>
          ) : null}
          {section.mono === false ? (
            <div className="chat-typo-exec-output-body text-text-secondary">{section.value}</div>
          ) : (
            <pre className="chat-typo-exec-output-body max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-text-primary">
              {section.value}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

function IdentityTooltip({ id, open = false, value = '' }) {
  if (!id || !value) return null
  return (
    <span
      id={id}
      role="tooltip"
      data-ui="execution-command-tooltip"
      className={`absolute left-2 top-full z-50 mt-1 max-h-40 w-max max-w-[min(36rem,calc(100vw-3rem))] select-text overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 font-mono text-[10px] leading-relaxed text-text-secondary shadow-md transition-opacity ${
        open
          ? 'pointer-events-auto visible opacity-100'
          : 'pointer-events-none invisible opacity-0'
      }`}
    >
      {value}
    </span>
  )
}

export default function ExecutionEvidenceDisclosure({ item = {}, nested = false }) {
  const [expanded, setExpanded] = useState(false)
  const [identityTooltipOpen, setIdentityTooltipOpen] = useState(false)
  const identityTooltipHoverTimerRef = useRef(null)
  const safeItemId = item?.id ? String(item.id).replace(/[^a-z0-9_-]/gi, '-') : ''
  const panelId = safeItemId ? `execution-evidence-${safeItemId}` : undefined
  const tooltipId = safeItemId ? `execution-command-tooltip-${safeItemId}` : undefined
  const sections = Array.isArray(item?.evidenceSections) ? item.evidenceSections : []
  const fileReference = resolveEvidenceFileReference(item)
  const fullIdentity = String(item?.fullIdentity || '').trim()
  const showIdentityTooltip = Boolean(
    tooltipId
    && fullIdentity
    && fullIdentity !== String(item?.identity || '').trim(),
  )
  const identityTooltipAvailable = showIdentityTooltip && !expanded
  const clearIdentityTooltipHoverTimer = () => {
    if (identityTooltipHoverTimerRef.current === null) return
    clearTimeout(identityTooltipHoverTimerRef.current)
    identityTooltipHoverTimerRef.current = null
  }
  useEffect(() => () => clearIdentityTooltipHoverTimer(), [])
  const handlePointerEnter = () => {
    clearIdentityTooltipHoverTimer()
    if (!identityTooltipAvailable) return
    identityTooltipHoverTimerRef.current = setTimeout(() => {
      identityTooltipHoverTimerRef.current = null
      setIdentityTooltipOpen(true)
    }, IDENTITY_TOOLTIP_HOVER_DELAY_MS)
  }
  const handlePointerLeave = () => {
    clearIdentityTooltipHoverTimer()
    setIdentityTooltipOpen(false)
  }
  const handleFocus = (event) => {
    clearIdentityTooltipHoverTimer()
    const focusTarget = event.target
    const focusIsKeyboardVisible = typeof focusTarget?.matches !== 'function'
      || focusTarget.matches(':focus-visible')
    if (identityTooltipAvailable && focusIsKeyboardVisible) setIdentityTooltipOpen(true)
  }
  const handleBlur = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    clearIdentityTooltipHoverTimer()
    setIdentityTooltipOpen(false)
  }
  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return
    clearIdentityTooltipHoverTimer()
    setIdentityTooltipOpen(false)
  }
  const handleToggle = () => {
    clearIdentityTooltipHoverTimer()
    setIdentityTooltipOpen(false)
    setExpanded((value) => !value)
  }
  const row = (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <EvidenceToolRowLabel item={item} fileReference={fileReference} />
      <span className="flex shrink-0 items-center gap-1">
        {item.expandable ? (
          <span className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
            <Icon name={expanded ? 'caret-down' : 'caret-right'} size={11} weight="bold" />
          </span>
        ) : null}
        <span className="w-4 text-center text-text-subtle" aria-hidden="true">{item.statusMark}</span>
      </span>
      {item.accessibleStatus ? <span className="sr-only">{item.accessibleStatus}</span> : null}
    </span>
  )

  if (!item.expandable) {
    return (
      <div
        className={`group relative flex min-h-7 items-center px-2 py-0.5 ${nested ? 'pl-4' : ''}`}
        data-ui="execution-evidence-row"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocusCapture={handleFocus}
        onBlurCapture={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {row}
        {identityTooltipAvailable ? (
          <IdentityTooltip id={tooltipId} open={identityTooltipOpen} value={fullIdentity} />
        ) : null}
      </div>
    )
  }

  if (fileReference) {
    return (
      <div
        data-ui="execution-evidence-row"
        className={`relative ${nested ? 'pl-2' : ''}`}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocusCapture={handleFocus}
        onBlurCapture={handleBlur}
        onKeyDown={handleKeyDown}
      >
        <div className="group flex min-h-7 w-full items-center rounded-sm px-2 py-0.5 hover:bg-surface-panel/35 focus-within:bg-surface-panel/35">
          <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <EvidenceToolRowLabel item={item} fileReference={fileReference} />
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-ui="execution-evidence-toggle"
                className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary opacity-0 outline-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:ring-1 focus-visible:ring-border-strong"
                aria-label={item.label}
                aria-describedby={identityTooltipAvailable ? tooltipId : undefined}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={handleToggle}
              >
                <Icon name={expanded ? 'caret-down' : 'caret-right'} size={11} weight="bold" aria-hidden="true" />
              </button>
              <span className="w-4 text-center text-text-subtle" aria-hidden="true">{item.statusMark}</span>
            </span>
            {item.accessibleStatus ? <span className="sr-only">{item.accessibleStatus}</span> : null}
          </span>
        </div>
        {identityTooltipAvailable ? (
          <IdentityTooltip id={tooltipId} open={identityTooltipOpen} value={fullIdentity} />
        ) : null}
        {expanded ? <div id={panelId}><EvidenceDetail sections={sections} /></div> : null}
      </div>
    )
  }

  return (
    <div
      data-ui="execution-evidence-row"
      className={`relative ${nested ? 'pl-2' : ''}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        data-ui="execution-evidence-toggle"
        className="group flex min-h-7 w-full items-center rounded-sm px-2 py-0.5 text-left outline-none transition-colors hover:bg-surface-panel/35 focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-describedby={identityTooltipAvailable ? tooltipId : undefined}
        onClick={handleToggle}
      >
        {row}
      </button>
      {identityTooltipAvailable ? (
        <IdentityTooltip id={tooltipId} open={identityTooltipOpen} value={fullIdentity} />
      ) : null}
      {expanded ? <div id={panelId}><EvidenceDetail sections={sections} /></div> : null}
    </div>
  )
}
