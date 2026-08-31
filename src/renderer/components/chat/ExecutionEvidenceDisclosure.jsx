import { useState } from 'react'
import ExecutionToolRowLabel from './ExecutionToolRowLabel.jsx'
import ProjectFileReferenceLink from './ProjectFileReferenceLink.jsx'
import Icon from '../ui/Icon.jsx'

const NAVIGABLE_FILE_TOOL_KINDS = new Set(['file_read', 'file_write', 'file_edit'])

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

export default function ExecutionEvidenceDisclosure({ item = {}, nested = false }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = item?.id ? `execution-evidence-${String(item.id).replace(/[^a-z0-9_-]/gi, '-')}` : undefined
  const sections = Array.isArray(item?.evidenceSections) ? item.evidenceSections : []
  const fileReference = resolveEvidenceFileReference(item)
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
      <div className={`flex min-h-7 items-center px-2 py-0.5 ${nested ? 'pl-4' : ''}`} data-ui="execution-evidence-row">
        {row}
      </div>
    )
  }

  if (fileReference) {
    return (
      <div data-ui="execution-evidence-row" className={nested ? 'pl-2' : undefined}>
        <div className="group flex min-h-7 w-full items-center rounded-sm px-2 py-0.5 hover:bg-surface-panel/35 focus-within:bg-surface-panel/35">
          <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <EvidenceToolRowLabel item={item} fileReference={fileReference} />
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-ui="execution-evidence-toggle"
                className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary opacity-0 outline-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:ring-1 focus-visible:ring-border-strong"
                aria-label={item.label}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setExpanded((value) => !value)}
              >
                <Icon name={expanded ? 'caret-down' : 'caret-right'} size={11} weight="bold" aria-hidden="true" />
              </button>
              <span className="w-4 text-center text-text-subtle" aria-hidden="true">{item.statusMark}</span>
            </span>
            {item.accessibleStatus ? <span className="sr-only">{item.accessibleStatus}</span> : null}
          </span>
        </div>
        {expanded ? <div id={panelId}><EvidenceDetail sections={sections} /></div> : null}
      </div>
    )
  }

  return (
    <div data-ui="execution-evidence-row" className={nested ? 'pl-2' : undefined}>
      <button
        type="button"
        data-ui="execution-evidence-toggle"
        className="group flex min-h-7 w-full items-center rounded-sm px-2 py-0.5 text-left outline-none transition-colors hover:bg-surface-panel/35 focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        {row}
      </button>
      {expanded ? <div id={panelId}><EvidenceDetail sections={sections} /></div> : null}
    </div>
  )
}
