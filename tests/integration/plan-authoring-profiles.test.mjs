import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getPlanAuthoringProfile,
  listPlanAuthoringProfiles,
  resolvePlanAuthoringProfile,
  validateRecommendedPlanProfile,
} from '../../src/main/chat/plan-authoring-profiles.mjs'
import { resolveModeCapability, resolveTurnTools } from '../../src/main/chat/turn-mode.mjs'
import { executeTool } from '../../src/main/tools/fs-tool-executor.mjs'
import { WORKSPACE_TOOLS } from '../../src/main/tools/tool-definitions-workspace.mjs'

test('bundled plan-authoring profiles are immutable, versioned, and product-owned', () => {
  const profiles = listPlanAuthoringProfiles()

  assert.deepEqual(profiles.map((profile) => profile.id), [
    'implementation',
    'technical_design',
    'investigation',
    'deep_implementation',
  ])
  for (const profile of profiles) {
    assert.match(profile.version, /^\d+\.\d+\.\d+$/)
    assert.match(profile.contentHash, /^[a-f0-9]{64}$/)
    assert.equal(profile.provenance.kind, 'first_party_equivalent')
    assert.equal(profile.provenance.license, 'MIT')
    assert.ok(Array.isArray(profile.provenance.sources))
    assert.ok(profile.provenance.sources.length > 0)
    assert.equal(Object.hasOwn(profile, 'instructions'), false)
  }

  const implementation = getPlanAuthoringProfile('implementation')
  assert.equal(implementation.version, '2.0.0')
  assert.match(implementation.instructions, /repository-grounded/i)
  assert.ok(implementation.instructions.length >= 1_000)
  assert.throws(() => {
    implementation.instructions = 'mutated'
  }, TypeError)
  const historical = getPlanAuthoringProfile('implementation', { version: '1.0.0' })
  assert.equal(historical.version, '1.0.0')
  assert.notEqual(historical.contentHash, implementation.contentHash)
  assert.throws(() => getPlanAuthoringProfile('unknown-profile'), /unknown plan-authoring profile/i)
})

test('packaged ADDOM includes the product-owned plan-authoring profile runtime', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
  const packagedFiles = Array.isArray(packageJson?.build?.files) ? packageJson.build.files : []
  assert.equal(packagedFiles.includes('src/main'), true)
  const source = fs.readFileSync(path.resolve('src/main/chat/plan-authoring-profiles.mjs'), 'utf8')
  assert.match(source, /deep_implementation/)
  assert.doesNotMatch(source, /readFileSync|readdirSync|process\.env/)
})

test('profile resolution validates the recommendation and honors the user selection', () => {
  const recommendation = validateRecommendedPlanProfile({
    profile: 'deep_implementation',
    rationale: 'The change spans migration, rollout, and explicit verification.',
  })
  const resolved = resolvePlanAuthoringProfile({
    selectedProfile: 'technical_design',
    recommendation,
    direction: {
      revision: 4,
      summary: 'Define boundaries before implementation.',
      answeredQuestionIds: ['scope', 'ownership'],
    },
  })

  assert.equal(resolved.selectedProfile.id, 'technical_design')
  assert.equal(resolved.recommendation.profile, 'deep_implementation')
  assert.equal(resolved.direction.revision, 4)
  assert.match(resolved.instructions, /architecture/i)
  assert.equal(validateRecommendedPlanProfile({ profile: 'unknown', rationale: 'No.' }), null)
  assert.equal(validateRecommendedPlanProfile({ profile: 'implementation', rationale: 'x'.repeat(181) }), null)
})

test('profile resolution keeps the complete accepted direction without a silent prompt cutoff', () => {
  const summary = `${'Preserve the accepted production boundary. '.repeat(64)}Complete.`
  const resolved = resolvePlanAuthoringProfile({
    selectedProfile: 'implementation',
    direction: { revision: 2, summary },
  })

  assert.equal(summary.length > 2_000, true)
  assert.equal(resolved.direction.summary, summary)
})

test('planning-skill lookup is available in Plan and Execute but denied in Thinking', async () => {
  assert.equal(resolveModeCapability('planning_skill_read', 'thinking').allowed, false)
  assert.equal(resolveModeCapability('planning_skill_read', 'plan').allowed, true)
  assert.equal(resolveModeCapability('planning_skill_read', 'execute').allowed, true)
  assert.equal(resolveModeCapability('plan_direction_update', 'thinking').allowed, false)
  assert.equal(resolveModeCapability('plan_direction_update', 'plan').allowed, true)

  const thinkingTools = resolveTurnTools('thinking')
  const planTools = resolveTurnTools('plan')
  assert.equal(Boolean(thinkingTools.planning_skill_read), false)
  assert.equal(Boolean(planTools.planning_skill_read), true)

  const result = await executeTool('', 'planning_skill_read', { profile_id: 'investigation' })
  assert.match(String(result.result?.instructions || ''), /evidence/i)
  await assert.rejects(
    executeTool('', 'planning_skill_read', { profile_id: 'not-real' }),
    /unknown plan-authoring profile/i,
  )
})

test('the Plan-only direction tool persists no more than five questions', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-direction-tool-'))
  const result = await executeTool(process.cwd(), 'plan_direction_update', {
    summary: 'Plan the durable review workflow.',
    questions: Array.from({ length: 6 }, (_, index) => ({
      id: `question_${index + 1}`,
      question: `Question ${index + 1}?`,
    })),
    recommended_plan_profile: 'implementation',
    recommendation_rationale: 'The work is repository-grounded.',
    expected_revision: 0,
  }, {
    threadId: 'direction-tool-thread',
    userDataPath,
  })

  assert.equal(result.result.plan.lifecycle, 'awaiting_decision')
  assert.equal(result.result.plan.direction.questions.length, 5)
  assert.equal(result.result.plan.direction.recommendation.profile, 'implementation')
})

test('direction tools expose compact choices and a revision-bound synthesis finalizer', () => {
  const update = WORKSPACE_TOOLS.find((tool) => tool.name === 'plan_direction_update')
  const finalize = WORKSPACE_TOOLS.find((tool) => tool.name === 'plan_direction_finalize')
  const optionSchema = update?.parameters?.properties?.questions?.items?.properties?.options

  assert.equal(optionSchema?.minItems, 2)
  assert.equal(optionSchema?.maxItems, 3)
  assert.deepEqual(optionSchema?.items?.required, ['id', 'label'])
  assert.ok(finalize)
  assert.deepEqual(finalize.parameters.required, [
    'summary',
    'incorporated_answer_ids',
    'expected_revision',
    'expected_direction_revision',
    'expected_answer_revision',
    'request_id',
  ])
  assert.equal(resolveModeCapability('plan_direction_finalize', 'plan').allowed, true)
  assert.equal(resolveModeCapability('plan_direction_finalize', 'thinking').allowed, false)
})
