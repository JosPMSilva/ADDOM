import React from 'react'
import {
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
} from './use-xterm-viewport.js'

export default function TerminalContextMenu({
  menuRef = null,
  contextMenu = null,
  labels = {},
  shortcutLabels = {},
  canInteract = false,
  hasSessionOutput = false,
  archived = false,
  terminalFontSize = TERMINAL_FONT_SIZE_DEFAULT,
  onKeepFocusPointer = null,
  onCutSelection = null,
  onCopySelection = null,
  onCopyVisibleOutput = null,
  onCopyFullScrollback = null,
  onSendOutputToChat = null,
  onExplainLastError = null,
  onSummarizeSession = null,
  onSaveSnapshotToMemory = null,
  memoryPending = false,
  onPaste = null,
  onPasteSingleLine = null,
  onSelectAll = null,
  onClear = null,
  onZoomIn = null,
  onZoomOut = null,
  onZoomReset = null,
}) {
  if (!contextMenu) return null

  const itemClass = 'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[12px] text-text-primary hover:bg-surface-panel/80 disabled:cursor-not-allowed disabled:text-text-tertiary'

  return (
    <div
      ref={menuRef}
      className="absolute z-20 max-h-[calc(100%-1.5rem)] min-w-[13rem] overflow-y-auto rounded-2xl border border-surface-border bg-surface-panel-muted-strong/95 p-1.5 shadow-[0_18px_44px_rgb(var(--theme-shadow-rgb)_/_0.44)] backdrop-blur"
      style={{
        left: `${contextMenu.x}px`,
        top: `${contextMenu.y}px`,
      }}
  role="menu"
      aria-label={labels.terminalActions || 'Terminal actions'}
      data-ui="terminal-context-menu"
    >
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onCutSelection}
        disabled={contextMenu.canCut !== true}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.cut || 'Cut selection'}</span>
        {shortcutLabels.cutSelection ? (
          <span className="font-mono text-[11px] text-text-tertiary">{shortcutLabels.cutSelection}</span>
        ) : null}
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onCopySelection}
        disabled={contextMenu.canCopy !== true}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.copy || 'Copy'}</span>
        <span className="font-mono text-[11px] text-text-tertiary">{shortcutLabels.copySelection}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onCopyVisibleOutput}
        disabled={!hasSessionOutput}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.copyVisibleOutput || 'Copy visible output'}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onCopyFullScrollback}
        disabled={!hasSessionOutput}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.copyFullScrollback || 'Copy full scrollback'}</span>
      </button>
      <div className="my-1 h-px bg-surface-border/60" role="separator" />
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onSendOutputToChat}
        disabled={!hasSessionOutput}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.sendOutputToChat || 'Send output to chat'}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onExplainLastError}
        disabled={!hasSessionOutput}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.explainLastError || 'Explain last error'}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onSummarizeSession}
        disabled={!hasSessionOutput}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.summarizeSession || 'Summarize session'}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onSaveSnapshotToMemory}
        disabled={!hasSessionOutput || archived || memoryPending}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.saveSnapshotToMemory || 'Save snapshot to Memory'}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onPaste}
        disabled={!canInteract}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.paste || 'Paste'}</span>
        <span className="font-mono text-[11px] text-text-tertiary">{shortcutLabels.pasteClipboard}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onPasteSingleLine}
        disabled={!canInteract}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.pasteAsSingleLine || 'Paste as single line'}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onSelectAll}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.selectAll || 'Select all'}</span>
        <span className="text-[11px] text-text-tertiary">{labels.buffer || 'Buffer'}</span>
      </button>
      <div className="my-1 h-px bg-surface-border/60" role="separator" />
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onClear}
        disabled={!hasSessionOutput || archived}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.clear || 'Clear'}</span>
        <span className="font-mono text-[11px] text-text-tertiary">{shortcutLabels.clear}</span>
      </button>
      <div className="my-1 h-px bg-surface-border/60" role="separator" />
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onZoomIn}
        disabled={terminalFontSize >= TERMINAL_FONT_SIZE_MAX}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.zoomIn || 'Zoom in'}</span>
        <span className="font-mono text-[11px] text-text-tertiary">{shortcutLabels.zoomIn}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onZoomOut}
        disabled={terminalFontSize <= TERMINAL_FONT_SIZE_MIN}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.zoomOut || 'Zoom out'}</span>
        <span className="font-mono text-[11px] text-text-tertiary">{shortcutLabels.zoomOut}</span>
      </button>
      <button
        type="button"
        onMouseDown={onKeepFocusPointer}
        onClick={onZoomReset}
        disabled={terminalFontSize === TERMINAL_FONT_SIZE_DEFAULT}
        className={itemClass}
        role="menuitem"
      >
        <span>{labels.zoomReset || 'Reset zoom'}</span>
        <span className="font-mono text-[11px] text-text-tertiary">
          {labels.terminalFontSize?.replace?.('{{size}}', terminalFontSize) || `${terminalFontSize}px`}
        </span>
      </button>
    </div>
  )
}
