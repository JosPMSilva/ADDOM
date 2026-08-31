import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import rendererI18n, { initializeRendererI18n, syncRendererUiLocale } from '../../src/renderer/i18n/init.mjs'
import useRendererTranslation from '../../src/renderer/i18n/use-renderer-translation.mjs'
import useSettingsStore from '../../src/renderer/store/useSettingsStore.js'

function ProjectCountProbe({ count = 0 }) {
  const { t } = useRendererTranslation(['core'])
  return React.createElement('div', null, t('core:projectEntry.recentProjects.projectCount', {
    defaultValue: '{count, plural, one {# project} other {# projects}}',
    count,
  }))
}

test('useRendererTranslation renders ICU plurals instead of leaking raw catalog text', async () => {
  useSettingsStore.setState({ uiLocale: 'en' })
  await initializeRendererI18n({ uiLocale: 'en' })

  const enHtml = renderToStaticMarkup(React.createElement(ProjectCountProbe, { count: 2 }))
  assert.match(enHtml, />2 projects</)
  assert.doesNotMatch(enHtml, /\{count, plural,/)

  await syncRendererUiLocale('en')
  useSettingsStore.setState({ uiLocale: 'en' })
  assert.equal(rendererI18n.language, 'en')
})

test('useRendererTranslation SSR renders the new shipped locales', async () => {
  const cases = [
    ['pt-BR', '2 projetos'],
    ['fr', '2 projets'],
    ['de', '2 Projekte'],
    ['ja', '2 プロジェクト'],
    ['zh-CN', '2 个项目'],
    ['ko', '2개 프로젝트'],
    ['it', '2 progetti'],
    ['nl', '2 projecten'],
    ['pl', '2 projekty'],
    ['tr', '2 proje'],
    ['uk', '2 проєкти'],
    ['id', '2 proyek'],
    ['vi', '2 dự án'],
  ]

  for (const [locale, expectedText] of cases) {
    await syncRendererUiLocale(locale)
    useSettingsStore.setState({ uiLocale: locale })

    const html = renderToStaticMarkup(React.createElement(ProjectCountProbe, { count: 2 }))
    assert.match(html, new RegExp(`>${expectedText}<`))
    assert.doesNotMatch(html, /\{count, plural,/)
  }
})
