import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useDialogFocusTrap } from '../../src/renderer/components/use-dialog-focus-trap.mjs'

import {
  createWorkspaceRailDragSession,
  resolveWorkspaceRailKeyboardCommand,
  shouldCloseWorkspaceRailAfterTarget,
  startWorkspaceRailDragPresentation,
  WORKSPACE_RAIL_KEYBOARD_STEP,
} from '../../src/renderer/components/workspace/workspace-rail-interactions.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let WorkspaceRailShell
let useWorkspaceRailControl
let useWorkspaceRailFocusReturn

before(async () => {
  const shellMod = await ssrLoadRendererModule('/components/workspace/WorkspaceRailShell.jsx')
  const hooksMod = await ssrLoadRendererModule('/components/workspace/use-workspace-rail-hooks.mjs')
  WorkspaceRailShell = shellMod.default
  useWorkspaceRailControl = hooksMod.useWorkspaceRailControl
  useWorkspaceRailFocusReturn = hooksMod.useWorkspaceRailFocusReturn
})

after(closeViteSsrLoader)

function createEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
    dispatch(type, event = {}) { listeners.get(type)?.(event) },
    has(type) { return listeners.has(type) },
  }
}

function createNullHostContainer() {
  const windowValue = {
    addEventListener() {}, removeEventListener() {}, event: undefined,
    HTMLIFrameElement: class {},
  }
  const documentValue = {
    nodeType: 9, defaultView: windowValue,
    addEventListener() {}, removeEventListener() {},
    documentElement: { namespaceURI: 'http://www.w3.org/1999/xhtml' },
  }
  const container = {
    nodeType: 1, nodeName: 'DIV', tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: documentValue,
    addEventListener() {}, removeEventListener() {},
    appendChild(child) { child.parentNode = this; return child },
    insertBefore(child) { child.parentNode = this; return child },
    removeChild(child) { child.parentNode = null; return child },
  }
  documentValue.body = container
  windowValue.document = documentValue
  return { container, documentValue, windowValue }
}

test('mounted controlled rail requests changes without mutating rendered ownership', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const host = createNullHostContainer()
  globalThis.window = host.windowValue
  globalThis.document = host.documentValue
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  try {
    const { createRoot } = await import('react-dom/client')
    const openChanges = []
    const widthChanges = []
    let control
    function Probe(props) {
      control = useWorkspaceRailControl(props)
      return null
    }
    const root = createRoot(host.container)
    await React.act(async () => root.render(React.createElement(Probe, {
      open: true,
      width: 336,
      onOpenChange: (value) => openChanges.push(value),
      onWidthChange: (value) => widthChanges.push(value),
    })))
    await React.act(async () => {
      control.requestOpen(false)
      const target = createEventTarget()
      createWorkspaceRailDragSession({
        eventTarget: target,
        startClientX: 100,
        startWidth: 336,
        onPreview: () => {},
        onCommit: (result) => control.requestWidth(result.width),
      })
      target.dispatch('pointerup', { clientX: 164 })
    })
    assert.deepEqual(openChanges, [false])
    assert.deepEqual(widthChanges, [400])
    assert.equal(control.open, true)
    assert.equal(control.width, 336)

    await React.act(async () => root.render(React.createElement(Probe, {
      open: false,
      width: 400,
      onOpenChange: (value) => openChanges.push(value),
      onWidthChange: (value) => widthChanges.push(value),
    })))
    assert.equal(control.open, false)
    assert.equal(control.width, 400)
    await React.act(async () => root.unmount())
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
})

test('mounted close focus return cancels stale frames on reopen and focuses once on ordinary close', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const host = createNullHostContainer()
  let focusCalls = 0
  let nextFrameId = 1
  const frames = new Map()
  const cancelledCallbacks = []
  host.windowValue.requestAnimationFrame = (callback) => {
    const id = nextFrameId
    nextFrameId += 1
    frames.set(id, callback)
    return id
  }
  host.windowValue.cancelAnimationFrame = (id) => {
    const callback = frames.get(id)
    if (callback) cancelledCallbacks.push(callback)
    frames.delete(id)
  }
  host.documentValue.getElementById = () => ({ focus: () => { focusCalls += 1 } })
  globalThis.window = host.windowValue
  globalThis.document = host.documentValue
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  try {
    const { createRoot } = await import('react-dom/client')
    function Probe({ open }) {
      useWorkspaceRailFocusReturn(true, open)
      return null
    }
    const root = createRoot(host.container)
    await React.act(async () => root.render(React.createElement(Probe, { open: true })))
    assert.equal(focusCalls, 0)
    await React.act(async () => root.render(React.createElement(Probe, { open: false })))
    assert.equal(frames.size, 1)
    assert.equal(focusCalls, 0)
    await React.act(async () => root.render(React.createElement(Probe, { open: true })))
    assert.equal(frames.size, 0)
    cancelledCallbacks[0]?.()
    assert.equal(focusCalls, 0)

    await React.act(async () => root.render(React.createElement(Probe, { open: false })))
    assert.equal(frames.size, 1)
    cancelledCallbacks[0]?.()
    assert.equal(focusCalls, 0)
    const closeFrame = frames.values().next().value
    frames.clear()
    closeFrame()
    assert.equal(focusCalls, 1)
    await React.act(async () => root.unmount())
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
})

test('rail focus trap can delegate restoration without changing the default hook contract', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const host = createNullHostContainer()
  let openerFocusCalls = 0
  host.documentValue.activeElement = { focus: () => { openerFocusCalls += 1 } }
  globalThis.window = host.windowValue
  globalThis.document = host.documentValue
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const dialog = {
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return [] }, focus() {},
  }
  try {
    const { createRoot } = await import('react-dom/client')
    function Probe({ active }) {
      const dialogRef = React.useRef(dialog)
      useDialogFocusTrap(active, dialogRef, { restoreFocus: false })
      return null
    }
    const root = createRoot(host.container)
    await React.act(async () => root.render(React.createElement(Probe, { active: true })))
    await React.act(async () => root.render(React.createElement(Probe, { active: false })))
    assert.equal(openerFocusCalls, 0)
    await React.act(async () => root.unmount())
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
})

test('dialog focus trap can initially focus the dialog container', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const host = createNullHostContainer()
  let dialogFocusCalls = 0
  let firstActionFocusCalls = 0
  const firstAction = {
    focus: () => { firstActionFocusCalls += 1 },
    getAttribute: () => null,
  }
  const dialog = {
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return [firstAction] },
    focus() { dialogFocusCalls += 1 },
  }
  globalThis.window = host.windowValue
  globalThis.document = host.documentValue
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  try {
    const { createRoot } = await import('react-dom/client')
    function Probe() {
      const dialogRef = React.useRef(dialog)
      useDialogFocusTrap(true, dialogRef, { initialFocus: 'container' })
      return null
    }
    const root = createRoot(host.container)
    await React.act(async () => root.render(React.createElement(Probe)))
    assert.equal(dialogFocusCalls, 1)
    assert.equal(firstActionFocusCalls, 0)
    await React.act(async () => root.unmount())
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
})

test('mounted drag presentation disables transition only while active', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const host = createNullHostContainer()
  globalThis.window = host.windowValue
  globalThis.document = host.documentValue
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const railElement = { style: { transition: 'width 150ms' } }
  const bodyElement = { style: { cursor: 'default', userSelect: 'text' } }
  try {
    const { createRoot } = await import('react-dom/client')
    function Probe({ active }) {
      React.useEffect(() => {
        if (!active) return undefined
        return startWorkspaceRailDragPresentation({ railElement, bodyElement })
      }, [active])
      return null
    }
    const root = createRoot(host.container)
    await React.act(async () => root.render(React.createElement(Probe, { active: true })))
    assert.equal(railElement.style.transition, 'none')
    assert.equal(bodyElement.style.cursor, 'col-resize')
    assert.equal(bodyElement.style.userSelect, 'none')
    await React.act(async () => root.render(React.createElement(Probe, { active: false })))
    assert.equal(railElement.style.transition, 'width 150ms')
    assert.equal(bodyElement.style.cursor, 'default')
    assert.equal(bodyElement.style.userSelect, 'text')
    await React.act(async () => root.unmount())
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
})

test('drag previews directly and commits only a valid pointer release', () => {
  const target = createEventTarget()
  const previews = []
  const commits = []
  const session = createWorkspaceRailDragSession({
    eventTarget: target,
    startClientX: 100,
    startWidth: 336,
    uiScale: 2,
    onPreview: (width) => previews.push(width),
    onCommit: (result) => commits.push(result),
  })

  target.dispatch('pointermove', { clientX: 468 })
  assert.deepEqual(previews, [520])
  assert.deepEqual(commits, [])
  target.dispatch('pointerup', { clientX: 468 })
  assert.deepEqual(commits, [{ open: true, width: 520 }])
  assert.equal(target.has('pointermove'), false)
  assert.equal(target.has('pointerup'), false)
  assert.equal(target.has('pointercancel'), false)
  session.cleanup()
})

test('drag snap-closes below 220 while retaining the useful expanded width', () => {
  const target = createEventTarget()
  const commits = []
  createWorkspaceRailDragSession({
    eventTarget: target,
    startClientX: 300,
    startWidth: 336,
    onPreview: () => {},
    onCommit: (result) => commits.push(result),
  })
  target.dispatch('pointermove', { clientX: 183 })
  target.dispatch('pointerup', { clientX: 183 })
  assert.deepEqual(commits, [{ open: false, width: 336 }])
})

test('pointer cancel cleans listeners without committing', () => {
  const target = createEventTarget()
  let commits = 0
  let cancelled = 0
  createWorkspaceRailDragSession({
    eventTarget: target,
    startClientX: 0,
    startWidth: 336,
    onPreview: () => {},
    onCommit: () => { commits += 1 },
    onCancel: () => { cancelled += 1 },
  })
  target.dispatch('pointercancel')
  assert.equal(commits, 0)
  assert.equal(cancelled, 1)
  assert.equal(target.has('pointermove'), false)
})

test('drag owns one primary pointer, releases capture, and cancels on lost capture', () => {
  const target = createEventTarget()
  const captureTarget = createEventTarget()
  const captured = []
  const released = []
  captureTarget.setPointerCapture = (pointerId) => captured.push(pointerId)
  captureTarget.releasePointerCapture = (pointerId) => released.push(pointerId)
  const previews = []
  const commits = []
  let cancels = 0
  createWorkspaceRailDragSession({
    eventTarget: target,
    captureTarget,
    pointerId: 7,
    startClientX: 100,
    startWidth: 336,
    onPreview: (width) => previews.push(width),
    onCommit: (result) => commits.push(result),
    onCancel: () => { cancels += 1 },
  })
  assert.deepEqual(captured, [7])
  target.dispatch('pointermove', { pointerId: 8, clientX: 300 })
  target.dispatch('pointerup', { pointerId: 8, clientX: 300 })
  assert.deepEqual(previews, [])
  assert.deepEqual(commits, [])
  captureTarget.dispatch('lostpointercapture', { pointerId: 7 })
  assert.equal(cancels, 1)
  assert.deepEqual(released, [])
  assert.equal(target.has('pointermove'), false)

  createWorkspaceRailDragSession({
    eventTarget: target,
    captureTarget,
    pointerId: 9,
    startClientX: 100,
    startWidth: 336,
    onPreview: () => {},
    onCommit: (result) => commits.push(result),
  })
  target.dispatch('pointerup', { pointerId: 9, clientX: 164 })
  assert.deepEqual(released, [9])
  assert.deepEqual(commits, [{ open: true, width: 400 }])
})

test('secondary pointer is ignored by the shell source contract', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(
    new URL('../../src/renderer/components/workspace/WorkspaceRailShell.jsx', import.meta.url),
    'utf8',
  ))
  assert.match(source, /event\.button !== 0 \|\| event\.isPrimary === false/)
  assert.match(source, /startWorkspaceRailDragPresentation/)
})

test('successful selection closes only the narrow overlay', () => {
  assert.equal(shouldCloseWorkspaceRailAfterTarget({ narrow: true, kind: 'select-thread', result: true }), true)
  assert.equal(shouldCloseWorkspaceRailAfterTarget({ narrow: false, kind: 'select-thread', result: true }), false)
  assert.equal(shouldCloseWorkspaceRailAfterTarget({ narrow: true, kind: 'select-thread', result: false }), false)
  assert.equal(shouldCloseWorkspaceRailAfterTarget({ narrow: true, kind: 'select-thread', result: null }), false)
  assert.equal(shouldCloseWorkspaceRailAfterTarget({ narrow: true, kind: 'create-thread', result: { id: 'thread_2' } }), true)
  assert.equal(shouldCloseWorkspaceRailAfterTarget({ narrow: true, kind: 'create-thread', result: null }), false)
})

test('keyboard commands use physical direction, exact bounds, reset, and close', () => {
  assert.equal(WORKSPACE_RAIL_KEYBOARD_STEP, 16)
  assert.deepEqual(resolveWorkspaceRailKeyboardCommand('ArrowLeft', 336), { handled: true, open: true, width: 320 })
  assert.deepEqual(resolveWorkspaceRailKeyboardCommand('ArrowRight', 512), { handled: true, open: true, width: 520 })
  assert.deepEqual(resolveWorkspaceRailKeyboardCommand('Home', 480), { handled: true, open: true, width: 336 })
  assert.deepEqual(resolveWorkspaceRailKeyboardCommand('Escape', 480), { handled: true, open: false, width: 480 })
})

test('shell is Chat-gated and renders desktop separator plus narrow modal overlay contract', () => {
  const hidden = renderToStaticMarkup(React.createElement(WorkspaceRailShell, { enabled: false }))
  assert.equal(hidden, '')

  const html = renderToStaticMarkup(React.createElement(WorkspaceRailShell, {
    enabled: true,
    open: true,
    width: 336,
    narrow: false,
    children: React.createElement('div', null, 'Tree'),
  }))
  assert.match(html, /data-ui="workspace-rail-shell"/)
  assert.match(html, /data-layout="in-flow"/)
  assert.match(html, /role="separator"/)
  assert.match(html, /aria-orientation="vertical"/)
  assert.match(html, /aria-valuemin="220"/)
  assert.match(html, /aria-valuemax="520"/)
  assert.match(html, /aria-valuenow="336"/)
  assert.match(html, /duration-150/)
  assert.match(html, /motion-reduce:transition-none/)
  assert.match(html, /data-ui="workspace-rail-close"/)
  assert.doesNotMatch(html, /workspace-rail-open/)

  const narrow = renderToStaticMarkup(React.createElement(WorkspaceRailShell, {
    enabled: true,
    open: true,
    width: 336,
    narrow: true,
  }))
  assert.match(narrow, /data-ui="workspace-rail-scrim"/)
  assert.match(narrow, /role="dialog"/)
  assert.match(narrow, /aria-modal="true"/)
  assert.match(narrow, /data-layout="overlay"/)
  assert.match(narrow, /absolute inset-0/)
  assert.doesNotMatch(narrow, /role="separator"/)

  const narrowClosed = renderToStaticMarkup(React.createElement(WorkspaceRailShell, {
    enabled: true,
    open: false,
    width: 336,
    narrow: true,
    children: React.createElement('div', null, 'Activity monitor'),
  }))
  assert.match(narrowClosed, /data-ui="workspace-rail-activity-monitor"/)
  assert.match(narrowClosed, /hidden=""/)
  assert.doesNotMatch(narrowClosed, /data-ui="workspace-rail-overlay"/)
})
