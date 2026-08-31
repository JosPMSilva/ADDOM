import {
  applyDelegationEnvelopeTexts,
  buildDelegationErrorEnvelope,
  summarizeResults,
} from './delegation-summary.mjs'

function clean(value) {
  return String(value ?? '').trim()
}

export function partitionDelegationPreflight(preflight = {}) {
  const tasks = Array.isArray(preflight?.tasks) ? preflight.tasks : []
  const errors = Array.isArray(preflight?.errors) ? preflight.errors : []
  const blockedTaskIds = new Set(
    errors.map((error) => clean(error?.taskId)).filter(Boolean),
  )
  const hasGlobalError = errors.some((error) => !clean(error?.taskId))
  const readyTasks = tasks.filter((task) => !blockedTaskIds.has(clean(task?.task_id)))
  const blockedTasks = tasks.filter((task) => blockedTaskIds.has(clean(task?.task_id)))
  return {
    hasGlobalError,
    readyTasks,
    blockedTasks,
    blockedTaskIds,
    canRunPartial: errors.length > 0
      && !hasGlobalError
      && readyTasks.length > 0
      && blockedTasks.length > 0,
  }
}

export function prepareRunnableDelegationPreflight(rawPreflight = {}) {
  const partition = partitionDelegationPreflight(rawPreflight)
  if (!partition.canRunPartial) {
    return { preflight: rawPreflight, partialPreflight: null }
  }
  return {
    preflight: {
      ...rawPreflight,
      ok: true,
      tasks: partition.readyTasks,
      errors: [],
    },
    partialPreflight: {
      allTasks: rawPreflight.tasks,
      blockedTasks: partition.blockedTasks,
      errors: rawPreflight.errors,
    },
  }
}

export function mergePartialDelegationPreflight({
  executionEnvelope,
  blockedTasks = [],
  allTasks = [],
  errors = [],
  policy = {},
  envelopeMeta = {},
} = {}) {
  const blockedEnvelope = buildDelegationErrorEnvelope({
    ...envelopeMeta,
    policy,
    tasks: blockedTasks,
    errors,
  })
  const executedByTaskId = new Map(
    (Array.isArray(executionEnvelope?.agents) ? executionEnvelope.agents : [])
      .map((agent) => [clean(agent?.taskId), agent]),
  )
  const blockedByTaskId = new Map(
    (Array.isArray(blockedEnvelope?.agents) ? blockedEnvelope.agents : [])
      .map((agent) => [clean(agent?.taskId), agent]),
  )
  const agents = allTasks
    .map((task) => executedByTaskId.get(clean(task?.task_id))
      || blockedByTaskId.get(clean(task?.task_id)))
    .filter(Boolean)
  const summary = summarizeResults(agents)
  const completed = Number(summary.completed || 0)
  const envelope = {
    ...executionEnvelope,
    ...envelopeMeta,
    status: completed > 0 ? 'completed_with_errors' : clean(executionEnvelope?.status || 'failed'),
    taskCount: agents.length,
    requestedTaskCount: Number(executionEnvelope?.requestedTaskCount ?? allTasks.length),
    plannedTaskCount: Number(executionEnvelope?.plannedTaskCount ?? Math.max(0, allTasks.length - blockedTasks.length)),
    admittedTaskCount: Number(executionEnvelope?.admittedTaskCount ?? Math.max(0, agents.length - blockedTasks.length)),
    executedTaskCount: Number(executionEnvelope?.executedTaskCount ?? Math.max(0, agents.length - blockedTasks.length)),
    skippedTaskCount: Number(executionEnvelope?.skippedTaskCount || 0) + blockedTasks.length,
    limitedTaskCount: Number(executionEnvelope?.limitedTaskCount || 0),
    summary,
    agents,
    errors: [
      ...(Array.isArray(executionEnvelope?.errors) ? executionEnvelope.errors : []),
      ...errors,
    ],
    partialSuccess: completed > 0 && completed < agents.length,
    allAgentsFailed: completed === 0,
  }
  applyDelegationEnvelopeTexts(envelope)
  return envelope
}
