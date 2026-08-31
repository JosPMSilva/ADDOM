import test from 'node:test'
import assert from 'node:assert/strict'

import { listAllSkills, getSkillById } from '../../src/main/moa/skill-registry.mjs'
import { listRoleTemplates } from '../../src/main/moa/role-templates.mjs'

test('MoA curated skill catalog entries have focused role contracts', () => {
  const skills = listAllSkills()
  const curated = skills.filter((skill) => skill.source === 'addom/built-in')

  assert.ok(curated.length >= 40)
  assert.equal(curated.length, listRoleTemplates().length)
  for (const skill of curated) {
    assert.equal(typeof skill.id, 'string')
    assert.ok(skill.id.length > 0)
    assert.equal(typeof skill.description, 'string')
    assert.ok(skill.description.length >= 40, `${skill.id} description is too weak`)
    assert.match(skill.description, /Use when/i, `${skill.id} description lacks routing guidance`)
    assert.equal(typeof skill.defaultSystemPrompt, 'string')
    assert.ok(skill.defaultSystemPrompt.length >= 250, `${skill.id} prompt is too weak`)
    assert.ok(skill.defaultSystemPrompt.length <= 2000, `${skill.id} prompt exceeds role prompt cap`)
    assert.doesNotMatch(skill.defaultSystemPrompt, /â|�/, `${skill.id} contains mojibake`)
    assert.match(skill.defaultSystemPrompt, /Operational contract:/, `${skill.id} lacks the native operating contract`)
    assert.match(skill.defaultSystemPrompt, /Output contract:/, `${skill.id} lacks an output contract`)
    assert.ok(Array.isArray(skill.recommendedUseCases))
    assert.ok(skill.recommendedUseCases.length >= 3, `${skill.id} needs routing use cases`)
  }
})

test('MoA curated catalog includes ADDOM-specific workflow roles', () => {
  for (const skillId of ['vite-build-specialist', 'agent-skill-designer', 'tool-surface-architect']) {
    const skill = getSkillById(skillId)
    assert.ok(skill, `expected ${skillId}`)
    assert.equal(skill.source, 'addom/built-in')
  }
})

test('MoA curated catalog covers discovery, delivery, product, data, and agent-system work', () => {
  for (const skillId of [
    'codebase-explorer',
    'implementation-engineer',
    'release-readiness-reviewer',
    'product-requirements-analyst',
    'data-pipeline-engineer',
    'llm-evaluation-engineer',
    'multi-agent-coordinator',
    'provider-runtime-investigator',
  ]) {
    assert.ok(getSkillById(skillId), `expected ${skillId}`)
  }
})
