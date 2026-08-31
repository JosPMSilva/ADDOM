import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-memory-scope-userdata-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  deriveMemoryScopeKeys,
  writeMemory,
  buildMemoryContext,
} = await import('../../src/main/moa/agent-memory.mjs')
const { closeDb } = await import('../../src/main/memory/db.mjs')
const { registerProject } = await import('../../src/main/workspace/workspace-store.mjs')

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('deriveMemoryScopeKeys includes exact, family, specialty, and task-type scopes', () => {
  const keys = deriveMemoryScopeKeys({
    roleId: 'role_security',
    templateId: 'template_security',
    specialty: 'security',
    taskType: 'review',
  })

  assert.deepEqual(keys, [
    'role_security',
    'family__template_security',
    'specialty__security',
    'task_type__review',
  ])
})

test('buildMemoryContext aggregates role-family scopes without duplicating one write across scopes', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-memory-scope-'))
  try {
    registerProject(projectRoot)
    writeMemory(projectRoot, {
      roleId: 'role_security',
      templateId: 'template_security',
      specialty: 'security',
      taskType: 'review',
    }, {
      summary: 'Exact + family memory',
      context: 'Remember prior auth audit patterns.',
      taskInstruction: 'Audit auth middleware.',
    })
    writeMemory(projectRoot, {
      templateId: 'template_security',
    }, {
      summary: 'Family-only memory',
      context: 'Shared security template memory.',
      taskInstruction: 'Template note.',
    })

    const memory = buildMemoryContext(projectRoot, {
      roleId: 'role_security',
      templateId: 'template_security',
      specialty: 'security',
      taskType: 'review',
    }, { maxEntries: 10, maxChars: 4000 })

    const exactCount = memory.split('Exact + family memory').length - 1
    assert.equal(exactCount, 1)
    assert.match(memory, /Shared security template memory\./)
    assert.match(memory, /Remember prior auth audit patterns\./)
  } finally {
    try { fs.rmSync(projectRoot, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})
