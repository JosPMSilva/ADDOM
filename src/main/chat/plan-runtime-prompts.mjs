import { resolvePlanAuthoringProfile } from './plan-authoring-profiles.mjs'
import { formatPlanDirectionAnswer } from './plan-direction-state.mjs'
import { readManagedPlanDocument, readPlanState } from './plan-runtime-state.mjs'

function text(value = '', maxLength = 0) {
  const normalized = String(value || '').trim()
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized
}

function requireRevision(plan, expectedRevision) {
  const expected = Number(expectedRevision)
  const actual = Number(plan?.revision || 0)
  if (!Number.isInteger(expected) || expected < 0 || expected !== actual) {
    throw new Error(`Stale plan revision: expected ${expectedRevision}, current revision is ${actual}. Re-read the plan before retrying.`)
  }
}

function requireDirectionRevision(direction, expectedRevision) {
  const expected = Number(expectedRevision)
  const actual = Number(direction?.revision || 0)
  if (!Number.isInteger(expected) || expected < 1 || expected !== actual) {
    throw new Error(`Stale direction revision: expected ${expectedRevision}, current direction revision is ${actual}. Re-read the direction before retrying.`)
  }
}

function requireAnswerRevision(direction, expectedRevision) {
  const expected = Number(expectedRevision)
  const actual = Number(direction?.answerRevision || 0)
  if (!Number.isInteger(expected) || expected < 0 || expected !== actual) {
    throw new Error(`Stale answer revision: expected ${expectedRevision}, current answer revision is ${actual}. Re-read the direction before retrying.`)
  }
}

function requireSynthesisRequest(direction, requestId) {
  if (!requestId || direction?.synthesis?.requestId !== requestId) {
    throw new Error('The plan direction synthesis request is stale or unknown.')
  }
}

export function buildActivePlanDecisionPrompt(projectRoot, {
  threadId = '', mode = '', ...storageOptions
} = {}) {
  if (text(mode).toLowerCase() !== 'plan') return ''
  const { plan } = readPlanState(projectRoot, { threadId, ...storageOptions })
  if (plan.lifecycle !== 'awaiting_decision' || !plan.direction) return ''
  const answers = plan.direction.questions
    .filter((question) => question.answer)
    .map((question) => `- ${question.header || question.question}: ${formatPlanDirectionAnswer(question.answer)}`)
  const feedback = plan.direction.feedback.map((entry) => `- ${entry.text}`)
  return [
    '[ADDOM Active Plan Direction]',
    `Plan ID: ${plan.planId}`,
    `Plan revision: ${plan.revision}`,
    `Direction revision: ${plan.direction.revision}`,
    `Answer revision: ${plan.direction.answerRevision}`,
    `Direction stage: ${plan.direction.stage}`,
    `Current direction: ${plan.direction.summary}`,
    ...(answers.length > 0 ? ['Accepted answers:', ...answers] : []),
    ...(feedback.length > 0 ? ['Requested changes:', ...feedback] : []),
    'Treat these durable choices as authoritative. Do not silently discard or reinterpret them.',
  ].join('\n')
}

export function buildPlanActionPrompt(projectRoot, {
  threadId = '', mode = '', action = null, ...storageOptions
} = {}) {
  if (text(mode).toLowerCase() !== 'plan' || !action || typeof action !== 'object') return ''
  const { plan } = readPlanState(projectRoot, { threadId, ...storageOptions })
  const kind = text(action.kind, 40).toLowerCase()
  if (!plan.planId || text(action.planId, 128) !== plan.planId) {
    throw new Error('The typed Plan action targets a stale or unknown plan.')
  }
  requireRevision(plan, action.expectedRevision)
  requireDirectionRevision(plan.direction, action.expectedDirectionRevision)
  if (kind === 'synthesize_direction') {
    requireAnswerRevision(plan.direction, action.expectedAnswerRevision)
    requireSynthesisRequest(plan.direction, action.requestId)
    if (plan.direction.stage !== 'synthesizing' || plan.direction.synthesis?.status !== 'pending') {
      throw new Error('The typed direction synthesis action is no longer pending.')
    }
    const answers = plan.direction.questions
      .filter((question) => question.answer)
      .map((question) => `- ${question.id}: ${formatPlanDirectionAnswer(question.answer)}`)
    const feedback = plan.direction.feedback.map((entry) => `- ${entry.text}`)
    return [
      '[ADDOM Internal Plan Direction Synthesis]',
      'This is a transcript-quiet typed lifecycle action, not a new user request.',
      `Plan ID: ${plan.planId}`,
      `Expected plan revision: ${plan.revision}`,
      `Expected direction revision: ${plan.direction.revision}`,
      `Expected answer revision: ${plan.direction.answerRevision}`,
      `Synthesis request ID: ${plan.direction.synthesis.requestId}`,
      `Provisional direction: ${plan.direction.summary}`,
      ...(answers.length > 0 ? ['Durable answers that must all be incorporated:', ...answers] : []),
      ...(feedback.length > 0 ? ['Requested direction changes that must be incorporated:', ...feedback] : []),
      'Synthesize one concise review-ready direction, then call plan_direction_finalize exactly once.',
      'Pass every answered question ID as incorporated_answer_ids and the exact revisions and request ID above.',
      'If one genuinely new decision is still required, include exactly one next_question; otherwise publish review directly.',
      'Do not emit a user-facing final answer. The durable Direction Card is the review surface.',
    ].join('\n')
  }
  if (kind === 'draft_plan') {
    if (plan.lifecycle !== 'drafting' || !plan.profile?.selectedProfile || plan.direction?.stage !== 'review') {
      throw new Error('The typed plan drafting action is no longer valid.')
    }
    return [
      '[ADDOM Internal Managed Plan Draft]',
      'This is a transcript-quiet typed lifecycle action, not a new user request.',
      `Plan ID: ${plan.planId}`,
      `Expected plan revision: ${plan.revision}`,
      `Accepted direction revision: ${plan.direction.revision}`,
      'Create the complete managed Markdown plan with the selected bundled profile.',
      'Call plan_document_write with the exact current plan revision when the document is complete.',
      'Do not ask for another confirmation and do not emit a user-facing final answer.',
    ].join('\n')
  }
  if (kind === 'revise_plan') {
    if (plan.lifecycle !== 'revising' || plan.review?.submission?.status !== 'pending') {
      throw new Error('The typed managed plan revision action is no longer pending.')
    }
    if (!action.requestId || action.requestId !== plan.review.submission.requestId) {
      throw new Error('The typed managed plan revision action is stale or unknown.')
    }
    const document = readManagedPlanDocument(projectRoot, {
      threadId, planId: plan.planId, ...storageOptions,
    })
    if (document.ok !== true) throw new Error('The managed plan document is unavailable for revision.')
    const changes = plan.review.pendingChanges.map((change, index) => [
      `${index + 1}. Instruction: ${change.instruction}`,
      ...(change.blockKind || change.blockId
        ? [`   Target block: ${change.blockKind || 'block'}${change.blockId ? ` (${change.blockId})` : ''}`]
        : []),
      ...(change.headingAnchor ? [`   Section: ${change.headingAnchor}`] : []),
      ...(change.blockText ? [`   Block text: ${change.blockText}`] : []),
    ].join('\n'))
    return [
      '[ADDOM Internal Managed Plan Revision]',
      'This is a transcript-quiet typed lifecycle action, not a new user request.',
      `Plan ID: ${plan.planId}`,
      `Expected plan revision: ${plan.revision}`,
      `Revision request ID: ${plan.review.submission.requestId}`,
      'Apply every pending review change to the same managed Plan.md document.',
      'Preserve unaffected sections and the accepted direction. Do not create a second plan document.',
      'Pending review changes:',
      ...changes,
      'Current managed Plan.md:',
      document.content,
      'Call plan_document_write exactly once with the complete revised Markdown and the exact current plan revision.',
      'Do not emit a user-facing final answer. The refreshed managed document is the review surface.',
    ].join('\n')
  }
  throw new Error('Unknown typed Plan action.')
}

export function buildActivePlanAuthoringPrompt(projectRoot, {
  threadId = '', mode = '', ...storageOptions
} = {}) {
  if (text(mode).toLowerCase() !== 'plan') return ''
  const { plan } = readPlanState(projectRoot, { threadId, ...storageOptions })
  if ((plan.lifecycle !== 'drafting' && plan.lifecycle !== 'revising')
    || !plan.profile?.selectedProfile || !plan.direction) return ''
  try {
    const resolved = resolvePlanAuthoringProfile({
      selectedProfile: plan.profile.selectedProfile,
      selectedVersion: plan.profile.version,
      recommendation: plan.direction.recommendation,
      direction: plan.direction,
    })
    if (resolved.selectedProfile.version !== plan.profile.version
      || resolved.selectedProfile.contentHash !== plan.profile.contentHash) return ''
    const answers = plan.direction.questions
      .filter((question) => question.answer)
      .map((question) => `- ${question.header || question.question}: ${formatPlanDirectionAnswer(question.answer)}`)
    return [
      '[ADDOM Selected Plan Authoring Profile]',
      `Profile: ${resolved.selectedProfile.label} (${resolved.selectedProfile.id}, v${resolved.selectedProfile.version}).`,
      `Profile integrity: ${resolved.selectedProfile.contentHash}.`,
      'Follow these bundled instructions for the managed Markdown plan:',
      resolved.instructions,
      `Accepted direction: ${resolved.direction.summary}`,
      ...(answers.length > 0 ? ['Accepted direction answers:', ...answers] : []),
      'The selected profile and accepted direction are authoritative for this drafting turn.',
    ].join('\n')
  } catch {
    return ''
  }
}
