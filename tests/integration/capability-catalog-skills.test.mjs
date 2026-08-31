import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildCapabilityCatalogPath,
} from '../../src/main/tools/capability-catalog-builder.mjs'
import {
  buildSkillCapabilityCatalog,
  buildSkillCapabilityEntries,
} from '../../src/main/tools/capability-catalog-skills.mjs'

const SAMPLE_SKILLS = Object.freeze([
  {
    id: 'api-security-reviewer',
    category: 'security',
    tags: ['security', 'ipc'],
    label: 'API Security Reviewer',
    description: 'Reviews API and IPC trust boundaries without writing files.',
    defaultSystemPrompt: 'DO NOT RENDER THIS PROMPT BODY',
    recommendedUseCases: ['Review IPC handlers', 'Audit auth validation'],
    suggestedCanWriteFiles: false,
    source: 'addom/built-in',
  },
  {
    id: 'refactor-worker',
    category: 'engineering',
    tags: ['refactor'],
    label: 'Refactor Worker',
    description: 'Makes small behavior-preserving refactors.',
    defaultSystemPrompt: 'DO NOT RENDER THIS PROMPT BODY EITHER',
    recommendedUseCases: ['Split oversized modules'],
    suggestedCanWriteFiles: true,
    source: 'local/project.json',
  },
])

test('skill catalog groups registry summaries without prompt bodies', () => {
  const { entries, pages } = buildSkillCapabilityCatalog({ skills: SAMPLE_SKILLS })
  const securityEntry = entries.find((entry) => entry.id === 'skills.security')
  const engineeringEntry = entries.find((entry) => entry.id === 'skills.engineering')

  assert.ok(securityEntry)
  assert.ok(engineeringEntry)
  assert.equal(securityEntry.source, 'skill')
  assert.equal(securityEntry.status, 'available')
  assert.deepEqual(securityEntry.toolsAfterActivation, ['list_curated_skills', 'install_curated_skill'])
  assert.equal(engineeringEntry.permissionClass, 'mixed')
  assert.equal(engineeringEntry.trust, 'external')

  const markdown = pages.get(buildCapabilityCatalogPath('skills-security'))
  assert.match(markdown, /# Skills: Security/)
  assert.match(markdown, /api-security-reviewer/)
  assert.match(markdown, /list_curated_skills/)
  assert.doesNotMatch(markdown, /DO NOT RENDER/)
  assert.doesNotMatch(markdown, /defaultSystemPrompt/)
  assert.doesNotMatch(markdown, /inputSchema/)
})

test('skill catalog can include project-local registry skills as untrusted metadata', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-skill-catalog-'))
  try {
    const skillsDir = path.join(projectRoot, '.addom', 'skills')
    fs.mkdirSync(skillsDir, { recursive: true })
    fs.writeFileSync(path.join(skillsDir, 'local.json'), JSON.stringify({
      id: 'local-specialist',
      category: 'engineering',
      label: 'Local Specialist',
      description: 'Project-local role metadata.',
      defaultSystemPrompt: 'LOCAL PROMPT BODY MUST NOT APPEAR',
      recommendedUseCases: ['Project-specific review'],
      suggestedCanWriteFiles: true,
    }), 'utf8')

    const { entries, pages } = buildSkillCapabilityCatalog({ projectFolder: projectRoot })
    const engineeringEntry = entries.find((entry) => entry.id === 'skills.engineering')

    assert.ok(engineeringEntry)
    assert.equal(engineeringEntry.trust, 'external')
    const markdown = pages.get(buildCapabilityCatalogPath('skills-engineering'))
    assert.match(markdown, /local-specialist/)
    assert.match(markdown, /External Metadata \(Untrusted\)/)
    assert.doesNotMatch(markdown, /LOCAL PROMPT BODY/)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('skill catalog caps large categories', () => {
  const skills = Array.from({ length: 40 }, (_, index) => ({
    id: `skill-${index}`,
    category: 'quality',
    label: `Skill ${index}`,
    description: `Skill ${index} summary.`,
    source: 'addom/built-in',
  }))
  const [entry] = buildSkillCapabilityEntries({ skills })

  assert.equal(entry.toolSummaries.length, 24)
  assert.equal(entry.provenance.skillIds.length, 24)
  assert.equal(entry.provenance.omittedSkills, 16)
})
