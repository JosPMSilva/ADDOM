import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  advanceCanonicalFinalText,
  projectStreamingFinalDocument,
} from '../../src/common/chat/final-document-stream-projector.mjs'

function reconstruct(projection) {
  return projection.blocks.map((block) => block.text).join('') + projection.tail.text
}

test('stream projector freezes completed top-level Markdown blocks and mutates only the tail', () => {
  const first = projectStreamingFinalDocument({
    messageId: 'assistant_1',
    text: '# Title\n\nFirst paragraph',
  })
  assert.deepEqual(first.blocks.map((block) => block.text), ['# Title\n\n'])
  assert.equal(first.tail.text, 'First paragraph')

  const second = projectStreamingFinalDocument({
    previous: first,
    messageId: 'assistant_1',
    text: '# Title\n\nFirst paragraph\n\n- one\n- two',
  })
  assert.equal(second.blocks[0], first.blocks[0])
  assert.deepEqual(second.blocks.map((block) => block.text), [
    '# Title\n\n',
    'First paragraph\n\n',
  ])
  assert.equal(second.tail.text, '- one\n- two')
  assert.equal(reconstruct(second), second.text)

  const final = projectStreamingFinalDocument({
    previous: second,
    messageId: 'assistant_1',
    text: second.text,
    settled: true,
  })
  assert.equal(final.blocks[0], first.blocks[0])
  assert.equal(final.blocks[1], second.blocks[1])
  assert.equal(final.tail.text, '')
  assert.equal(reconstruct(final), final.text)
})

test('stream projector repairs only an open fenced-code tail', () => {
  const projection = projectStreamingFinalDocument({
    messageId: 'assistant_code',
    text: 'Intro.\n\n```js\nconst value = 1',
  })

  assert.deepEqual(projection.blocks.map((block) => block.text), ['Intro.\n\n'])
  assert.equal(projection.tail.text, '```js\nconst value = 1')
  assert.equal(projection.tail.renderText, '```js\nconst value = 1\n```')
  assert.equal(reconstruct(projection), projection.text)

  const final = projectStreamingFinalDocument({
    previous: projection,
    messageId: 'assistant_code',
    text: 'Intro.\n\n```js\nconst value = 1\n```',
    settled: true,
  })
  assert.equal(final.tail.text, '')
  assert.equal(final.blocks.at(-1).text, '```js\nconst value = 1\n```')
  assert.equal(final.blocks.at(-1).renderText, final.blocks.at(-1).text)
})

test('stream projector keeps tables, lists, links, and code spans in the mutable tail until their top-level block closes', () => {
  const cases = [
    '| A | B |\n|---|---|\n| 1 | 2 |',
    '- one\n- two',
    '[label](https://example.com',
    'Use `inline',
  ]

  for (const text of cases) {
    const open = projectStreamingFinalDocument({ messageId: `case:${text}`, text })
    assert.equal(open.blocks.length, 0)
    assert.equal(open.tail.text, text)

    const closed = projectStreamingFinalDocument({
      previous: open,
      messageId: `case:${text}`,
      text: `${text}\n\nNext`,
    })
    assert.equal(closed.blocks.length, 1)
    assert.equal(closed.tail.text, 'Next')
    assert.equal(reconstruct(closed), closed.text)
  }
})

test('tail replacement preserves stable block identity while settled reload reconstructs the same keys', () => {
  const initial = projectStreamingFinalDocument({
    messageId: 'assistant_replace',
    text: '# Stable\n\nDraft tail',
  })
  const replaced = projectStreamingFinalDocument({
    previous: initial,
    messageId: 'assistant_replace',
    text: '# Stable\n\nCorrected tail\n\nFinal paragraph.',
  })
  assert.equal(replaced.blocks[0], initial.blocks[0])

  const liveFinal = projectStreamingFinalDocument({
    previous: replaced,
    messageId: 'assistant_replace',
    text: replaced.text,
    settled: true,
  })
  const reload = projectStreamingFinalDocument({
    messageId: 'assistant_replace',
    text: replaced.text,
    settled: true,
  })
  assert.deepEqual(
    liveFinal.blocks.map(({ id, text }) => ({ id, text })),
    reload.blocks.map(({ id, text }) => ({ id, text })),
  )
})

test('canonical progression normalizes append, cumulative, final replacement, stale, and duplicate events', () => {
  let state = advanceCanonicalFinalText(null, {
    operation: 'append',
    text: 'Hello',
    eventId: 'evt_1',
    sequence: 1,
  })
  state = advanceCanonicalFinalText(state, {
    operation: 'append',
    text: ' world',
    eventId: 'evt_2',
    sequence: 2,
  })
  assert.equal(state.text, 'Hello world')

  const duplicate = advanceCanonicalFinalText(state, {
    operation: 'append',
    text: ' world',
    eventId: 'evt_2',
    sequence: 2,
  })
  assert.equal(duplicate, state)

  const cumulative = advanceCanonicalFinalText(state, {
    operation: 'cumulative',
    text: 'Hello world!',
    eventId: 'evt_3',
    sequence: 3,
  })
  assert.equal(cumulative.text, 'Hello world!')

  const stale = advanceCanonicalFinalText(cumulative, {
    operation: 'cumulative',
    text: 'Hello',
    eventId: 'evt_stale',
    sequence: 2,
  })
  assert.equal(stale, cumulative)

  const final = advanceCanonicalFinalText(cumulative, {
    operation: 'replace',
    text: 'Canonical final.',
    eventId: 'evt_final',
    sequence: 4,
    final: true,
  })
  assert.equal(final.text, 'Canonical final.')
  assert.equal(final.settled, true)
})

test('canonical progression bounds duplicate-event memory', () => {
  let state = null
  for (let index = 1; index <= 200; index += 1) {
    state = advanceCanonicalFinalText(state, {
      operation: 'append',
      text: String(index),
      eventId: `evt_${index}`,
      sequence: index,
    })
  }
  assert.ok(state.seenEventIds.length <= 128)
})

test('all provider-stream fixtures project only canonical final-document events into exact final Markdown', () => {
  const fixtureRoot = path.resolve('tests/fixtures/cross-provider-final-answer')
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
  const providerEntries = manifest.fixtures.filter((entry) => entry.metaFile.startsWith('provider-streams/'))

  for (const entry of providerEntries) {
    const metaPath = path.join(fixtureRoot, entry.metaFile)
    const streamPath = path.join(path.dirname(metaPath), 'stream.json')
    const fixture = JSON.parse(fs.readFileSync(streamPath, 'utf8'))
    let progression = null
    let projection = null
    for (const event of fixture.canonicalEvents) {
      if (event.ownership !== 'final-document') continue
      progression = advanceCanonicalFinalText(progression, {
        operation: 'append',
        text: event.text,
        eventId: event.eventId,
        sequence: event.sequence,
      })
      projection = projectStreamingFinalDocument({
        previous: projection,
        messageId: fixture.fixtureId,
        text: progression.text,
      })
    }

    const settled = projectStreamingFinalDocument({
      previous: projection,
      messageId: fixture.fixtureId,
      text: progression?.text || '',
      settled: true,
    })
    assert.equal(settled.text, fixture.expectedFinalMarkdown, fixture.fixtureId)
    assert.equal(reconstruct(settled), fixture.expectedFinalMarkdown, fixture.fixtureId)
    for (const event of fixture.canonicalEvents.filter((item) => item.ownership !== 'final-document')) {
      assert.equal(settled.text.includes(event.text), false, `${fixture.fixtureId}:${event.eventId}`)
    }
  }
})
