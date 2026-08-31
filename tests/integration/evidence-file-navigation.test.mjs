import test from 'node:test'
import assert from 'node:assert/strict'

import * as evidenceNavigation from '../../src/renderer/components/chat/evidence-file-navigation.mjs'

const { resolveAbsoluteEvidenceFileReference } = evidenceNavigation

test('absolute Windows evidence paths preserve identity and optional source location', () => {
  assert.deepEqual(
    resolveAbsoluteEvidenceFileReference('C:\\Users\\me\\.codex\\skills\\SKILL.md:18'),
    {
      ok: true,
      absolutePath: 'C:/Users/me/.codex/skills/SKILL.md',
      directoryPath: 'C:/Users/me/.codex/skills',
      filePath: 'SKILL.md',
      line: 18,
      column: 1,
    },
  )
})

test('relative and directory evidence targets remain project-scoped', () => {
  assert.equal(resolveAbsoluteEvidenceFileReference('package.json').ok, false)
  assert.equal(resolveAbsoluteEvidenceFileReference('C:/Users/me/.codex/skills').ok, false)
})

test('project document companion targets accept Markdown files and reject editor files', () => {
  assert.equal(typeof evidenceNavigation.resolveProjectDocumentCompanionTarget, 'function')
  assert.deepEqual(
    evidenceNavigation.resolveProjectDocumentCompanionTarget({
      projectId: 'project-addom',
      filePath: 'docs/HARDWARE_TOOL_IMPROVEMENT_PLAN.md',
    }),
    {
      projectId: 'project-addom',
      filePath: 'docs/HARDWARE_TOOL_IMPROVEMENT_PLAN.md',
    },
  )
  assert.equal(evidenceNavigation.resolveProjectDocumentCompanionTarget({
    projectId: 'project-addom',
    filePath: 'src/main/index.mjs',
  }), null)
  assert.equal(evidenceNavigation.resolveProjectDocumentCompanionTarget({
    projectId: '',
    filePath: 'docs/PLAN.md',
  }), null)
})
