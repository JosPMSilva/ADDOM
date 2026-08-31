import test from 'node:test'
import assert from 'node:assert/strict'
import { listRoleTemplates, getRoleTemplateById } from '../../src/main/moa/role-templates.mjs'

test('listRoleTemplates returns normalized built-in templates', () => {
  const rows = listRoleTemplates()
  assert.ok(Array.isArray(rows))
  assert.ok(rows.length >= 4)
  for (const row of rows) {
    assert.equal(typeof row.id, 'string')
    assert.ok(row.id.length > 0)
    assert.equal(typeof row.label, 'string')
    assert.ok(row.label.length > 0)
    assert.equal(typeof row.defaultName, 'string')
    assert.equal(typeof row.defaultSystemPrompt, 'string')
    assert.ok(Array.isArray(row.recommendedUseCases))
  }
})

test('getRoleTemplateById resolves known template IDs', () => {
  const row = getRoleTemplateById('security-reviewer')
  assert.ok(row)
  assert.equal(row.id, 'security-reviewer')
})


