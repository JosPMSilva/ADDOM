import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const {
  default: rendererI18n,
  initializeRendererI18n,
  resolveActiveRendererUiLocale,
} = await import('../../src/renderer/i18n/init.mjs')

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const localesRoot = path.join(repoRoot, 'src', 'renderer', 'i18n', 'locales')

function collectStringLeaves(value, out = []) {
  if (typeof value === 'string') {
    out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStringLeaves(entry, out)
    return out
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStringLeaves(entry, out)
  }
  return out
}

function findSuspiciousMojibake(text = '') {
  const issues = []
  if (text.includes('\uFFFD')) issues.push('replacement-char')
  if (/\?\?+/.test(text)) issues.push('double-question-mark')
  if (/[\p{L}\p{N}]\?[\p{L}\p{N}]/u.test(text)) issues.push('broken-in-word-question-mark')
  if (/(^|[\s([{"'/:])\?[\p{L}\p{N}]/u.test(text)) issues.push('broken-leading-question-mark')
  return issues
}

test('renderer i18n initializes with shipped renderer locale resources', async () => {
  const instance = await initializeRendererI18n({
    uiLocale: 'es',
  })

  assert.equal(instance, rendererI18n)
  assert.equal(rendererI18n.isInitialized, true)
  assert.equal(rendererI18n.language, 'es')
  assert.equal(rendererI18n.hasResourceBundle('en', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('es', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('pt-BR', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('fr', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('de', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('ja', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('zh-CN', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('ko', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('it', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('nl', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('pl', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('tr', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('uk', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('id', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('vi', 'core'), true)
  assert.equal(rendererI18n.hasResourceBundle('en-XA', 'core'), true)
  assert.equal(rendererI18n.t('app.confirmDialog.confirm', { ns: 'core' }), 'Confirmar')
  assert.equal(rendererI18n.t('settings:blocks.executionMode.mode.ask'), 'Ask')
  assert.equal(rendererI18n.t('core:backgroundJobs.title'), 'Background Jobs')
  assert.match(
    rendererI18n.t('settings:blocks.language.systemDefaultDescription'),
    /\bBackend\b/,
  )
  assert.equal(rendererI18n.t('core:chat.planDirection.create'), 'Crear plan')
  assert.equal(rendererI18n.exists('core:chat.planInteraction.implementPlan'), false)
  assert.match(
    rendererI18n.t('core:chat.roleConfirmation.allowStagedWrites.description'),
    /\bwrite_file\b/,
  )
  assert.match(
    rendererI18n.t('settings:blocks.moaAgents.description'),
    /\bagent roles\b/i,
  )
})

test('renderer i18n resolves system locale requests through the shipped-language gate', () => {
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'en-US' }), 'en')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'es-MX' }), 'es')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'pt-PT' }), 'pt-BR')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'fr-CA' }), 'fr')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'de-AT' }), 'de')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'ja-JP' }), 'ja')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'zh-Hans-CN' }), 'zh-CN')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'ko-KR' }), 'ko')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'it-IT' }), 'it')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'nl-BE' }), 'nl')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'pl-PL' }), 'pl')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'tr-TR' }), 'tr')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'uk-UA' }), 'uk')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'id-ID' }), 'id')
  assert.equal(resolveActiveRendererUiLocale('system', { language: 'vi-VN' }), 'vi')
  assert.equal(resolveActiveRendererUiLocale('en-XA'), 'en-XA')
})

test('renderer i18n supports both ICU messages and brace-style placeholders in renderer catalogs', async () => {
  await initializeRendererI18n({
    uiLocale: 'en',
  })

  assert.equal(
    rendererI18n.t('core:projectEntry.clearProjectHistoryDialog.message', { name: 'Ada' }),
    'Clear transcript history for project "Ada"?\n\nThis does not delete project files.',
  )

  assert.equal(
    rendererI18n.t('core:memoryPanel.visibleCount.nodeOther', { count: 7 }),
    '7 nodes',
  )

  assert.equal(
    rendererI18n.t('core:projectEntry.recentProjects.projectCount', { count: 2 }),
    '2 projects',
  )
})

test('renderer i18n keeps canonical English scoped to product terms instead of leaking into localized composer and terminal labels', async () => {
  await initializeRendererI18n({
    uiLocale: 'en',
  })

  const shippedLocales = [
    'es',
    'pt-BR',
    'fr',
    'de',
    'ja',
    'zh-CN',
    'ko',
    'it',
    'nl',
    'pl',
    'tr',
    'uk',
    'id',
    'vi',
  ]

  for (const locale of shippedLocales) {
    assert.doesNotMatch(
      rendererI18n.t('core:chat.composer.placeholder.execute', { lng: locale }),
      /\bAsk\b/,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:chat.composer.placeholder.plan', { lng: locale }),
      /\bAsk\b/,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:terminal.dock.browser.actions.saveToThreadMemory', { lng: locale }),
      /\bmemory\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:terminal.dock.browser.actions.saveToProjectMemory', { lng: locale }),
      /\bmemory\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:terminal.dock.browser.actions.threadMemory', { lng: locale }),
      /\bmemory\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:chat.planRequests.label.memoryReview', { lng: locale }),
      /\bMemory\b/,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:terminal.dock.browser.actions.saveSnapshotToMemory', {
        lng: locale,
      }),
      /\bMemory\b/,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:commandPalette.commands.memory.openPanel.title', {
        lng: locale,
      }),
      /\bMemory\b/,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:shell.badges.globalMemoryContextOn', { lng: locale }),
      /\bmemory\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:shell.badges.globalMemoryContextOff', { lng: locale }),
      /\bmemory\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:blocks.commandSafety.description', { lng: locale }),
      /\bpermission mode\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:alerts.executionModeSaveFailed.message', { lng: locale }),
      /\bpermission mode\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:chat.composer.placeholder.selectThread', { lng: locale }),
      /\bthread\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:blocks.dataReset.exportCurrentThread', { lng: locale }),
      /\bThread\b/,
    )
    assert.doesNotMatch(
      rendererI18n.t('core:terminal.globalIndicator.threadCount', {
        lng: locale,
        count: 2,
        suffix: 's',
      }),
      /\bthread\b/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:sections.general.terminal.summary', { lng: locale }),
      /Persist terminal font/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:blocks.terminal.fontSizeLabel', { lng: locale }),
      /^Font size$/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:blocks.terminal.fontSizeDescription', { lng: locale }),
      /Base xterm font size/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:blocks.terminal.scrollbackLabel', { lng: locale }),
      /^Scrollback lines$/i,
    )
    assert.doesNotMatch(
      rendererI18n.t('settings:blocks.terminal.scrollbackDescription', { lng: locale }),
      /How much terminal history/i,
    )
  }

  assert.equal(
    rendererI18n.t('core:terminal.dock.state.userTakeover', { lng: 'pt-BR' }),
    'Usuário no controle',
  )
  assert.equal(
    rendererI18n.t('core:terminal.dock.state.aiControlling', { lng: 'pt-BR' }),
    'IA no controle',
  )
  assert.equal(
    rendererI18n.t('core:terminal.dock.browser.actions.handBackToAi', { lng: 'pt-BR' }),
    'Devolver o controle à IA',
  )
  assert.equal(
    rendererI18n.t('settings:shell.badges.typographyScale', { lng: 'en', percent: 125 }),
    'text 125%',
  )
  assert.equal(
    rendererI18n.t('settings:blocks.uiScaling.chatTypographyScale', { lng: 'en' }),
    'Text scale',
  )
  assert.doesNotMatch(
    rendererI18n.t('settings:sections.general.uiScaling.summary', { lng: 'en' }),
    /typography/i,
  )
  assert.equal(
    rendererI18n.t('settings:blocks.uiScaling.chatTypographyScale', { lng: 'pt-BR' }),
    'Escala de texto',
  )
})

test('renderer locale catalogs and composer status copy stay free of mojibake markers', () => {
  const localeCodes = fs.readdirSync(localesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((locale) => locale !== 'en' && locale !== 'en-XA')

  const failures = []

  for (const locale of localeCodes) {
    for (const fileName of ['core.json', 'settings.json']) {
      const absolutePath = path.join(localesRoot, locale, fileName)
      const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
      for (const text of collectStringLeaves(parsed)) {
        const issues = findSuspiciousMojibake(text)
        if (issues.length > 0) {
          failures.push(`${locale}/${fileName}: ${issues.join(', ')} :: ${text}`)
          break
        }
      }
    }
  }

  const composerActionsPath = path.join(
    repoRoot,
    'src',
    'renderer',
    'components',
    'chat',
    'use-chat-panel-composer-actions.mjs',
  )
  const composerActionsText = fs.readFileSync(composerActionsPath, 'utf8')
  if (
    composerActionsText.includes('?? Council failed:')
    || composerActionsText.includes('??? Council outputs collected')
    || composerActionsText.includes('â€”')
  ) {
    failures.push('use-chat-panel-composer-actions.mjs: broken council/pipeline status copy')
  }

  assert.deepEqual(failures, [])
})
