import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let resolveSettingsDetailView = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/settings-panel-detail-view.mjs')
  resolveSettingsDetailView = mod?.resolveSettingsDetailView || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('resolveSettingsDetailView finds registered category detail views only', () => {
  assert.equal(typeof resolveSettingsDetailView, 'function')

  const view = resolveSettingsDetailView([
    {
      id: 'providers',
      detailViews: {
        openrouter: { id: 'openrouter', render: () => null },
      },
    },
  ], 'openrouter')

  assert.equal(view?.id, 'openrouter')
  assert.equal(resolveSettingsDetailView([], 'openrouter'), null)
  assert.equal(resolveSettingsDetailView([{ id: 'general' }], 'openrouter'), null)
})
