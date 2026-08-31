import crypto from 'node:crypto'

const MAX_REVIEW_CHANGES = 20
const MAX_REVIEW_BLOCK_ID_LENGTH = 240
const MAX_REVIEW_BLOCK_KIND_LENGTH = 40
const MAX_REVIEW_BLOCK_TEXT_LENGTH = 4_000
const MAX_REVIEW_INSTRUCTION_LENGTH = 2_000

function text(value = '', maxLength = 0) {
  const normalized = String(value || '').trim()
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized
}

function normalizeReviewChange(raw = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id, 128)
  const instruction = text(raw.instruction, MAX_REVIEW_INSTRUCTION_LENGTH)
  if (!id || !instruction) return null
  return {
    id,
    headingAnchor: text(raw.headingAnchor || raw.heading_anchor, 240),
    blockId: text(raw.blockId || raw.block_id, MAX_REVIEW_BLOCK_ID_LENGTH),
    blockKind: text(raw.blockKind || raw.block_kind, MAX_REVIEW_BLOCK_KIND_LENGTH)
      || (raw.selectedText || raw.selected_text ? 'legacy' : ''),
    blockText: text(
      raw.blockText || raw.block_text || raw.selectedText || raw.selected_text,
      MAX_REVIEW_BLOCK_TEXT_LENGTH,
    ),
    instruction,
    createdAt: text(raw.createdAt || raw.created_at) || null,
  }
}

export function normalizePlanReview(raw = null) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const pendingChanges = (Array.isArray(source.pendingChanges) ? source.pendingChanges : [])
    .map(normalizeReviewChange)
    .filter(Boolean)
    .slice(0, MAX_REVIEW_CHANGES)
  const submissionSource = source.submission && typeof source.submission === 'object'
    && !Array.isArray(source.submission) ? source.submission : null
  const status = text(submissionSource?.status, 32).toLowerCase()
  const requestId = text(submissionSource?.requestId || submissionSource?.request_id, 160)
  const submission = requestId && (status === 'pending' || status === 'failed')
    ? {
        requestId,
        status,
        sourceRevision: Math.max(0, Number(submissionSource?.sourceRevision || 0) || 0),
        error: text(submissionSource?.error, 1_000),
      }
    : null
  return { pendingChanges, submission }
}

export function recoverLegacyPlanReviewLifecycle(lifecycle = '', review = null) {
  return lifecycle === 'approved' && normalizePlanReview(review).pendingChanges.length > 0
    ? 'ready_for_review'
    : lifecycle
}

export function createPlanReviewOperations({ readRecord, requireRevision, finalizeMutation } = {}) {
  function addPlanReviewChange(projectRoot, input = {}, options = {}) {
    const { paths, record } = readRecord(projectRoot, options)
    if (!record?.document) throw new Error('No managed plan document exists to review.')
    requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision)
    if (record.lifecycle !== 'ready_for_review') {
      throw new Error('Review changes can only be added while the plan is ready for review.')
    }
    const instruction = text(input?.instruction, MAX_REVIEW_INSTRUCTION_LENGTH)
    if (!instruction) throw new Error('A review change instruction is required.')
    const blockId = text(input?.block_id ?? input?.blockId, MAX_REVIEW_BLOCK_ID_LENGTH)
    const blockKind = text(input?.block_kind ?? input?.blockKind, MAX_REVIEW_BLOCK_KIND_LENGTH)
    const blockText = text(input?.block_text ?? input?.blockText, MAX_REVIEW_BLOCK_TEXT_LENGTH)
    if (!blockId || !blockKind || !blockText) {
      throw new Error('A semantic plan block target is required for every review change.')
    }
    if (record.review.pendingChanges.length >= MAX_REVIEW_CHANGES) {
      throw new Error(`A managed plan may have at most ${MAX_REVIEW_CHANGES} pending review changes.`)
    }
    const change = normalizeReviewChange({
      id: `plan_change_${crypto.randomUUID()}`,
      headingAnchor: input?.heading_anchor ?? input?.headingAnchor,
      blockId,
      blockKind,
      blockText,
      instruction,
      createdAt: new Date().toISOString(),
    })
    const plan = finalizeMutation(paths, record, {
      review: { pendingChanges: [...record.review.pendingChanges, change], submission: null },
    })
    return { plan, change }
  }

  function removePlanReviewChange(projectRoot, input = {}, options = {}) {
    const { paths, record } = readRecord(projectRoot, options)
    if (!record?.document) throw new Error('No managed plan document exists to review.')
    requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision)
    if (record.lifecycle !== 'ready_for_review') {
      throw new Error('Review changes can only be removed while the plan is ready for review.')
    }
    const changeId = text(input?.change_id || input?.changeId, 128)
    if (!changeId) throw new Error('A review change ID is required.')
    const pendingChanges = record.review.pendingChanges.filter((change) => change.id !== changeId)
    if (pendingChanges.length === record.review.pendingChanges.length) {
      throw new Error('The review change no longer exists.')
    }
    const plan = finalizeMutation(paths, record, {
      review: { pendingChanges, submission: null },
    })
    return { plan }
  }

  function beginPlanReviewRevision(projectRoot, input = {}, options = {}) {
    const { paths, record } = readRecord(projectRoot, options)
    if (!record?.document) throw new Error('No managed plan document exists to revise.')
    requireRevision(record, input?.expected_revision ?? input?.expectedRevision ?? options.expectedRevision)
    if (record.lifecycle !== 'ready_for_review') {
      throw new Error('Only a plan ready for review can submit review changes.')
    }
    if (record.review.pendingChanges.length === 0) throw new Error('There are no pending review changes to submit.')
    const requestId = `plan_revision_${crypto.randomUUID()}`
    const plan = finalizeMutation(paths, record, {
      lifecycle: 'revising',
      review: {
        pendingChanges: record.review.pendingChanges,
        submission: { requestId, status: 'pending', sourceRevision: record.revision, error: '' },
      },
    })
    return {
      plan,
      action: {
        kind: 'revise_plan', planId: plan.planId, requestId,
        expectedRevision: plan.revision,
        expectedDirectionRevision: plan.direction?.revision || 0,
      },
      event: { kind: 'plan_review_revision_started', planId: plan.planId, revision: plan.revision },
    }
  }

  function failPlanReviewRevision(projectRoot, input = {}, options = {}) {
    const { paths, record } = readRecord(projectRoot, options)
    if (!record?.document) throw new Error('No managed plan document exists to revise.')
    const requestId = text(input?.request_id || input?.requestId, 160)
    if (record.lifecycle !== 'revising' || record.review?.submission?.requestId !== requestId) {
      throw new Error('The managed plan revision request is stale or unknown.')
    }
    const plan = finalizeMutation(paths, record, {
      lifecycle: 'ready_for_review',
      review: {
        pendingChanges: record.review.pendingChanges,
        submission: {
          ...record.review.submission,
          status: 'failed',
          error: text(input?.error, 1_000) || 'The provider stopped before revising the managed plan.',
        },
      },
    })
    return {
      plan,
      event: { kind: 'plan_review_revision_failed', planId: plan.planId, revision: plan.revision },
    }
  }

  function implementManagedPlan(projectRoot, input = {}, options = {}) {
    const { paths, record } = readRecord(projectRoot, options)
    if (!record?.document) throw new Error('No managed plan document exists to implement.')
    requireRevision(record, input?.expected_revision ?? options.expectedRevision)
    if (record.lifecycle !== 'ready_for_review' && record.lifecycle !== 'approved') {
      throw new Error('Only a plan ready for review can be implemented.')
    }
    if (record.review.pendingChanges.length > 0) {
      throw new Error('Submit or remove pending review changes before implementation.')
    }
    const acceptedRevision = record.revision
    const plan = record.lifecycle === 'approved'
      ? record
      : finalizeMutation(paths, record, { lifecycle: 'approved' })
    return {
      plan,
      handoff: { planId: plan.planId, revision: acceptedRevision, threadId: plan.threadId },
    }
  }

  return {
    addPlanReviewChange,
    beginPlanReviewRevision,
    failPlanReviewRevision,
    implementManagedPlan,
    removePlanReviewChange,
  }
}
