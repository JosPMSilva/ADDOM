import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  MAX_PROJECT_DOCUMENT_BYTES,
  readProjectDocument,
  revealProjectDocument,
} from '../../src/main/documents/project-document-service.mjs'

async function makeFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-document-service-'))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-document-outside-'))
  await fs.mkdir(path.join(root, 'docs'), { recursive: true })
  await fs.writeFile(path.join(root, 'docs', 'plan.md'), '# Plan\n\nSafe content.\n')
  await fs.writeFile(path.join(root, 'docs', 'plain.txt'), 'not markdown')
  await fs.writeFile(path.join(root, 'docs', 'invalid-utf8.md'), Buffer.from([0xc3, 0x28]))
  await fs.writeFile(path.join(outside, 'secret.md'), '# Outside')
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
  })
  return {
    root,
    outside,
    listProjects: () => [{ id: 'project_1', path: root, name: 'Fixture' }],
  }
}

test('reads a project Markdown document with canonical sanitized metadata', async (t) => {
  const fixture = await makeFixture(t)
  const result = await readProjectDocument({
    projectId: 'project_1',
    filePath: 'docs/plan.md',
  }, { listProjects: fixture.listProjects })

  assert.equal(result.ok, true)
  assert.equal(result.projectId, 'project_1')
  assert.equal(result.filePath, 'docs/plan.md')
  assert.equal(result.name, 'plan.md')
  assert.match(result.content, /^# Plan/)
  assert.equal(typeof result.modifiedAt, 'number')
  assert.equal('absolutePath' in result, false)
})

test('rejects traversal, absolute paths, unsupported types, and oversized documents', async (t) => {
  const fixture = await makeFixture(t)
  const oversized = path.join(fixture.root, 'docs', 'large.md')
  await fs.writeFile(oversized, Buffer.alloc(MAX_PROJECT_DOCUMENT_BYTES + 1, 65))

  const cases = [
    ['../secret.md', 'path_not_allowed'],
    [path.join(fixture.outside, 'secret.md'), 'path_not_allowed'],
    ['docs/plain.txt', 'unsupported_document_type'],
    ['docs/large.md', 'document_too_large'],
  ]
  for (const [filePath, error] of cases) {
    const result = await readProjectDocument({ projectId: 'project_1', filePath }, {
      listProjects: fixture.listProjects,
    })
    assert.equal(result.ok, false, filePath)
    assert.equal(result.error, error, filePath)
  }

  const invalidEncoding = await readProjectDocument({
    projectId: 'project_1',
    filePath: 'docs/invalid-utf8.md',
  }, { listProjects: fixture.listProjects })
  assert.equal(invalidEncoding.ok, false)
  assert.equal(invalidEncoding.error, 'unsupported_document_encoding')
})

test('rejects a symlink that resolves outside the project when the platform permits it', async (t) => {
  const fixture = await makeFixture(t)
  const linkPath = path.join(fixture.root, 'docs', 'escaped.md')
  try {
    await fs.symlink(path.join(fixture.outside, 'secret.md'), linkPath, 'file')
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) {
      t.skip(`symlink creation unavailable: ${error.code}`)
      return
    }
    throw error
  }

  const result = await readProjectDocument({ projectId: 'project_1', filePath: 'docs/escaped.md' }, {
    listProjects: fixture.listProjects,
  })
  assert.deepEqual(result, {
    ok: false,
    error: 'symlink_escape',
    projectId: 'project_1',
    filePath: 'docs/escaped.md',
  })
})

test('reveal resolves through the same guard and never accepts renderer absolute paths', async (t) => {
  const fixture = await makeFixture(t)
  const revealed = []
  const result = await revealProjectDocument({ projectId: 'project_1', filePath: 'docs/plan.md' }, {
    listProjects: fixture.listProjects,
    showItemInFolder: (target) => revealed.push(target),
  })

  assert.equal(result.ok, true)
  assert.equal(revealed.length, 1)
  assert.equal(path.basename(revealed[0]), 'plan.md')
  assert.equal('path' in result, false)

  const failedReveal = await revealProjectDocument({
    projectId: 'project_1',
    filePath: 'docs/plan.md',
  }, {
    listProjects: fixture.listProjects,
    showItemInFolder: () => { throw new Error('shell unavailable') },
  })
  assert.equal(failedReveal.ok, false)
  assert.equal(failedReveal.error, 'reveal_unavailable')
})
