import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_UI_LOCALE,
  EXPOSED_UI_LOCALES,
  PSEUDO_UI_LOCALE,
  getUiLocaleFallbackChain,
  isExposedUiLocale,
  listUiLocaleOptions,
  normalizeUiLocale,
  resolveRendererUiLocale,
} from '../../src/common/i18n/locale-config.mjs'
import {
  CANONICAL_TECHNICAL_GLOSSARY,
  isCanonicalTechnicalTerm,
} from '../../src/common/i18n/technical-glossary.mjs'

test('ui locale normalization canonicalizes supported values and falls back safely', () => {
  assert.equal(DEFAULT_UI_LOCALE, 'en')
  assert.equal(normalizeUiLocale(' EN-us '), 'en')
  assert.equal(normalizeUiLocale('en-xa'), 'en-XA')
  assert.equal(normalizeUiLocale('es-MX'), 'es')
  assert.equal(normalizeUiLocale('pt_PT'), 'pt-BR')
  assert.equal(normalizeUiLocale('fr-CA'), 'fr')
  assert.equal(normalizeUiLocale('de-DE'), 'de')
  assert.equal(normalizeUiLocale('ja-JP'), 'ja')
  assert.equal(normalizeUiLocale('zh_CN'), 'zh-CN')
  assert.equal(normalizeUiLocale('ko-KR'), 'ko')
  assert.equal(normalizeUiLocale('it-IT'), 'it')
  assert.equal(normalizeUiLocale('nl-NL'), 'nl')
  assert.equal(normalizeUiLocale('pl-PL'), 'pl')
  assert.equal(normalizeUiLocale('tr-TR'), 'tr')
  assert.equal(normalizeUiLocale('uk-UA'), 'uk')
  assert.equal(normalizeUiLocale('id-ID'), 'id')
  assert.equal(normalizeUiLocale('vi-VN'), 'vi')
  assert.equal(normalizeUiLocale('system'), 'system')
  assert.equal(normalizeUiLocale('sv-SE'), 'en')
})

test('renderer locale resolution gates real locales while allowing the validation pseudo-locale', () => {
  assert.equal(resolveRendererUiLocale('en'), 'en')
  assert.equal(resolveRendererUiLocale('en-XA'), 'en-XA')
  assert.equal(resolveRendererUiLocale('es'), 'es')
  assert.equal(resolveRendererUiLocale('pt-BR'), 'pt-BR')
  assert.equal(resolveRendererUiLocale('fr'), 'fr')
  assert.equal(resolveRendererUiLocale('de'), 'de')
  assert.equal(resolveRendererUiLocale('ja'), 'ja')
  assert.equal(resolveRendererUiLocale('zh-CN'), 'zh-CN')
  assert.equal(resolveRendererUiLocale('ko'), 'ko')
  assert.equal(resolveRendererUiLocale('it'), 'it')
  assert.equal(resolveRendererUiLocale('nl'), 'nl')
  assert.equal(resolveRendererUiLocale('pl'), 'pl')
  assert.equal(resolveRendererUiLocale('tr'), 'tr')
  assert.equal(resolveRendererUiLocale('uk'), 'uk')
  assert.equal(resolveRendererUiLocale('id'), 'id')
  assert.equal(resolveRendererUiLocale('vi'), 'vi')
  assert.equal(resolveRendererUiLocale('system', { language: 'pt-PT' }), 'pt-BR')
  assert.equal(resolveRendererUiLocale('system', { language: 'es-MX' }), 'es')
  assert.equal(resolveRendererUiLocale('system', { language: 'fr-CA' }), 'fr')
  assert.equal(resolveRendererUiLocale('system', { language: 'de-AT' }), 'de')
  assert.equal(resolveRendererUiLocale('system', { language: 'ja-JP' }), 'ja')
  assert.equal(resolveRendererUiLocale('system', { language: 'zh-Hans-CN' }), 'zh-CN')
  assert.equal(resolveRendererUiLocale('system', { language: 'ko-KR' }), 'ko')
  assert.equal(resolveRendererUiLocale('system', { language: 'it-IT' }), 'it')
  assert.equal(resolveRendererUiLocale('system', { language: 'nl-BE' }), 'nl')
  assert.equal(resolveRendererUiLocale('system', { language: 'pl-PL' }), 'pl')
  assert.equal(resolveRendererUiLocale('system', { language: 'tr-TR' }), 'tr')
  assert.equal(resolveRendererUiLocale('system', { language: 'uk-UA' }), 'uk')
  assert.equal(resolveRendererUiLocale('system', { language: 'id-ID' }), 'id')
  assert.equal(resolveRendererUiLocale('system', { language: 'vi-VN' }), 'vi')
  assert.deepEqual(getUiLocaleFallbackChain('es'), ['es', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('pt-BR'), ['pt-BR', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('fr'), ['fr', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('de'), ['de', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('ja'), ['ja', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('zh-CN'), ['zh-CN', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('ko'), ['ko', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('it'), ['it', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('nl'), ['nl', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('pl'), ['pl', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('tr'), ['tr', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('uk'), ['uk', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('id'), ['id', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('vi'), ['vi', 'en'])
  assert.deepEqual(getUiLocaleFallbackChain('en-XA'), ['en-XA', 'en'])
})

test('locale metadata exposes shipped release locales and hides validation-only locales from the normal selector', () => {
  const options = listUiLocaleOptions()
  assert.deepEqual(options.map((entry) => entry.code), [
    'system',
    'en',
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
  ])
  assert.equal(options.find((entry) => entry.code === 'en')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'es')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'pt-BR')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'fr')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'de')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'ja')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'zh-CN')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'ko')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'it')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'nl')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'pl')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'tr')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'uk')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'id')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'vi')?.shipped, true)
  assert.equal(options.find((entry) => entry.code === 'system')?.shipped, false)
  assert.equal(EXPOSED_UI_LOCALES.includes(PSEUDO_UI_LOCALE), false)
  assert.equal(isExposedUiLocale(PSEUDO_UI_LOCALE), false)

  const allOptions = listUiLocaleOptions({ includeHidden: true, includeUnshipped: true })
  assert.equal(allOptions.find((entry) => entry.code === PSEUDO_UI_LOCALE)?.shipped, true)
  assert.equal(allOptions.find((entry) => entry.code === 'es')?.shipped, true)
  assert.equal(allOptions.find((entry) => entry.code === 'pt-BR')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'fr')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'de')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'ja')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'zh-CN')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'ko')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'it')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'nl')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'pl')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'tr')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'uk')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'id')?.exposed, true)
  assert.equal(allOptions.find((entry) => entry.code === 'vi')?.exposed, true)
})

test('technical glossary stays canonical English', () => {
  assert.equal(CANONICAL_TECHNICAL_GLOSSARY.product.includes('ADDOM'), true)
  assert.equal(CANONICAL_TECHNICAL_GLOSSARY.providers.includes('OpenAI'), true)
  assert.equal(isCanonicalTechnicalTerm('MCP'), true)
  assert.equal(isCanonicalTechnicalTerm('Open Router'), false)
})
