import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { getUserDataPath } from '../platform/electron-app.mjs'
import { normalizePlanDirectionQuestions } from './plan-direction-state.mjs'
import { readPlanState, savePlanDirection } from './plan-runtime-state.mjs'

function text(value = '', maxLength = 0) {
  const normalized = String(value || '').trim()
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized
}

function hash(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24)
}

function markerPath(projectRoot = '', options = {}) {
  const project = path.resolve(text(options.projectId || projectRoot || 'global'))
  const threadId = text(options.todoScopeKey || options.planScopeKey || options.threadId || 'global', 256)
  const userDataPath = path.resolve(text(options.userDataPath || getUserDataPath()))
  return path.join(userDataPath, 'managed-plans', `${hash(project)}-${hash(threadId)}`, 'legacy-renderer-plan-migration.json')
}

function readMarker(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

function writeMarker(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, filePath)
  } finally {
    try { fs.rmSync(temporary, { force: true }) } catch { /* best effort */ }
  }
}

function emptyPlan() {
  return {
    tasks: [], revision: 0, updatedAt: null, planId: '', lifecycle: 'exploring', document: null,
    unresolvedQuestionIds: [], direction: null, profile: null, supersedesPlanId: '', supersededByPlanId: '',
  }
}

export function migrateLegacyRendererPlanState(projectRoot, legacyState = {}, options = {}) {
  const filePath = markerPath(projectRoot, options)
  const current = readPlanState(projectRoot, options).plan
  if (readMarker(filePath)) return { migrated: false, reason: 'already_migrated', plan: current }
  if (current.planId) {
    writeMarker(filePath, {
      version: 1, status: 'skipped_active_plan', planId: current.planId, migratedAt: new Date().toISOString(),
    })
    return { migrated: false, reason: 'active_plan_exists', plan: current }
  }

  const source = legacyState && typeof legacyState === 'object' && !Array.isArray(legacyState) ? legacyState : {}
  const canonical = source.canonicalPlan && typeof source.canonicalPlan === 'object' ? source.canonicalPlan : {}
  const baseSummary = text(canonical.summary || source.summary)
  const messageId = text(canonical.messageId, 160)
  const selectedOptionId = text(source.selectedOptionByMessage?.[messageId] || canonical.selectedOptionId, 80)
  const selectedOption = (Array.isArray(canonical.options) ? canonical.options : [])
    .find((option) => text(option?.id, 80) === selectedOptionId)
  const selectedDirection = text(
    source.customDirectionByMessage?.[messageId]
    || canonical.customDirection
    || selectedOption?.title
    || selectedOption?.description,
    240,
  )
  const summary = text([baseSummary, selectedDirection ? `Selected direction: ${selectedDirection}.` : '']
    .filter(Boolean).join('\n'))
  if (!summary) return { migrated: false, reason: 'empty_legacy_state', plan: emptyPlan() }

  const answeredQuestions = source.answeredQuestions && typeof source.answeredQuestions === 'object'
    ? source.answeredQuestions
    : {}
  const questions = normalizePlanDirectionQuestions((Array.isArray(canonical.questions) ? canonical.questions : [])
    .map((question) => ({
      id: question?.id,
      header: question?.header,
      question: question?.text || question?.question,
      answer: answeredQuestions?.[question?.id] || question?.answer,
    })))
  const { plan } = savePlanDirection(projectRoot, { summary, questions, expected_revision: 0 }, options)
  writeMarker(filePath, {
    version: 1, status: 'migrated', sourceHash: hash(JSON.stringify(source)),
    planId: plan.planId, migratedAt: new Date().toISOString(),
  })
  return { migrated: true, reason: 'migrated', plan }
}
