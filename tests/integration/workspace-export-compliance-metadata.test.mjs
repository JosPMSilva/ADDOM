import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-export-compliance-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-export-compliance-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  registerProject,
  appendEvent,
  exportThread,
} = await import('../../src/main/workspace/workspace-store.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(projectPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('exportThread includes compliance export metadata and compliance event summary', async (t) => {
  try {
    const opened = registerProject(projectPath)
    const threadId = String(opened?.activeThread?.id || '').trim()
    assert.ok(threadId)

    appendEvent(threadId, {
      turnId: 'turn_1',
      kind: 'assistant_message',
      role: 'assistant',
      content: 'First response.',
      meta: {
        providerId: 'openai',
        model: 'gpt-5.2',
      },
    })
    appendEvent(threadId, {
      turnId: 'turn_2',
      kind: 'assistant_message',
      role: 'assistant',
      content: 'Second response.',
      meta: {
        providerId: 'openai',
        model: 'gpt-5.2',
      },
    })
    appendEvent(threadId, {
      turnId: 'turn_2',
      kind: 'compliance_notice_shown',
      role: 'system',
      content: 'Compliance notice shown.',
      meta: { noticeType: 'provider_switch' },
    })
    appendEvent(threadId, {
      turnId: 'turn_2',
      kind: 'compliance_notice_acknowledged',
      role: 'system',
      content: 'Compliance notice acknowledged.',
      meta: { noticeType: 'provider_terms_notice' },
    })
    appendEvent(threadId, {
      turnId: 'turn_2',
      kind: 'compliance_notice_skipped',
      role: 'system',
      content: 'Compliance notice skipped.',
      meta: { noticeType: 'repetitive_dispatch_pattern' },
    })

    const exported = await exportThread(threadId, { preserveCitations: false })
    assert.equal(exported.schema, 'addom.thread_export.v2')
    assert.equal(exported.eventCount, 5)
    assert.equal(exported.exportMeta.options.preserveCitations, false)
    assert.ok(String(exported.exportMeta.complianceDisclaimer.text || '').includes('distillation'))

    const provenance = exported.exportMeta.provenance
    assert.equal(provenance.providerCount, 1)
    assert.equal(provenance.providerModelCount, 1)
    assert.equal(provenance.entries.length, 1)
    assert.equal(provenance.entries[0].providerId, 'openai')
    assert.equal(provenance.entries[0].model, 'gpt-5.2')
    assert.equal(provenance.entries[0].eventCount, 2)

    const summary = exported.exportMeta.complianceSummary
    assert.equal(summary.shown, 1)
    assert.equal(summary.acknowledged, 1)
    assert.equal(summary.skipped, 1)
    assert.equal(summary.total, 3)
    assert.equal(summary.byNoticeType.provider_switch.total, 1)
    assert.equal(summary.byNoticeType.provider_terms_notice.total, 1)
    assert.equal(summary.byNoticeType.repetitive_dispatch_pattern.total, 1)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
