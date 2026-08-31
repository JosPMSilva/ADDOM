import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let TerminalStatusBanner = null
let TerminalViewport = null
let SourceControlPanel = null
let useAppStore = null
let useSettingsStore = null
let initializeRendererI18n = null
let syncRendererUiLocale = null

before(async () => {
  const terminalStatusBannerMod = await ssrLoadRendererModule('/components/terminal/TerminalStatusBanner.jsx')
  const terminalViewportMod = await ssrLoadRendererModule('/components/terminal/TerminalViewport.jsx')
  const sourceControlPanelMod = await ssrLoadRendererModule('/components/SourceControlPanel.jsx')
  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')
  const settingsStoreMod = await ssrLoadRendererModule('/store/useSettingsStore.js')
  const i18nMod = await ssrLoadRendererModule('/i18n/init.mjs')

  TerminalStatusBanner = terminalStatusBannerMod?.default || null
  TerminalViewport = terminalViewportMod?.default || null
  SourceControlPanel = sourceControlPanelMod?.default || null
  useAppStore = appStoreMod?.default || null
  useSettingsStore = settingsStoreMod?.default || null
  initializeRendererI18n = i18nMod?.initializeRendererI18n || null
  syncRendererUiLocale = i18nMod?.syncRendererUiLocale || null
})

after(async () => {
  await closeViteSsrLoader()
})

function resetStore(store, nextState = {}) {
  if (!store || typeof store.setState !== 'function') return
  const baseState = typeof store.getInitialState === 'function'
    ? store.getInitialState()
    : store.getState()
  store.setState({
    ...baseState,
    ...(nextState && typeof nextState === 'object' ? nextState : {}),
  }, true)
}

async function setUiLocale(uiLocale = 'en') {
  useSettingsStore?.setState?.({ uiLocale })
  await initializeRendererI18n?.({ uiLocale })
}

test('terminal renderer surfaces localize to Spanish in SSR', async () => {
  await setUiLocale('es')

  const bannerHtml = renderToStaticMarkup(React.createElement(TerminalStatusBanner, {
    runtimeHealth: { status: 'loading' },
  }))
  assert.match(bannerHtml, /Comprobando el runtime/)

  const viewportHtml = renderToStaticMarkup(React.createElement(TerminalViewport, {
    runtimeHealth: { status: 'supported' },
    session: null,
    canCreate: true,
  }))
  assert.match(viewportHtml, /Iniciar una sesi/)
  assert.match(viewportHtml, /Crear sesi/)
})

test('source control empty-project prompt localizes to Spanish in SSR', async () => {
  await setUiLocale('es')
  resetStore(useAppStore, { projectFolder: '' })

  const html = renderToStaticMarkup(React.createElement(SourceControlPanel))
  assert.match(html, /Abre una carpeta de proyecto para inspeccionar cambios/)
})

test('terminal renderer surfaces localize to pseudo-locale in SSR', async () => {
  await setUiLocale('en-XA')

  const bannerHtml = renderToStaticMarkup(React.createElement(TerminalStatusBanner, {
    runtimeHealth: { status: 'loading' },
  }))
  assert.match(bannerHtml, /\[Çħëçķïñğ řüñŧïṁë.*\]/i)

  await syncRendererUiLocale?.('en')
  useSettingsStore?.setState?.({ uiLocale: 'en' })
})
