import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let MoonshotRemoteToolsBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsBlocks.jsx')
  MoonshotRemoteToolsBlock = mod?.MoonshotRemoteToolsBlock ?? null
})

after(async () => {
  await closeViteSsrLoader()
})

test('settings block exports no Moonshot remote tools catalog after the cleanup-first cutover', () => {
  assert.equal(MoonshotRemoteToolsBlock, null)
})
