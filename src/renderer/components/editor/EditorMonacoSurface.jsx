import React from 'react'
import Editor from '@monaco-editor/react'
import { useMonacoLoadGuard } from './MonacoLoadGuard.jsx'

export default function EditorMonacoSurface({
  path,
  language,
  defaultLanguage,
  height,
  width,
  defaultValue,
  onChange,
  onMount,
  theme,
  options,
  saveViewState,
  keepCurrentModel,
  loading,
}) {
  const { handleMount, loadingElement } = useMonacoLoadGuard({
    onMount,
    loadingFallback: loading,
    timeoutMessage: 'Editor runtime failed to initialize. Reload the app.',
  })

  return (
    <Editor
      path={path}
      language={language}
      defaultLanguage={defaultLanguage}
      height={height}
      width={width}
      defaultValue={defaultValue}
      onChange={onChange}
      onMount={handleMount}
      theme={theme}
      options={options}
      saveViewState={saveViewState}
      keepCurrentModel={keepCurrentModel}
      loading={loadingElement}
    />
  )
}
