import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let disposeInlineCompletionsNoop = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/editor/editor-monaco-mount-helpers.mjs')
  disposeInlineCompletionsNoop = mod?.disposeInlineCompletionsNoop || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('inline completion provider implements Monaco disposeInlineCompletions contract', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/editor/editor-monaco-inline-completions.mjs'),
    'utf8',
  )
  assert.match(source, /disposeInlineCompletions\s*:/)
  assert.equal(typeof disposeInlineCompletionsNoop, 'function')
  assert.doesNotThrow(() => disposeInlineCompletionsNoop({ items: [] }, 'accept'))
})
