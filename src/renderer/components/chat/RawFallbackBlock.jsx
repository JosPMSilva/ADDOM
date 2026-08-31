import React from 'react'

export default function RawFallbackBlock({
  text,
  reason = '',
}) {
  const content = String(text ?? '')
  if (!content) return null
  const showDevLabel = !!import.meta?.env?.DEV

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-raw-fallback-border bg-raw-fallback-surface">
      {showDevLabel && (
        <div className="border-b border-raw-fallback-border bg-raw-fallback-header px-3 py-1.5 text-[10px] uppercase tracking-wide text-raw-fallback-text">
          Unformatted segment {reason ? `(${reason})` : ''}
        </div>
      )}
      <pre className="overflow-x-auto text-xs leading-relaxed p-3 m-0">
        <code className="font-mono whitespace-pre">{content}</code>
      </pre>
    </div>
  )
}
