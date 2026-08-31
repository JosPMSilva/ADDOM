import React, { useMemo } from 'react'
import DiffCodeBlock from './DiffCodeBlock.jsx'
import CodeSnippetBlock from './CodeSnippetBlock.jsx'
import PatchFileGroup from './PatchFileGroup.jsx'
import RawFallbackBlock from './RawFallbackBlock.jsx'
import {
  hasDelegationPayload,
  stripDelegationPayloads,
} from '../../../common/chat/strip-delegation-payload.mjs'
import ProjectFileReferenceLink from './ProjectFileReferenceLink.jsx'
import MarkdownReferenceExampleCell from './MarkdownReferenceExampleCell.jsx'
import MarkdownReferenceKeyButton from './MarkdownReferenceKeyButton.jsx'
import {
  parseMarkdownReferenceExamples,
  resolveMarkdownReferenceKeyInsertText,
} from './markdown-reference-example-cells.mjs'
import {
  childrenAreSectionLabel,
  childrenAreVisuallyEmpty,
  MemoProseMarkdown,
  markdownCodeBlockLanguageFromPreChildren,
  markdownCodeBlockTextFromPreChildren,
  messageTextNeedsMarkdownRuntime,
  reactNodeText,
  renderPlainProseText,
  resolveMarkdownTableClassName,
} from './message-bubble-render-utils.mjs'

const EXECUTION_FILE_REFERENCE_CANDIDATE_RE = /\.[A-Za-z0-9._-]+(?:#L\d+|:\d+)?/
const EXECUTION_FILE_REFERENCE_TOKEN_RE = /^(?!\/)(?!\/\/)(?![A-Za-z]:[\\/])(?!https?:\/\/)(?!file:\/\/)(?:[A-Za-z0-9_@()+.-]+[\\/])*[A-Za-z0-9_@()+.-]+\.[A-Za-z0-9._-]+(?:#L\d+|:\d+)?$/i
const FILE_REFERENCE_BLOCK_CLASS_NAME = 'my-2 break-all rounded-lg border border-surface-border bg-surface-panel-alt px-3 py-2 font-mono text-xs text-info-soft'

function ChatMarkdownLink({ href, children, className }) {
  const label = reactNodeText(children).trim()
  const urlLike = /^https?:\/\/\S+$/i.test(label)

  return (
    <ProjectFileReferenceLink
      href={href}
      label={label}
      className={className}
      title={urlLike ? label : undefined}
      fallbackTag="a"
      fallbackHref="#"
      markAsExternalUrl={urlLike}
    >
      {children}
    </ProjectFileReferenceLink>
  )
}

function renderMarkdownTableAstNodes(nodes = [], renderContext = {}, keyPrefix = 'table-node') {
  const source = Array.isArray(nodes) ? nodes : []
  return source.map((node, index) => renderMarkdownTableAstNode(node, renderContext, `${keyPrefix}:${index}`))
}

function renderMarkdownTableAstNode(node, renderContext = {}, key = 'table-node') {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'text') return node.value || ''

  const tag = String(node.tagName || '').trim().toLowerCase()
  const children = renderMarkdownTableAstNodes(node.children || [], renderContext, key)
  const {
    inlineCodeClassName = '',
    unorderedListClassName = '',
    orderedListClassName = '',
    listItemClassName = '',
    blockquoteClassName = '',
    linkClassName = '',
    strongClassName = '',
    emphasisClassName = '',
  } = renderContext

  if (tag === 'a') {
    return (
      <ChatMarkdownLink key={key} href={node.properties?.href} className={linkClassName}>
        {children}
      </ChatMarkdownLink>
    )
  }
  if (tag === 'code') {
    return <code key={key} className={inlineCodeClassName}>{children}</code>
  }
  if (tag === 'strong') {
    return <strong key={key} className={strongClassName}>{children}</strong>
  }
  if (tag === 'em') {
    return <em key={key} className={emphasisClassName}>{children}</em>
  }
  if (tag === 'br') return <br key={key} />
  if (tag === 'p') {
    return <div key={key} className="chat-markdown-record-paragraph">{children}</div>
  }
  if (tag === 'ul') {
    return <ul key={key} className={`${unorderedListClassName} chat-markdown-record-rich-list`}>{children}</ul>
  }
  if (tag === 'ol') {
    return <ol key={key} className={`${orderedListClassName} chat-markdown-record-rich-list`}>{children}</ol>
  }
  if (tag === 'li') {
    return <li key={key} className={listItemClassName || undefined}>{children}</li>
  }
  if (tag === 'blockquote') {
    return <blockquote key={key} className={blockquoteClassName}>{children}</blockquote>
  }
  if (children.length === 1) return React.cloneElement(React.createElement(React.Fragment, { key }), {}, children[0])
  return <React.Fragment key={key}>{children}</React.Fragment>
}

function renderMarkdownRecordList(tableModel = {}, renderContext = {}) {
  const rows = Array.isArray(tableModel?.rows) ? tableModel.rows : []
  if (rows.length === 0) return null

  return (
    <div className="chat-markdown-record-list">
      {rows.map((row, rowIndex) => {
        const cells = Array.isArray(row?.cells) ? row.cells : []
        const primaryCell = cells[0] || null
        const detailCells = cells.slice(1)
        return (
          <section key={`record-row:${rowIndex}`} className="chat-markdown-record-card">
            <header className="chat-markdown-record-header">
              {primaryCell?.headerLabel ? (
                <div className="chat-markdown-record-eyebrow">{primaryCell.headerLabel}</div>
              ) : null}
              <div className="chat-markdown-record-title">
                {primaryCell
                  ? renderMarkdownTableAstNodes(primaryCell.children, renderContext, `record-row:${rowIndex}:primary`)
                  : null}
              </div>
            </header>
            <div className="chat-markdown-record-body">
              {detailCells.map((cell, cellIndex) => (
                <div key={`record-row:${rowIndex}:detail:${cellIndex}`} className="chat-markdown-record-field">
                  <div className="chat-markdown-record-field-label">{cell.headerLabel}</div>
                  <div className="chat-markdown-record-field-value">
                    {renderMarkdownTableAstNodes(cell.children, renderContext, `record-row:${rowIndex}:detail:${cellIndex}:content`)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function renderMarkdownReferenceTableCell(cell = {}, renderContext = {}, keyPrefix = 'reference-cell', options = {}) {
  const {
    isKeyColumn = false,
    nameCell = null,
  } = options

  if (isKeyColumn) {
    const insertText = resolveMarkdownReferenceKeyInsertText({
      keyCell: cell,
      nameCell,
    })
    const label = String(cell?.text || insertText || '').trim()
    return (
      <MarkdownReferenceKeyButton insertText={insertText} label={label} />
    )
  }

  const examples = parseMarkdownReferenceExamples(cell?.text)
  if (examples) {
    return <MarkdownReferenceExampleCell examples={examples} />
  }
  return renderMarkdownTableAstNodes(cell?.children || [], renderContext, keyPrefix)
}

function renderMarkdownReferenceTable(tableModel = {}, renderContext = {}) {
  const rows = Array.isArray(tableModel?.rows) ? tableModel.rows : []
  const headerLabels = Array.isArray(tableModel?.headerLabels) ? tableModel.headerLabels : []
  const columnWidths = Array.isArray(tableModel?.columnWidths) ? tableModel.columnWidths : []
  const keyIndex = Number(tableModel?.keyIndex)
  const nameIndex = Number(tableModel?.nameIndex)
  if (rows.length === 0) return null

  return (
    <div className={tableModel.wrapperClassName || 'chat-markdown-table-wrap chat-markdown-table-wrap--reference'}>
      <table className={tableModel.className || 'chat-markdown-table chat-markdown-table--reference'}>
        {columnWidths.length > 0 ? (
          <colgroup>
            {columnWidths.map((width, index) => (
              <col key={`chat-reference-col-${index}`} style={{ width }} />
            ))}
          </colgroup>
        ) : null}
        {headerLabels.length > 0 ? (
          <thead className="chat-markdown-thead">
            <tr className="chat-markdown-row">
              {headerLabels.map((label, index) => (
                <th key={`reference-th:${index}`} className="chat-markdown-th">
                  <div className="chat-markdown-cell-content">{label}</div>
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody className="chat-markdown-tbody">
          {rows.map((row, rowIndex) => {
            const cells = Array.isArray(row?.cells) ? row.cells : []
            const nameCell = nameIndex >= 0 ? (cells[nameIndex] || null) : null
            return (
              <tr key={`reference-row:${rowIndex}`} className="chat-markdown-row">
                {cells.map((cell, cellIndex) => (
                  <td key={`reference-td:${rowIndex}:${cellIndex}`} className="chat-markdown-td">
                    <div className="chat-markdown-cell-content">
                      {renderMarkdownReferenceTableCell(
                        cell,
                        renderContext,
                        `reference-row:${rowIndex}:cell:${cellIndex}`,
                        {
                          isKeyColumn: keyIndex >= 0 && cellIndex === keyIndex,
                          nameCell,
                        },
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function renderFileReferenceBlock({ key, filePath = '', label = '' } = {}) {
  const normalizedFilePath = String(filePath || '').trim()
  const normalizedLabel = String(label || '').trim()
  const displayLabel = normalizedFilePath || normalizedLabel
  if (!displayLabel) return null

  return (
    <ProjectFileReferenceLink
      key={key}
      filePath={normalizedFilePath}
      label={normalizedLabel || normalizedFilePath}
      fallbackTag="div"
      className={FILE_REFERENCE_BLOCK_CLASS_NAME}
    >
      {displayLabel}
    </ProjectFileReferenceLink>
  )
}

function tokenizeExecutionPlainText(text = '') {
  return String(text ?? '').match(/\s+|[^\s]+/g) || []
}

function isExecutionFileReferenceToken(token = '') {
  const value = String(token || '').trim()
  if (!value) return false
  return EXECUTION_FILE_REFERENCE_TOKEN_RE.test(value)
}

export function buildExecutionFileReferenceRenderState(text = '', {
  keyPrefix = 'execution-file-ref',
  className = '',
} = {}) {
  const source = String(text ?? '')
  if (!source || !EXECUTION_FILE_REFERENCE_CANDIDATE_RE.test(source)) {
    return { content: source, hasFileReferences: false }
  }

  const tokens = tokenizeExecutionPlainText(source)
  let hasFileReferences = false
  const content = tokens.map((token, index) => {
    if (!token || /^\s+$/.test(token) || !isExecutionFileReferenceToken(token)) return token
    hasFileReferences = true
    return (
      <ProjectFileReferenceLink
        key={`${keyPrefix}:${index}:${token}`}
        label={token}
        className={className}
        title={token}
        fallbackTag="span"
      >
        {token}
      </ProjectFileReferenceLink>
    )
  })

  return hasFileReferences
    ? { content, hasFileReferences: true }
    : { content: source, hasFileReferences: false }
}

const CHAT_MARKDOWN_COMPONENT_MODE_DEFAULTS = {
  'assistant-message': {
    inlineCodeClassName: 'rounded bg-surface-panel-alt px-1 py-0.5 font-mono text-xs text-success',
    paragraphClassName: '',
    unorderedListClassName: 'chat-list chat-list-ul',
    orderedListClassName: 'chat-list chat-list-ol',
    listItemClassName: 'text-chat-text',
    blockquoteClassName: 'my-2 border-l-2 border-accent pl-3 text-text-secondary italic',
    linkClassName: 'text-accent underline hover:text-text-primary',
    ruleClassName: 'my-3 border-chat-border',
    strongClassName: 'font-semibold text-chat-text',
    emphasisClassName: 'italic text-text-secondary',
  },
  'execution-stream': {
    inlineCodeClassName: 'rounded bg-surface-panel/70 px-1 py-0.5 font-mono text-text-subtle',
    paragraphClassName: 'mb-3 last:mb-0',
    unorderedListClassName: 'chat-list chat-list-ul mb-3',
    orderedListClassName: 'chat-list chat-list-ol mb-3',
    listItemClassName: '',
    blockquoteClassName: 'my-3 border-l-2 border-surface-border pl-3 text-text-secondary italic',
    linkClassName: 'text-text-subtle underline decoration-surface-border hover:text-text-secondary',
    ruleClassName: 'my-4 border-surface-border',
    strongClassName: 'font-semibold',
    emphasisClassName: 'italic text-text-secondary',
  },
  'agent-task': {
    inlineCodeClassName: 'rounded bg-surface-panel-alt px-1 py-0.5 font-mono text-xs text-success',
    paragraphClassName: 'mb-2 last:mb-0',
    unorderedListClassName: 'chat-list chat-list-ul mb-2',
    orderedListClassName: 'chat-list chat-list-ol mb-2',
    listItemClassName: 'text-chat-text',
    blockquoteClassName: 'my-2 border-l-2 border-accent pl-3 text-text-secondary italic',
    linkClassName: 'text-accent underline hover:text-text-primary',
    ruleClassName: 'my-3 border-chat-border',
    strongClassName: 'font-semibold text-chat-text',
    emphasisClassName: 'italic text-text-secondary',
  },
  'agent-result': {
    inlineCodeClassName: 'rounded bg-surface-panel-alt px-1 py-0.5 font-mono text-xs text-success',
    paragraphClassName: 'mb-2 last:mb-0',
    unorderedListClassName: 'chat-list chat-list-ul mb-2',
    orderedListClassName: 'chat-list chat-list-ol mb-2',
    listItemClassName: 'text-chat-text',
    blockquoteClassName: 'my-2 border-l-2 border-accent pl-3 text-text-secondary italic',
    linkClassName: 'text-accent underline hover:text-text-primary',
    ruleClassName: 'my-3 border-chat-border',
    strongClassName: 'font-semibold text-chat-text',
    emphasisClassName: 'italic text-text-secondary',
  },
}

const CHAT_RICH_CONTENT_FEATURE_MODE_DEFAULTS = {
  'assistant-message': {
    allowPatchFileGroups: false,
    allowDispatchCards: false,
    allowCouncilCards: false,
    allowReviewCards: false,
  },
  'execution-stream': {
    allowPatchFileGroups: false,
    allowDispatchCards: false,
    allowCouncilCards: false,
    allowReviewCards: false,
  },
  'agent-task': {
    allowPatchFileGroups: false,
    allowDispatchCards: false,
    allowCouncilCards: false,
    allowReviewCards: false,
  },
  'agent-result': {
    allowPatchFileGroups: false,
    allowDispatchCards: false,
    allowCouncilCards: false,
    allowReviewCards: false,
  },
}

function resolveChatMarkdownComponentConfig({ mode = 'assistant-message', config = null } = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase()
  const modeDefaults = CHAT_MARKDOWN_COMPONENT_MODE_DEFAULTS[normalizedMode] || CHAT_MARKDOWN_COMPONENT_MODE_DEFAULTS['assistant-message']
  return {
    ...modeDefaults,
    ...(config && typeof config === 'object' ? config : {}),
  }
}

function resolveChatRichContentFeaturePolicy({ mode = 'assistant-message', featurePolicy = null } = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase()
  const modeDefaults = CHAT_RICH_CONTENT_FEATURE_MODE_DEFAULTS[normalizedMode] || CHAT_RICH_CONTENT_FEATURE_MODE_DEFAULTS['assistant-message']
  return {
    ...modeDefaults,
    ...(featurePolicy && typeof featurePolicy === 'object' ? featurePolicy : {}),
  }
}

function flattenMarkdownCodeChildren(children) {
  if (children == null) return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(flattenMarkdownCodeChildren).join('')
  if (typeof children === 'object' && children?.props) {
    return flattenMarkdownCodeChildren(children.props.children)
  }
  return String(children)
}

export function createChatMarkdownComponents({ mode = 'assistant-message', config = null } = {}) {
  const resolvedConfig = resolveChatMarkdownComponentConfig({ mode, config })
  const {
    inlineCodeClassName,
    paragraphClassName,
    unorderedListClassName,
    orderedListClassName,
    listItemClassName,
    blockquoteClassName,
    linkClassName,
    ruleClassName,
    strongClassName,
    emphasisClassName,
  } = resolvedConfig

  return {
    code({ inline, className, children, ...props }) {
      const flattenedChildren = flattenMarkdownCodeChildren(children)
      const domProps = { ...(props || {}) }
      delete domProps.node
      return inline
        ? <code className={inlineCodeClassName} {...domProps}>{flattenedChildren}</code>
        : <code className={className} {...domProps}>{flattenedChildren}</code>
    },
    pre({ children }) { return renderMarkdownCodeBlock(children) },
    p({ children }) {
      if (childrenAreVisuallyEmpty(children)) return null
      const sectionLabel = childrenAreSectionLabel(children)
      const resolvedParagraphClassName = [
        paragraphClassName,
        sectionLabel ? 'chat-section-label' : '',
      ].filter(Boolean).join(' ')
      return (
        <p className={resolvedParagraphClassName || undefined}>
          {children}
        </p>
      )
    },
    ul({ children }) { return <ul className={unorderedListClassName}>{children}</ul> },
    ol({ children }) { return <ol className={orderedListClassName}>{children}</ol> },
    li({ children }) {
      if (childrenAreVisuallyEmpty(children)) return null
      return <li className={listItemClassName || undefined}>{children}</li>
    },
    h1({ children }) { return <h1 className="chat-markdown-heading chat-markdown-heading-1">{children}</h1> },
    h2({ children }) { return <h2 className="chat-markdown-heading chat-markdown-heading-2">{children}</h2> },
    h3({ children }) { return <h3 className="chat-markdown-heading chat-markdown-heading-3">{children}</h3> },
    blockquote({ children }) { return <blockquote className={blockquoteClassName}>{children}</blockquote> },
    a({ href, children }) {
      return <ChatMarkdownLink href={href} className={linkClassName}>{children}</ChatMarkdownLink>
    },
    hr() { return <hr className={ruleClassName} /> },
    table({ children, node }) {
      const tableModel = resolveMarkdownTableClassName(node)
      const tableRenderContext = {
        inlineCodeClassName,
        unorderedListClassName,
        orderedListClassName,
        listItemClassName,
        blockquoteClassName,
        linkClassName,
        strongClassName,
        emphasisClassName,
      }
      if (tableModel.variant === 'record_list') {
        return renderMarkdownRecordList(tableModel, tableRenderContext)
      }
      if (tableModel.variant === 'reference_table') {
        return renderMarkdownReferenceTable(tableModel, tableRenderContext)
      }
      const { className, wrapperClassName, columnWidths } = tableModel
      return (
        <div className={wrapperClassName}>
          <table className={className}>
            {columnWidths.length > 0 && (
              <colgroup>
                {columnWidths.map((width, index) => (
                  <col key={`chat-rich-col-${index}`} style={{ width }} />
                ))}
              </colgroup>
            )}
            {children}
          </table>
        </div>
      )
    },
    thead({ children }) {
      return <thead className="chat-markdown-thead">{children}</thead>
    },
    tbody({ children }) {
      return <tbody className="chat-markdown-tbody">{children}</tbody>
    },
    tr({ children }) {
      return <tr className="chat-markdown-row">{children}</tr>
    },
    th({ children }) {
      return <th className="chat-markdown-th"><div className="chat-markdown-cell-content">{children}</div></th>
    },
    td({ children }) {
      return <td className="chat-markdown-td"><div className="chat-markdown-cell-content">{children}</div></td>
    },
    strong({ children }) { return <strong className={strongClassName}>{children}</strong> },
    em({ children }) { return <em className={emphasisClassName}>{children}</em> },
  }
}

export function renderMarkdownCodeBlock(children, key = undefined) {
  const language = markdownCodeBlockLanguageFromPreChildren(children)
  const text = markdownCodeBlockTextFromPreChildren(children)
  return (
    <CodeSnippetBlock
      key={key}
      text={text}
      language={language}
    />
  )
}

export function useChatMarkdownComponents({ mode = 'assistant-message', config = null } = {}) {
  const resolvedConfig = useMemo(
    () => resolveChatMarkdownComponentConfig({ mode, config }),
    [config, mode],
  )

  return useMemo(() => createChatMarkdownComponents({ mode, config: resolvedConfig }), [mode, resolvedConfig])
}

function renderRichSegment(segment, idx, {
  keyPrefix,
  mode = 'assistant-message',
  isStreaming = false,
  featurePolicy = null,
  markdownComponents = {},
  renderMarkdown = null,
  renderPlainProse = null,
  renderDispatchConfirmationCard = null,
  renderCouncilResultCard = null,
  renderReviewReportCard = null,
  tryParseDispatchJson = null,
  tryParseCouncilJson = null,
  tryParseReviewJson = null,
}) {
  if (!segment || typeof segment !== 'object') return null
  const key = `${keyPrefix}:${idx}:${String(segment.id || 'segment')}`
  const resolvedFeaturePolicy = resolveChatRichContentFeaturePolicy({ mode, featurePolicy })
  const plainProseRenderer = typeof renderPlainProse === 'function'
    ? renderPlainProse
    : ({ text, key: proseKey }) => renderPlainProseText(text, { keyPrefix: proseKey })
  const markdownRenderer = typeof renderMarkdown === 'function'
    ? renderMarkdown
    : ({ text, key: proseKey }) => (
      <MemoProseMarkdown
        key={proseKey}
        text={text}
        components={markdownComponents}
      />
    )

  switch (segment.type) {
    case 'patch_file_group':
      if (!resolvedFeaturePolicy.allowPatchFileGroups) {
        const diffSegments = Array.isArray(segment.diffSegments) ? segment.diffSegments : []
        const fileLabel = String(segment.filePath || '').trim()
        return (
          <React.Fragment key={key}>
            {renderFileReferenceBlock({ key: `${key}:file`, filePath: fileLabel, label: fileLabel })}
            {diffSegments.map((diffSegment, diffIdx) => (
              <DiffCodeBlock
                key={`${key}:diff:${String(diffSegment?.id || diffIdx)}`}
                text={diffSegment?.text}
                language={diffSegment?.language || 'diff'}
              />
            ))}
          </React.Fragment>
        )
      }
      return (
        <PatchFileGroup
          key={key}
          filePath={segment.filePath}
          diffSegments={segment.diffSegments}
        />
      )
    case 'prose_markdown': {
      const segmentText = String(segment.text ?? '')

      if (
        !isStreaming
        && resolvedFeaturePolicy.allowDispatchCards
        && typeof tryParseDispatchJson === 'function'
        && typeof renderDispatchConfirmationCard === 'function'
      ) {
        const dispatchJson = tryParseDispatchJson(segmentText)
        if (dispatchJson) return renderDispatchConfirmationCard(dispatchJson, key)
      }
      if (
        !isStreaming
        && resolvedFeaturePolicy.allowCouncilCards
        && typeof tryParseCouncilJson === 'function'
        && typeof renderCouncilResultCard === 'function'
      ) {
        const councilJson = tryParseCouncilJson(segmentText)
        if (councilJson) return renderCouncilResultCard(councilJson, key)
      }
      if (
        !isStreaming
        && resolvedFeaturePolicy.allowReviewCards
        && typeof tryParseReviewJson === 'function'
        && typeof renderReviewReportCard === 'function'
      ) {
        const reviewJson = tryParseReviewJson(segmentText)
        if (reviewJson) return renderReviewReportCard(reviewJson, key)
      }

      if (hasDelegationPayload(segmentText)) {
        // Legacy markers and compact <delegation> XML are suppressed; the Agents surface owns spawn evidence.
        const prose = stripDelegationPayloads(segmentText)
        if (!prose) return null
        return messageTextNeedsMarkdownRuntime(prose)
          ? markdownRenderer({ key, text: prose })
          : plainProseRenderer({ key, text: prose })
      }

      return messageTextNeedsMarkdownRuntime(segmentText)
        ? markdownRenderer({ key, text: segmentText })
        : plainProseRenderer({ key, text: segmentText })
    }
    case 'diff_block':
      return (
        <DiffCodeBlock
          key={key}
          text={segment.text}
          language={segment.language || 'diff'}
        />
      )
    case 'code_block':
      return (
        <CodeSnippetBlock
          key={key}
          text={segment.text}
          language={segment.language || 'text'}
        />
      )
    case 'file_label':
      return renderFileReferenceBlock({
        key,
        filePath: segment.filePath,
        label: segment.rawLabel,
      })
    case 'raw_fallback':
      if (isStreaming) {
        return (
          <p key={key} className="whitespace-pre-wrap break-words text-chat-text">
            {String(segment.text ?? '')}
          </p>
        )
      }
      return <RawFallbackBlock key={key} text={segment.text} reason={segment.reason} />
    default:
      return null
  }
}

export function renderChatRichContentSegments(segments = [], options = {}) {
  const list = Array.isArray(segments) ? segments : []
  if (list.length === 0) return null
  const resolvedOptions = {
    ...options,
    featurePolicy: resolveChatRichContentFeaturePolicy({
      mode: options.mode,
      featurePolicy: options.featurePolicy,
    }),
  }
  return list.map((segment, idx) => renderRichSegment(segment, idx, resolvedOptions))
}
