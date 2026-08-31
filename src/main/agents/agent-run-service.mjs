import { randomUUID } from 'node:crypto'

const COMPLETION_CONSUMERS = Object.freeze(['blocking_waiter', 'automatic_wake'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function getAttemptGraph(repository, runId, attemptId) {
  const graph = repository.getRunGraph(runId)
  if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
  const attempt = graph.attempts.find((candidate) => candidate.id === attemptId)
  if (!attempt) throw new TypeError(`Agent attempt ${attemptId} was not found`)
  const node = graph.nodes.find((candidate) => candidate.id === attempt.nodeId)
  if (!node) throw new TypeError(`Agent node ${attempt.nodeId} was not found`)
  return { graph, attempt, node }
}

function requireReservation(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be non-negative`)
  return value
}

export function createAgentCompletionLeaseStore(db, { now = Date.now } = {}) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agent_completion_leases (
      attempt_id, run_id, node_id, consumer, acquired_at
    )
    SELECT id, run_id, node_id, ?, ?
    FROM agent_attempts WHERE id = ?
  `)
  const find = db.prepare(`
    SELECT consumer FROM agent_completion_leases WHERE attempt_id = ?
  `)

  function acquire({ attemptId, consumer }) {
    if (!COMPLETION_CONSUMERS.includes(consumer)) {
      throw new TypeError(`Unsupported completion consumer: ${consumer}`)
    }
    const changes = insert.run(consumer, now(), attemptId).changes
    const existing = find.get(attemptId)
    if (!existing) throw new TypeError(`Agent attempt ${attemptId} was not found`)
    return {
      acquired: changes > 0,
      consumer: existing.consumer,
    }
  }

  return Object.freeze({ acquire })
}

export function createAgentRunService(
  db,
  {
    eventStore,
    repository,
    scheduler,
    now = Date.now,
    attemptIdFactory = randomUUID,
  },
) {
  if (!eventStore || !repository || !scheduler) {
    throw new TypeError('eventStore, repository, and scheduler are required')
  }

  function draft(kind, {
    runId,
    nodeId,
    parentNodeId,
    attemptId = null,
    providerCorrelationKey = null,
    payload,
    idempotencySuffix,
  }) {
    return {
      runId,
      nodeId,
      parentNodeId,
      attemptId,
      providerEventId: null,
      providerCorrelationKey,
      idempotencyKey: `${runId}:${kind}:${idempotencySuffix}`,
      kind,
      payload,
      createdAt: now(),
    }
  }

  function statusDraft(entity, from, to, snapshot, attempt = null) {
    const runId = snapshot.runId || snapshot.id
    const nodeId = entity === 'run' ? snapshot.rootNodeId : snapshot.nodeId || snapshot.id
    const parentNodeId = entity === 'node' ? snapshot.parentNodeId : null
    const attemptId = entity === 'attempt' ? snapshot.id : attempt?.id || null
    return draft('agent_status_changed', {
      runId,
      nodeId,
      parentNodeId,
      attemptId,
      providerCorrelationKey: attempt?.providerCorrelationKey || null,
      payload: { entity, from, to, snapshot },
      idempotencySuffix: `${entity}:${snapshot.id}:${attempt?.id || 'none'}:${from}:${to}`,
    })
  }

  function queueAttempt(input) {
    const { node, attempt, schedulerEntry, ownershipEvents = [], createOwnership = null } = input
    return scheduler.enqueueWithOwnership(schedulerEntry, () => {
      eventStore.appendMany([...ownershipEvents, draft('agent_attempt_queued', {
        runId: attempt.runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        attemptId: attempt.id,
        providerCorrelationKey: attempt.providerCorrelationKey,
        payload: { attemptId: attempt.id, node, attempt },
        idempotencySuffix: attempt.id,
      })])
      createOwnership?.()
    })
  }

  const claimTransaction = db.transaction(() => {
    const entry = scheduler.claimNext()
    if (!entry) return null
    const { attempt, node } = getAttemptGraph(repository, entry.runId, entry.attemptId)
    const startedAt = now()
    const resumed = attempt.status === 'waiting' && node.status === 'waiting'
    if (resumed) {
      const runningNode = {
        ...node,
        status: 'running',
        finishedAt: null,
      }
      const runningAttempt = {
        ...attempt,
        status: 'running',
        finishedAt: null,
      }
      eventStore.appendMany([
        statusDraft('node', node.status, 'running', runningNode, runningAttempt),
        statusDraft('attempt', attempt.status, 'running', runningAttempt, runningAttempt),
      ])
      return { ...entry, resumed: true }
    }
    const startingNode = {
      ...node,
      status: 'starting',
      attemptId: attempt.id,
      startedAt: node.startedAt ?? startedAt,
      finishedAt: null,
    }
    const startingAttempt = {
      ...attempt,
      status: 'starting',
      startedAt: attempt.startedAt ?? startedAt,
      finishedAt: null,
    }
    eventStore.appendMany([
      statusDraft('node', node.status, 'starting', startingNode, startingAttempt),
      statusDraft('attempt', attempt.status, 'starting', startingAttempt, startingAttempt),
    ])
    return { ...entry, resumed: false }
  })

  function claimNext() {
    return claimTransaction()
  }

  const failTransaction = db.transaction((input) => {
    const schedulerEntry = scheduler.get(input.attemptId)
    if (!schedulerEntry) throw new TypeError(`Scheduled attempt ${input.attemptId} was not found`)
    const { attempt, node } = getAttemptGraph(repository, schedulerEntry.runId, input.attemptId)
    if (TERMINAL_STATUSES.has(attempt.status)) {
      return { failed: false, reason: 'already_terminal' }
    }
    const failedAttempt = {
      ...attempt,
      status: 'failed',
      reconciliationState: 'matched',
      finishedAt: now(),
      stopReason: input.retryable ? 'retryable_failure' : 'failed',
      errorCode: input.errorCode || 'AGENT_ATTEMPT_FAILED',
    }
    if (input.retryable) {
      const waitingNode = {
        ...node,
        status: 'waiting',
        finishedAt: null,
        errorSummary: input.errorSummary,
      }
      eventStore.appendMany([
        statusDraft('attempt', attempt.status, 'failed', failedAttempt, failedAttempt),
        statusDraft('node', node.status, 'waiting', waitingNode, failedAttempt),
      ])
    } else {
      const failedNode = {
        ...node,
        status: 'failed',
        finishedAt: now(),
        errorSummary: input.errorSummary,
      }
      eventStore.append(draft('agent_failed', {
        runId: attempt.runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        attemptId: attempt.id,
        providerCorrelationKey: attempt.providerCorrelationKey,
        payload: {
          errorSummary: input.errorSummary,
          node: failedNode,
          attempt: failedAttempt,
        },
        idempotencySuffix: attempt.id,
      }))
    }
    scheduler.complete(input.attemptId)
    return { failed: true, retryable: input.retryable === true }
  })

  function failAttempt(input) {
    return failTransaction(input)
  }

  const completeTransaction = db.transaction((input) => {
    const schedulerEntry = scheduler.get(input.attemptId)
    if (!schedulerEntry) throw new TypeError(`Scheduled attempt ${input.attemptId} was not found`)
    const { attempt, node } = getAttemptGraph(repository, schedulerEntry.runId, input.attemptId)
    if (TERMINAL_STATUSES.has(attempt.status)) {
      return { completed: false, reason: 'already_terminal' }
    }
    const finishedAt = now()
    const completedAttempt = {
      ...attempt,
      status: 'completed',
      reconciliationState: 'matched',
      finishedAt,
      stopReason: 'completed',
      errorCode: null,
      usage: input.usage ?? null,
    }
    const completedNode = {
      ...node,
      status: 'completed',
      finishedAt,
      exclusiveUsage: input.usage ?? null,
      resultSummary: input.resultSummary,
      errorSummary: null,
    }
    eventStore.append(draft('agent_completed', {
      runId: attempt.runId,
      nodeId: node.id,
      parentNodeId: node.parentNodeId,
      attemptId: attempt.id,
      providerCorrelationKey: attempt.providerCorrelationKey,
      payload: {
        resultSummary: input.resultSummary,
        node: completedNode,
        attempt: completedAttempt,
      },
      idempotencySuffix: attempt.id,
    }))
    scheduler.complete(input.attemptId)
    return { completed: true }
  })

  function completeAttempt(input) {
    return completeTransaction(input)
  }

  function retryNode({
    runId,
    nodeId,
    reservations,
    attemptId = null,
    workspaceLease = null,
    createOwnership = null,
  }) {
    const graph = repository.getRunGraph(runId)
    if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
    const node = graph.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) throw new TypeError(`Agent node ${nodeId} was not found`)
    const attempts = graph.attempts
      .filter((attempt) => attempt.nodeId === nodeId)
      .sort((left, right) => left.attemptNumber - right.attemptNumber)
    const previous = attempts.at(-1)
    if (!previous || previous.status !== 'failed' || node.status !== 'waiting') {
      throw new TypeError(`Agent node ${nodeId} has no retryable failed attempt`)
    }
    const attempt = {
      ...previous,
      id: attemptId || attemptIdFactory(),
      attemptNumber: previous.attemptNumber + 1,
      providerRequestId: null,
      providerCorrelationKey: null,
      reconciliationState: 'pending_match',
      status: 'queued',
      startedAt: null,
      finishedAt: null,
      stopReason: null,
      errorCode: null,
      usage: null,
      recoveryOfAttemptId: previous.id,
      workspaceId: workspaceLease?.workspaceId || previous.workspaceId,
      workspaceMode: workspaceLease?.workspaceMode || previous.workspaceMode,
    }
    const queuedNode = {
      ...node,
      status: 'queued',
      attemptId: attempt.id,
      finishedAt: null,
      errorSummary: null,
      workspaceId: attempt.workspaceId,
      workspaceMode: attempt.workspaceMode,
    }
    const admission = queueAttempt({
      node: queuedNode,
      attempt,
      schedulerEntry: {
        attemptId: attempt.id,
        runId,
        nodeId,
        parentNodeId: node.parentNodeId,
        projectId: graph.run.projectId,
        threadId: graph.run.threadId,
        providerId: node.providerId,
        depth: node.depth,
        tokenReservation: requireReservation(reservations.tokenReservation, 'tokenReservation'),
        costReservationUsd: requireReservation(reservations.costReservationUsd, 'costReservationUsd'),
        toolCallReservation: requireReservation(reservations.toolCallReservation, 'toolCallReservation'),
        createdAt: now(),
      },
      createOwnership,
    })
    if (!admission.admitted) {
      const finishedAt = now()
      const failedNode = {
        ...node,
        status: 'failed',
        finishedAt,
        errorSummary: `Retry admission rejected: ${admission.reason}`,
      }
      eventStore.append(draft('agent_failed', {
        runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        attemptId: previous.id,
        providerCorrelationKey: previous.providerCorrelationKey,
        payload: {
          errorSummary: failedNode.errorSummary,
          node: failedNode,
          attempt: previous,
        },
        idempotencySuffix: `${previous.id}:retry-rejected`,
      }))
    }
    return { ...admission, attemptId: attempt.id }
  }

  function listCancellableAttemptIds({ scope, runId, targetNodeId = null }) {
    const graph = repository.getRunGraph(runId)
    if (!graph) return []
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
    const activeAttempts = graph.attempts.filter((attempt) => !TERMINAL_STATUSES.has(attempt.status))
    const activeByNode = new Map(activeAttempts.map((attempt) => [attempt.nodeId, attempt]))

    function selected(node, attempt) {
      if (scope === 'run') return true
      if (node.id === targetNodeId) return true
      if (scope === 'node' || !node.branchPath.includes(targetNodeId)) return false
      if (scope === 'subtree') return true
      const targetIndex = node.branchPath.indexOf(targetNodeId)
      for (const lineageNodeId of node.branchPath.slice(targetIndex + 1)) {
        const lineageAttempt = activeByNode.get(lineageNodeId)
        if (lineageAttempt && lineageAttempt.backgroundKind !== 'foreground') return false
      }
      return attempt.backgroundKind === 'foreground'
    }

    return activeAttempts
      .filter((attempt) => {
        const node = nodes.get(attempt.nodeId)
        return node && selected(node, attempt)
      })
      .map((attempt) => attempt.id)
  }

  const cancelTransaction = db.transaction((attemptIds, input) => {
    const graphs = new Map()
    const cancelled = []
    if (input.scope === 'run') {
      const graph = repository.getRunGraph(input.runId)
      if (graph && !TERMINAL_STATUSES.has(graph.run.status) && graph.run.status !== 'cancelling') {
        const cancellingRun = { ...graph.run, status: 'cancelling', finishedAt: null }
        eventStore.append(statusDraft(
          'run',
          graph.run.status,
          'cancelling',
          cancellingRun,
        ))
      }
    }
    for (const attemptId of attemptIds) {
      const schedulerEntry = scheduler.get(attemptId)
      const runId = schedulerEntry?.runId || input.runId
      if (!graphs.has(runId)) graphs.set(runId, repository.getRunGraph(runId))
      const graph = graphs.get(runId)
      const attempt = graph?.attempts.find((candidate) => candidate.id === attemptId)
      const node = graph?.nodes.find((candidate) => candidate.id === attempt?.nodeId)
      if (!attempt || !node || TERMINAL_STATUSES.has(attempt.status)) continue
      const cancellingAttempt = { ...attempt, status: 'cancelling', finishedAt: null }
      const cancellingNode = { ...node, status: 'cancelling', finishedAt: null }
      eventStore.appendMany([
        statusDraft('attempt', attempt.status, 'cancelling', cancellingAttempt, cancellingAttempt),
        statusDraft('node', node.status, 'cancelling', cancellingNode, cancellingAttempt),
      ])
      const finishedAt = now()
      const cancelledAttempt = {
        ...cancellingAttempt,
        status: 'cancelled',
        reconciliationState: 'matched',
        finishedAt,
        stopReason: input.reason,
      }
      const cancelledNode = {
        ...cancellingNode,
        status: 'cancelled',
        finishedAt,
        resultSummary: null,
      }
      eventStore.append(draft('agent_cancelled', {
        runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        attemptId,
        providerCorrelationKey: attempt.providerCorrelationKey,
        payload: {
          scope: input.scope,
          node: cancelledNode,
          attempt: cancelledAttempt,
        },
        idempotencySuffix: `${input.scope}:${attemptId}`,
      }))
      cancelled.push(attemptId)
    }
    scheduler.removeAttempts(cancelled)
    if (input.scope === 'run') {
      const graph = repository.getRunGraph(input.runId)
      if (graph?.run.status === 'cancelling') {
        const cancelledRun = {
          ...graph.run,
          status: 'cancelled',
          activeNodeCount: 0,
          queuedNodeCount: 0,
          finishedAt: now(),
          completionReason: input.reason,
        }
        eventStore.append(draft('agent_run_cancelled', {
          runId: input.runId,
          nodeId: graph.run.rootNodeId,
          parentNodeId: null,
          payload: {
            completionReason: input.reason,
            run: cancelledRun,
          },
          idempotencySuffix: input.runId,
        }))
      }
    }
    return cancelled
  })

  function cancelAttempts(attemptIds, input) {
    return cancelTransaction(attemptIds, input)
  }

  function orphanAttempt(attemptId, { reason = 'scheduler_lease_expired' } = {}) {
    return failAttempt({
      attemptId,
      errorSummary: reason === 'runtime_ownership_unrecoverable'
        ? 'Agent execution could not be recovered after the runtime restarted.'
        : 'Agent controller lease expired before a terminal result was observed.',
      errorCode: 'AGENT_ORPHANED',
      retryable: false,
    })
  }

  return Object.freeze({
    cancelAttempts,
    claimNext,
    completeAttempt,
    failAttempt,
    listCancellableAttemptIds,
    orphanAttempt,
    queueAttempt,
    retryNode,
  })
}
