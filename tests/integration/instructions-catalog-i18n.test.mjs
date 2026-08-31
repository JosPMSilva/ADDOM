import test from 'node:test'
import assert from 'node:assert/strict'

import { SYSTEM_UI_LOCALE, listUiLocaleOptions } from '../../src/common/i18n/locale-config.mjs'
import {
  getLocalizedInstructionsCatalog,
  getLocalizedInstructionsGuideBlock,
} from '../../src/renderer/content/instructions-catalog-i18n.mjs'
import { INSTRUCTIONS_CATALOG } from '../../src/renderer/content/instructions-catalog.mjs'

const EXPOSED_LOCALES = listUiLocaleOptions()
  .map((entry) => entry.code)
  .filter((code) => code !== SYSTEM_UI_LOCALE)

test('instructions catalog stays complete across exposed locales', () => {
  for (const locale of EXPOSED_LOCALES) {
    const catalog = getLocalizedInstructionsCatalog(locale)
    const guideBlock = getLocalizedInstructionsGuideBlock(locale)

    assert.ok(catalog.title, `missing title for ${locale}`)
    assert.ok(catalog.description, `missing description for ${locale}`)
    assert.ok(catalog.updatedLabel, `missing updated label for ${locale}`)
    assert.equal(catalog.sections.length, INSTRUCTIONS_CATALOG.sections.length, `section count mismatch for ${locale}`)

    catalog.sections.forEach((section, index) => {
      const sourceSection = INSTRUCTIONS_CATALOG.sections[index]
      assert.ok(section.title, `missing section title for ${locale}:${section.id}`)
      assert.equal(section.items.length, sourceSection.items.length, `item count mismatch for ${locale}:${section.id}`)
      section.items.forEach((item, itemIndex) => {
        assert.ok(item, `missing section item ${itemIndex} for ${locale}:${section.id}`)
      })
    })

    assert.ok(guideBlock.sectionTitle, `missing guide block title for ${locale}`)
    assert.ok(guideBlock.sectionDescription, `missing guide block description for ${locale}`)
    assert.ok(guideBlock.guideLabel, `missing guide block label for ${locale}`)
    assert.ok(guideBlock.versionLabel, `missing guide block version label for ${locale}`)
    assert.ok(guideBlock.updatedLabel, `missing guide block updated label for ${locale}`)
    assert.ok(guideBlock.openGuide, `missing guide block CTA for ${locale}`)
    assert.ok(guideBlock.note, `missing guide block note for ${locale}`)
  }
})

test('major non-English locales use localized guide titles', () => {
  for (const locale of ['de', 'es', 'ja', 'zh-CN']) {
    const catalog = getLocalizedInstructionsCatalog(locale)
    const guideBlock = getLocalizedInstructionsGuideBlock(locale)

    assert.notEqual(catalog.title, INSTRUCTIONS_CATALOG.title, `catalog title still English for ${locale}`)
    assert.notEqual(guideBlock.sectionTitle, 'Usage Guide', `guide block title still English for ${locale}`)
    assert.notEqual(guideBlock.openGuide, 'Open Guide', `guide CTA still English for ${locale}`)
  }
})

test('usage guide reflects the current Settings and Agents surfaces in every locale', () => {
  assert.equal(INSTRUCTIONS_CATALOG.version, '2026.08.31.1')
  assert.equal(INSTRUCTIONS_CATALOG.lastUpdated, '2026-08-31')
  assert.ok(INSTRUCTIONS_CATALOG.sections.some((section) => section.id === 'providers-and-agents'))

  for (const locale of EXPOSED_LOCALES) {
    const serialized = JSON.stringify(getLocalizedInstructionsCatalog(locale))
    assert.doesNotMatch(serialized, /providers-and-moa|Tools & Safety|Data & Privacy|Knowledge Base|\bMoA\b/i, `stale guide copy for ${locale}`)
    assert.match(serialized, /General, Appearance, Terminal, Agents, Providers, Safety, and Data/, `missing current Settings categories for ${locale}`)
  }
})
