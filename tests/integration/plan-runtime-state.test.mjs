import test from 'node:test'
import assert from 'node:assert/strict'

import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

import {
  readPlanState,
  readManagedPlanDocument,
  addPlanReviewChange,
  answerPlanDirectionQuestion,
  approvePlan,
  beginPlanReviewRevision,
  failPlanReviewRevision,
  implementManagedPlan,
  removePlanReviewChange,
  failPlanDirectionSynthesis,
  finalizePlanDirectionSynthesis,
  savePlanDirection,
  retryPlanDirectionSynthesis,
  selectPlanAuthoringProfile,
  replacePlanTasks,
  updatePlanTask,
  writeManagedPlanDocument,
} from '../../src/main/chat/plan-runtime-state.mjs'
import { migrateLegacyRendererPlanState } from '../../src/main/chat/plan-runtime-legacy-migration.mjs'
import {
  buildActivePlanAuthoringPrompt,
  buildActivePlanDecisionPrompt,
  buildPlanActionPrompt,
} from '../../src/main/chat/plan-runtime-prompts.mjs'
import { planDirectionUpdate } from '../../src/main/tools/todo-tools.mjs'

function createPlanStorage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-state-'))
}

function findStoredPlanRecord(userDataPath) {
  const managedRoot = path.join(userDataPath, 'managed-plans')
  const scopeName = fs.readdirSync(managedRoot, { withFileTypes: true })
    .find((entry) => entry.isDirectory())?.name
  assert.ok(scopeName)
  const scopePath = path.join(managedRoot, scopeName)
  const recordName = fs.readdirSync(scopePath)
    .find((entry) => entry.endsWith('.json') && entry !== 'index.json')
  assert.ok(recordName)
  return path.join(scopePath, recordName)
}

function createReviewReadyPlan({ userDataPath, projectRoot, threadId }) {
  const direction = savePlanDirection(projectRoot, {
    summary: 'Create a reviewable managed plan.',
    expected_revision: 0,
  }, { threadId, userDataPath })
  const selected = selectPlanAuthoringProfile(projectRoot, {
    selected_profile: 'implementation',
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })
  return writeManagedPlanDocument(projectRoot, {
    content: '# Plan\n\n## Reliability\n\nPreserve this paragraph.',
    expected_revision: selected.plan.revision,
  }, { threadId, userDataPath })
}

test('plan direction preserves a complete summary without a silent storage cutoff', () => {
  const userDataPath = createPlanStorage()
  const summary = `${'Contract-first reliability with explicit verification. '.repeat(64)}Complete.`
  const result = savePlanDirection(process.cwd(), {
    summary,
    expected_revision: 0,
  }, { threadId: 'full-direction-summary', userDataPath })

  assert.equal(summary.length > 2_000, true)
  assert.equal(result.plan.direction.summary, summary)
  assert.equal(
    readPlanState(process.cwd(), { threadId: 'full-direction-summary', userDataPath }).plan.direction.summary,
    summary,
  )
})

test('plan direction rejects a plan ID that escapes managed-plan storage', async () => {
  const userDataPath = createPlanStorage()

  await assert.rejects(
    planDirectionUpdate(process.cwd(), {
      summary: 'Keep the managed plan inside its scope.',
      planId: '../../escaped-direction',
      threadId: 'path-containment',
      userDataPath,
      expected_revision: 0,
    }),
    /invalid plan id/i,
  )
  assert.equal(fs.existsSync(path.join(userDataPath, 'escaped-direction.json')), false)
})

test('plan tools ignore model-supplied storage scope and use runtime-owned scope', async () => {
  const runtimeUserDataPath = createPlanStorage()
  const modelSuppliedUserDataPath = createPlanStorage()

  const result = await planDirectionUpdate(process.cwd(), {
    summary: 'Keep plan storage bound to the active runtime thread.',
    threadId: 'model-supplied-thread',
    userDataPath: modelSuppliedUserDataPath,
    expected_revision: 0,
  }, {
    threadId: 'runtime-thread',
    userDataPath: runtimeUserDataPath,
  })

  assert.equal(result.plan.threadId, 'runtime-thread')
  assert.equal(readPlanState(process.cwd(), {
    threadId: 'runtime-thread',
    userDataPath: runtimeUserDataPath,
  }).plan.planId, result.plan.planId)
  assert.equal(fs.existsSync(path.join(modelSuppliedUserDataPath, 'managed-plans')), false)
})

test('replacePlanTasks creates a durable revisioned plan state', () => {
  const userDataPath = createPlanStorage()
  const result = replacePlanTasks(process.cwd(), [
    { id: 'task_1', content: 'Inspect planning surface', status: 'completed' },
    { id: 'task_2', content: 'Introduce runtime plan state', status: 'in_progress' },
  ], {
    threadId: 'phase3-plan-state-1',
    userDataPath,
    expectedRevision: 0,
  })

  assert.equal(result.plan.revision, 1)
  assert.equal(typeof result.plan.updatedAt, 'string')
  assert.deepEqual(result.plan.tasks, [
    { id: 'task_1', content: 'Inspect planning surface', status: 'completed' },
    { id: 'task_2', content: 'Introduce runtime plan state', status: 'in_progress' },
  ])
  assert.equal(result.summary, '2 tasks (0 pending, 1 in progress, 1 completed)')
  assert.ok(result.plan.planId)
  assert.equal(result.plan.lifecycle, 'drafting')
  assert.deepEqual(
    readPlanState(process.cwd(), { threadId: 'phase3-plan-state-1', userDataPath }).plan.tasks,
    result.plan.tasks,
  )
})

test('updatePlanTask updates an existing task without replacing the entire plan', () => {
  const userDataPath = createPlanStorage()
  replacePlanTasks(process.cwd(), [
    { id: 'task_1', content: 'Inspect planning surface', status: 'pending' },
    { id: 'task_2', content: 'Introduce runtime plan state', status: 'in_progress' },
  ], {
    threadId: 'phase3-plan-state-2',
    userDataPath,
    expectedRevision: 0,
  })

  const updated = updatePlanTask(process.cwd(), {
    task_id: 'task_2',
    status: 'completed',
    notes: 'Contract locked.',
  }, {
    threadId: 'phase3-plan-state-2',
    userDataPath,
    expectedRevision: 1,
  })

  assert.equal(updated.plan.revision, 2)
  assert.deepEqual(updated.task, {
    id: 'task_2',
    content: 'Introduce runtime plan state',
    status: 'completed',
    notes: 'Contract locked.',
  })

  const next = readPlanState(process.cwd(), {
    threadId: 'phase3-plan-state-2',
    userDataPath,
  })
  assert.deepEqual(next.plan.tasks, [
    { id: 'task_1', content: 'Inspect planning surface', status: 'pending' },
    { id: 'task_2', content: 'Introduce runtime plan state', status: 'completed', notes: 'Contract locked.' },
  ])
})

test('updatePlanTask requires content when creating a new task', () => {
  const userDataPath = createPlanStorage()
  assert.throws(() => updatePlanTask(process.cwd(), {
    task_id: 'task_new',
    status: 'pending',
  }, {
    threadId: 'phase3-plan-state-3',
    userDataPath,
    expectedRevision: 0,
  }), /requires content when creating a new task/i)
})

test('plan state remains isolated by explicit scope key', () => {
  const userDataPath = createPlanStorage()
  replacePlanTasks(process.cwd(), [
    { id: 'task_1', content: 'Role A task', status: 'in_progress' },
  ], {
    threadId: 'phase3-shared-thread',
    todoScopeKey: 'moa:role-a',
    userDataPath,
    expectedRevision: 0,
  })

  replacePlanTasks(process.cwd(), [
    { id: 'task_1', content: 'Role B task', status: 'pending' },
  ], {
    threadId: 'phase3-shared-thread',
    todoScopeKey: 'moa:role-b',
    userDataPath,
    expectedRevision: 0,
  })

  const roleA = readPlanState(process.cwd(), {
    threadId: 'phase3-shared-thread',
    todoScopeKey: 'moa:role-a',
    userDataPath,
  })
  const roleB = readPlanState(process.cwd(), {
    threadId: 'phase3-shared-thread',
    todoScopeKey: 'moa:role-b',
    userDataPath,
  })

  assert.deepEqual(roleA.plan.tasks, [
    { id: 'task_1', content: 'Role A task', status: 'in_progress' },
  ])
  assert.deepEqual(roleB.plan.tasks, [
    { id: 'task_1', content: 'Role B task', status: 'pending' },
  ])
})

test('managed plan documents require an accepted direction and profile', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-project-'))
  const initial = updatePlanTask(projectRoot, {
    task_id: 'task_1', content: 'Draft the plan', status: 'in_progress', expected_revision: 0,
  }, { threadId: 'plan-document-thread', userDataPath })

  assert.throws(() => writeManagedPlanDocument(projectRoot, {
    content: '# Bypassed plan', expected_revision: initial.plan.revision,
  }, { threadId: 'plan-document-thread', userDataPath }), /accepted plan direction/i)
})

test('managed plan documents reject stale revisions and remain outside the project worktree', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-project-'))
  const direction = savePlanDirection(projectRoot, {
    summary: 'Draft a managed plan without touching the project worktree.',
    expected_revision: 0,
  }, { threadId: 'plan-document-thread', userDataPath })
  const selected = selectPlanAuthoringProfile(projectRoot, {
    selected_profile: 'implementation',
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId: 'plan-document-thread', userDataPath })
  const ready = writeManagedPlanDocument(projectRoot, {
    content: '# Canonical plan\n\nReview this plan.',
    expected_revision: selected.plan.revision,
  }, { threadId: 'plan-document-thread', userDataPath })

  assert.equal(ready.plan.lifecycle, 'ready_for_review')
  assert.equal(ready.plan.revision, 3)
  assert.ok(ready.plan.document?.filePath)
  assert.equal(fs.existsSync(path.join(projectRoot, 'plans')), false)
  const storedRecordPath = findStoredPlanRecord(userDataPath)
  const storedRecord = JSON.parse(fs.readFileSync(storedRecordPath, 'utf8'))
  storedRecord.document.filePath = path.join(projectRoot, 'escaped-plan.md')
  fs.writeFileSync(storedRecordPath, JSON.stringify(storedRecord), 'utf8')
  const reloaded = readManagedPlanDocument(projectRoot, {
    threadId: 'plan-document-thread', userDataPath, planId: ready.plan.planId,
  })
  assert.equal(reloaded.ok, true)
  assert.equal(reloaded.document.filePath, ready.plan.document.filePath)
  assert.throws(() => writeManagedPlanDocument(projectRoot, {
    content: '# stale', expected_revision: selected.plan.revision,
  }, { threadId: 'plan-document-thread', userDataPath }), /stale plan revision/i)
})

test('managed plan review changes persist, batch into one revision action, and clear only after a successful rewrite', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-review-'))
  const threadId = 'managed-plan-review-batch'
  const ready = createReviewReadyPlan({ userDataPath, projectRoot, threadId })

  const first = addPlanReviewChange(projectRoot, {
    expected_revision: ready.plan.revision,
    heading_anchor: 'Reliability',
    block_id: 'paragraph-42',
    block_kind: 'paragraph',
    block_text: 'Preserve this paragraph.',
    instruction: 'Explain the failure boundary.',
  }, { threadId, userDataPath })
  const second = addPlanReviewChange(projectRoot, {
    expected_revision: first.plan.revision,
    heading_anchor: 'Reliability',
    block_id: 'paragraph-42',
    block_kind: 'paragraph',
    block_text: 'Preserve this paragraph.',
    instruction: 'Add the expected verification evidence.',
  }, { threadId, userDataPath })

  assert.equal(second.plan.review.pendingChanges.length, 2)
  assert.deepEqual(second.plan.review.pendingChanges.map((change) => ({
    blockId: change.blockId,
    blockKind: change.blockKind,
    blockText: change.blockText,
  })), [
    { blockId: 'paragraph-42', blockKind: 'paragraph', blockText: 'Preserve this paragraph.' },
    { blockId: 'paragraph-42', blockKind: 'paragraph', blockText: 'Preserve this paragraph.' },
  ])
  assert.equal(readManagedPlanDocument(projectRoot, {
    threadId, userDataPath, planId: ready.plan.planId,
  }).review.pendingChanges.length, 2)

  const submitted = beginPlanReviewRevision(projectRoot, {
    expected_revision: second.plan.revision,
  }, { threadId, userDataPath })
  assert.equal(submitted.plan.lifecycle, 'revising')
  assert.equal(submitted.plan.review.submission.status, 'pending')
  assert.equal(submitted.action.kind, 'revise_plan')
  assert.equal(submitted.action.expectedRevision, submitted.plan.revision)
  assert.equal(submitted.action.requestId, submitted.plan.review.submission.requestId)

  const revised = writeManagedPlanDocument(projectRoot, {
    content: '# Plan\n\n## Reliability\n\nExplain the boundary and verification evidence.',
    expected_revision: submitted.plan.revision,
  }, { threadId, userDataPath })
  assert.equal(revised.plan.lifecycle, 'ready_for_review')
  assert.deepEqual(revised.plan.review.pendingChanges, [])
  assert.equal(revised.plan.review.submission, null)
})

test('plan-mode managed document writes can revise a ready review document without bypassing revisions', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-direct-revision-'))
  const threadId = 'managed-plan-direct-revision'
  const ready = createReviewReadyPlan({ userDataPath, projectRoot, threadId })

  const revised = writeManagedPlanDocument(projectRoot, {
    content: '# Revised plan\n\nApply the requested plan-mode changes.',
    expected_revision: ready.plan.revision,
  }, { threadId, userDataPath, allowReadyForReviewRevision: true })

  assert.equal(revised.plan.lifecycle, 'ready_for_review')
  assert.equal(revised.plan.revision, ready.plan.revision + 1)
  assert.equal(revised.document.content, '# Revised plan\n\nApply the requested plan-mode changes.')
})

test('new managed plan annotations require one semantic block target', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-review-target-'))
  const threadId = 'managed-plan-review-target'
  const ready = createReviewReadyPlan({ userDataPath, projectRoot, threadId })

  assert.throws(() => addPlanReviewChange(projectRoot, {
    expected_revision: ready.plan.revision,
    instruction: 'This instruction has no target.',
  }, { threadId, userDataPath }), /semantic plan block/i)
})

test('failed managed plan revision preserves annotations for retry and removal remains revision-bound', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-review-'))
  const threadId = 'managed-plan-review-failure'
  const ready = createReviewReadyPlan({ userDataPath, projectRoot, threadId })
  const annotated = addPlanReviewChange(projectRoot, {
    expected_revision: ready.plan.revision,
    block_id: 'paragraph-18',
    block_kind: 'paragraph',
    block_text: 'Preserve this paragraph.',
    instruction: 'Clarify this paragraph.',
  }, { threadId, userDataPath })
  const submitted = beginPlanReviewRevision(projectRoot, {
    expected_revision: annotated.plan.revision,
  }, { threadId, userDataPath })
  const failed = failPlanReviewRevision(projectRoot, {
    request_id: submitted.action.requestId,
    error: 'Provider stopped before writing the revision.',
  }, { threadId, userDataPath })

  assert.equal(failed.plan.lifecycle, 'ready_for_review')
  assert.equal(failed.plan.review.pendingChanges.length, 1)
  assert.equal(failed.plan.review.submission.status, 'failed')

  const removed = removePlanReviewChange(projectRoot, {
    expected_revision: failed.plan.revision,
    change_id: failed.plan.review.pendingChanges[0].id,
  }, { threadId, userDataPath })
  assert.deepEqual(removed.plan.review.pendingChanges, [])
  assert.throws(() => removePlanReviewChange(projectRoot, {
    expected_revision: failed.plan.revision,
    change_id: 'missing',
  }, { threadId, userDataPath }), /stale plan revision/i)
})

test('Implement atomically accepts the exact visible plan revision and rejects pending changes', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-review-'))
  const threadId = 'managed-plan-implement'
  const ready = createReviewReadyPlan({ userDataPath, projectRoot, threadId })
  const annotated = addPlanReviewChange(projectRoot, {
    expected_revision: ready.plan.revision,
    block_id: 'paragraph-18',
    block_kind: 'paragraph',
    block_text: 'Preserve this paragraph.',
    instruction: 'Change this before implementation.',
  }, { threadId, userDataPath })

  assert.throws(() => implementManagedPlan(projectRoot, {
    expected_revision: annotated.plan.revision,
  }, { threadId, userDataPath }), /pending review changes/i)
  const removed = removePlanReviewChange(projectRoot, {
    expected_revision: annotated.plan.revision,
    change_id: annotated.plan.review.pendingChanges[0].id,
  }, { threadId, userDataPath })
  const accepted = implementManagedPlan(projectRoot, {
    expected_revision: removed.plan.revision,
  }, { threadId, userDataPath })

  assert.equal(accepted.plan.lifecycle, 'approved')
  assert.deepEqual(accepted.handoff, {
    planId: accepted.plan.planId,
    revision: removed.plan.revision,
    threadId,
  })
  assert.throws(() => implementManagedPlan(projectRoot, {
    expected_revision: removed.plan.revision,
  }, { threadId, userDataPath }), /stale plan revision/i)
})

test('legacy approved plans with pending annotations recover as reviewable plans', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-review-'))
  const threadId = 'legacy-approved-plan-review'
  const ready = createReviewReadyPlan({ userDataPath, projectRoot, threadId })
  const annotated = addPlanReviewChange(projectRoot, {
    expected_revision: ready.plan.revision,
    block_id: 'paragraph-18',
    block_kind: 'paragraph',
    block_text: 'Preserve this paragraph.',
    instruction: 'Clarify this paragraph.',
  }, { threadId, userDataPath })
  const recordPath = findStoredPlanRecord(userDataPath)
  const stored = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  stored.lifecycle = 'approved'
  fs.writeFileSync(recordPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8')

  const recovered = readPlanState(projectRoot, { threadId, userDataPath }).plan

  assert.equal(recovered.lifecycle, 'ready_for_review')
  assert.equal(recovered.review.pendingChanges.length, annotated.plan.review.pendingChanges.length)
})

test('an interrupted managed-plan document commit recovers the document and record together', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-project-'))
  const threadId = 'recover-plan-document'
  const direction = savePlanDirection(projectRoot, {
    summary: 'Recover a plan document commit after interruption.',
    expected_revision: 0,
  }, { threadId, userDataPath })
  const selected = selectPlanAuthoringProfile(projectRoot, {
    selected_profile: 'implementation',
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })

  const recordPath = findStoredPlanRecord(userDataPath)
  const scopePath = path.dirname(recordPath)
  const nextRevision = selected.plan.revision + 1
  const documentPath = path.join(scopePath, `${selected.plan.planId}.md`)
  const nextRecord = {
    ...selected.plan,
    lifecycle: 'ready_for_review',
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    document: {
      kind: 'managed_plan',
      planId: selected.plan.planId,
      filePath: documentPath,
      revision: nextRevision,
    },
  }
  fs.writeFileSync(path.join(scopePath, '.pending-plan-document-commit.json'), `${JSON.stringify({
    version: 1,
    kind: 'plan_document_commit',
    planId: selected.plan.planId,
    priorRevision: selected.plan.revision,
    content: '# Recovered plan\n',
    nextRecord,
  }, null, 2)}\n`, 'utf8')
  fs.writeFileSync(documentPath, '# Recovered plan\n', 'utf8')

  const recovered = readPlanState(projectRoot, { threadId, userDataPath }).plan
  assert.equal(recovered.revision, nextRevision)
  assert.equal(recovered.lifecycle, 'ready_for_review')
  assert.equal(readManagedPlanDocument(projectRoot, {
    threadId, userDataPath, planId: recovered.planId,
  }).content, '# Recovered plan\n')
  assert.equal(fs.existsSync(path.join(scopePath, '.pending-plan-document-commit.json')), false)
})

test('starting a new direction after approval supersedes the prior plan without deleting its history', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-project-'))
  const threadId = 'superseded-plan-history'
  const direction = savePlanDirection(projectRoot, {
    summary: 'Create the first approved plan.', expected_revision: 0,
  }, { threadId, userDataPath })
  const selected = selectPlanAuthoringProfile(projectRoot, {
    selected_profile: 'implementation',
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })
  const ready = writeManagedPlanDocument(projectRoot, {
    content: '# First plan', expected_revision: selected.plan.revision,
  }, { threadId, userDataPath })
  const approved = approvePlan(projectRoot, {
    expected_revision: ready.plan.revision,
  }, { threadId, userDataPath })

  assert.throws(() => updatePlanTask(projectRoot, {
    task_id: 'late_edit', content: 'Mutate the approved plan', expected_revision: approved.plan.revision,
  }, { threadId, userDataPath }), /approved plan is immutable/i)

  const replacement = savePlanDirection(projectRoot, {
    summary: 'Create a replacement plan.', expected_revision: approved.plan.revision,
  }, { threadId, userDataPath })

  assert.notEqual(replacement.plan.planId, approved.plan.planId)
  assert.equal(replacement.plan.lifecycle, 'awaiting_decision')
  assert.equal(replacement.plan.supersedesPlanId, approved.plan.planId)
  const historical = readPlanState(projectRoot, {
    threadId, userDataPath, planId: approved.plan.planId,
  }).plan
  assert.equal(historical.lifecycle, 'superseded')
  assert.equal(historical.supersededByPlanId, replacement.plan.planId)
  assert.equal(readManagedPlanDocument(projectRoot, {
    threadId, userDataPath, planId: historical.planId,
  }).content, '# First plan\n')
})

test('accepted direction and the user-selected profile persist before drafting', () => {
  const userDataPath = createPlanStorage()
  const options = { threadId: 'plan-profile-thread', userDataPath, expectedRevision: 0 }
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Create a durable plan review workflow.',
    answered_question_ids: ['scope', 'review'],
    recommendation: {
      recommendedPlanProfile: 'deep_implementation',
      rationale: 'This crosses persistence, runtime policy, and renderer review.',
    },
  }, options)

  assert.equal(direction.plan.lifecycle, 'awaiting_decision')
  assert.equal(direction.plan.direction.revision, 1)
  assert.equal(direction.plan.direction.recommendation.profile, 'deep_implementation')

  const selected = selectPlanAuthoringProfile(process.cwd(), {
    selected_profile: 'technical_design',
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId: 'plan-profile-thread', userDataPath })

  assert.equal(selected.plan.lifecycle, 'drafting')
  assert.equal(selected.plan.profile.selectedProfile, 'technical_design')
  assert.equal(selected.plan.profile.version, '2.0.0')
  assert.equal(selected.event.kind, 'plan_profile_selected')

  const restored = readPlanState(process.cwd(), { threadId: 'plan-profile-thread', userDataPath }).plan
  assert.equal(restored.direction.recommendation.profile, 'deep_implementation')
  assert.equal(restored.profile.selectedProfile, 'technical_design')
  const draftingPrompt = buildActivePlanAuthoringPrompt(process.cwd(), {
    threadId: 'plan-profile-thread',
    mode: 'plan',
    userDataPath,
  })
  assert.match(draftingPrompt, /Technical design \(technical_design, v2\.0\.0\)/)
  assert.match(draftingPrompt, /repository-grounded technical design/i)
  assert.match(draftingPrompt, /Create a durable plan review workflow\./)
  assert.equal(buildActivePlanAuthoringPrompt(process.cwd(), {
    threadId: 'plan-profile-thread',
    mode: 'thinking',
    userDataPath,
  }), '')
})

test('persisted profile metadata is not silently upgraded during hydration', () => {
  const userDataPath = createPlanStorage()
  const threadId = 'historical-profile-version'
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Preserve the exact selected planning instructions.',
    expected_revision: 0,
  }, { threadId, userDataPath })
  selectPlanAuthoringProfile(process.cwd(), {
    selected_profile: 'implementation',
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })

  const recordPath = findStoredPlanRecord(userDataPath)
  const stored = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  stored.profile.version = '0.9.0'
  stored.profile.contentHash = 'a'.repeat(64)
  fs.writeFileSync(recordPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8')

  const restored = readPlanState(process.cwd(), { threadId, userDataPath }).plan
  assert.equal(restored.profile.version, '0.9.0')
  assert.equal(restored.profile.contentHash, 'a'.repeat(64))
  assert.equal(buildActivePlanAuthoringPrompt(process.cwd(), {
    threadId, mode: 'plan', userDataPath,
  }), '')
})

test('direction-card answers persist independently and reject stale or unknown questions', () => {
  const userDataPath = createPlanStorage()
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Establish the planning workflow direction.',
    questions: [
      { id: 'scope', question: 'Which scope should the first plan cover?' },
      { id: 'depth', question: 'How much delivery detail is needed?' },
    ],
  }, { threadId: 'direction-answers', userDataPath, expectedRevision: 0 })
  const answered = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'scope',
    answer: 'The complete managed-plan lifecycle.',
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId: 'direction-answers', userDataPath })

  assert.deepEqual(answered.plan.direction.questions[0].answer, {
    kind: 'custom', optionId: '', text: 'The complete managed-plan lifecycle.',
  })
  assert.equal(answered.plan.direction.revision, 2)
  assert.equal(answered.complete, false)
  assert.throws(() => selectPlanAuthoringProfile(process.cwd(), {
    selected_profile: 'implementation',
    expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
  }, { threadId: 'direction-answers', userDataPath }), /answer every direction question/i)
  assert.throws(() => answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'unknown', answer: 'No', expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
  }, { threadId: 'direction-answers', userDataPath }), /unknown direction question/i)
})

test('direction schema v2 preserves structured choices and starts synthesis only after the final typed answer', () => {
  const userDataPath = createPlanStorage()
  const threadId = 'direction-v2-answers'
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Choose the first production milestone.',
    questions: [
      {
        id: 'priority',
        header: 'Priority',
        question: 'Which outcome should lead?',
        options: [
          { id: 'reliability', label: 'Reliability', description: 'Stabilize failure behavior.', recommended: true },
          { id: 'features', label: 'Features', description: 'Add new telemetry first.' },
        ],
      },
      { id: 'scope', header: 'Scope', question: 'What should the first slice include?' },
    ],
  }, { threadId, userDataPath, expectedRevision: 0 })

  assert.equal(direction.plan.direction.schemaVersion, 2)
  assert.equal(direction.plan.direction.stage, 'collecting_answers')
  assert.equal(direction.plan.direction.answerRevision, 0)
  assert.deepEqual(direction.plan.direction.questions[0].options, [
    { id: 'reliability', label: 'Reliability', description: 'Stabilize failure behavior.', recommended: true },
    { id: 'features', label: 'Features', description: 'Add new telemetry first.', recommended: false },
  ])

  const first = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'priority',
    answer: { kind: 'option', optionId: 'reliability', text: 'Reliability' },
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })
  assert.deepEqual(first.plan.direction.questions[0].answer, {
    kind: 'option', optionId: 'reliability', text: 'Reliability',
  })
  assert.equal(first.plan.direction.answerRevision, 1)
  assert.equal(first.plan.direction.stage, 'collecting_answers')
  assert.equal(first.action, null)

  const last = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'scope',
    answer: { kind: 'custom', text: 'CLI errors, stable JSON, and focused tests.' },
    expected_revision: first.plan.revision,
    expected_direction_revision: first.plan.direction.revision,
  }, { threadId, userDataPath })
  assert.equal(last.complete, true)
  assert.equal(last.plan.direction.answerRevision, 2)
  assert.equal(last.plan.direction.stage, 'synthesizing')
  assert.equal(last.plan.direction.synthesis.status, 'pending')
  assert.equal(last.plan.direction.synthesis.sourceAnswerRevision, 2)
  assert.match(last.plan.direction.synthesis.requestId, /^plan_direction_/)
  assert.equal(last.action.requestId, last.plan.direction.synthesis.requestId)
})

test('direction synthesis is revision-bound, rejects omitted answers, and gates profile selection until review', () => {
  assert.equal(typeof finalizePlanDirectionSynthesis, 'function')
  const userDataPath = createPlanStorage()
  const threadId = 'direction-v2-finalize'
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Provisional direction.',
    questions: [{ id: 'scope', question: 'What is in scope?' }],
  }, { threadId, userDataPath, expectedRevision: 0 })
  const answered = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'scope',
    answer: { kind: 'custom', text: 'The complete direction lifecycle.' },
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })

  assert.throws(() => selectPlanAuthoringProfile(process.cwd(), {
    selected_profile: 'implementation',
    expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
  }, { threadId, userDataPath }), /synthesized direction.*review/i)
  assert.throws(() => finalizePlanDirectionSynthesis(process.cwd(), {
    summary: 'A summary that does not prove answer coverage.',
    incorporated_answer_ids: [],
    expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
    expected_answer_revision: answered.plan.direction.answerRevision,
    request_id: answered.action.requestId,
  }, { threadId, userDataPath }), /incorporate every answered direction question/i)

  const finalized = finalizePlanDirectionSynthesis(process.cwd(), {
    summary: 'Implement the complete direction lifecycle with durable revision checks.',
    incorporated_answer_ids: ['scope'],
    recommended_plan_profile: 'implementation',
    recommendation_rationale: 'This is a repository-grounded implementation plan.',
    expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
    expected_answer_revision: answered.plan.direction.answerRevision,
    request_id: answered.action.requestId,
  }, { threadId, userDataPath })
  assert.equal(finalized.plan.direction.stage, 'review')
  assert.equal(finalized.plan.direction.summary, 'Implement the complete direction lifecycle with durable revision checks.')
  assert.deepEqual(finalized.plan.direction.incorporatedAnswerIds, ['scope'])
  assert.equal(finalized.plan.direction.recommendation.profile, 'implementation')

  const selected = selectPlanAuthoringProfile(process.cwd(), {
    selected_profile: 'implementation',
    expected_revision: finalized.plan.revision,
    expected_direction_revision: finalized.plan.direction.revision,
  }, { threadId, userDataPath })
  assert.equal(selected.plan.lifecycle, 'drafting')
})

test('direction synthesis may append one genuinely new question before review', () => {
  const userDataPath = createPlanStorage()
  const options = { threadId: 'synthesis-follow-up', userDataPath }
  const created = savePlanDirection(process.cwd(), {
    summary: 'Choose a delivery boundary.',
    questions: [{
      id: 'scope', question: 'Which scope?',
      options: [
        { id: 'focused', label: 'Focused', recommended: true },
        { id: 'broad', label: 'Broad' },
      ],
    }],
    expected_revision: 0,
  }, options)
  const answered = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'scope',
    answer: { kind: 'option', option_id: 'focused' },
    expected_revision: created.plan.revision,
    expected_direction_revision: created.plan.direction.revision,
  }, options)

  assert.throws(() => finalizePlanDirectionSynthesis(process.cwd(), {
    summary: 'Invalid duplicate follow-up.',
    incorporated_answer_ids: ['scope'],
    next_question: { id: 'scope', question: 'Ask the same question again?' },
    expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
    expected_answer_revision: answered.plan.direction.answerRevision,
    request_id: answered.plan.direction.synthesis.requestId,
  }, options), /new question/i)

  const followUp = finalizePlanDirectionSynthesis(process.cwd(), {
    summary: 'Deliver a focused first milestone after confirming the verification boundary.',
    incorporated_answer_ids: ['scope'],
    next_question: {
      id: 'verification',
      header: 'Verification',
      question: 'Which verification depth should the plan require?',
      options: [
        { id: 'focused_tests', label: 'Focused tests', recommended: true },
        { id: 'full_suite', label: 'Full suite' },
      ],
    },
    expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
    expected_answer_revision: answered.plan.direction.answerRevision,
    request_id: answered.plan.direction.synthesis.requestId,
  }, options)

  assert.equal(followUp.plan.direction.stage, 'collecting_answers')
  assert.equal(followUp.plan.direction.questions.length, 2)
  assert.equal(followUp.plan.direction.questions[1].id, 'verification')
  assert.equal(followUp.plan.direction.questions[1].answer, null)
})

test('failed direction synthesis retains input and retry is idempotent by request ID', () => {
  assert.equal(typeof failPlanDirectionSynthesis, 'function')
  assert.equal(typeof retryPlanDirectionSynthesis, 'function')
  const userDataPath = createPlanStorage()
  const threadId = 'direction-v2-retry'
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Provisional direction.',
    questions: [{ id: 'scope', question: 'What is in scope?' }],
  }, { threadId, userDataPath, expectedRevision: 0 })
  const answered = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'scope', answer: { kind: 'custom', text: 'Preserve this answer.' },
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })
  const failed = failPlanDirectionSynthesis(process.cwd(), {
    request_id: answered.action.requestId,
    error: 'The provider stopped before finalizing the direction.',
  }, { threadId, userDataPath })
  assert.equal(failed.plan.direction.synthesis.status, 'failed')
  assert.equal(failed.plan.direction.questions[0].answer.text, 'Preserve this answer.')

  const retry = retryPlanDirectionSynthesis(process.cwd(), {
    expected_revision: failed.plan.revision,
    expected_direction_revision: failed.plan.direction.revision,
  }, { threadId, userDataPath })
  const repeated = retryPlanDirectionSynthesis(process.cwd(), {
    expected_revision: retry.plan.revision,
    expected_direction_revision: retry.plan.direction.revision,
  }, { threadId, userDataPath })
  assert.equal(retry.plan.direction.synthesis.status, 'pending')
  assert.equal(repeated.plan.revision, retry.plan.revision)
  assert.equal(repeated.action.requestId, retry.action.requestId)
})

test('pending direction prompt binds typed answers, feedback, and exact revisions to Plan turns', () => {
  assert.equal(typeof buildActivePlanDecisionPrompt, 'function')
  const userDataPath = createPlanStorage()
  const threadId = 'direction-v2-prompt'
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Provisional direction.',
    questions: [{ id: 'priority', header: 'Priority', question: 'What leads?' }],
  }, { threadId, userDataPath, expectedRevision: 0 })
  const answered = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'priority', answer: { kind: 'custom', text: 'Reliability first.' },
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })
  const prompt = buildActivePlanDecisionPrompt(process.cwd(), {
    threadId, mode: 'plan', userDataPath,
  })
  assert.match(prompt, /Plan ID:/)
  assert.match(prompt, new RegExp(`Direction revision: ${answered.plan.direction.revision}`))
  assert.match(prompt, new RegExp(`Answer revision: ${answered.plan.direction.answerRevision}`))
  assert.match(prompt, /Priority: Reliability first\./)
  assert.equal(buildActivePlanDecisionPrompt(process.cwd(), {
    threadId, mode: 'thinking', userDataPath,
  }), '')
})

test('typed Plan actions produce revision-bound synthesis and drafting prompts', () => {
  assert.equal(typeof buildPlanActionPrompt, 'function')
  const userDataPath = createPlanStorage()
  const threadId = 'typed-plan-actions'
  const direction = savePlanDirection(process.cwd(), {
    summary: 'Provisional direction.',
    questions: [{ id: 'scope', question: 'What is in scope?' }],
  }, { threadId, userDataPath, expectedRevision: 0 })
  const answered = answerPlanDirectionQuestion(process.cwd(), {
    question_id: 'scope', answer: { kind: 'custom', text: 'The durable Plan lifecycle.' },
    expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, { threadId, userDataPath })
  const synthesisPrompt = buildPlanActionPrompt(process.cwd(), {
    threadId,
    mode: 'plan',
    userDataPath,
    action: {
      kind: 'synthesize_direction',
      planId: answered.plan.planId,
      requestId: answered.action.requestId,
      expectedRevision: answered.plan.revision,
      expectedDirectionRevision: answered.plan.direction.revision,
      expectedAnswerRevision: answered.plan.direction.answerRevision,
    },
  })
  assert.match(synthesisPrompt, /plan_direction_finalize/)
  assert.match(synthesisPrompt, new RegExp(answered.action.requestId))
  assert.match(synthesisPrompt, /scope: The durable Plan lifecycle\./)

  const finalized = finalizePlanDirectionSynthesis(process.cwd(), {
    summary: 'Implement the durable Plan lifecycle.', incorporated_answer_ids: ['scope'],
    expected_revision: answered.plan.revision,
    expected_direction_revision: answered.plan.direction.revision,
    expected_answer_revision: answered.plan.direction.answerRevision,
    request_id: answered.action.requestId,
  }, { threadId, userDataPath })
  const selected = selectPlanAuthoringProfile(process.cwd(), {
    selected_profile: 'implementation', expected_revision: finalized.plan.revision,
    expected_direction_revision: finalized.plan.direction.revision,
  }, { threadId, userDataPath })
  const draftPrompt = buildPlanActionPrompt(process.cwd(), {
    threadId,
    mode: 'plan',
    userDataPath,
    action: {
      kind: 'draft_plan',
      planId: selected.plan.planId,
      expectedRevision: selected.plan.revision,
      expectedDirectionRevision: selected.plan.direction.revision,
    },
  })
  assert.match(draftPrompt, /plan_document_write/)
  assert.match(draftPrompt, /do not ask for another confirmation/i)
})

test('typed managed plan revision prompt batches durable annotations against the current document', () => {
  const userDataPath = createPlanStorage()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-plan-review-prompt-'))
  const threadId = 'typed-plan-review-action'
  const ready = createReviewReadyPlan({ userDataPath, projectRoot, threadId })
  const annotated = addPlanReviewChange(projectRoot, {
    expected_revision: ready.plan.revision,
    heading_anchor: 'Reliability',
    block_id: 'paragraph-42',
    block_kind: 'paragraph',
    block_text: 'Preserve this paragraph.',
    instruction: 'State the expected failure boundary.',
  }, { threadId, userDataPath })
  const submitted = beginPlanReviewRevision(projectRoot, {
    expected_revision: annotated.plan.revision,
  }, { threadId, userDataPath })
  const prompt = buildPlanActionPrompt(projectRoot, {
    threadId, mode: 'plan', userDataPath, action: submitted.action,
  })

  assert.match(prompt, /ADDOM Internal Managed Plan Revision/)
  assert.match(prompt, /State the expected failure boundary\./)
  assert.match(prompt, /Target block: paragraph \(paragraph-42\)/)
  assert.match(prompt, /Block text: Preserve this paragraph\./)
  assert.match(prompt, /Current managed Plan\.md:/)
  assert.match(prompt, /call plan_document_write exactly once/i)
})

test('legacy renderer plan state migrates once without overwriting the managed authority', () => {
  const userDataPath = createPlanStorage()
  const options = { threadId: 'legacy-plan-migration', userDataPath }
  const legacy = {
    canonicalPlan: {
      messageId: 'legacy_message',
      summary: 'Preserve the accepted provider direction.',
      selectedOptionId: 'openai_first',
      questions: [{ id: 'scope', text: 'Which provider leads?' }],
      options: [{ id: 'openai_first', title: 'OpenAI first' }],
    },
    answeredQuestions: { scope: 'OpenAI account auth.' },
  }

  const first = migrateLegacyRendererPlanState(process.cwd(), legacy, options)
  assert.equal(first.migrated, true)
  assert.equal(first.plan.lifecycle, 'awaiting_decision')
  assert.match(first.plan.direction.summary, /OpenAI first/)
  assert.deepEqual(first.plan.direction.questions[0]?.answer, {
    kind: 'custom', optionId: '', text: 'OpenAI account auth.',
  })

  const second = migrateLegacyRendererPlanState(process.cwd(), legacy, options)
  assert.equal(second.migrated, false)
  assert.equal(second.reason, 'already_migrated')
  assert.equal(second.plan.revision, first.plan.revision)
})
