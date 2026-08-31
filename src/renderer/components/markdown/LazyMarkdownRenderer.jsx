import React, { Suspense } from 'react'

let clientMarkdownRuntimePromise = null

function loadClientMarkdownRuntime() {
  if (!clientMarkdownRuntimePromise) {
    clientMarkdownRuntimePromise = import('./MarkdownRuntimeClient.jsx')
  }
  return clientMarkdownRuntimePromise
}

const LazyClientMarkdownContent = React.lazy(async () => {
  const mod = await loadClientMarkdownRuntime()
  return { default: mod.default }
})

let ServerMarkdownContent = null

if (import.meta.env.SSR) {
  const serverMarkdownRuntimeModule = await import('./MarkdownRuntimeServer.jsx')
  ServerMarkdownContent = serverMarkdownRuntimeModule.default || null
}

function MarkdownFallback({ text = '' }) {
  const normalizedText = String(text ?? '')
  if (!normalizedText) return null
  return <span className="whitespace-pre-wrap break-words">{normalizedText}</span>
}

function ProseMarkdown({
  text,
  components,
  remarkPlugins,
  rehypePlugins,
  fallback = null,
}) {
  const normalizedText = String(text ?? '')
  if (!normalizedText) return null

  if (import.meta.env.SSR && ServerMarkdownContent) {
    return (
      <ServerMarkdownContent
        text={normalizedText}
        components={components}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      />
    )
  }

  return (
    <Suspense fallback={fallback ?? <MarkdownFallback text={normalizedText} />}>
      <LazyClientMarkdownContent
        text={normalizedText}
        components={components}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      />
    </Suspense>
  )
}

const MemoProseMarkdown = React.memo(
  ProseMarkdown,
  (prev, next) => (
    prev.text === next.text
    && prev.components === next.components
    && prev.remarkPlugins === next.remarkPlugins
    && prev.rehypePlugins === next.rehypePlugins
    && prev.fallback === next.fallback
  ),
)

function preloadMarkdownRuntime() {
  if (import.meta.env.SSR) return Promise.resolve(ServerMarkdownContent)
  return loadClientMarkdownRuntime()
}

export { MemoProseMarkdown, preloadMarkdownRuntime }
