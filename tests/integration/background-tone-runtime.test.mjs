import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('background tone runtime applies CSS variables and dataset tone', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document

  const styleValues = new Map()
  globalThis.window = {}
  globalThis.document = {
    documentElement: {
      dataset: {},
      style: {
        setProperty(name, value) {
          styleValues.set(String(name || ''), String(value || ''))
        },
      },
    },
  }

  try {
    const runtimeUrl = pathToFileURL(path.resolve('src/renderer/background-tone-runtime.mjs')).href
    const runtime = await import(`${runtimeUrl}?background-tone-runtime-test=${Date.now()}`)
    assert.equal(typeof runtime.applyBackgroundToneSettings, 'function')

    runtime.applyBackgroundToneSettings({ tone: 'slate' })
    assert.equal(globalThis.document.documentElement.dataset.appBackgroundTone, 'slate')
    assert.equal(styleValues.get('--color-surface'), '#101211')
    assert.equal(styleValues.get('--color-surface-panel'), '#20231f')
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})
