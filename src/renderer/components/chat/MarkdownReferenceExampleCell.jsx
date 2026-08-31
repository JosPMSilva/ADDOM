import React from 'react'

export default function MarkdownReferenceExampleCell({
  examples = [],
}) {
  const rows = Array.isArray(examples) ? examples : []
  if (rows.length === 0) return null

  return (
    <div className="chat-markdown-example-list">
      {rows.map((example, index) => {
        const expression = String(example?.expression || '').trim()
        const result = String(example?.result || '').trim()
        if (!expression || !result) return null
        return (
          <div
            key={`example-row:${index}:${expression}:${result}`}
            className="chat-markdown-example-row"
          >
            <code className="chat-markdown-example-expr">{expression}</code>
            <span className="chat-markdown-example-arrow" aria-hidden="true">→</span>
            <span className="chat-markdown-example-result">{result}</span>
          </div>
        )
      })}
    </div>
  )
}
