import React from 'react'
import Editor from '@monaco-editor/react'
import { useMonacoLoadGuard } from '../editor/MonacoLoadGuard.jsx'

export default function ComposerCodeBlockAdvancedEditorSurface({
  language,
  value,
  onChange,
  onMount,
  theme,
  options,
  loading,
}) {
  const { handleMount, loadingElement } = useMonacoLoadGuard({
    onMount,
    loadingFallback: loading,
    timeoutMessage: 'Editor runtime failed to initialize. Reload the app.',
  })

  return (
    <Editor
      language={language}
      value={value}
      onChange={onChange}
      onMount={handleMount}
      theme={theme}
      options={options}
      loading={loadingElement}
    />
  )
}
