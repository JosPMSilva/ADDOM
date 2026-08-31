import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyContinuityCompaction } from '../../src/main/chat/continuity/compaction-engine.mjs'
import { COMPACTION_HANDOFF_HEADER } from '../../src/main/chat/continuity/compaction-handoff-prompt.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/continuity/compaction-task-fidelity-evals.json')

function loadFixtures() {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed?.fixtures) ? parsed.fixtures : []
}

for (const fixture of loadFixtures()) {
  const fixtureId = String(fixture?.id || 'unknown_fixture')
  const fixtureDescription = String(fixture?.description || '').trim()
  test(`compaction task-fidelity eval fixture: ${fixtureId}`, async () => {
    const baseMessages = Array.isArray(fixture?.messages) ? fixture.messages : []
    const history = baseMessages.map((message) => ({
      role: String(message?.role || 'assistant'),
      content: String(message?.content || ''),
    }))
    const filler = fixture?.filler && typeof fixture.filler === 'object'
      ? fixture.filler
      : {}
    const fillerCount = Number(filler.count || 0) || 0
    const fillerChars = Number(filler.chars || 0) || 0
    const fillerRole = String(filler.role || 'assistant').trim().toLowerCase() || 'assistant'
    const fillerPrefix = String(filler.prefix || 'filler').trim() || 'filler'
    const fillerText = 'x'.repeat(Math.max(0, fillerChars))
    for (let i = 0; i < fillerCount; i += 1) {
      history.push({
        role: fillerRole,
        content: `${fillerPrefix}_${i}: ${fillerText}`,
      })
    }

    const result = await applyContinuityCompaction({
      history,
      modelLimit: Number(fixture?.modelLimit || 0) || 0,
      packetText: String(fixture?.packetText || ''),
      providerId: String(fixture?.providerId || ''),
      turnId: String(fixture?.turnId || ''),
    })

    assert.equal(result.compacted, true, fixtureDescription || fixtureId)
    const handoffRow = (Array.isArray(result.history) ? result.history : [])
      .find((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
    assert.ok(handoffRow, `missing ${COMPACTION_HANDOFF_HEADER} for ${fixtureId}`)
    const handoffText = String(handoffRow?.content || '')

    const expectations = Array.isArray(fixture?.expectContains) ? fixture.expectContains : []
    for (const expected of expectations) {
      const fragment = String(expected || '')
      if (!fragment) continue
      assert.ok(
        handoffText.includes(fragment),
        `fixture ${fixtureId} missing fragment: ${fragment}`,
      )
    }

    const exclusions = Array.isArray(fixture?.expectExcludes) ? fixture.expectExcludes : []
    for (const excluded of exclusions) {
      const fragment = String(excluded || '')
      if (!fragment) continue
      assert.equal(
        handoffText.includes(fragment),
        false,
        `fixture ${fixtureId} retained obsolete fragment: ${fragment}`,
      )
    }
  })
}
