import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ProjectFileReferenceLink = null
let rendererUseAppStore = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ProjectFileReferenceLink.jsx')
  ProjectFileReferenceLink = mod?.default || null

  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')
  rendererUseAppStore = appStoreMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('ProjectFileReferenceLink recovers empty-href markdown labels from visible file-reference text', () => {
  assert.equal(typeof ProjectFileReferenceLink, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder

  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderToStaticMarkup(
      React.createElement(
        ProjectFileReferenceLink,
        {
          href: '',
          label: 'src/main/index.mjs:810',
          className: 'text-accent underline',
          fallbackTag: 'a',
          fallbackHref: '#',
        },
        'src/main/index.mjs:810',
      ),
    )

    assert.match(html, /data-chat-file-reference="true"/)
    assert.match(html, /href="#"/)
    assert.match(html, /src\/main\/index\.mjs:810/)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})
