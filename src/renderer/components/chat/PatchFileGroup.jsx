import React from 'react'
import DiffCodeBlock from './DiffCodeBlock.jsx'

export default function PatchFileGroup({
  filePath,
  diffSegments = [],
}) {
  const label = String(filePath ?? '').trim() || 'Patch'
  const diffs = Array.isArray(diffSegments) ? diffSegments : []
  if (diffs.length === 0) return null

  return (
    <section
      className="my-3 rounded-xl border border-surface-border bg-surface-panel-alt overflow-hidden"
      data-chat-render="patch-group"
      data-file-path={label}
    >
      <div className="px-3 py-2 border-b border-surface-border bg-surface-panel flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-surface-border bg-surface-panel-alt text-[10px] uppercase tracking-wide text-text-tertiary">
          File
        </span>
        <span className="font-mono text-xs text-text-primary break-all">{label}</span>
      </div>
      <div className="p-2">
        {diffs.map((diff, idx) => (
          <DiffCodeBlock
            key={diff.id || `${label}:${idx}`}
            text={diff.text}
            language={diff.language || 'diff'}
          />
        ))}
      </div>
    </section>
  )
}
