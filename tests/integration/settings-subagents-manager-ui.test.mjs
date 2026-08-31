import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let SettingsSubagentsSummary = null
let SettingsSubagentsManager = null

before(async () => {
  const summaryExists = existsSync(new URL('../../src/renderer/components/settings/SettingsSubagentsSummary.jsx', import.meta.url))
  const managerExists = existsSync(new URL('../../src/renderer/components/settings/SettingsSubagentsManager.jsx', import.meta.url))
  const summaryMod = summaryExists
    ? await ssrLoadRendererModule('/components/settings/SettingsSubagentsSummary.jsx')
    : null
  const managerMod = managerExists
    ? await ssrLoadRendererModule('/components/settings/SettingsSubagentsManager.jsx')
    : null
  SettingsSubagentsSummary = summaryMod?.default || null
  SettingsSubagentsManager = managerMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('Subagents summary is a compact preference row', () => {
  assert.equal(typeof SettingsSubagentsSummary, 'function')
  const html = renderToStaticMarkup(React.createElement(SettingsSubagentsSummary, {
    roleCount: 2,
    onManage: () => {},
  }))

  assert.match(html, /balanced capacity/)
  assert.match(html, /8 active at once/)
  assert.match(html, /2 roles/)
  assert.match(html, /data-ui="settings-manage-subagents"/)
  assert.doesNotMatch(html, /role="switch"|Enable Subagents/)
  assert.doesNotMatch(html, /border-b/)
  assert.doesNotMatch(html, /rounded-xl|shadow-sm|bg-warning/)
})

test('Subagents manager defaults to configured roles', () => {
  assert.equal(typeof SettingsSubagentsManager, 'function')
  const html = renderToStaticMarkup(React.createElement(SettingsSubagentsManager, {
    moaRoles: [{ id: 'reviewer', name: 'Reviewer', providerId: 'openai', model: 'gpt-5', canWriteFiles: false }],
    setMoaRoles: () => {},
    providers: [],
    modelCatalogVisibility: {},
    roleTemplates: [],
    onClose: () => {},
  }))

  assert.match(html, /Reviewer/)
  assert.match(html, /openai \/ gpt-5/)
  assert.match(html, /Agent delegation/)
  assert.match(html, /Capacity/)
  assert.match(html, /Advanced limits/)
  assert.match(html, /Agent roles/)
  assert.match(html, /Skill Catalog/)
  assert.doesNotMatch(html, /Maximum active agents|Token limit per run|Provider concurrency caps/)
  assert.doesNotMatch(html, />Delete</)
  assert.doesNotMatch(html, /max-h-\[320px\]|rounded-xl|shadow-sm/)
})

test('Subagents collection sources avoid cards and nested scrolling', () => {
  const files = [
    'MoaTemplateGallery.jsx',
    'MoaRolesSection.jsx',
    'MoaRoleForm.jsx',
  ]
  for (const file of files) {
    const source = readFileSync(new URL(`../../src/renderer/components/settings/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /rounded-xl|shadow-sm|shadow-inner|max-h-\[320px\]/)
  }
})

test('renderer source no longer owns an Agents enable flag', () => {
  const rendererRoot = fileURLToPath(new URL('../../src/renderer/', import.meta.url))
  const source = readdirSync(rendererRoot, { recursive: true })
    .filter((entry) => ['.js', '.jsx', '.mjs', '.json'].includes(extname(String(entry))))
    .map((entry) => readFileSync(join(rendererRoot, String(entry)), 'utf8'))
    .join('\n')

  assert.doesNotMatch(source, /\b(?:moaEnabled|setMoaEnabled)\b/)
})
