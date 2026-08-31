import React, { useCallback, useMemo, useRef, useState } from 'react'
import LiveExecutionStreamBlock from './LiveExecutionStreamBlock.jsx'
import TurnFileChangesCard from './TurnFileChangesCard.jsx'
import { summarizeTurnFileChanges } from './turn-file-changes.mjs'
import { shouldRenderExecutionTurn } from './turn-shell-execution.mjs'

/**
 * Provider-agnostic turn chrome:
 *   execution header → final answer → file artifacts
 *
 * Owned by the assistant message / streaming turn path so Cursor, OpenAI,
 * and other providers share one reading order.
 */
export default function TurnShell({
  turnId = '',
  activities = [],
  fileRows = [],
  projectFolder = '',
  isLiveTurn = false,
  executionTurn = null,
  finalAnswerStarted = false,
  onContinueInterruptedTurn,
  dockSource = '',
  children = null,
}) {
  const hasFiles = Array.isArray(fileRows) && fileRows.length > 0
  const hasExecution = shouldRenderExecutionTurn(executionTurn, {
    isLiveTurn,
    canContinueInterrupted: typeof onContinueInterruptedTurn === 'function',
  })
  const hasAnswer = children != null && children !== false
  const filesSummary = useMemo(
    () => (hasFiles ? summarizeTurnFileChanges(fileRows) : null),
    [fileRows, hasFiles],
  )
  const filesSlotRef = useRef(null)
  const [filesPulse, setFilesPulse] = useState(false)
  const filesPulseTimerRef = useRef(0)

  const revealFiles = useCallback(() => {
    const node = filesSlotRef.current
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    if (filesPulseTimerRef.current) {
      clearTimeout(filesPulseTimerRef.current)
    }
    setFilesPulse(true)
    filesPulseTimerRef.current = setTimeout(() => {
      setFilesPulse(false)
      filesPulseTimerRef.current = 0
    }, 1100)
  }, [])

  React.useEffect(() => () => {
    if (filesPulseTimerRef.current) clearTimeout(filesPulseTimerRef.current)
  }, [])

  if (!hasFiles && !hasExecution && !hasAnswer) return null

  const filesHint = hasFiles && hasExecution && filesSummary?.fileCount > 0
    ? {
      fileCount: filesSummary.fileCount,
      totalAdded: filesSummary.totalAdded,
      totalRemoved: filesSummary.totalRemoved,
      onReveal: revealFiles,
    }
    : null

  return (
    <div
      data-turn-shell="true"
      data-turn-boundary={(hasExecution || hasFiles) && hasAnswer ? 'spaced' : undefined}
    >
      {hasExecution ? (
        <div data-turn-shell-slot="execution" className="overflow-visible">
          <LiveExecutionStreamBlock
            turn={executionTurn}
            isLiveTurn={isLiveTurn}
            finalAnswerStarted={finalAnswerStarted}
            onContinueInterruptedTurn={onContinueInterruptedTurn}
            filesHint={filesHint}
          />
        </div>
      ) : null}
      {hasAnswer ? (
        <div data-turn-shell-slot="answer">
          {children}
        </div>
      ) : null}
      {hasFiles ? (
        <div
          ref={filesSlotRef}
          data-turn-shell-slot="files"
          data-turn-shell-files-pulse={filesPulse ? 'true' : undefined}
          className="overflow-visible"
        >
          <TurnFileChangesCard
            turnId={turnId}
            activities={activities}
            fileRows={fileRows}
            projectFolder={projectFolder}
            isLiveTurn={isLiveTurn}
            dockSource={dockSource}
          />
        </div>
      ) : null}
    </div>
  )
}
