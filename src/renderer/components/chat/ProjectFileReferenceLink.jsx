import React, { useId, useMemo } from 'react'
import useAppStore from '../../store/useAppStore.js'
import useEditorStore from '../../store/useEditorStore.js'
import { resolveProjectFileReference } from '../editor/editor-markdown-preview-utils.mjs'
import {
  isMarkdownDocumentPath,
  resolveAbsoluteEvidenceFileReference,
  resolveProjectDocumentCompanionTarget,
} from './evidence-file-navigation.mjs'

export { isMarkdownDocumentPath } from './evidence-file-navigation.mjs'

function renderFallbackElement(tagName, { children, className, title, href }) {
  if (tagName === 'a') {
    return (
      <a href={href || '#'} className={className} title={title}>
        {children}
      </a>
    )
  }
  if (tagName === 'div') {
    return (
      <div className={className} title={title}>
        {children}
      </div>
    )
  }
  if (tagName === 'code') {
    return (
      <code className={className} title={title}>
        {children}
      </code>
    )
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  )
}

export default function ProjectFileReferenceLink({
  reference = null,
  href = '',
  label = '',
  filePath = '',
  line = undefined,
  column = undefined,
  currentFilePath = '',
  children = null,
  className = '',
  title = undefined,
  fallbackTag = 'span',
  fallbackHref = '#',
  markAsExternalUrl = false,
}) {
  const projectFolder = useAppStore((state) => state.projectFolder)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const reactId = useId()
  const originId = useMemo(() => `document-origin-${reactId.replace(/[^a-z0-9_-]/gi, '')}`, [reactId])
  const resolvedReference = useMemo(
    () => (reference && typeof reference === 'object'
      ? reference
      : resolveProjectFileReference({
          href,
          label,
          filePath,
          line,
          column,
          currentFilePath,
          projectFolder,
        })),
    [reference, href, label, filePath, line, column, currentFilePath, projectFolder],
  )
  const isExternal = resolvedReference?.ok === true && resolvedReference.kind === 'external'
  const isLocalFile = resolvedReference?.ok === true && resolvedReference.kind === 'file'
  const evidenceReference = useMemo(
    () => (!isLocalFile && !isExternal ? resolveAbsoluteEvidenceFileReference(filePath || href) : null),
    [filePath, href, isExternal, isLocalFile],
  )

  if (isExternal) {
    return (
      <a
        href={resolvedReference.href}
        className={className}
        target="_blank"
        rel="noreferrer"
        title={title}
        data-chat-markdown-url={markAsExternalUrl ? 'true' : undefined}
      >
        {children}
      </a>
    )
  }

  if (isLocalFile) {
    return (
      <a
        href="#"
        className={className}
        title={title}
        data-chat-file-reference="true"
        data-document-origin-id={originId}
        onClick={(event) => {
          event.preventDefault()
          if (!projectFolder) return
          const documentTarget = resolveProjectDocumentCompanionTarget({
            projectId: activeProjectId,
            filePath: resolvedReference.filePath,
          })
          if (documentTarget) {
            const originViewKey = event.currentTarget
              .closest('[data-companion-view-key]')
              ?.getAttribute('data-companion-view-key') || ''
            void useAppStore.getState().openDocumentCompanion?.({
              ...documentTarget,
              originSelector: `[data-document-origin-id="${originId}"]`,
              originViewKey,
            })
            return
          }
          const setActivePanel = useAppStore.getState().setActivePanel
          const openFileAtLocation = useEditorStore.getState().openFileAtLocation
          setActivePanel?.('editor')
          if (typeof openFileAtLocation === 'function') {
            void openFileAtLocation(
              projectFolder,
              resolvedReference.filePath,
              resolvedReference.line,
              resolvedReference.column,
              { source: 'chat_project_reference' },
            )
          }
        }}
        onContextMenu={(event) => {
          if (!resolvedReference.directoryPath) return
          event.preventDefault()
          void window?.addom?.shell?.showOpenContainingFolderMenu?.(resolvedReference.directoryPath)
        }}
      >
        {children}
      </a>
    )
  }

  if (evidenceReference?.ok === true) {
    return (
      <a
        href="#"
        className={className}
        title={title}
        data-evidence-file-reference="true"
        data-document-origin-id={originId}
        onClick={(event) => {
          event.preventDefault()
          if (isMarkdownDocumentPath(evidenceReference.filePath)) {
            const originViewKey = event.currentTarget
              .closest('[data-companion-view-key]')
              ?.getAttribute('data-companion-view-key') || ''
            void useAppStore.getState().openDocumentCompanion?.({
              evidenceFilePath: evidenceReference.absolutePath,
              originSelector: `[data-document-origin-id="${originId}"]`,
              originViewKey,
            })
            return
          }
          useAppStore.getState().setActivePanel?.('editor')
          void useEditorStore.getState().openEvidenceFileAtLocation?.(
            evidenceReference.absolutePath,
            evidenceReference.line,
            evidenceReference.column,
          )
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          void window?.addom?.shell?.showOpenContainingFolderMenu?.(evidenceReference.directoryPath)
        }}
      >
        {children}
      </a>
    )
  }

  return renderFallbackElement(fallbackTag, {
    children,
    className,
    title,
    href: fallbackHref,
  })
}
