import React from 'react'
import CodeSnippetBlock from '../CodeSnippetBlock.jsx'
import ProjectFileReferenceLink from '../ProjectFileReferenceLink.jsx'
import { tokenizeProjectFileReferences } from '../evidence-file-navigation.mjs'
import { resolveGeneratedArtifactImage } from './generated-artifact-image.mjs'
import GeneratedArtifactImage from './GeneratedArtifactImage.jsx'
import { createPlanAnnotationBlockId } from '../document-companion-plan-annotation.mjs'

function nodeText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (React.isValidElement(node)) return nodeText(node.props?.children)
  return ''
}

function codeLanguage(children) {
  const codeElement = React.Children.toArray(children).find((child) => React.isValidElement(child))
  const className = String(codeElement?.props?.className || '')
  return String(className.match(/language-([a-z0-9_+.-]+)/i)?.[1] || 'text').toLowerCase()
}

function FinalAnswerLink({ href = '', children = null, currentFilePath = '' }) {
  const label = nodeText(children).trim()
  return (
    <ProjectFileReferenceLink
      href={href}
      label={label}
      currentFilePath={currentFilePath}
      className="final-answer-link text-accent underline decoration-current/50 underline-offset-2 hover:text-text-primary"
      title={/^https?:\/\/\S+$/i.test(label) ? label : undefined}
      fallbackTag="span"
      markAsExternalUrl={/^https?:\/\//i.test(String(href || ''))}
    >
      {children}
    </ProjectFileReferenceLink>
  )
}

function renderFileReferenceText(children, keyPrefix = 'file-reference') {
  return React.Children.toArray(children).flatMap((child, childIndex) => {
    if (typeof child !== 'string') return child
    return tokenizeProjectFileReferences(child).map((segment, segmentIndex) => {
      if (segment.type !== 'file') return segment.value
      return (
        <ProjectFileReferenceLink
          key={`${keyPrefix}-${childIndex}-${segmentIndex}`}
          label={segment.value}
          filePath={segment.value}
          className="final-answer-file-reference cursor-pointer underline decoration-current/35 underline-offset-2 hover:text-text-primary"
          title={segment.value}
          fallbackTag="span"
        >
          {segment.value}
        </ProjectFileReferenceLink>
      )
    })
  })
}

function inlineCodeFileReference(text = '') {
  const segments = tokenizeProjectFileReferences(text)
  return segments.length === 1 && segments[0]?.type === 'file' ? segments[0].value : ''
}

export function createFinalAnswerMarkdownComponents({
  generatedArtifacts = [],
  messageId = '',
  threadId = '',
  currentFilePath = '',
  planAnnotations = null,
} = {}) {
  const stagedBlockIds = new Set(planAnnotations?.stagedBlockIds || [])
  const annotationProps = (node, blockKind, children) => {
    if (!planAnnotations) return {}
    const blockText = nodeText(children).trim().slice(0, 4_000)
    const blockId = createPlanAnnotationBlockId(node, blockKind, blockText)
    return {
      'data-plan-annotation-block': 'true',
      'data-plan-block-id': blockId,
      'data-plan-block-kind': blockKind,
      'data-plan-annotation-active': planAnnotations.activeBlockId === blockId ? 'true' : undefined,
      'data-plan-annotation-staged': stagedBlockIds.has(blockId) ? 'true' : undefined,
    }
  }
  const annotationAction = (node, blockKind, children) => {
    if (!planAnnotations) return null
    const blockText = nodeText(children).trim().slice(0, 4_000)
    const blockId = createPlanAnnotationBlockId(node, blockKind, blockText)
    return (
      <button
        type="button"
        data-plan-annotation-action="true"
        className="plan-annotation-action"
        aria-label={planAnnotations.actionLabel}
        title={planAnnotations.actionLabel}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          planAnnotations.onAnnotate?.({
            blockId,
            blockKind,
            blockText,
            element: event.currentTarget.closest('[data-plan-annotation-block="true"]'),
          })
        }}
      >
        {planAnnotations.actionLabel}
      </button>
    )
  }
  const heading = (level, node, children) => {
    const Tag = `h${level}`
    return (
      <Tag
        className={`final-answer-heading final-answer-heading-${level}`}
        {...annotationProps(node, 'heading', children)}
      >
        {children}
        {annotationAction(node, 'heading', children)}
      </Tag>
    )
  }
  return {
    code({ className, children, ...props }) {
      const domProps = { ...(props || {}) }
      delete domProps.node
      const text = nodeText(children)
      const filePath = inlineCodeFileReference(text)
      if (filePath) {
        return (
          <ProjectFileReferenceLink
            filePath={filePath}
            label={filePath}
            currentFilePath={currentFilePath}
            className={[className, 'final-answer-inline-code', 'final-answer-file-reference', 'cursor-pointer', 'underline', 'decoration-current/35', 'underline-offset-2', 'hover:text-text-primary'].filter(Boolean).join(' ')}
            title={filePath}
            fallbackTag="code"
          >
            {text}
          </ProjectFileReferenceLink>
        )
      }
      return <code className={[className, 'final-answer-inline-code'].filter(Boolean).join(' ')} {...domProps}>{text}</code>
    },
    pre({ node, children }) {
      if (!planAnnotations) return <CodeSnippetBlock text={nodeText(children)} language={codeLanguage(children)} />
      return (
        <div className="final-answer-annotated-code" {...annotationProps(node, 'code', children)}>
          <CodeSnippetBlock text={nodeText(children)} language={codeLanguage(children)} />
          {annotationAction(node, 'code', children)}
        </div>
      )
    },
    p({ node, children }) {
      return (
        <p className="final-answer-paragraph" {...annotationProps(node, 'paragraph', children)}>
          {renderFileReferenceText(children, 'paragraph')}
          {annotationAction(node, 'paragraph', children)}
        </p>
      )
    },
    ul({ children }) { return <ul className="final-answer-list final-answer-list-unordered">{children}</ul> },
    ol({ children }) { return <ol className="final-answer-list final-answer-list-ordered">{children}</ol> },
    li({ node, children }) {
      return (
        <li className="final-answer-list-item" {...annotationProps(node, 'list-item', children)}>
          {renderFileReferenceText(children, 'list-item')}
          {annotationAction(node, 'list-item', children)}
        </li>
      )
    },
    h1({ node, children }) { return heading(1, node, children) },
    h2({ node, children }) { return heading(2, node, children) },
    h3({ node, children }) { return heading(3, node, children) },
    h4({ node, children }) { return heading(4, node, children) },
    h5({ node, children }) { return heading(5, node, children) },
    h6({ node, children }) { return heading(6, node, children) },
    blockquote({ children }) { return <blockquote className="final-answer-blockquote">{children}</blockquote> },
    a({ href, children }) {
      return <FinalAnswerLink href={href} currentFilePath={currentFilePath}>{children}</FinalAnswerLink>
    },
    img({ src = '', alt = '' }) {
      const artifact = resolveGeneratedArtifactImage(src, generatedArtifacts)
      if (artifact) {
        return (
          <GeneratedArtifactImage
            artifact={artifact}
            alt={alt}
            messageId={messageId}
            threadId={threadId}
          />
        )
      }
      if (!/^https?:\/\//i.test(String(src || '').trim())) return null
      return (
        <img
          src={src}
          alt={String(alt || '')}
          className="my-3 max-h-[min(68vh,720px)] max-w-full rounded-lg border border-surface-border object-contain"
          loading="lazy"
        />
      )
    },
    hr() { return <hr className="final-answer-rule" /> },
    table({ children }) {
      return (
        <div className="final-answer-table-scroll" data-final-answer-table-scroll="true" tabIndex={0}>
          <table className="final-answer-table">{children}</table>
        </div>
      )
    },
    thead({ children }) { return <thead className="final-answer-table-head">{children}</thead> },
    tbody({ children }) { return <tbody className="final-answer-table-body">{children}</tbody> },
    tr({ children }) { return <tr className="final-answer-table-row">{children}</tr> },
    th({ children }) { return <th className="final-answer-table-header">{children}</th> },
    td({ children }) { return <td className="final-answer-table-cell">{children}</td> },
    strong({ children }) { return <strong className="final-answer-strong">{children}</strong> },
    em({ children }) { return <em className="final-answer-emphasis">{children}</em> },
  }
}
