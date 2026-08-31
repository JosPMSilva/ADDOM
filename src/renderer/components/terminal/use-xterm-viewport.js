import { Terminal } from '@xterm/xterm/lib/xterm.mjs'
import { FitAddon } from '@xterm/addon-fit/lib/addon-fit.mjs'
import { SearchAddon } from '@xterm/addon-search/lib/addon-search.mjs'
import { WebLinksAddon } from '@xterm/addon-web-links/lib/addon-web-links.mjs'
import {
  buildTerminalSearchDecorations,
  buildTerminalTheme,
} from '../../theme/specialized-theme-adapters.mjs'
import {
  getResolvedAppearanceMode,
  subscribeAppearanceChanges,
} from '../../theme/appearance-runtime.mjs'
import {
  TERMINAL_KEY_ACTIONS,
  normalizeTerminalPlatform,
  resolveTerminalKeyAction,
} from './terminal-keymap.mjs'
import { createTerminalWorkspaceLinkProvider } from './terminal-output-links.mjs'
import {
  DEFAULT_TERMINAL_SETTINGS,
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  clampTerminalFontSize,
  normalizeTerminalSettings,
  resolveTerminalFontFamily,
} from '../../../common/terminal/terminal-settings.mjs'

export {
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  clampTerminalFontSize,
}

const BASE_TERMINAL_OPTIONS = Object.freeze({
  allowTransparency: false,
  bellStyle: 'none',
  convertEol: false,
  cursorBlink: true,
  cursorInactiveStyle: 'outline',
  cursorStyle: 'block',
  drawBoldTextInBrightColors: true,
  fontFamily: resolveTerminalFontFamily(DEFAULT_TERMINAL_SETTINGS.fontFamily),
  fontSize: TERMINAL_FONT_SIZE_DEFAULT,
  lineHeight: 1.45,
  letterSpacing: 0,
  scrollback: DEFAULT_TERMINAL_SETTINGS.scrollback,
  theme: buildTerminalTheme('dark'),
})

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function toPositiveInteger(value = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0
}

export function isTerminalInteractive(runtimeHealth = null, session = null) {
  return asTrimmedString(runtimeHealth?.status).toLowerCase() === 'supported'
    && asTrimmedString(session?.status || 'running').toLowerCase() === 'running'
    && !!asTrimmedString(session?.id)
}

export function resolveRendererPlatform() {
  if (typeof navigator === 'undefined') return ''
  return normalizeTerminalPlatform(
    navigator.userAgentData?.platform
    || navigator.platform
    || navigator.userAgent,
  )
}

export function buildTerminalOptions({
  platform = resolveRendererPlatform(),
  fontSize,
  terminalSettings = DEFAULT_TERMINAL_SETTINGS,
} = {}) {
  const normalizedPlatform = normalizeTerminalPlatform(platform)
  const normalizedTerminalSettings = normalizeTerminalSettings(terminalSettings)
  return {
    ...BASE_TERMINAL_OPTIONS,
    fontFamily: resolveTerminalFontFamily(normalizedTerminalSettings.fontFamily),
    fontSize: clampTerminalFontSize(fontSize ?? normalizedTerminalSettings.fontSize),
    scrollback: normalizedTerminalSettings.scrollback,
    theme: { ...buildTerminalTheme(getResolvedAppearanceMode()) },
    // Keep native Option/dead-key composition on macOS instead of forcing Meta.
    macOptionIsMeta: normalizedPlatform === 'darwin' ? false : undefined,
  }
}

function createAnimationFrameScheduler(callback) {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    let frameId = 0
    return {
      schedule() {
        if (frameId) window.cancelAnimationFrame(frameId)
        frameId = window.requestAnimationFrame(() => {
          frameId = 0
          callback()
        })
      },
      cancel() {
        if (!frameId) return
        window.cancelAnimationFrame(frameId)
        frameId = 0
      },
    }
  }

  let timeoutId = null
  return {
    schedule() {
      if (timeoutId !== null) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        timeoutId = null
        callback()
      }, 0)
    },
    cancel() {
      if (timeoutId === null) return
      clearTimeout(timeoutId)
      timeoutId = null
    },
  }
}

function stopEventPropagation(event) {
  event.stopPropagation()
}

function createDomEventDisposable(target, eventName, handler) {
  if (!target?.addEventListener || !target?.removeEventListener || typeof handler !== 'function') {
    return { dispose() {} }
  }
  target.addEventListener(eventName, handler)
  return {
    dispose() {
      target.removeEventListener(eventName, handler)
    },
  }
}

function createDisposableGroup(...entries) {
  return () => {
    for (const entry of entries) {
      try {
        entry?.dispose?.()
      } catch {
        // Best-effort renderer cleanup only.
      }
    }
  }
}

function getBufferLineText(buffer = null, lineIndex = 0) {
  const line = buffer?.getLine?.(lineIndex)
  if (!line || typeof line.translateToString !== 'function') return ''
  return line.translateToString(true)
}

function trimTrailingBlankLines(lines = []) {
  const nextLines = Array.isArray(lines) ? [...lines] : []
  while (nextLines.length > 0 && String(nextLines.at(-1) || '').trim() === '') {
    nextLines.pop()
  }
  return nextLines
}

function extractTerminalBufferText(terminal = null, mode = 'full') {
  const buffer = terminal?.buffer?.active
  if (!buffer || typeof buffer.getLine !== 'function') return ''

  const bufferLength = toPositiveInteger(buffer.length || (Number(buffer.baseY || 0) + Number(terminal?.rows || 0)))
  if (!bufferLength) return ''

  const start = mode === 'visible'
    ? Math.max(0, Number(buffer.viewportY || 0))
    : 0
  const rowCount = mode === 'visible'
    ? toPositiveInteger(terminal?.rows || bufferLength)
    : bufferLength
  const end = Math.min(bufferLength, start + rowCount)
  const lines = []
  for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
    lines.push(getBufferLineText(buffer, lineIndex))
  }
  return trimTrailingBlankLines(lines).join('\n')
}

function extractTerminalSelectionText(terminal = null, startPosition = null, endPosition = null) {
  const buffer = terminal?.buffer?.active
  if (!buffer || typeof buffer.getLine !== 'function') return ''
  const start = createSelectionKeyPosition(startPosition)
  const end = createSelectionKeyPosition(endPosition)
  const cols = Math.max(1, Number(terminal?.cols || 0))
  const startIndex = getSelectionLinearIndex(start, cols)
  const endIndex = getSelectionLinearIndex(end, cols)
  const from = startIndex <= endIndex ? start : end
  const to = startIndex <= endIndex ? end : start
  if (areSelectionPositionsEqual(from, to)) return ''

  const lines = []
  for (let row = from.row; row <= to.row; row += 1) {
    const lineText = getBufferLineText(buffer, row)
    const sliceStart = row === from.row ? from.column : 0
    const sliceEnd = row === to.row ? to.column : lineText.length
    lines.push(lineText.slice(sliceStart, sliceEnd))
  }
  return lines.join('\n')
}

function createSearchOptions({ incremental = false } = {}) {
  return {
    incremental: incremental === true,
    decorations: { ...buildTerminalSearchDecorations(getResolvedAppearanceMode()) },
  }
}

function getTerminalBufferCursorPosition(terminal) {
  const buffer = terminal?.buffer?.active
  const row = Math.max(0, Number(buffer?.baseY || 0) + Number(buffer?.cursorY || 0))
  const column = Math.max(0, Number(buffer?.cursorX || 0))
  return { row, column }
}

function createSelectionKeyPosition({ row = 0, column = 0 } = {}) {
  return {
    row: Math.max(0, Number(row || 0)),
    column: Math.max(0, Number(column || 0)),
  }
}

function areSelectionPositionsEqual(left = null, right = null) {
  return Number(left?.row || 0) === Number(right?.row || 0)
    && Number(left?.column || 0) === Number(right?.column || 0)
}

function getSelectionLinearIndex(position = null, cols = 0) {
  const normalizedCols = Math.max(1, Number(cols || 0))
  return (Math.max(0, Number(position?.row || 0)) * normalizedCols)
    + Math.max(0, Math.min(normalizedCols, Number(position?.column || 0)))
}

function getSelectionPositionFromLinearIndex(index = 0, cols = 0, maxRow = 0) {
  const normalizedCols = Math.max(1, Number(cols || 0))
  const normalizedMaxRow = Math.max(0, Number(maxRow || 0))
  const normalizedIndex = Math.max(0, Number(index || 0))
  return {
    row: Math.min(normalizedMaxRow, Math.floor(normalizedIndex / normalizedCols)),
    column: Math.max(0, Math.min(normalizedCols, normalizedIndex % normalizedCols)),
  }
}

function resolveKeyboardSelectionTargetPosition(terminal, event, startPosition) {
  const key = asTrimmedString(event?.key)
  const cols = Math.max(1, Number(terminal?.cols || 0))
  const bufferLength = Math.max(1, Number(terminal?.buffer?.active?.length || 1))
  const maxRow = Math.max(0, bufferLength - 1)
  const current = createSelectionKeyPosition(startPosition)

  if (key === 'ArrowLeft') {
    const currentIndex = getSelectionLinearIndex(current, cols)
    return getSelectionPositionFromLinearIndex(currentIndex - 1, cols, maxRow)
  }
  if (key === 'ArrowRight') {
    const currentIndex = getSelectionLinearIndex(current, cols)
    return getSelectionPositionFromLinearIndex(currentIndex + 1, cols, maxRow)
  }
  if (key === 'ArrowUp') {
    return {
      row: Math.max(0, current.row - 1),
      column: current.column,
    }
  }
  if (key === 'ArrowDown') {
    return {
      row: Math.min(maxRow, current.row + 1),
      column: current.column,
    }
  }
  if (key === 'Home') {
    return {
      row: current.row,
      column: 0,
    }
  }
  if (key === 'End') {
    return {
      row: current.row,
      column: cols,
    }
  }
  return null
}

function isKeyboardSelectionShortcut(event = null) {
  if (!event || typeof event !== 'object') return false
  if (asTrimmedString(event.type || 'keydown').toLowerCase() !== 'keydown') return false
  if (event.defaultPrevented === true) return false
  if (event.shiftKey !== true) return false
  if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) return false
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(asTrimmedString(event.key))
}

function resolveKeyboardSelectionInputSequence(event = null) {
  const key = asTrimmedString(event?.key)
  if (key === 'ArrowLeft') return '\u001b[D'
  if (key === 'ArrowRight') return '\u001b[C'
  if (key === 'ArrowUp') return '\u001b[A'
  if (key === 'ArrowDown') return '\u001b[B'
  if (key === 'Home') return '\u001b[H'
  if (key === 'End') return '\u001b[F'
  return ''
}

function isPrintableTerminalInput(event = null) {
  if (!event || typeof event !== 'object') return false
  if (asTrimmedString(event.type || 'keydown').toLowerCase() !== 'keydown') return false
  if (event.defaultPrevented === true) return false
  if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) return false
  return asTrimmedString(event.key).length === 1
}

function isSelectionDeleteShortcut(event = null) {
  if (!event || typeof event !== 'object') return false
  if (asTrimmedString(event.type || 'keydown').toLowerCase() !== 'keydown') return false
  if (event.defaultPrevented === true) return false
  if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) return false
  return ['Backspace', 'Delete'].includes(asTrimmedString(event.key))
}

function writeTerminalOutput(terminal, data = '', inputReplayState = null) {
  const nextData = String(data || '')
  if (!nextData) return
  if (inputReplayState && typeof inputReplayState === 'object') {
    inputReplayState.depth = Number(inputReplayState.depth || 0) + 1
    terminal.write(nextData, () => {
      inputReplayState.depth = Math.max(0, Number(inputReplayState.depth || 0) - 1)
    })
    return
  }
  terminal.write(nextData)
}

function syncTerminalOutputSafely(terminal, previousOutput = '', nextOutput = '', inputReplayState = null) {
  const prior = String(previousOutput || '')
  const next = String(nextOutput || '')
  if (next === prior) return next
  if (!next) {
    terminal.reset()
    return ''
  }
  if (prior && next.startsWith(prior)) {
    const delta = next.slice(prior.length)
    if (delta) writeTerminalOutput(terminal, delta, inputReplayState)
    return next
  }
  terminal.reset()
  writeTerminalOutput(terminal, next, inputReplayState)
  return next
}

export function createXtermViewportController({
  hostElement = null,
  createTerminal = null,
  createFitAddon = null,
  createSearchAddon = null,
  createWebLinksAddon = null,
  platform = resolveRendererPlatform(),
  projectFolder = '',
  fontSize = TERMINAL_FONT_SIZE_DEFAULT,
  terminalSettings = DEFAULT_TERMINAL_SETTINGS,
  onInput = null,
  onResize = null,
  onMetricsChange = null,
  onVisibleTextChange = null,
  onFocusChange = null,
  onSearchResultsChange = null,
  onOpenUrlLink = null,
  onOpenWorkspaceFileLink = null,
  onCutSelection = null,
  onCopySelection = null,
  onPasteRequest = null,
  onFindRequest = null,
  onClearRequest = null,
  onNewTerminalRequest = null,
  onCloseTerminalRequest = null,
  onSwitchPreviousSessionRequest = null,
  onSwitchNextSessionRequest = null,
  onZoomInRequest = null,
  onZoomOutRequest = null,
  onZoomResetRequest = null,
  onSelectionChange = null,
} = {}) {
  if (!hostElement || typeof createTerminal !== 'function' || typeof createFitAddon !== 'function') {
    return null
  }

  const terminal = createTerminal(buildTerminalOptions({ platform, fontSize, terminalSettings }))
  const fitAddon = createFitAddon()
  const searchAddon = typeof createSearchAddon === 'function'
    ? createSearchAddon()
    : null
  const webLinksAddon = typeof createWebLinksAddon === 'function'
    ? createWebLinksAddon((event, uri) => {
        onOpenUrlLink?.(uri, event)
      })
    : null
  terminal.loadAddon(fitAddon)
  if (searchAddon) {
    terminal.loadAddon(searchAddon)
  }
  if (webLinksAddon) {
    terminal.loadAddon(webLinksAddon)
  }
  terminal.open(hostElement)
  const unsubscribeAppearance = subscribeAppearanceChanges(({ resolvedMode }) => {
    terminal.options.theme = { ...buildTerminalTheme(resolvedMode) }
  })
  const rendererPlatform = normalizeTerminalPlatform(platform)

  let disposed = false
  let sessionId = ''
  let rawOutput = ''
  let canInteract = false
  let currentProjectFolder = asTrimmedString(projectFolder)
  let resizeObserver = null
  let lastMeasured = { cols: 0, rows: 0 }
  let lastPublished = { sessionId: '', cols: 0, rows: 0 }
  let lastVisibleTextSignature = ''
  let keyboardSelectionAnchor = null
  let keyboardSelectionFocus = null
  let keyboardSelectionInputInFlight = false
  const keyboardSelectionInputQueue = []
  let deferredKeyboardSelectionAction = null
  let currentTerminalSettings = normalizeTerminalSettings(terminalSettings)
  let currentFontSize = clampTerminalFontSize(fontSize ?? currentTerminalSettings.fontSize)
  const inputReplayState = { depth: 0 }

  const clearKeyboardSelectionState = () => {
    keyboardSelectionAnchor = null
    keyboardSelectionFocus = null
    keyboardSelectionInputInFlight = false
    keyboardSelectionInputQueue.length = 0
    deferredKeyboardSelectionAction = null
    terminal.clearSelection?.()
    onSelectionChange?.('')
  }

  const renderKeyboardSelection = () => {
    if (!keyboardSelectionAnchor || !keyboardSelectionFocus) {
      terminal.clearSelection?.()
      onSelectionChange?.('')
      return
    }
    if (areSelectionPositionsEqual(keyboardSelectionAnchor, keyboardSelectionFocus)) {
      terminal.clearSelection?.()
      onSelectionChange?.('')
      return
    }
    const cols = Math.max(1, Number(terminal.cols || 0))
    const anchorIndex = getSelectionLinearIndex(keyboardSelectionAnchor, cols)
    const focusIndex = getSelectionLinearIndex(keyboardSelectionFocus, cols)
    const selectionStart = anchorIndex <= focusIndex ? keyboardSelectionAnchor : keyboardSelectionFocus
    const selectionLength = Math.abs(focusIndex - anchorIndex)
    terminal.select?.(
      Math.max(0, Number(selectionStart.column || 0)),
      Math.max(0, Number(selectionStart.row || 0)),
      selectionLength,
    )
    onSelectionChange?.(extractTerminalSelectionText(terminal, keyboardSelectionAnchor, keyboardSelectionFocus))
  }

  const getActiveKeyboardSelection = () => {
    if (!keyboardSelectionAnchor || !keyboardSelectionFocus) return null
    if (areSelectionPositionsEqual(keyboardSelectionAnchor, keyboardSelectionFocus)) return null
    const cols = Math.max(1, Number(terminal.cols || 0))
    const anchorIndex = getSelectionLinearIndex(keyboardSelectionAnchor, cols)
    const focusIndex = getSelectionLinearIndex(keyboardSelectionFocus, cols)
    return {
      anchorIndex,
      focusIndex,
      length: Math.abs(focusIndex - anchorIndex),
      focusBeforeAnchor: focusIndex < anchorIndex,
    }
  }

  const forwardSyntheticInput = (data = '') => {
    const text = String(data || '')
    if (!text || !canInteract || !sessionId) return false
    onInput?.(sessionId, text)
    return true
  }

  const hasPendingKeyboardSelectionInput = () => (
    keyboardSelectionInputInFlight
    || keyboardSelectionInputQueue.length > 0
  )

  const flushDeferredKeyboardSelectionAction = () => {
    if (hasPendingKeyboardSelectionInput()) return false
    const action = deferredKeyboardSelectionAction
    if (typeof action !== 'function') return false
    deferredKeyboardSelectionAction = null
    action()
    return true
  }

  const deferKeyboardSelectionAction = (action) => {
    if (typeof action !== 'function') return false
    deferredKeyboardSelectionAction = action
    return true
  }

  const flushQueuedKeyboardSelectionInput = () => {
    if (keyboardSelectionInputInFlight || keyboardSelectionInputQueue.length <= 0) return
    const nextSequence = String(keyboardSelectionInputQueue.shift() || '')
    if (!nextSequence) return
    keyboardSelectionInputInFlight = true
    if (!forwardSyntheticInput(nextSequence)) {
      keyboardSelectionInputInFlight = false
      flushDeferredKeyboardSelectionAction()
    }
  }

  const deleteActiveKeyboardSelection = () => {
    const activeSelection = getActiveKeyboardSelection()
    if (!activeSelection?.length) return false
    const deleteSequence = activeSelection.focusBeforeAnchor ? '\u001b[3~' : '\u007f'
    forwardSyntheticInput(deleteSequence.repeat(activeSelection.length))
    clearKeyboardSelectionState()
    return true
  }

  const syncKeyboardSelectionToCursor = () => {
    if (!keyboardSelectionAnchor) return
    keyboardSelectionInputInFlight = false
    keyboardSelectionFocus = createSelectionKeyPosition(getTerminalBufferCursorPosition(terminal))
    renderKeyboardSelection()
    flushQueuedKeyboardSelectionInput()
    flushDeferredKeyboardSelectionAction()
  }

  const getResolvedSelectionText = () => {
    const directSelectionText = String(terminal.getSelection?.() || '')
    if (directSelectionText) return directSelectionText
    if (!keyboardSelectionAnchor || !keyboardSelectionFocus) return ''
    return extractTerminalSelectionText(terminal, keyboardSelectionAnchor, keyboardSelectionFocus)
  }

  const fitTerminalToViewport = () => {
    const proposed = fitAddon.proposeDimensions?.()
    const cols = toPositiveInteger(proposed?.cols)
    const rows = toPositiveInteger(proposed?.rows)
    if (!cols || !rows) return false
    fitAddon.fit()
    return true
  }

  const publishDimensions = () => {
    if (disposed) return
    const proposed = fitAddon.proposeDimensions?.()
    const cols = toPositiveInteger(proposed?.cols || terminal.cols)
    const rows = toPositiveInteger(proposed?.rows || terminal.rows)
    if (!cols || !rows) return

    const metricsChanged = (
      lastMeasured.cols !== cols
      || lastMeasured.rows !== rows
    )
    if (metricsChanged) {
      lastMeasured = { cols, rows }
      onMetricsChange?.({ cols, rows })
    }

    if (!sessionId || !canInteract) return

    const resizeUnchanged = (
      lastPublished.sessionId === sessionId
      && lastPublished.cols === cols
      && lastPublished.rows === rows
    )
    if (resizeUnchanged) return
    lastPublished = { sessionId, cols, rows }
    onResize?.(sessionId, { cols, rows })
  }

  const publishVisibleText = () => {
    if (disposed || !sessionId || !canInteract) return
    const proposed = fitAddon.proposeDimensions?.()
    const cols = toPositiveInteger(proposed?.cols || terminal.cols)
    const rows = toPositiveInteger(proposed?.rows || terminal.rows)
    const text = extractTerminalBufferText(terminal, 'visible')
    const capturedAt = Date.now()
    const signature = JSON.stringify([sessionId, cols, rows, text])
    if (signature === lastVisibleTextSignature) return
    lastVisibleTextSignature = signature
    onVisibleTextChange?.(sessionId, {
      text,
      cols,
      rows,
      capturedAt,
    })
  }

  const scheduler = createAnimationFrameScheduler(() => {
    fitTerminalToViewport()
    publishDimensions()
    publishVisibleText()
  })

  const keyboardEvents = ['keydown', 'keypress', 'keyup']
  for (const eventName of keyboardEvents) {
    hostElement.addEventListener(eventName, stopEventPropagation)
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      scheduler.schedule()
    })
    resizeObserver.observe(hostElement)
  }

  const dataDisposable = terminal.onData((data) => {
    if (Number(inputReplayState.depth || 0) > 0) return
    if (!canInteract || !sessionId || !data) return
    onInput?.(sessionId, data)
  })
  const focusDisposable = typeof terminal.onFocus === 'function'
    ? terminal.onFocus(() => {
      onFocusChange?.(true)
    })
    : createDomEventDisposable(terminal.textarea || hostElement, 'focus', () => {
      onFocusChange?.(true)
    })
  const blurDisposable = typeof terminal.onBlur === 'function'
    ? terminal.onBlur(() => {
      onFocusChange?.(false)
    })
    : createDomEventDisposable(terminal.textarea || hostElement, 'blur', () => {
      onFocusChange?.(false)
    })
  const searchResultsDisposable = typeof searchAddon?.onDidChangeResults === 'function'
    ? searchAddon.onDidChangeResults((event) => {
      onSearchResultsChange?.({
        resultIndex: Number(event?.resultIndex ?? -1),
        resultCount: Number(event?.resultCount ?? 0),
      })
    })
    : null
  const scrollDisposable = typeof terminal.onScroll === 'function'
    ? terminal.onScroll(() => {
      scheduler.schedule()
    })
    : null
  const cursorMoveDisposable = typeof terminal.onCursorMove === 'function'
    ? terminal.onCursorMove(() => {
      syncKeyboardSelectionToCursor()
    })
    : null
  const selectionDisposable = typeof terminal.onSelectionChange === 'function'
    ? terminal.onSelectionChange(() => {
      onSelectionChange?.(String(terminal.getSelection?.() || ''))
    })
    : null
  const workspaceLinkDisposable = typeof terminal.registerLinkProvider === 'function'
    ? terminal.registerLinkProvider(createTerminalWorkspaceLinkProvider({
        terminal,
        getProjectFolder: () => currentProjectFolder,
        onOpenWorkspaceFileLink,
      }))
    : null
  const disposeTerminalEvents = createDisposableGroup(
    dataDisposable,
    focusDisposable,
    blurDisposable,
    searchResultsDisposable,
    scrollDisposable,
    cursorMoveDisposable,
    selectionDisposable,
    workspaceLinkDisposable,
  )
  const shortcutHandlers = {
    [TERMINAL_KEY_ACTIONS.find]: onFindRequest,
    [TERMINAL_KEY_ACTIONS.clear]: onClearRequest,
    [TERMINAL_KEY_ACTIONS.newTerminal]: onNewTerminalRequest,
    [TERMINAL_KEY_ACTIONS.closeTerminal]: onCloseTerminalRequest,
    [TERMINAL_KEY_ACTIONS.switchPreviousSession]: onSwitchPreviousSessionRequest,
    [TERMINAL_KEY_ACTIONS.switchNextSession]: onSwitchNextSessionRequest,
    [TERMINAL_KEY_ACTIONS.zoomIn]: onZoomInRequest,
    [TERMINAL_KEY_ACTIONS.zoomOut]: onZoomOutRequest,
    [TERMINAL_KEY_ACTIONS.zoomReset]: onZoomResetRequest,
  }

  const consumeTerminalShortcut = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  terminal.attachCustomKeyEventHandler?.((event) => {
    if ((getActiveKeyboardSelection() || keyboardSelectionAnchor) && isPrintableTerminalInput(event)) {
      consumeTerminalShortcut(event)
      if (hasPendingKeyboardSelectionInput()) {
        deferKeyboardSelectionAction(() => {
          deleteActiveKeyboardSelection()
          forwardSyntheticInput(event.key)
        })
        return false
      }
      deleteActiveKeyboardSelection()
      forwardSyntheticInput(event.key)
      return false
    }

    if ((getActiveKeyboardSelection() || keyboardSelectionAnchor) && isSelectionDeleteShortcut(event)) {
      consumeTerminalShortcut(event)
      if (hasPendingKeyboardSelectionInput()) {
        deferKeyboardSelectionAction(() => {
          deleteActiveKeyboardSelection()
        })
        return false
      }
      deleteActiveKeyboardSelection()
      return false
    }

    if (isKeyboardSelectionShortcut(event)) {
      const currentCursorPosition = getTerminalBufferCursorPosition(terminal)
      const activeAnchor = keyboardSelectionAnchor || currentCursorPosition
      consumeTerminalShortcut(event)
      keyboardSelectionAnchor = createSelectionKeyPosition(activeAnchor)
      keyboardSelectionFocus = createSelectionKeyPosition(currentCursorPosition)
      keyboardSelectionInputQueue.push(resolveKeyboardSelectionInputSequence(event))
      flushQueuedKeyboardSelectionInput()
      if (typeof terminal.onCursorMove !== 'function') {
        const nextFocus = resolveKeyboardSelectionTargetPosition(terminal, event, currentCursorPosition)
        if (!nextFocus) return false
        keyboardSelectionFocus = createSelectionKeyPosition(nextFocus)
        keyboardSelectionInputInFlight = false
        renderKeyboardSelection()
        flushQueuedKeyboardSelectionInput()
      }
      return false
    }

    const keyAction = resolveTerminalKeyAction(event, rendererPlatform)
    if (!keyAction) return true

    if (keyAction.id === TERMINAL_KEY_ACTIONS.cutSelection) {
      if (!getActiveKeyboardSelection() && !keyboardSelectionAnchor) return true
      consumeTerminalShortcut(event)
      if (hasPendingKeyboardSelectionInput()) {
        deferKeyboardSelectionAction(() => {
          const selectionText = getResolvedSelectionText()
          if (!selectionText) return
          onCutSelection?.(selectionText)
        })
        return false
      }
      onCutSelection?.(getResolvedSelectionText())
      return false
    }
    if (keyAction.id === TERMINAL_KEY_ACTIONS.copySelection) {
      if (!getResolvedSelectionText() && !keyboardSelectionAnchor) return true
      consumeTerminalShortcut(event)
      if (hasPendingKeyboardSelectionInput()) {
        deferKeyboardSelectionAction(() => {
          const selectionText = getResolvedSelectionText()
          if (!selectionText) return
          onCopySelection?.(selectionText)
        })
        return false
      }
      const selectionText = getResolvedSelectionText()
      if (!selectionText) return false
      onCopySelection?.(selectionText)
      return false
    }
    if (keyAction.id === TERMINAL_KEY_ACTIONS.pasteClipboard) {
      consumeTerminalShortcut(event)
      onPasteRequest?.()
      return false
    }
    consumeTerminalShortcut(event)
    shortcutHandlers[keyAction.id]?.()
    return false
  })

  const controller = {
    focus() {
      if (disposed) return
      terminal.focus()
    },
    blur() {
      if (disposed) return
      terminal.textarea?.blur?.()
    },
    hasSelection() {
      if (disposed) return false
      return terminal.hasSelection?.() === true
    },
    getSelectionText() {
      if (disposed) return ''
      return getResolvedSelectionText()
    },
    pasteText(data = '') {
      if (disposed) return
      const text = String(data || '')
      if (!text) return
      if (typeof terminal.paste === 'function') {
        terminal.paste(text)
        return
      }
      if (typeof terminal.input === 'function') {
        terminal.input(text, true)
      }
    },
    clearSelection() {
      if (disposed) return
      clearKeyboardSelectionState()
    },
    selectAll() {
      if (disposed) return
      keyboardSelectionAnchor = null
      keyboardSelectionFocus = null
      terminal.selectAll?.()
    },
    canDeleteSelection() {
      if (disposed) return false
      return !!getActiveKeyboardSelection()
    },
    deleteSelection() {
      if (disposed) return false
      return deleteActiveKeyboardSelection()
    },
    getVisibleText() {
      if (disposed) return ''
      return extractTerminalBufferText(terminal, 'visible')
    },
    getFullScrollbackText() {
      if (disposed) return ''
      return extractTerminalBufferText(terminal, 'full') || rawOutput
    },
    clearBuffer() {
      if (disposed || typeof terminal.clear !== 'function') return false
      terminal.clear()
      clearKeyboardSelectionState()
      searchAddon?.clearDecorations?.()
      onSearchResultsChange?.({ resultIndex: -1, resultCount: 0 })
      return true
    },
    findNext(query = '', options = {}) {
      if (disposed || !searchAddon) return false
      const term = String(query || '')
      if (!term) {
        searchAddon.clearDecorations?.()
        clearKeyboardSelectionState()
        onSearchResultsChange?.({ resultIndex: -1, resultCount: 0 })
        return false
      }
      return searchAddon.findNext(term, createSearchOptions(options)) === true
    },
    findPrevious(query = '', options = {}) {
      if (disposed || !searchAddon) return false
      const term = String(query || '')
      if (!term) {
        searchAddon.clearDecorations?.()
        clearKeyboardSelectionState()
        onSearchResultsChange?.({ resultIndex: -1, resultCount: 0 })
        return false
      }
      return searchAddon.findPrevious(term, createSearchOptions(options)) === true
    },
    clearSearch() {
      if (disposed) return
      searchAddon?.clearDecorations?.()
      clearKeyboardSelectionState()
      onSearchResultsChange?.({ resultIndex: -1, resultCount: 0 })
    },
    setFontSize(nextFontSize = TERMINAL_FONT_SIZE_DEFAULT) {
      if (disposed) return
      const normalizedFontSize = clampTerminalFontSize(nextFontSize)
      if (normalizedFontSize === currentFontSize) return
      currentFontSize = normalizedFontSize
      terminal.options.fontSize = normalizedFontSize
      scheduler.schedule()
    },
    setTerminalSettings(nextTerminalSettings = DEFAULT_TERMINAL_SETTINGS) {
      if (disposed) return
      currentTerminalSettings = normalizeTerminalSettings(nextTerminalSettings)
      terminal.options.fontFamily = resolveTerminalFontFamily(currentTerminalSettings.fontFamily)
      terminal.options.scrollback = currentTerminalSettings.scrollback
      scheduler.schedule()
    },
    update({
      nextSessionId = '',
      nextRawOutput = '',
      nextCanInteract = false,
      nextProjectFolder = currentProjectFolder,
      nextFontSize = currentFontSize,
      nextTerminalSettings = currentTerminalSettings,
    } = {}) {
      if (disposed) return
      controller.setTerminalSettings(nextTerminalSettings)
      controller.setFontSize(nextFontSize)
      currentProjectFolder = asTrimmedString(nextProjectFolder)
      fitTerminalToViewport()
      const normalizedSessionId = asTrimmedString(nextSessionId)
      const sessionChanged = normalizedSessionId !== sessionId
      const forceReplay = sessionChanged
      if (forceReplay) {
        terminal.reset()
        searchAddon?.clearDecorations?.()
        rawOutput = ''
        lastPublished = { sessionId: '', cols: 0, rows: 0 }
        lastVisibleTextSignature = ''
      }
      sessionId = normalizedSessionId
      canInteract = nextCanInteract === true
      if (forceReplay) {
        const nextOutput = String(nextRawOutput || '')
        if (nextOutput) writeTerminalOutput(terminal, nextOutput, inputReplayState)
        rawOutput = nextOutput
        keyboardSelectionAnchor = null
        keyboardSelectionFocus = null
      } else {
        rawOutput = syncTerminalOutputSafely(terminal, rawOutput, nextRawOutput, inputReplayState)
      }
      publishDimensions()
      scheduler.schedule()
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeAppearance()
      scheduler.cancel()
      disposeTerminalEvents()
      resizeObserver?.disconnect?.()
      for (const eventName of keyboardEvents) {
        hostElement.removeEventListener(eventName, stopEventPropagation)
      }
      searchAddon?.dispose?.()
      webLinksAddon?.dispose?.()
      terminal.dispose()
    },
  }

  scheduler.schedule()
  return controller
}

export function createDefaultXtermViewportController({
  hostElement = null,
  onInput = null,
  onResize = null,
    onMetricsChange = null,
    onVisibleTextChange = null,
    onFocusChange = null,
  onSearchResultsChange = null,
  onOpenUrlLink = null,
  onOpenWorkspaceFileLink = null,
  onCopySelection = null,
  onPasteRequest = null,
  onFindRequest = null,
  onClearRequest = null,
  onNewTerminalRequest = null,
  onCloseTerminalRequest = null,
  onSwitchPreviousSessionRequest = null,
  onSwitchNextSessionRequest = null,
  onZoomInRequest = null,
  onZoomOutRequest = null,
  onZoomResetRequest = null,
  projectFolder = '',
  fontSize = TERMINAL_FONT_SIZE_DEFAULT,
  terminalSettings = DEFAULT_TERMINAL_SETTINGS,
  onSelectionChange = null,
} = {}) {
  return createXtermViewportController({
    hostElement,
    createTerminal: (options) => new Terminal(options),
    createFitAddon: () => new FitAddon(),
    createSearchAddon: () => new SearchAddon(),
    createWebLinksAddon: (handler) => new WebLinksAddon(handler),
    projectFolder,
    fontSize,
    terminalSettings,
    onInput,
    onResize,
    onMetricsChange,
    onVisibleTextChange,
    onFocusChange,
    onSearchResultsChange,
    onOpenUrlLink,
    onOpenWorkspaceFileLink,
    onCopySelection,
    onPasteRequest,
    onFindRequest,
    onClearRequest,
    onNewTerminalRequest,
    onCloseTerminalRequest,
    onSwitchPreviousSessionRequest,
    onSwitchNextSessionRequest,
    onZoomInRequest,
    onZoomOutRequest,
    onZoomResetRequest,
    onSelectionChange,
  })
}
