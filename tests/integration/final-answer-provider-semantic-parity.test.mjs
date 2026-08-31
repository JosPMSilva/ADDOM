import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { advanceCanonicalFinalText } from '../../src/common/chat/final-document-stream-projector.mjs'
import { buildNormalizedFinalDocumentSemanticSnapshot } from '../helpers/final-document-semantic-snapshot.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

const fixtureRoot = path.resolve('tests/fixtures/cross-provider-final-answer')
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
const providerMatrix = [
  { providerId: 'openai', modelId: 'gpt-5.4' },
  { providerId: 'openai', modelId: 'gpt-5.3-codex' },
  { providerId: 'cursor', modelId: 'composer-2.5' },
  { providerId: 'openrouter', modelId: 'anthropic/claude-sonnet-5' },
]
const locales = ['en', 'de', 'ja', 'en-XA']

let MessageBubble = null
let initializeRendererI18n = null

before(async () => {
  const messageMod = await ssrLoadRendererModule('/components/chat/MessageBubble.jsx')
  const i18nMod = await ssrLoadRendererModule('/i18n/init.mjs')
  MessageBubble = messageMod?.MessageBubble || null
  initializeRendererI18n = i18nMod?.initializeRendererI18n || null
})

after(async () => {
  await initializeRendererI18n?.({ uiLocale: 'en' })
  await closeViteSsrLoader()
})

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function readFixtureContent(fixtureId) {
  const entry = manifest.fixtures.find((fixture) => fixture.fixtureId === fixtureId)
  assert.ok(entry, `Missing fixture ${fixtureId}`)
  const metaPath = path.join(fixtureRoot, entry.metaFile)
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  return fs.readFileSync(path.join(path.dirname(metaPath), meta.contentFile), 'utf8')
}

function renderSnapshot(content, { providerId, modelId, messageId }) {
  const html = renderToStaticMarkup(React.createElement(MessageBubble, {
    message: {
      id: messageId,
      role: 'assistant',
      content,
      finalDocument: { schemaVersion: 1, text: content, parts: [] },
      status: 'done',
      streamMeta: { provider: providerId, model: modelId },
    },
  }))
  const snapshot = buildNormalizedFinalDocumentSemanticSnapshot({
    html,
    source: 'ssr',
    messageMeta: { messageId, providerId, modelId },
  })
  return { html, snapshot }
}

function providerNeutralSemantics(snapshot, { localizeControls = false } = {}) {
  const localeNeutralStats = Object.fromEntries(
    Object.entries(snapshot.stats).filter(([key]) => key !== 'sourceCharacterCount'),
  )
  return {
    document: snapshot.document,
    links: snapshot.annotations.links,
    controls: snapshot.annotations.controls.map((control) => (
      localizeControls
        ? { role: control.role, path: control.path, ownership: control.ownership }
        : control
    )),
    stats: localizeControls ? localeNeutralStats : snapshot.stats,
  }
}

test('equal canonical Markdown produces equal semantics for every supported provider route', async () => {
  await initializeRendererI18n?.({ uiLocale: 'en' })
  const content = readFixtureContent('markdown-syntax-matrix')
  const hashes = providerMatrix.map((provider, index) => {
    const { html, snapshot } = renderSnapshot(content, {
      ...provider,
      messageId: `provider-parity-${index}`,
    })
    assert.match(html, /data-final-answer-document="true"/)
    assert.doesNotMatch(html, /data-chat-render="(?:plan-card|delegation|role|dispatch|council|review|patch-group)"/)
    return sha256(providerNeutralSemantics(snapshot))
  })

  assert.equal(new Set(hashes).size, 1)
})

test('provider stream fixtures exclude execution ownership and preserve exact final semantics', async () => {
  await initializeRendererI18n?.({ uiLocale: 'en' })
  const entries = manifest.fixtures.filter((entry) => entry.metaFile.startsWith('provider-streams/'))
  for (const entry of entries) {
    const metaPath = path.join(fixtureRoot, entry.metaFile)
    const fixture = JSON.parse(fs.readFileSync(path.join(path.dirname(metaPath), 'stream.json'), 'utf8'))
    let progression = null
    for (const event of fixture.canonicalEvents) {
      if (event.ownership !== 'final-document') continue
      progression = advanceCanonicalFinalText(progression, {
        operation: 'append',
        text: event.text,
        eventId: event.eventId,
        sequence: event.sequence,
      })
    }
    assert.equal(progression?.text || '', fixture.expectedFinalMarkdown, fixture.fixtureId)
    const { html, snapshot } = renderSnapshot(fixture.expectedFinalMarkdown, {
      providerId: fixture.provider,
      modelId: fixture.model,
      messageId: fixture.fixtureId,
    })
    assert.ok(snapshot.document.blocks.length > 0, fixture.fixtureId)
    for (const event of fixture.canonicalEvents.filter((item) => item.ownership !== 'final-document')) {
      assert.equal(html.includes(event.text), false, `${fixture.fixtureId}:${event.eventId}`)
    }
  }
})

test('final-document semantics stay stable across en, de, ja, and pseudo-locale UI chrome', async () => {
  const content = readFixtureContent('markdown-syntax-matrix')
  const results = []
  for (const locale of locales) {
    await initializeRendererI18n?.({ uiLocale: locale })
    const { snapshot } = renderSnapshot(content, {
      ...providerMatrix[0],
      messageId: `locale-parity-${locale}`,
    })
    results.push({
      locale,
      semantics: providerNeutralSemantics(snapshot, { localizeControls: true }),
    })
  }
  for (const result of results.slice(1)) {
    assert.deepEqual(result.semantics, results[0].semantics, result.locale)
  }
})

test('20, 50, and 100 agent-shaped execution events cannot enter the final document', () => {
  const finalMarkdown = '# Agent result\n\nOnly the root final answer belongs here.\n'
  for (const agentCount of [20, 50, 100]) {
    const events = Array.from({ length: agentCount }, (_, index) => ({
      eventId: `agent-${agentCount}-${index}`,
      sequence: index + 1,
      ownership: index % 2 === 0 ? 'commentary' : 'reasoning',
      text: `Agent ${index + 1} private activity.`,
    }))
    events.push({
      eventId: `final-${agentCount}`,
      sequence: agentCount + 1,
      ownership: 'final-document',
      text: finalMarkdown,
    })
    let progression = null
    for (const event of events) {
      if (event.ownership !== 'final-document') continue
      progression = advanceCanonicalFinalText(progression, {
        operation: 'append',
        text: event.text,
        eventId: event.eventId,
        sequence: event.sequence,
      })
    }
    assert.equal(progression?.text, finalMarkdown)
    assert.doesNotMatch(progression?.text || '', /private activity/)
  }
})
