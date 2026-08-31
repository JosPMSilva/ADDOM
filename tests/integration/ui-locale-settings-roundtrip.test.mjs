import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-ui-locale-settings-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  getSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('uiLocale defaults to canonical English', () => {
  const settings = getSettings()
  assert.equal(settings.uiLocale, 'en')
})

test('uiLocale round-trips canonical locale codes through settings persistence', async () => {
  const first = await setSettingsPatch({
    uiLocale: ' ES-mx ',
  })
  assert.equal(first.uiLocale, 'es')
  assert.equal(getSettings().uiLocale, 'es')

  const second = await setSettingsPatch({
    uiLocale: 'de-DE',
  })
  assert.equal(second.uiLocale, 'de')
  assert.equal(getSettings().uiLocale, 'de')

  const third = await setSettingsPatch({
    uiLocale: 'fr-CA',
  })
  assert.equal(third.uiLocale, 'fr')
  assert.equal(getSettings().uiLocale, 'fr')

  const fourth = await setSettingsPatch({
    uiLocale: 'pt_PT',
  })
  assert.equal(fourth.uiLocale, 'pt-BR')
  assert.equal(getSettings().uiLocale, 'pt-BR')

  const fifth = await setSettingsPatch({
    uiLocale: 'ja-JP',
  })
  assert.equal(fifth.uiLocale, 'ja')
  assert.equal(getSettings().uiLocale, 'ja')

  const sixth = await setSettingsPatch({
    uiLocale: 'zh_CN',
  })
  assert.equal(sixth.uiLocale, 'zh-CN')
  assert.equal(getSettings().uiLocale, 'zh-CN')

  const seventh = await setSettingsPatch({
    uiLocale: 'ko-KR',
  })
  assert.equal(seventh.uiLocale, 'ko')
  assert.equal(getSettings().uiLocale, 'ko')

  const eighth = await setSettingsPatch({
    uiLocale: 'it-IT',
  })
  assert.equal(eighth.uiLocale, 'it')
  assert.equal(getSettings().uiLocale, 'it')

  const ninth = await setSettingsPatch({
    uiLocale: 'nl-BE',
  })
  assert.equal(ninth.uiLocale, 'nl')
  assert.equal(getSettings().uiLocale, 'nl')

  const tenth = await setSettingsPatch({
    uiLocale: 'pl-PL',
  })
  assert.equal(tenth.uiLocale, 'pl')
  assert.equal(getSettings().uiLocale, 'pl')

  const eleventh = await setSettingsPatch({
    uiLocale: 'tr-TR',
  })
  assert.equal(eleventh.uiLocale, 'tr')
  assert.equal(getSettings().uiLocale, 'tr')

  const twelfth = await setSettingsPatch({
    uiLocale: 'uk-UA',
  })
  assert.equal(twelfth.uiLocale, 'uk')
  assert.equal(getSettings().uiLocale, 'uk')

  const thirteenth = await setSettingsPatch({
    uiLocale: 'id-ID',
  })
  assert.equal(thirteenth.uiLocale, 'id')
  assert.equal(getSettings().uiLocale, 'id')

  const fourteenth = await setSettingsPatch({
    uiLocale: 'vi-VN',
  })
  assert.equal(fourteenth.uiLocale, 'vi')
  assert.equal(getSettings().uiLocale, 'vi')
})

test('uiLocale preserves the system sentinel without writing translated labels', async () => {
  const next = await setSettingsPatch({
    uiLocale: 'system',
  })

  assert.equal(next.uiLocale, 'system')
  assert.equal(getSettings().uiLocale, 'system')

  const storedSettings = JSON.parse(
    fs.readFileSync(path.join(userDataPath, 'settings.json'), 'utf8'),
  )
  assert.equal(storedSettings.uiLocale, 'system')
})
