import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

const DIALOG_PATH = 'src/renderer/components/ui/AppDecisionDialog.jsx'
let AppDecisionDialog = null

before(async () => {
  if (!existsSync(DIALOG_PATH)) return
  const mod = await ssrLoadRendererModule('/components/ui/AppDecisionDialog.jsx')
  AppDecisionDialog = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('App delegates shared confirmations to the decision dialog component', () => {
  const appSource = readFileSync('src/renderer/App.jsx', 'utf8')

  assert.equal(existsSync(DIALOG_PATH), true)
  assert.match(appSource, /import AppDecisionDialog from '\.\/components\/ui\/AppDecisionDialog\.jsx'/)
  assert.match(appSource, /<AppDecisionDialog/)
  assert.doesNotMatch(appSource, /function ConfirmDialogHost/)
})

test('decision dialog is one borderless tonal surface with one dismissal control', () => {
  assert.equal(typeof AppDecisionDialog, 'function')
  const html = renderToStaticMarkup(React.createElement(AppDecisionDialog, {
    dialog: {
      id: 'delete-thread',
      title: 'Delete thread?',
      message: 'Memory and artifacts remain available.',
      confirmLabel: 'Delete thread',
      cancelLabel: 'Cancel',
      tone: 'danger',
      showCancel: true,
    },
    onConfirm: () => {},
    onCancel: () => {},
  }))

  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby="app-decision-dialog-title-delete-thread"/)
  assert.match(html, /aria-describedby="app-decision-dialog-description-delete-thread"/)
  assert.match(html, /Delete thread\?/)
  assert.match(html, /Memory and artifacts remain available\./)
  assert.match(html, />Cancel</)
  assert.match(html, />Delete thread</)
  assert.doesNotMatch(html, /Confirmation|Notice/)
  assert.doesNotMatch(html, /aria-label="Close|data-ui="app-decision-dialog-close"/)
  assert.doesNotMatch(html, /border-danger|border-warning|bg-danger|bg-warning/)
})

test('decision alerts keep the same surface without a redundant cancel action', () => {
  assert.equal(typeof AppDecisionDialog, 'function')
  const html = renderToStaticMarkup(React.createElement(AppDecisionDialog, {
    dialog: {
      id: 'saved',
      title: 'Saved',
      message: 'Your setting was saved.',
      confirmLabel: 'OK',
      showCancel: false,
      tone: 'neutral',
    },
    onConfirm: () => {},
    onCancel: () => {},
  }))

  assert.match(html, />OK</)
  assert.doesNotMatch(html, />Cancel</)
})

test('decision dialog traps focus, restores focus, and supports Escape and backdrop dismissal', () => {
  assert.equal(existsSync(DIALOG_PATH), true)
  const source = readFileSync(DIALOG_PATH, 'utf8')

  assert.match(source, /useDialogFocusTrap\(open,\s*dialogRef\)/)
  assert.match(source, /useDialogEscapeDismiss\(open,\s*dialogRef,\s*onCancel\)/)
  assert.match(source, /event\.target !== event\.currentTarget/)
  assert.match(source, /onMouseDown=\{handleBackdropMouseDown\}/)
})
