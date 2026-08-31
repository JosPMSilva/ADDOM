import {
  finalizePlanDirectionSynthesis,
  readPlanState,
  replacePlanTasks,
  savePlanDirection,
  updatePlanTask,
  writeManagedPlanDocument,
} from '../chat/plan-runtime-state.mjs'

function toLegacyTodos(plan = null) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : []
  return tasks.map((task) => ({
    id: String(task.id || ''),
    content: String(task.content || ''),
    status: String(task.status || 'pending'),
  }))
}

function planStorageOptions(toolInput = {}, options = {}) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const runtime = options && typeof options === 'object' ? options : {}
  return {
    ...(runtime.threadId ? { threadId: runtime.threadId } : {}),
    ...(runtime.todoScopeKey ? { todoScopeKey: runtime.todoScopeKey } : {}),
    ...(runtime.planScopeKey ? { planScopeKey: runtime.planScopeKey } : {}),
    ...(runtime.userDataPath ? { userDataPath: runtime.userDataPath } : {}),
    ...(runtime.mode === 'plan' ? { allowReadyForReviewRevision: true } : {}),
    ...(input.expected_revision != null ? { expected_revision: input.expected_revision } : {}),
    ...(input.expectedRevision != null ? { expectedRevision: input.expectedRevision } : {}),
  }
}

function rejectToolSuppliedPlanId(toolInput = {}) {
  if (toolInput && typeof toolInput === 'object' && Object.hasOwn(toolInput, 'planId')) {
    throw new Error('Invalid plan ID: planId is runtime-managed and cannot be supplied by a tool call.')
  }
}

export async function todoRead(projectRoot, toolInput = {}, options = {}) {
  const effectiveOptions = planStorageOptions(toolInput, options)
  const { plan, summary } = readPlanState(projectRoot, effectiveOptions)
  const todos = toLegacyTodos(plan)
  return {
    todos,
    summary,
  }
}

export async function todoWrite(projectRoot, toolInput = {}, options = {}) {
  const effectiveOptions = planStorageOptions(toolInput, options)
  const { plan, summary } = replacePlanTasks(projectRoot, toolInput?.todos, effectiveOptions)
  const todos = toLegacyTodos(plan)
  return {
    todos,
    summary,
  }
}

export async function planRead(projectRoot, toolInput = {}, options = {}) {
  const effectiveOptions = planStorageOptions(toolInput, options)
  return readPlanState(projectRoot, effectiveOptions)
}

export async function planUpdate(projectRoot, toolInput = {}, options = {}) {
  return updatePlanTask(projectRoot, toolInput, planStorageOptions(toolInput, options))
}

export async function planDirectionUpdate(projectRoot, toolInput = {}, options = {}) {
  rejectToolSuppliedPlanId(toolInput)
  const effectiveOptions = planStorageOptions(toolInput, options)
  return savePlanDirection(projectRoot, {
    ...toolInput,
    recommendation: {
      recommendedPlanProfile: toolInput?.recommended_plan_profile,
      rationale: toolInput?.recommendation_rationale,
    },
  }, effectiveOptions)
}

export async function planDirectionFinalize(projectRoot, toolInput = {}, options = {}) {
  rejectToolSuppliedPlanId(toolInput)
  return finalizePlanDirectionSynthesis(
    projectRoot,
    toolInput,
    planStorageOptions(toolInput, options),
  )
}

export async function planDocumentWrite(projectRoot, toolInput = {}, options = {}) {
  rejectToolSuppliedPlanId(toolInput)
  return writeManagedPlanDocument(projectRoot, toolInput, planStorageOptions(toolInput, options))
}
