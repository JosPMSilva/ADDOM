import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { getUserDataPath } from '../platform/electron-app.mjs'
import {
  resolvePlanAuthoringProfile,
  validateRecommendedPlanProfile,
} from './plan-authoring-profiles.mjs'
import {
  buildPlanDirectionAction,
  createSynthesisRequest,
  directionAnswerIds,
  normalizePlanDirection,
  normalizePlanDirectionAnswer,
  normalizePlanDirectionQuestions,
  sameAnswer,
} from './plan-direction-state.mjs'
import {
  createPlanReviewOperations,
  normalizePlanReview,
  recoverLegacyPlanReviewLifecycle,
} from './plan-review-state.mjs'

const MAX_PLAN_TASKS = 32
const MAX_TEXT_LENGTH = 240
const MAX_NOTES_LENGTH = 400
const PLAN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const PLAN_LIFECYCLES = new Set([
  'exploring', 'awaiting_decision', 'drafting', 'ready_for_review', 'revising', 'approved', 'superseded',
])

function text(value = '', maxLength = 0) {
  const normalized = String(value || '').trim()
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized
}

function normalizeStatus(value = '') {
  const normalized = text(value).toLowerCase()
  return normalized === 'completed' || normalized === 'in_progress' ? normalized : 'pending'
}

function normalizeLifecycle(value = '', fallback = 'exploring') {
  const normalized = text(value).toLowerCase()
  return PLAN_LIFECYCLES.has(normalized) ? normalized : fallback
}

function normalizeTasks(tasks = []) {
  const seen = new Set()
  const out = []
  for (const [index, raw] of (Array.isArray(tasks) ? tasks : []).entries()) {
    if (out.length >= MAX_PLAN_TASKS) break
    const content = text(raw?.content || raw?.text, MAX_TEXT_LENGTH)
    if (!content) continue
    const id = text(raw?.id || `task_${index + 1}`, 64) || `task_${index + 1}`
    if (seen.has(id.toLowerCase())) continue
    seen.add(id.toLowerCase())
    const notes = text(raw?.notes, MAX_NOTES_LENGTH)
    out.push({ id, content, status: normalizeStatus(raw?.status), ...(notes ? { notes } : {}) })
  }
  return out
}

function normalizeDirection(raw = null) {
  return normalizePlanDirection(raw, { validateRecommendation: validateRecommendedPlanProfile })
}

function normalizeProfile(raw = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const selectedProfile = text(raw.selectedProfile || raw.selected_profile || raw.id, 80).toLowerCase()
  const version = text(raw.version, 32)
  const contentHash = text(raw.contentHash || raw.content_hash, 64).toLowerCase()
  if (!selectedProfile || !version || !/^[a-f0-9]{64}$/.test(contentHash)) return null
  const provenance = raw.provenance && typeof raw.provenance === 'object' && !Array.isArray(raw.provenance)
    ? structuredClone(raw.provenance)
    : null
  return {
    id: text(raw.id || selectedProfile, 80).toLowerCase(),
    label: text(raw.label, 120),
    version,
    contentHash,
    ...(provenance ? { provenance } : {}),
    selectedProfile,
    directionRevision: Math.max(0, Number(raw.directionRevision || raw.direction_revision || 0) || 0),
  }
}

function normalizePlanId(value = '', { required = false } = {}) {
  const normalized = text(value, 128)
  if (!normalized && !required) return ''
  if (!PLAN_ID_PATTERN.test(normalized)) throw new Error('Invalid plan ID.')
  return normalized
}

function scope(projectRoot = '', options = {}) {
  const project = path.resolve(text(options?.projectId || projectRoot || 'global'))
  const threadId = text(options?.todoScopeKey || options?.planScopeKey || options?.threadId || 'global', 256)
  return { project, threadId }
}

function hash(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24)
}

function storagePaths(projectRoot = '', options = {}) {
  const current = scope(projectRoot, options)
  const userDataPath = path.resolve(text(options?.userDataPath || getUserDataPath()))
  const rootPath = path.join(userDataPath, 'managed-plans')
  const scopeId = `${hash(current.project)}-${hash(current.threadId)}`
  const scopePath = path.join(rootPath, scopeId)
  return {
    rootPath,
    scopePath,
    indexPath: path.join(scopePath, 'index.json'),
    project: current.project,
    threadId: current.threadId,
  }
}

function atomicWrite(filePath = '', value = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, filePath)
  } finally {
    try { fs.rmSync(temporary, { force: true }) } catch { /* best effort */ }
  }
}

function readJson(filePath = '') {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readIndex(paths) {
  const index = readJson(paths.indexPath)
  try { return normalizePlanId(index?.activePlanId) } catch { return '' }
}

function planFilePath(paths, planId = '') {
  return path.join(paths.scopePath, `${normalizePlanId(planId, { required: true })}.json`)
}

function documentFilePath(paths, planId = '') {
  return path.join(paths.scopePath, `${normalizePlanId(planId, { required: true })}.md`)
}

function documentCommitJournalPath(paths) {
  return path.join(paths.scopePath, '.pending-plan-document-commit.json')
}

function supersessionJournalPath(paths) {
  return path.join(paths.scopePath, '.pending-plan-supersession.json')
}

function emptyPlan() {
  return {
    tasks: [], revision: 0, updatedAt: null, planId: '', lifecycle: 'exploring', document: null,
    unresolvedQuestionIds: [], direction: null, profile: null, review: normalizePlanReview(),
    supersedesPlanId: '', supersededByPlanId: '',
  }
}

function normalizeRecord(record = null) {
  if (!record || typeof record !== 'object') return null
  let planId = ''
  try { planId = normalizePlanId(record.planId, { required: true }) } catch { return null }
  const revision = Math.max(0, Number(record.revision || 0) || 0)
  const document = record.document && typeof record.document === 'object'
    ? {
        kind: 'managed_plan',
        planId,
        filePath: text(record.document.filePath, 512),
        revision: Math.max(0, Number(record.document.revision || revision) || 0),
      }
    : null
  const review = normalizePlanReview(record.review)
  return {
    planId,
    project: text(record.project, 2048),
    threadId: text(record.threadId, 256),
    tasks: normalizeTasks(record.tasks),
    lifecycle: recoverLegacyPlanReviewLifecycle(normalizeLifecycle(record.lifecycle), review),
    revision,
    updatedAt: text(record.updatedAt) || null,
    unresolvedQuestionIds: [...new Set((Array.isArray(record.unresolvedQuestionIds) ? record.unresolvedQuestionIds : [])
      .map((value) => text(value, 256)).filter(Boolean))],
    direction: normalizeDirection(record.direction),
    profile: normalizeProfile(record.profile),
    review,
    document,
    supersedesPlanId: normalizePlanId(record.supersedesPlanId),
    supersededByPlanId: normalizePlanId(record.supersededByPlanId),
  }
}

function writeRecordFile(paths, record) {
  atomicWrite(planFilePath(paths, record.planId), `${JSON.stringify(record, null, 2)}\n`)
}

function writeActivePlanIndex(paths, planId) {
  atomicWrite(paths.indexPath, `${JSON.stringify({ activePlanId: planId }, null, 2)}\n`)
}

function removeJournal(filePath) {
  try { fs.rmSync(filePath, { force: true }) } catch { /* recovered state is already durable */ }
}

function recoverPendingDocumentCommit(paths) {
  const journalPath = documentCommitJournalPath(paths)
  const journal = readJson(journalPath)
  if (!journal) return
  const nextRecord = normalizeRecord(journal.nextRecord)
  const priorRevision = Number(journal.priorRevision)
  const content = typeof journal.content === 'string' ? journal.content : ''
  if (
    journal.kind !== 'plan_document_commit'
    || journal.version !== 1
    || !nextRecord
    || !Number.isInteger(priorRevision)
    || nextRecord.revision !== priorRevision + 1
    || nextRecord.lifecycle !== 'ready_for_review'
    || nextRecord.document?.planId !== nextRecord.planId
    || nextRecord.document?.revision !== nextRecord.revision
    || !content
  ) {
    throw new Error('Managed plan document recovery journal is invalid.')
  }
  const current = normalizeRecord(readJson(planFilePath(paths, nextRecord.planId)))
  if (current && current.revision > nextRecord.revision) {
    removeJournal(journalPath)
    return
  }
  if (current && current.revision !== priorRevision && current.revision !== nextRecord.revision) {
    throw new Error('Managed plan document recovery found a conflicting plan revision.')
  }
  atomicWrite(documentFilePath(paths, nextRecord.planId), content)
  writeRecordFile(paths, nextRecord)
  writeActivePlanIndex(paths, nextRecord.planId)
  removeJournal(journalPath)
}

function recoverPendingSupersession(paths) {
  const journalPath = supersessionJournalPath(paths)
  const journal = readJson(journalPath)
  if (!journal) return
  const historicalRecord = normalizeRecord(journal.historicalRecord)
  const activeRecord = normalizeRecord(journal.activeRecord)
  if (
    journal.kind !== 'plan_supersession'
    || journal.version !== 1
    || !historicalRecord
    || !activeRecord
    || historicalRecord.lifecycle !== 'superseded'
    || historicalRecord.supersededByPlanId !== activeRecord.planId
    || activeRecord.supersedesPlanId !== historicalRecord.planId
  ) {
    throw new Error('Managed plan supersession recovery journal is invalid.')
  }
  writeRecordFile(paths, activeRecord)
  writeRecordFile(paths, historicalRecord)
  writeActivePlanIndex(paths, activeRecord.planId)
  removeJournal(journalPath)
}

function readRecord(projectRoot = '', options = {}) {
  const paths = storagePaths(projectRoot, options)
  recoverPendingDocumentCommit(paths)
  recoverPendingSupersession(paths)
  const planId = options?.planId == null || options.planId === ''
    ? readIndex(paths)
    : normalizePlanId(options.planId, { required: true })
  const record = planId ? normalizeRecord(readJson(planFilePath(paths, planId))) : null
  if (record) {
    record.project = paths.project
    record.threadId = paths.threadId
    if (record.document) record.document.filePath = documentFilePath(paths, record.planId)
  }
  return { paths, record }
}

function persistRecord(paths, record) {
  writeRecordFile(paths, record)
  writeActivePlanIndex(paths, record.planId)
}

function requireRevision(record, expectedRevision) {
  const expected = Number(expectedRevision)
  if (!Number.isInteger(expected) || expected < 0) throw new Error('expected_revision is required for plan mutation.')
  const actual = Number(record?.revision || 0)
  if (expected !== actual) throw new Error(`Stale plan revision: expected ${expected}, current revision is ${actual}. Re-read the plan before retrying.`)
}

function requireMutablePlan(record) {
  if (record?.lifecycle === 'approved') {
    throw new Error('The approved plan is immutable. Start a replacement with plan_direction_update.')
  }
  if (record?.lifecycle === 'superseded') {
    throw new Error('The superseded plan is immutable. Read the active replacement before continuing.')
  }
}

function createRecord(paths, planId = '') {
  const id = planId ? normalizePlanId(planId, { required: true }) : crypto.randomUUID()
  return {
    planId: id,
    project: paths.project,
    threadId: paths.threadId,
    tasks: [],
    lifecycle: 'exploring',
    revision: 0,
    updatedAt: null,
    unresolvedQuestionIds: [],
    direction: null,
    profile: null,
    review: normalizePlanReview(),
    document: null,
    supersedesPlanId: '',
    supersededByPlanId: '',
  }
}

function summary(tasks = []) {
  const counts = { pending: 0, in_progress: 0, completed: 0 }
  for (const task of tasks) counts[normalizeStatus(task?.status)] += 1
  return `${tasks.length} task${tasks.length === 1 ? '' : 's'} (${counts.pending} pending, ${counts.in_progress} in progress, ${counts.completed} completed)`
}

function buildMutation(prior, update = {}) {
  return {
    ...prior,
    ...update,
    tasks: normalizeTasks(update.tasks ?? prior.tasks),
    lifecycle: normalizeLifecycle(update.lifecycle, prior.lifecycle),
    direction: update.direction === undefined ? prior.direction : normalizeDirection(update.direction),
    profile: update.profile === undefined ? prior.profile : normalizeProfile(update.profile),
    review: update.review === undefined ? normalizePlanReview(prior.review) : normalizePlanReview(update.review),
    revision: Number(prior.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  }
}

function finalizeMutation(paths, prior, update = {}) {
  const next = buildMutation(prior, update)
  persistRecord(paths, next)
  return next
}

function supersedeApprovedPlan(paths, current, direction) {
  const replacementId = crypto.randomUUID()
  const activeRecord = buildMutation({
    ...createRecord(paths, replacementId),
    supersedesPlanId: current.planId,
  }, {
    direction,
    lifecycle: 'awaiting_decision',
  })
  const historicalRecord = buildMutation(current, {
    lifecycle: 'superseded',
    supersededByPlanId: replacementId,
  })
  const journalPath = supersessionJournalPath(paths)
  atomicWrite(journalPath, `${JSON.stringify({
    version: 1,
    kind: 'plan_supersession',
    historicalRecord,
    activeRecord,
  }, null, 2)}\n`)
  recoverPendingSupersession(paths)
  return activeRecord
}

export function readPlanState(projectRoot, options = {}) {
  const { record } = readRecord(projectRoot, options)
  const plan = record || emptyPlan()
  return { plan, summary: summary(plan.tasks) }
}

export function replacePlanTasks(projectRoot, tasks = [], options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  const current = record || createRecord(paths, options.planId)
  requireRevision(current, options.expectedRevision ?? options.expected_revision)
  requireMutablePlan(current)
  const plan = finalizeMutation(paths, current, { tasks, lifecycle: 'drafting' })
  return { plan, summary: summary(plan.tasks) }
}

export function updatePlanTask(projectRoot, update = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  const current = record || createRecord(paths, options.planId)
  requireRevision(current, update?.expected_revision ?? update?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  requireMutablePlan(current)
  const taskId = text(update?.task_id || update?.taskId || update?.id, 64)
  if (!taskId) throw new Error('plan_update requires task_id.')
  const tasks = [...current.tasks]
  const index = tasks.findIndex((task) => task.id.toLowerCase() === taskId.toLowerCase())
  const content = text(update?.content, MAX_TEXT_LENGTH)
  const notes = text(update?.notes, MAX_NOTES_LENGTH)
  if (index < 0 && !content) throw new Error('plan_update requires content when creating a new task.')
  if (index < 0 && tasks.length < MAX_PLAN_TASKS) {
    tasks.push({ id: taskId, content, status: normalizeStatus(update?.status), ...(notes ? { notes } : {}) })
  } else if (index >= 0) {
    tasks[index] = {
      ...tasks[index],
      ...(content ? { content } : {}),
      ...(update?.status != null ? { status: normalizeStatus(update.status) } : {}),
      ...(notes ? { notes } : {}),
    }
  }
  const plan = finalizeMutation(paths, current, { tasks, lifecycle: 'drafting' })
  return { plan, task: plan.tasks.find((task) => task.id.toLowerCase() === taskId.toLowerCase()) || null, summary: summary(plan.tasks) }
}

export function savePlanDirection(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  const current = record || createRecord(paths, options.planId)
  requireRevision(current, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  const summary = text(input?.summary)
  if (!summary) throw new Error('plan direction requires a summary.')
  const replacingApprovedPlan = current.lifecycle === 'approved'
  const direction = normalizeDirection({
    schemaVersion: 2,
    revision: replacingApprovedPlan ? 1 : Number(current.direction?.revision || 0) + 1,
    answerRevision: 0,
    stage: normalizePlanDirectionQuestions(input?.questions).length > 0 ? 'collecting_answers' : 'review',
    summary,
    questions: input?.questions,
    recommendation: input?.recommendation,
  })
  const plan = replacingApprovedPlan
    ? supersedeApprovedPlan(paths, current, direction)
    : finalizeMutation(paths, current, { direction, lifecycle: 'awaiting_decision' })
  return {
    plan,
    event: { kind: 'plan_direction_ready', planId: plan.planId, revision: plan.revision, direction: plan.direction },
  }
}

export function answerPlanDirectionQuestion(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record?.direction) throw new Error('No plan direction is awaiting an answer.')
  requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  requireDirectionRevision(record.direction, input?.expected_direction_revision ?? input?.expectedDirectionRevision)
  if (record.lifecycle !== 'awaiting_decision' || record.direction.stage !== 'collecting_answers') {
    throw new Error('Direction questions can only be answered while the direction is collecting answers.')
  }
  const questionId = text(input?.question_id || input?.questionId, 128).toLowerCase()
  const index = record.direction.questions.findIndex((question) => question.id === questionId)
  if (index < 0) throw new Error('Unknown direction question.')
  const answer = normalizePlanDirectionAnswer(input?.answer, record.direction.questions[index].options)
  if (!answer) throw new Error('A direction answer is required.')
  if (sameAnswer(record.direction.questions[index].answer, answer)) {
    return {
      plan: record,
      complete: record.direction.questions.every((question) => question.answer),
      action: buildPlanDirectionAction(record.direction),
      event: null,
    }
  }
  const questions = record.direction.questions.map((question, questionIndex) => (
    questionIndex === index ? { ...question, answer } : question
  ))
  const complete = questions.every((question) => question.answer)
  let direction = normalizeDirection({
    ...record.direction,
    revision: record.direction.revision + 1,
    answerRevision: record.direction.answerRevision + 1,
    stage: complete ? 'synthesizing' : 'collecting_answers',
    questions,
    incorporatedAnswerIds: [],
    synthesis: null,
  })
  if (complete) {
    direction = normalizeDirection({
      ...direction,
      synthesis: createSynthesisRequest(direction, `plan_direction_${crypto.randomUUID()}`),
    })
  }
  const plan = finalizeMutation(paths, record, { direction, lifecycle: 'awaiting_decision' })
  return {
    plan,
    complete,
    action: buildPlanDirectionAction(plan.direction),
    event: { kind: 'plan_direction_answered', planId: plan.planId, revision: plan.revision, direction: plan.direction },
  }
}

function requireAnswerRevision(direction = null, expectedRevision = undefined) {
  const expected = Number(expectedRevision)
  if (!Number.isInteger(expected) || expected < 0) throw new Error('expected_answer_revision is required for direction synthesis.')
  const actual = Number(direction?.answerRevision || 0)
  if (expected !== actual) {
    throw new Error(`Stale answer revision: expected ${expected}, current answer revision is ${actual}. Re-read the direction before retrying.`)
  }
}

function requireSynthesisRequest(direction = null, input = {}) {
  const requestId = text(input?.request_id || input?.requestId, 160)
  if (!requestId || direction?.synthesis?.requestId !== requestId) {
    throw new Error('The plan direction synthesis request is stale or unknown.')
  }
  return requestId
}

function exactAnswerCoverage(direction = null, input = {}) {
  const expected = [...directionAnswerIds(direction)].sort()
  const actual = [...new Set((Array.isArray(input?.incorporated_answer_ids)
    ? input.incorporated_answer_ids
    : input?.incorporatedAnswerIds || [])
    .map((value) => text(value, 128).toLowerCase()).filter(Boolean))].sort()
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new Error('Direction synthesis must incorporate every answered direction question exactly once.')
  }
  return actual
}

function nextSynthesisQuestion(direction = null, input = {}) {
  const raw = input?.next_question ?? input?.nextQuestion
  if (raw == null) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The next plan direction question is invalid.')
  }
  const existing = Array.isArray(direction?.questions) ? direction.questions : []
  if (existing.length >= 5) throw new Error('The plan direction already contains the maximum of five questions.')
  const question = normalizePlanDirectionQuestions([raw])[0] || null
  if (!question) throw new Error('The next plan direction question is invalid.')
  const duplicate = existing.some((entry) => (
    entry.id === question.id
    || text(entry.question).toLowerCase() === text(question.question).toLowerCase()
  ))
  if (duplicate) throw new Error('Direction synthesis may append only a genuinely new question.')
  return question
}

export function finalizePlanDirectionSynthesis(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record?.direction || record.direction.stage !== 'synthesizing') {
    throw new Error('No plan direction synthesis is awaiting finalization.')
  }
  requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  requireDirectionRevision(record.direction, input?.expected_direction_revision ?? input?.expectedDirectionRevision)
  requireAnswerRevision(record.direction, input?.expected_answer_revision ?? input?.expectedAnswerRevision)
  requireSynthesisRequest(record.direction, input)
  if (record.direction.synthesis?.status !== 'pending') {
    throw new Error('The plan direction synthesis request is not pending.')
  }
  const summary = text(input?.summary)
  if (!summary) throw new Error('A synthesized direction summary is required.')
  const incorporatedAnswerIds = exactAnswerCoverage(record.direction, input)
  const recommendation = validateRecommendedPlanProfile({
    recommendedPlanProfile: input?.recommended_plan_profile ?? input?.recommendedPlanProfile,
    rationale: input?.recommendation_rationale ?? input?.recommendationRationale,
  })
  const nextQuestion = nextSynthesisQuestion(record.direction, input)
  const direction = normalizeDirection({
    ...record.direction,
    revision: record.direction.revision + 1,
    stage: nextQuestion ? 'collecting_answers' : 'review',
    summary,
    questions: nextQuestion ? [...record.direction.questions, nextQuestion] : record.direction.questions,
    incorporatedAnswerIds,
    synthesis: { ...record.direction.synthesis, status: 'completed', error: '' },
    recommendation,
  })
  const plan = finalizeMutation(paths, record, { direction, lifecycle: 'awaiting_decision' })
  return {
    plan,
    event: {
      kind: nextQuestion ? 'plan_direction_question_added' : 'plan_direction_review_ready',
      planId: plan.planId,
      revision: plan.revision,
      direction: plan.direction,
    },
  }
}

export function failPlanDirectionSynthesis(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record?.direction || record.direction.stage !== 'synthesizing') {
    throw new Error('No plan direction synthesis is active.')
  }
  requireSynthesisRequest(record.direction, input)
  if (record.direction.synthesis?.status === 'failed') {
    return { plan: record, event: null }
  }
  if (record.direction.synthesis?.status !== 'pending') {
    throw new Error('The plan direction synthesis request is not pending.')
  }
  const error = text(input?.error, 1_000) || 'The provider stopped before finalizing the direction.'
  const direction = normalizeDirection({
    ...record.direction,
    revision: record.direction.revision + 1,
    synthesis: { ...record.direction.synthesis, status: 'failed', error },
  })
  const plan = finalizeMutation(paths, record, { direction, lifecycle: 'awaiting_decision' })
  return {
    plan,
    event: { kind: 'plan_direction_synthesis_failed', planId: plan.planId, revision: plan.revision, direction: plan.direction },
  }
}

export function retryPlanDirectionSynthesis(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record?.direction || record.direction.stage !== 'synthesizing') {
    throw new Error('No plan direction synthesis is available to retry.')
  }
  requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  requireDirectionRevision(record.direction, input?.expected_direction_revision ?? input?.expectedDirectionRevision)
  if (record.direction.synthesis?.status === 'pending') {
    return { plan: record, action: buildPlanDirectionAction(record.direction), event: null }
  }
  if (record.direction.synthesis?.status !== 'failed') {
    throw new Error('Only a failed direction synthesis can be retried.')
  }
  let direction = normalizeDirection({
    ...record.direction,
    revision: record.direction.revision + 1,
    synthesis: null,
  })
  direction = normalizeDirection({
    ...direction,
    synthesis: createSynthesisRequest(direction, `plan_direction_${crypto.randomUUID()}`),
  })
  const plan = finalizeMutation(paths, record, { direction, lifecycle: 'awaiting_decision' })
  return {
    plan,
    action: buildPlanDirectionAction(plan.direction),
    event: { kind: 'plan_direction_synthesis_retrying', planId: plan.planId, revision: plan.revision, direction: plan.direction },
  }
}

export function changePlanDirection(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record?.direction || record.direction.stage !== 'review') {
    throw new Error('Only a direction ready for review can be changed.')
  }
  requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  requireDirectionRevision(record.direction, input?.expected_direction_revision ?? input?.expectedDirectionRevision)
  const feedbackText = text(input?.feedback, 1_200)
  if (!feedbackText) throw new Error('Direction feedback is required.')
  let direction = normalizeDirection({
    ...record.direction,
    revision: record.direction.revision + 1,
    stage: 'synthesizing',
    incorporatedAnswerIds: [],
    feedback: [...record.direction.feedback, {
      id: `feedback_${crypto.randomUUID()}`,
      text: feedbackText,
      createdAt: new Date().toISOString(),
      sourceDirectionRevision: record.direction.revision,
    }],
    synthesis: null,
  })
  direction = normalizeDirection({
    ...direction,
    synthesis: createSynthesisRequest(direction, `plan_direction_${crypto.randomUUID()}`),
  })
  const plan = finalizeMutation(paths, record, { direction, lifecycle: 'awaiting_decision' })
  return {
    plan,
    action: buildPlanDirectionAction(plan.direction),
    event: { kind: 'plan_direction_change_requested', planId: plan.planId, revision: plan.revision, direction: plan.direction },
  }
}

function requireDirectionRevision(direction = null, expectedRevision = undefined) {
  const expected = Number(expectedRevision)
  if (!Number.isInteger(expected) || expected < 1) throw new Error('expected_direction_revision is required for profile selection.')
  const actual = Number(direction?.revision || 0)
  if (expected !== actual) {
    throw new Error(`Stale direction revision: expected ${expected}, current direction revision is ${actual}. Re-read the direction before retrying.`)
  }
}

export function selectPlanAuthoringProfile(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record?.direction) throw new Error('No accepted plan direction exists to create a plan from.')
  requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  requireDirectionRevision(record.direction, input?.expected_direction_revision ?? input?.expectedDirectionRevision)
  if (record.direction.questions.some((question) => !question.answer)) {
    throw new Error('Answer every direction question before selecting a plan profile.')
  }
  if (record.direction.stage !== 'review' || record.direction.synthesis?.status === 'pending') {
    throw new Error('A synthesized direction must be ready for review before selecting a plan profile.')
  }
  const resolved = resolvePlanAuthoringProfile({
    selectedProfile: input?.selected_profile ?? input?.selectedProfile,
    recommendation: record.direction.recommendation,
    direction: record.direction,
  })
  const plan = finalizeMutation(paths, record, {
    lifecycle: 'drafting',
    profile: {
      ...resolved.selectedProfile,
      selectedProfile: resolved.selectedProfile.id,
      directionRevision: record.direction.revision,
    },
  })
  return {
    plan,
    draftingContext: resolved,
    event: {
      kind: 'plan_profile_selected',
      planId: plan.planId,
      revision: plan.revision,
      profile: plan.profile,
      directionRevision: record.direction.revision,
    },
  }
}

export function writeManagedPlanDocument(projectRoot, input = {}, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record) throw new Error('No active plan exists. Update the structured plan before writing its document.')
  requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision ?? options.expected_revision)
  if (!record.direction || record.direction.stage !== 'review' || record.direction.questions.some((question) => !question.answer)) {
    throw new Error('An accepted plan direction is required before writing the managed plan document.')
  }
  if (!record.profile || record.profile.directionRevision !== record.direction.revision) {
    throw new Error('A plan-authoring profile selected for the accepted direction is required before writing the managed plan document.')
  }
  const directReviewRevision = record.lifecycle === 'ready_for_review' && options.allowReadyForReviewRevision === true
  if (record.lifecycle !== 'drafting' && record.lifecycle !== 'revising' && !directReviewRevision) {
    throw new Error('Only a plan in the drafting or revising lifecycle can write the managed plan document.')
  }
  if (record.lifecycle === 'revising' && record.review?.submission?.status !== 'pending') {
    throw new Error('The managed plan revision request is no longer pending.')
  }
  const content = String(input?.content ?? input?.markdown ?? '').trim()
  if (!content) throw new Error('plan_document_write requires Markdown content.')
  const nextRevision = Number(record.revision || 0) + 1
  const filePath = documentFilePath(paths, record.planId)
  const document = { kind: 'managed_plan', planId: record.planId, filePath, revision: nextRevision }
  const plan = buildMutation(record, {
    document,
    lifecycle: 'ready_for_review',
    review: record.lifecycle === 'revising' || directReviewRevision ? { pendingChanges: [], submission: null } : record.review,
  })
  const journalPath = documentCommitJournalPath(paths)
  atomicWrite(journalPath, `${JSON.stringify({
    version: 1,
    kind: 'plan_document_commit',
    planId: record.planId,
    priorRevision: record.revision,
    content: `${content}\n`,
    nextRecord: plan,
  }, null, 2)}\n`)
  recoverPendingDocumentCommit(paths)
  return {
    plan,
    document: { ...document, content },
    event: { kind: 'plan_document_ready', planId: plan.planId, revision: plan.revision, document },
  }
}

const planReviewOperations = createPlanReviewOperations({
  readRecord,
  requireRevision,
  finalizeMutation,
})

export const {
  addPlanReviewChange,
  beginPlanReviewRevision,
  failPlanReviewRevision,
  implementManagedPlan,
  removePlanReviewChange,
} = planReviewOperations

export const approvePlan = implementManagedPlan

export function readManagedPlanDocument(projectRoot, options = {}) {
  const { paths, record } = readRecord(projectRoot, options)
  if (!record?.document?.filePath) return { ok: false, error: 'plan_document_not_found' }
  if (options.planId && normalizePlanId(options.planId, { required: true }) !== record.planId) {
    return { ok: false, error: 'plan_document_not_found' }
  }
  try {
    const content = fs.readFileSync(documentFilePath(paths, record.planId), 'utf8')
    return {
      ok: true,
      planId: record.planId,
      revision: record.revision,
      lifecycle: record.lifecycle,
      review: normalizePlanReview(record.review),
      name: 'Plan.md',
      content,
      document: { ...record.document },
    }
  } catch {
    return { ok: false, error: 'plan_document_unavailable' }
  }
}
