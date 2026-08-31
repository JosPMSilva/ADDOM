import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  buildTerminalOptions,
  clampTerminalFontSize,
  createXtermViewportController,
} from '../../src/renderer/components/terminal/use-xterm-viewport.js'
import {
  TERMINAL_KEY_ACTIONS,
  getTerminalShortcutLabels,
  resolveTerminalKeyAction,
} from '../../src/renderer/components/terminal/terminal-keymap.mjs'
import {
  findTerminalWorkspaceFileLinks,
  resolveTerminalWorkspaceFileReference,
} from '../../src/renderer/components/terminal/terminal-output-links.mjs'

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createTerminalKeyEvent({
  key,
  ctrlKey = false,
  shiftKey = false,
  metaKey = false,
  altKey = false,
  repeat = false,
} = {}) {
  return {
    type: 'keydown',
    key,
    ctrlKey,
    shiftKey,
    metaKey,
    altKey,
    repeat,
    defaultPrevented: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true
      this.defaultPrevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
  }
}

function createFakeHost() {
  const listeners = new Map()
  return {
    listeners,
    addEventListener(eventName, handler) {
      const nextHandlers = listeners.get(eventName) || []
      nextHandlers.push(handler)
      listeners.set(eventName, nextHandlers)
    },
    removeEventListener(eventName, handler) {
      const nextHandlers = (listeners.get(eventName) || []).filter((entry) => entry !== handler)
      listeners.set(eventName, nextHandlers)
    },
  }
}

function createFakeTerminalRig({
  initialTerminalCols = 120,
  initialTerminalRows = 40,
  fittedCols = 120,
  fittedRows = 40,
  bufferLines = ['prompt> '],
  viewportY = 0,
  autoEmitCursorMoveOnSelectionKey = true,
} = {}) {
  const subscriptions = {
    data: new Set(),
    focus: new Set(),
    blur: new Set(),
    cursorMove: new Set(),
  }
  let customKeyEventHandler = null
  const rig = {
    writes: [],
    resets: 0,
    focusCalls: 0,
    disposed: false,
    fitCalls: 0,
    pastedTexts: [],
    selectionText: '',
    selectionPosition: undefined,
    selectAllCalls: 0,
    selectCalls: [],
    clears: 0,
    cols: fittedCols,
    rows: fittedRows,
    terminal: null,
    fitAddon: null,
    loadedAddons: [],
    linkProviders: [],
    disposedLinkProviders: 0,
    writeCols: [],
    writeRows: [],
  }

  rig.fitAddon = {
    fit() {
      rig.fitCalls += 1
      rig.terminal.cols = rig.cols
      rig.terminal.rows = rig.rows
    },
    proposeDimensions() {
      return { cols: rig.cols, rows: rig.rows }
    },
  }

  rig.terminal = {
    cols: initialTerminalCols,
    rows: initialTerminalRows,
    options: {
      fontSize: 12,
    },
    buffer: {
      active: {
        viewportY,
        baseY: Math.max(0, bufferLines.length - fittedRows),
        length: bufferLines.length,
        getLine(lineIndex) {
          const text = bufferLines[lineIndex]
          if (typeof text !== 'string') return null
          return {
            translateToString() {
              return text
            },
          }
        },
      },
    },
    loadAddon(addon) {
      rig.loadedAddons.push(addon)
    },
    open() {},
    write(data, callback) {
      rig.writeCols.push(rig.terminal.cols)
      rig.writeRows.push(rig.terminal.rows)
      rig.writes.push(data)
      callback?.()
    },
    reset() {
      rig.resets += 1
    },
    clear() {
      rig.clears += 1
    },
    focus() {
      rig.focusCalls += 1
    },
    hasSelection() {
      return rig.selectionText.length > 0
    },
    getSelection() {
      return rig.selectionText
    },
    getSelectionPosition() {
      return rig.selectionPosition
    },
    paste(data) {
      rig.pastedTexts.push(data)
    },
    select(column, row, length) {
      rig.selectCalls.push({ column, row, length })
      rig.selectionText = `[selection:${column},${row},${length}]`
      rig.selectionPosition = {
        start: { x: column + 1, y: row + 1 },
        end: { x: column + length + 1, y: row + 1 },
      }
    },
    selectAll() {
      rig.selectAllCalls += 1
      rig.selectionText = 'ALL_BUFFER'
    },
    clearSelection() {
      rig.selectionText = ''
    },
    attachCustomKeyEventHandler(handler) {
      customKeyEventHandler = handler
    },
    registerLinkProvider(provider) {
      rig.linkProviders.push(provider)
      return {
        dispose() {
          rig.disposedLinkProviders += 1
        },
      }
    },
    dispose() {
      rig.disposed = true
    },
    onData(handler) {
      subscriptions.data.add(handler)
      return { dispose: () => subscriptions.data.delete(handler) }
    },
    onFocus(handler) {
      subscriptions.focus.add(handler)
      return { dispose: () => subscriptions.focus.delete(handler) }
    },
    onBlur(handler) {
      subscriptions.blur.add(handler)
      return { dispose: () => subscriptions.blur.delete(handler) }
    },
    onCursorMove(handler) {
      subscriptions.cursorMove.add(handler)
      return { dispose: () => subscriptions.cursorMove.delete(handler) }
    },
  }

  rig.emitData = (data) => {
    subscriptions.data.forEach((handler) => handler(data))
  }
  rig.emitFocus = () => {
    subscriptions.focus.forEach((handler) => handler())
  }
  rig.emitBlur = () => {
    subscriptions.blur.forEach((handler) => handler())
  }
  rig.emitCursorMove = () => {
    subscriptions.cursorMove.forEach((handler) => handler())
  }
  rig.triggerKey = (event) => {
    const result = customKeyEventHandler?.(event)
    if (result === false && event.shiftKey === true && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      if (event.key === 'ArrowLeft') {
        rig.terminal.buffer.active.cursorX = Math.max(0, Number(rig.terminal.buffer.active.cursorX || 0) - 1)
      } else if (event.key === 'ArrowRight') {
        rig.terminal.buffer.active.cursorX = Number(rig.terminal.buffer.active.cursorX || 0) + 1
      } else if (event.key === 'Home') {
        rig.terminal.buffer.active.cursorX = 0
      } else if (event.key === 'End') {
        rig.terminal.buffer.active.cursorX = Number(rig.terminal.cols || 0)
      }
      if (autoEmitCursorMoveOnSelectionKey) {
        rig.emitCursorMove()
      }
    }
    return result
  }
  rig.collectLinks = async (bufferLineNumber = 0) => new Promise((resolve) => {
    rig.linkProviders[0]?.provideLinks(bufferLineNumber, (links) => resolve(links || []))
  })
  rig.createTerminal = () => rig.terminal
  rig.createFitAddon = () => rig.fitAddon
  return rig
}

function createFakeSearchAddon({ findNextResult = true, findPreviousResult = true } = {}) {
  const listeners = new Set()
  return {
    findNextCalls: [],
    findPreviousCalls: [],
    clearDecorationsCalls: 0,
    disposed: false,
    onDidChangeResults(handler) {
      listeners.add(handler)
      return { dispose: () => listeners.delete(handler) }
    },
    findNext(term, options) {
      this.findNextCalls.push({ term, options })
      listeners.forEach((handler) => handler({ resultIndex: 0, resultCount: 2 }))
      return findNextResult
    },
    findPrevious(term, options) {
      this.findPreviousCalls.push({ term, options })
      listeners.forEach((handler) => handler({ resultIndex: 1, resultCount: 2 }))
      return findPreviousResult
    },
    clearDecorations() {
      this.clearDecorationsCalls += 1
    },
    dispose() {
      this.disposed = true
    },
  }
}

function createFakeWebLinksAddon() {
  return {
    disposed: false,
    dispose() {
      this.disposed = true
    },
  }
}

test('terminal keymap exposes deterministic platform labels', () => {
  const windowsLabels = getTerminalShortcutLabels('win32')
  const macLabels = getTerminalShortcutLabels('darwin')

  assert.equal(windowsLabels.cutSelection, 'Ctrl+Shift+X')
  assert.equal(windowsLabels.copySelection, 'Ctrl+Shift+C')
  assert.equal(windowsLabels.pasteClipboard, 'Ctrl+Shift+V')
  assert.equal(windowsLabels.find, 'Ctrl+Shift+F')
  assert.equal(windowsLabels.clear, 'Ctrl+Shift+K')
  assert.equal(windowsLabels.newTerminal, 'Ctrl+Shift+`')
  assert.equal(windowsLabels.closeTerminal, 'Ctrl+Shift+W')
  assert.equal(windowsLabels.switchPreviousSession, 'Ctrl+Shift+[')
  assert.equal(windowsLabels.switchNextSession, 'Ctrl+Shift+]')
  assert.equal(windowsLabels.zoomIn, 'Ctrl+=')
  assert.equal(windowsLabels.zoomOut, 'Ctrl+-')
  assert.equal(windowsLabels.zoomReset, 'Ctrl+0')

  assert.equal(macLabels.cutSelection, 'Cmd+X')
  assert.equal(macLabels.copySelection, 'Cmd+C')
  assert.equal(macLabels.pasteClipboard, 'Cmd+V')
  assert.equal(macLabels.find, 'Cmd+Shift+F')
  assert.equal(macLabels.zoomReset, 'Cmd+0')
})

test('terminal keymap preserves Windows/Linux Ctrl+C for terminal interrupt', () => {
  const interruptEvent = createTerminalKeyEvent({
    key: 'c',
    ctrlKey: true,
  })
  const copyEvent = createTerminalKeyEvent({
    key: 'c',
    ctrlKey: true,
    shiftKey: true,
  })

  assert.equal(resolveTerminalKeyAction(interruptEvent, 'linux'), null)
  assert.equal(resolveTerminalKeyAction(copyEvent, 'linux')?.id, TERMINAL_KEY_ACTIONS.copySelection)
})

test('terminal keymap resolves reserved terminal actions from one registry', () => {
  const shortcutCases = [
    [TERMINAL_KEY_ACTIONS.find, createTerminalKeyEvent({ key: 'f', ctrlKey: true, shiftKey: true })],
    [TERMINAL_KEY_ACTIONS.clear, createTerminalKeyEvent({ key: 'k', ctrlKey: true, shiftKey: true })],
    [TERMINAL_KEY_ACTIONS.newTerminal, createTerminalKeyEvent({ key: '`', ctrlKey: true, shiftKey: true })],
    [TERMINAL_KEY_ACTIONS.closeTerminal, createTerminalKeyEvent({ key: 'w', ctrlKey: true, shiftKey: true })],
    [TERMINAL_KEY_ACTIONS.switchPreviousSession, createTerminalKeyEvent({ key: '[', ctrlKey: true, shiftKey: true })],
    [TERMINAL_KEY_ACTIONS.switchNextSession, createTerminalKeyEvent({ key: ']', ctrlKey: true, shiftKey: true })],
    [TERMINAL_KEY_ACTIONS.zoomIn, createTerminalKeyEvent({ key: '=', ctrlKey: true })],
    [TERMINAL_KEY_ACTIONS.zoomOut, createTerminalKeyEvent({ key: '-', ctrlKey: true })],
    [TERMINAL_KEY_ACTIONS.zoomReset, createTerminalKeyEvent({ key: '0', ctrlKey: true })],
  ]

  for (const [expectedAction, event] of shortcutCases) {
    assert.equal(resolveTerminalKeyAction(event, 'win32')?.id, expectedAction)
  }
})

test('xterm viewport controller writes raw PTY output deltas and replays full output on session switch', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const resizes = []
  const metrics = []

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onResize: (sessionId, nextMetrics) => {
      resizes.push({ sessionId, metrics: nextMetrics })
    },
    onMetricsChange: (nextMetrics) => {
      metrics.push(nextMetrics)
    },
  })

  controller.update({
    nextSessionId: 'term_one',
    nextRawOutput: 'prompt> ',
    nextCanInteract: true,
  })
  await flushAsync()

  controller.update({
    nextSessionId: 'term_one',
    nextRawOutput: 'prompt> dir\r\nfile.txt\r\nprompt> ',
    nextCanInteract: true,
  })
  await flushAsync()

  controller.update({
    nextSessionId: 'term_two',
    nextRawOutput: 'other> ',
    nextCanInteract: true,
  })
  await flushAsync()

  assert.deepEqual(rig.writes, [
    'prompt> ',
    'dir\r\nfile.txt\r\nprompt> ',
    'other> ',
  ])
  assert.equal(rig.resets, 2)
  assert.deepEqual(metrics.at(-1), { cols: 120, rows: 40 })
  assert.deepEqual(resizes.at(-1), {
    sessionId: 'term_two',
    metrics: { cols: 120, rows: 40 },
  })

  controller.dispose()
})

test('xterm viewport controller pipes terminal input directly into session writes and suppresses host keyboard bubbling', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const inputs = []
  const focusStates = []

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onInput: (sessionId, data) => {
      inputs.push({ sessionId, data })
    },
    onFocusChange: (focused) => {
      focusStates.push(focused)
    },
  })

  controller.update({
    nextSessionId: 'term_input',
    nextRawOutput: 'prompt> ',
    nextCanInteract: true,
  })
  await flushAsync()

  rig.emitFocus()
  rig.emitData('echo test\r')
  rig.emitBlur()

  const keyboardEvent = {
    stopped: false,
    stopPropagation() {
      this.stopped = true
    },
  }
  host.listeners.get('keydown')?.[0]?.(keyboardEvent)

  assert.deepEqual(inputs, [{
    sessionId: 'term_input',
    data: 'echo test\r',
  }])
  assert.deepEqual(focusStates, [true, false])
  assert.equal(keyboardEvent.stopped, true)

  controller.dispose()
  assert.equal(rig.disposed, true)
})

test('xterm viewport controller ignores terminal input when the session is not interactive', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const inputs = []

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onInput: (sessionId, data) => {
      inputs.push({ sessionId, data })
    },
  })

  controller.update({
    nextSessionId: 'term_idle',
    nextRawOutput: 'prompt> ',
    nextCanInteract: false,
  })
  await flushAsync()

  rig.emitData('should-not-write')

  assert.deepEqual(inputs, [])

  controller.dispose()
})

test('xterm viewport controller keeps local metrics fresh but only publishes PTY resize from the interactive surface', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const metrics = []
  const resizes = []

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onMetricsChange: (nextMetrics) => {
      metrics.push(nextMetrics)
    },
    onResize: (sessionId, nextMetrics) => {
      resizes.push({ sessionId, metrics: nextMetrics })
    },
  })

  controller.update({
    nextSessionId: 'term_surface',
    nextRawOutput: 'prompt> ',
    nextCanInteract: false,
  })
  await flushAsync()

  rig.cols = 140
  rig.rows = 42
  controller.update({
    nextSessionId: 'term_surface',
    nextRawOutput: 'prompt> ',
    nextCanInteract: false,
  })
  await flushAsync()

  controller.update({
    nextSessionId: 'term_surface',
    nextRawOutput: 'prompt> ',
    nextCanInteract: true,
  })
  await flushAsync()

  assert.deepEqual(metrics, [
    { cols: 120, rows: 40 },
    { cols: 140, rows: 42 },
  ])
  assert.deepEqual(resizes, [{
    sessionId: 'term_surface',
    metrics: { cols: 140, rows: 42 },
  }])

  controller.dispose()
})

test('xterm viewport controller does not reset and replay the full buffer when only interactivity changes', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
  })

  controller.update({
    nextSessionId: 'term_focus_flip',
    nextRawOutput: 'prompt> ',
    nextCanInteract: false,
  })
  await flushAsync()

  controller.update({
    nextSessionId: 'term_focus_flip',
    nextRawOutput: 'prompt> ',
    nextCanInteract: true,
  })
  await flushAsync()

  assert.deepEqual(rig.writes, ['prompt> '])
  assert.equal(rig.resets, 1)

  controller.dispose()
})

test('xterm viewport controller suppresses terminal-generated replay responses while session output is rehydrated', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const inputs = []

  rig.terminal.write = (data, callback) => {
    rig.writes.push(data)
    if (String(data).includes('\u001b[c')) {
      rig.emitData('\u001b[?1;2c')
    }
    callback?.()
  }

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onInput: (sessionId, data) => {
      inputs.push({ sessionId, data })
    },
  })

  controller.update({
    nextSessionId: 'term_probe',
    nextRawOutput: 'prompt> \u001b[c',
    nextCanInteract: true,
  })
  await flushAsync()

  rig.emitData('dir\r')

  assert.deepEqual(inputs, [{
    sessionId: 'term_probe',
    data: 'dir\r',
  }])

  controller.dispose()
})

test('xterm viewport controller fits the host before replaying session output', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig({
    initialTerminalCols: 80,
    initialTerminalRows: 24,
    fittedCols: 300,
    fittedRows: 56,
  })

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
  })

  controller.update({
    nextSessionId: 'term_fit_first',
    nextRawOutput: '\u001b[1;36Hprompt> ',
    nextCanInteract: true,
  })
  await flushAsync()

  assert.equal(rig.writeCols[0], 300)
  assert.equal(rig.writeRows[0], 56)

  controller.dispose()
})

test('xterm viewport controller routes Windows/Linux terminal clipboard shortcuts through explicit callbacks', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const copied = []
  let pasteRequests = 0

  rig.selectionText = 'copied text'

  createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    platform: 'win32',
    onCopySelection: (value) => copied.push(value),
    onPasteRequest: () => {
      pasteRequests += 1
    },
  })

  const copyEvent = createTerminalKeyEvent({
    key: 'c',
    ctrlKey: true,
    shiftKey: true,
  })
  const pasteEvent = createTerminalKeyEvent({
    key: 'v',
    ctrlKey: true,
    shiftKey: true,
  })

  const copyAllowed = rig.triggerKey(copyEvent)
  const pasteAllowed = rig.triggerKey(pasteEvent)

  assert.equal(copyAllowed, false)
  assert.equal(pasteAllowed, false)
  assert.equal(copyEvent.prevented, true)
  assert.equal(copyEvent.stopped, true)
  assert.equal(pasteEvent.prevented, true)
  assert.equal(pasteEvent.stopped, true)
  assert.deepEqual(copied, ['copied text'])
  assert.equal(pasteRequests, 1)
})

test('xterm viewport controller routes keyboard cut through the explicit callback when the shell selection is active', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const cutSelections = []

  rig.terminal.buffer.active.cursorX = 6
  rig.terminal.buffer.active.cursorY = 0
  rig.terminal.buffer.active.baseY = 0
  rig.terminal.cols = 120

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    platform: 'win32',
    onCutSelection: (value) => cutSelections.push(value),
    onInput: () => {},
  })
  controller.update({
    nextSessionId: 'term_cut_shortcut',
    nextRawOutput: 'prompt> ABCDEF',
    nextCanInteract: true,
  })
  await flushAsync()

  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))
  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))

  const cutEvent = createTerminalKeyEvent({
    key: 'x',
    ctrlKey: true,
    shiftKey: true,
  })

  const allowed = rig.triggerKey(cutEvent)

  assert.equal(allowed, false)
  assert.equal(cutEvent.prevented, true)
  assert.equal(cutEvent.stopped, true)
  assert.deepEqual(cutSelections, ['[selection:4,0,2]'])
})

test('xterm viewport controller leaves plain Ctrl+C available for terminal interrupt on Windows/Linux', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const copied = []

  rig.selectionText = 'selected text'

  createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    platform: 'win32',
    onCopySelection: (value) => copied.push(value),
  })

  const interruptEvent = createTerminalKeyEvent({
    key: 'c',
    ctrlKey: true,
  })

  const allowed = rig.triggerKey(interruptEvent)

  assert.equal(allowed, true)
  assert.equal(interruptEvent.prevented, false)
  assert.equal(interruptEvent.stopped, false)
  assert.deepEqual(copied, [])
})

test('xterm viewport controller routes reserved terminal shortcuts through named callbacks', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const requestedActions = []

  createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    platform: 'linux',
    onFindRequest: () => requestedActions.push(TERMINAL_KEY_ACTIONS.find),
  })

  const findEvent = createTerminalKeyEvent({
    key: 'f',
    ctrlKey: true,
    shiftKey: true,
  })

  const allowed = rig.triggerKey(findEvent)

  assert.equal(allowed, false)
  assert.equal(findEvent.prevented, true)
  assert.equal(findEvent.stopped, true)
  assert.deepEqual(requestedActions, [TERMINAL_KEY_ACTIONS.find])
})

test('xterm viewport controller supports keyboard range selection with Shift+Arrow keys', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const inputs = []
  rig.terminal.buffer.active.cursorX = 6
  rig.terminal.buffer.active.cursorY = 0
  rig.terminal.buffer.active.baseY = 0
  rig.terminal.cols = 120

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onInput: (sessionId, data) => {
      inputs.push({ sessionId, data })
    },
  })
  controller.update({
    nextSessionId: 'term_select',
    nextRawOutput: 'prompt> ABCDEF',
    nextCanInteract: true,
  })
  await flushAsync()

  const shiftLeftEvent = createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  })
  const allowed = rig.triggerKey(shiftLeftEvent)

  assert.equal(allowed, false)
  assert.equal(shiftLeftEvent.prevented, true)
  assert.equal(shiftLeftEvent.stopped, true)
  assert.deepEqual(inputs, [{
    sessionId: 'term_select',
    data: '\u001b[D',
  }])
  assert.deepEqual(rig.selectCalls, [{
    column: 5,
    row: 0,
    length: 1,
  }])
  assert.equal(controller.canDeleteSelection(), true)
})

test('xterm viewport controller keeps keyboard selection aligned to cursor moves during repeat', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const inputs = []
  rig.terminal.buffer.active.cursorX = 10
  rig.terminal.buffer.active.cursorY = 0
  rig.terminal.buffer.active.baseY = 0
  rig.terminal.cols = 120

  createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onInput: (sessionId, data) => {
      inputs.push({ sessionId, data })
    },
  }).update({
    nextSessionId: 'term_repeat',
    nextRawOutput: 'prompt> ABCDEFGHIJ',
    nextCanInteract: true,
  })
  await flushAsync()

  const repeatLeftEvent = createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
    repeat: true,
  })
  const allowed = rig.triggerKey(repeatLeftEvent)

  assert.equal(allowed, false)
  assert.equal(repeatLeftEvent.prevented, true)
  assert.equal(repeatLeftEvent.stopped, true)
  assert.deepEqual(inputs, [{
    sessionId: 'term_repeat',
    data: '\u001b[D',
  }])
  assert.deepEqual(rig.selectCalls.at(-1), {
    column: 9,
    row: 0,
    length: 1,
  })
})

test('xterm viewport controller deletes keyboard-selected text from the shell line', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const inputs = []
  rig.terminal.buffer.active.cursorX = 6
  rig.terminal.buffer.active.cursorY = 0
  rig.terminal.buffer.active.baseY = 0
  rig.terminal.cols = 120

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onInput: (sessionId, data) => {
      inputs.push({ sessionId, data })
    },
  })
  controller.update({
    nextSessionId: 'term_cut',
    nextRawOutput: 'prompt> ABCDEF',
    nextCanInteract: true,
  })
  await flushAsync()

  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))
  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))

  assert.equal(controller.canDeleteSelection(), true)
  assert.equal(controller.deleteSelection(), true)
  assert.equal(controller.canDeleteSelection(), false)
  assert.deepEqual(inputs, [
    { sessionId: 'term_cut', data: '\u001b[D' },
    { sessionId: 'term_cut', data: '\u001b[D' },
    { sessionId: 'term_cut', data: '\u001b[3~\u001b[3~' },
  ])
})

test('xterm viewport controller defers replacement input until queued keyboard-selection cursor moves settle', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig({
    autoEmitCursorMoveOnSelectionKey: false,
  })
  const inputs = []
  rig.terminal.buffer.active.cursorX = 8
  rig.terminal.buffer.active.cursorY = 0
  rig.terminal.buffer.active.baseY = 0
  rig.terminal.cols = 120

  createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    onInput: (sessionId, data) => {
      inputs.push({ sessionId, data })
    },
  }).update({
    nextSessionId: 'term_deferred_replace',
    nextRawOutput: 'prompt> ABCDEFGH',
    nextCanInteract: true,
  })
  await flushAsync()

  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))
  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))
  const replacementEvent = createTerminalKeyEvent({
    key: 'Q',
  })
  const replacementAllowed = rig.triggerKey(replacementEvent)

  assert.equal(replacementAllowed, false)
  assert.deepEqual(inputs, [
    { sessionId: 'term_deferred_replace', data: '\u001b[D' },
  ])

  rig.emitCursorMove()
  assert.deepEqual(inputs, [
    { sessionId: 'term_deferred_replace', data: '\u001b[D' },
    { sessionId: 'term_deferred_replace', data: '\u001b[D' },
  ])

  rig.emitCursorMove()
  assert.deepEqual(inputs, [
    { sessionId: 'term_deferred_replace', data: '\u001b[D' },
    { sessionId: 'term_deferred_replace', data: '\u001b[D' },
    { sessionId: 'term_deferred_replace', data: '\u001b[3~\u001b[3~' },
    { sessionId: 'term_deferred_replace', data: 'Q' },
  ])
})

test('xterm viewport controller defers keyboard cut until queued selection cursor moves settle', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig({
    autoEmitCursorMoveOnSelectionKey: false,
  })
  const cutSelections = []
  rig.terminal.buffer.active.cursorX = 6
  rig.terminal.buffer.active.cursorY = 0
  rig.terminal.buffer.active.baseY = 0
  rig.terminal.cols = 120

  createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    platform: 'win32',
    onCutSelection: (value) => cutSelections.push(value),
  }).update({
    nextSessionId: 'term_deferred_cut',
    nextRawOutput: 'prompt> ABCDEF',
    nextCanInteract: true,
  })
  await flushAsync()

  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))
  rig.triggerKey(createTerminalKeyEvent({
    key: 'ArrowLeft',
    shiftKey: true,
  }))
  const cutEvent = createTerminalKeyEvent({
    key: 'x',
    ctrlKey: true,
    shiftKey: true,
  })
  const cutAllowed = rig.triggerKey(cutEvent)

  assert.equal(cutAllowed, false)
  assert.deepEqual(cutSelections, [])

  rig.emitCursorMove()
  assert.deepEqual(cutSelections, [])

  rig.emitCursorMove()
  assert.deepEqual(cutSelections, ['[selection:4,0,2]'])
})

test('xterm viewport controller supports search addon navigation and result events', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const searchAddon = createFakeSearchAddon()
  const results = []

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    createSearchAddon: () => searchAddon,
    onSearchResultsChange: (result) => results.push(result),
  })

  assert.equal(rig.loadedAddons.includes(searchAddon), true)
  assert.equal(controller.findNext('prompt', { incremental: true }), true)
  assert.equal(controller.findPrevious('prompt'), true)

  assert.equal(searchAddon.findNextCalls[0].term, 'prompt')
  assert.equal(searchAddon.findNextCalls[0].options.incremental, true)
  assert.equal(searchAddon.findNextCalls[0].options.decorations.matchOverviewRuler, '#d5d0c1')
  assert.equal(searchAddon.findPreviousCalls[0].term, 'prompt')
  assert.deepEqual(results, [
    { resultIndex: 0, resultCount: 2 },
    { resultIndex: 1, resultCount: 2 },
  ])

  controller.clearSearch()
  assert.equal(searchAddon.clearDecorationsCalls, 1)

  controller.dispose()
  assert.equal(searchAddon.disposed, true)
})

test('terminal output link helper resolves workspace file references and rejects outside absolute paths', () => {
  const projectFolder = 'C:/Users/example/Documents/ADDOM'

  assert.deepEqual(
    resolveTerminalWorkspaceFileReference('src/renderer/App.jsx:42:7', projectFolder),
    { filePath: 'src/renderer/App.jsx', line: 42, column: 7 },
  )
  assert.deepEqual(
    resolveTerminalWorkspaceFileReference('C:\\Users\\example\\Documents\\ADDOM\\package.json:12', projectFolder),
    { filePath: 'package.json', line: 12, column: 1 },
  )
  assert.equal(
    resolveTerminalWorkspaceFileReference('C:\\Users\\example\\Desktop\\outside.js:1', projectFolder),
    null,
  )

  assert.deepEqual(
    findTerminalWorkspaceFileLinks('Error at src/main/index.mjs:810 and package.json:12.', projectFolder)
      .map(({ filePath, line, column, text }) => ({ filePath, line, column, text })),
    [
      { filePath: 'src/main/index.mjs', line: 810, column: 1, text: 'src/main/index.mjs:810' },
      { filePath: 'package.json', line: 12, column: 1, text: 'package.json:12' },
    ],
  )
})

test('xterm viewport controller loads URL and workspace file link providers', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig({
    bufferLines: ['Open https://example.com and src/main/index.mjs:25:3'],
  })
  const openedFiles = []
  let webLinkHandler = null
  const webLinksAddon = createFakeWebLinksAddon()

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    createWebLinksAddon: (handler) => {
      webLinkHandler = handler
      return webLinksAddon
    },
    projectFolder: 'C:/Users/example/Documents/ADDOM',
    onOpenUrlLink: (uri) => openedFiles.push({ url: uri }),
    onOpenWorkspaceFileLink: (reference) => openedFiles.push(reference),
  })

  assert.equal(rig.loadedAddons.includes(webLinksAddon), true)
  webLinkHandler?.({}, 'https://example.com/')
  const links = await rig.collectLinks(0)
  assert.equal(links.length, 1)
  links[0].activate()

  assert.deepEqual(openedFiles, [
    { url: 'https://example.com/' },
    {
      filePath: 'src/main/index.mjs',
      line: 25,
      column: 3,
      text: 'src/main/index.mjs:25:3',
    },
  ])

  controller.dispose()
  assert.equal(rig.disposedLinkProviders, 1)
  assert.equal(webLinksAddon.disposed, true)
})

test('xterm viewport controller extracts visible and full scrollback text from the xterm buffer', () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig({
    bufferLines: [
      'line one',
      'line two',
      'line three',
      '',
    ],
    viewportY: 1,
    fittedRows: 2,
  })

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
  })

  assert.equal(controller.getVisibleText(), 'line two\nline three')
  assert.equal(controller.getFullScrollbackText(), 'line one\nline two\nline three')

  controller.dispose()
})

test('xterm viewport controller clears scrollback and zooms terminal font without resetting PTY output state', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()

  const controller = createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    fontSize: 12,
  })

  controller.update({
    nextSessionId: 'term_clear_zoom',
    nextRawOutput: 'prompt> ',
    nextCanInteract: true,
  })
  await flushAsync()

  assert.equal(controller.clearBuffer(), true)
  controller.setFontSize(16)
  await flushAsync()

  assert.equal(rig.clears, 1)
  assert.equal(rig.resets, 1)
  assert.equal(rig.terminal.options.fontSize, 16)
  assert.equal(rig.fitCalls >= 1, true)

  controller.dispose()
})

test('xterm viewport controller keeps macOS Cmd+C/V clipboard shortcuts', async () => {
  const host = createFakeHost()
  const rig = createFakeTerminalRig()
  const copied = []
  let pasteRequests = 0

  rig.selectionText = 'mac copied text'

  createXtermViewportController({
    hostElement: host,
    createTerminal: rig.createTerminal,
    createFitAddon: rig.createFitAddon,
    platform: 'darwin',
    onCopySelection: (value) => copied.push(value),
    onPasteRequest: () => {
      pasteRequests += 1
    },
  })

  const copyEvent = createTerminalKeyEvent({
    key: 'c',
    metaKey: true,
  })
  const pasteEvent = createTerminalKeyEvent({
    key: 'v',
    metaKey: true,
  })

  const copyAllowed = rig.triggerKey(copyEvent)
  const pasteAllowed = rig.triggerKey(pasteEvent)

  assert.equal(copyAllowed, false)
  assert.equal(pasteAllowed, false)
  assert.deepEqual(copied, ['mac copied text'])
  assert.equal(pasteRequests, 1)
})

test('xterm terminal options keep native macOS Option and dead-key composition enabled', () => {
  const macOptions = buildTerminalOptions({ platform: 'MacIntel' })
  const winOptions = buildTerminalOptions({ platform: 'Win32' })

  assert.equal(macOptions.macOptionIsMeta, false)
  assert.equal('macOptionIsMeta' in winOptions, true)
  assert.equal(winOptions.macOptionIsMeta, undefined)
})

test('xterm terminal font size is locally clamped', () => {
  assert.equal(clampTerminalFontSize(4), 9)
  assert.equal(clampTerminalFontSize(17.6), 18)
  assert.equal(clampTerminalFontSize(40), 22)
  assert.equal(buildTerminalOptions({ fontSize: 40 }).fontSize, 22)
})

test('xterm terminal options apply persisted terminal preference overrides', () => {
  const options = buildTerminalOptions({
    platform: 'win32',
    terminalSettings: {
      fontSize: 15,
      fontFamily: 'jetbrains_mono',
      scrollback: 12000,
    },
  })

  assert.equal(options.fontSize, 15)
  assert.equal(options.scrollback, 12000)
  assert.match(options.fontFamily, /JetBrains Mono/)
})

test('terminal viewport baseline keeps clipboard context menu actions focus-preserving', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/terminal/TerminalViewport.jsx'), 'utf8')
  const menuSource = fs.readFileSync(path.resolve('src/renderer/components/terminal/TerminalContextMenu.jsx'), 'utf8')

  assert.match(source, /TerminalSearchBar/)
  assert.match(source, /TerminalContextMenu/)
  assert.match(source, /copySelectionToClipboard/)
  assert.match(source, /copyVisibleOutputToClipboard/)
  assert.match(source, /copyFullScrollbackToClipboard/)
  assert.match(source, /pasteClipboardIntoTerminal/)
  assert.match(source, /pasteClipboardIntoTerminalAsSingleLine/)
  assert.match(source, /handleClearShortcut/)
  assert.match(source, /handleZoomInShortcut/)
  assert.match(menuSource, /onSelectAll/)
  assert.match(source, /getTerminalShortcutLabels/)
  assert.match(menuSource, /onMouseDown=\{onKeepFocusPointer\}/)
  assert.match(source, /this\.focusTerminal\(\)/)
})

test('terminal viewport keeps the settings store selector snapshot stable', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/terminal/TerminalViewport.jsx'), 'utf8')

  assert.match(source, /const rawTerminalSettings = useSettingsStore\(\(state\) => state\.coreSettings\?\.terminal\)/)
  assert.match(source, /const terminalSettings = React\.useMemo\(\(\) => normalizeTerminalSettings\(/)
  assert.doesNotMatch(source, /useSettingsStore\(\(state\) => normalizeTerminalSettings\(/)
})
