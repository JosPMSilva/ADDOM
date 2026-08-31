import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('ui scaling runtime tolerates non-browser window shims without resize APIs', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document

  const styleValues = new Map()
  globalThis.window = {
    innerWidth: 1600,
    innerHeight: 900,
  }
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
    const runtimeUrl = pathToFileURL(path.resolve('src/renderer/ui-scaling-runtime.mjs')).href
    const runtime = await import(`${runtimeUrl}?ui-scaling-runtime-test=${Date.now()}`)
    assert.equal(typeof runtime.applyUiScalingSettings, 'function')

    assert.doesNotThrow(() => {
      runtime.applyUiScalingSettings({ mode: 'manual', scale: 0.9 })
    })
    assert.equal(styleValues.get('--app-ui-scale'), '0.9')
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})
