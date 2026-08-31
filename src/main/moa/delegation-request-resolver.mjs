import { resolveMoaRoleKey } from '../../common/moa/moa-role-keys.mjs'
import { scoreRoleForTask } from './role-fit-scoring.mjs'

const DEFAULT_OUTPUT_FORMAT = 'Return concise, actionable output with file references.'
const TASK_TYPE_BY_KIND = Object.freeze({
  research: 'investigation',
  review: 'review',
  implementation: 'implementation',
})
const ALL_CONFIGURED_ROLES = 'all_configured_roles'

function clean(value) {
  return String(value ?? '').trim()
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function unique(values = []) {
  return [...new Set(values.map((entry) => clean(entry)).filter(Boolean))]
}

function normalizedText(value = '') {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeCount(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback
}

function normalizeCompactTask(rawTask = {}, fallbackInstruction = '') {
  const source = asObject(rawTask)
  const kind = clean(source.kind).toLowerCase()
  const paths = Array.isArray(source.paths) ? source.paths.map(clean).filter(Boolean) : []
  const context = clean(source.context)
  const requestedAccess = clean(source.access).toLowerCase() === 'staged_write'
    ? 'staged_write'
    : 'read_only'
  const explicitInstruction = clean(source.instruction)
  const goal = clean(source.goal)
  const instruction = explicitInstruction || goal || context || clean(fallbackInstruction)
  const pathContext = paths.length > 0
    ? `Relevant workspace paths:\n${paths.map((filePath) => `- ${filePath}`).join('\n')}`
    : ''
  const distinctContext = context && context !== instruction ? context : ''
  const instructionOwnedContext = !distinctContext && !pathContext && instruction
    ? 'Task scope and relevant workspace targets are defined by the instruction.'
    : ''
  const task = {
    task_id: clean(source.task_id || source.taskId),
    specialty: clean(source.specialty),
    task_type: clean(source.task_type || source.taskType),
    goal,
    instruction,
    injected_context: [
      distinctContext,
      pathContext,
      instructionOwnedContext,
    ].filter(Boolean).join('\n\n'),
    expected_output_format: clean(source.expected_output_format) || DEFAULT_OUTPUT_FORMAT,
    constraints: unique([
      ...(Array.isArray(source.constraints) ? source.constraints : []),
      requestedAccess,
    ]),
    requested_access: requestedAccess,
  }
  if (kind && kind !== 'auto' && TASK_TYPE_BY_KIND[kind]) {
    task.specialty ||= kind
    task.task_type ||= TASK_TYPE_BY_KIND[kind]
  }
  return task
}

export function normalizeCompactDelegationTasks(rawTasks = [], { fallbackInstruction = '' } = {}) {
  return (Array.isArray(rawTasks) ? rawTasks : [])
    .map((task) => normalizeCompactTask(task, fallbackInstruction))
}

function error(code, message, extra = {}) {
  return { code, message, ...extra }
}

function buildRoleMaps(catalog = {}, moaRoles = []) {
  const configuredByKey = new Map(
    (Array.isArray(moaRoles) ? moaRoles : [])
      .map((role) => [resolveMoaRoleKey(role), role])
      .filter(([key]) => key),
  )
  const catalogRoles = (Array.isArray(catalog?.roles) ? catalog.roles : [])
    .filter((role) => configuredByKey.has(clean(role?.key)))
    .sort((left, right) => clean(left?.key).localeCompare(clean(right?.key)))
  const readyCatalogRoles = catalogRoles.filter((role) => role?.status === 'ready')
  return {
    configuredByKey,
    catalogRoles,
    catalogByKey: new Map(catalogRoles.map((role) => [clean(role?.key), role])),
    readyCatalogRoles,
    readyByKey: new Map(readyCatalogRoles.map((role) => [clean(role?.key), role])),
  }
}

function requestedRepeatCount(text = '') {
  if (/\btwice\b|\b2\s+times?\b/i.test(text)) return 2
  const numeric = text.match(/\b(?:same\s+)?(?:configured\s+)?(?:agent\s+)?role\s+(\d+)\s+times?\b/i)
    || text.match(/\b(\d+)\s+(?:independent\s+)?(?:agents?|reviews?|samples?)\b/i)
  if (numeric) return normalizeCount(numeric[1], 1) || 1
  const words = { two: 2, three: 3, four: 4, five: 5, six: 6 }
  const word = text.match(/\b(two|three|four|five|six)\s+(?:independent\s+)?(?:agents?|reviews?|samples?)\b/i)
  return word ? words[word[1].toLowerCase()] : 1
}

function userRoleContract(userRequest = '', maps = {}, selectionIntent = '') {
  if (clean(selectionIntent) === ALL_CONFIGURED_ROLES) {
    return { mode: ALL_CONFIGURED_ROLES, roleKeys: maps.catalogRoles.map((role) => clean(role?.key)) }
  }
  const text = normalizedText(userRequest)
  if (!text) return { mode: 'model_routed', roleKeys: [] }
  const matches = maps.catalogRoles
    .map((role) => {
      const identities = unique([role?.name, role?.key, resolveMoaRoleKey(role)])
        .map(normalizedText)
        .filter((identity) => identity.length >= 3)
      const positions = identities.map((identity) => text.indexOf(identity)).filter((index) => index >= 0)
      return positions.length > 0 ? { key: clean(role?.key), position: Math.min(...positions) } : null
    })
    .filter(Boolean)
    .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
  if (matches.length === 0) return { mode: 'model_routed', roleKeys: [] }
  const roleKeys = matches.map((match) => match.key)
  if (roleKeys.length === 1) {
    const repeatCount = requestedRepeatCount(userRequest)
    return {
      mode: 'user_named_roles',
      roleKeys: Array.from({ length: repeatCount }, () => roleKeys[0]),
    }
  }
  return { mode: 'user_named_roles', roleKeys }
}

function roleSelectionError(roleKey = '', maps = {}) {
  const catalogRole = maps.catalogByKey.get(roleKey)
  if (!catalogRole) {
    return error('role_not_found', `Role key "${roleKey}" is not configured.`, { role_key: roleKey })
  }
  const reason = clean(catalogRole?.readiness_reason)
  return error(
    'role_unavailable',
    `Role key "${roleKey}" is configured but not ready${reason ? ` (${reason})` : ''}.`,
    { role_key: roleKey, reason },
  )
}

function templatesForCount(tasks = [], count = 0) {
  if (tasks.length === 1 && count > 1) return Array.from({ length: count }, () => tasks[0])
  return tasks.length === count ? tasks : null
}

function assignmentCost(task = {}, catalogRole = {}, configuredByKey = new Map(), roleIndex = 0) {
  const configuredRole = configuredByKey.get(clean(catalogRole?.key)) || {}
  const score = scoreRoleForTask(task, configuredRole).score
  return -(score * 1000) + roleIndex
}

function assignRolesGlobally(tasks = [], catalogRoles = [], configuredByKey = new Map()) {
  const taskCount = tasks.length
  const roleCount = catalogRoles.length
  if (taskCount === 0) return []
  if (taskCount > roleCount) return null
  const costs = tasks.map((task) => catalogRoles.map((role, index) => (
    assignmentCost(task, role, configuredByKey, index)
  )))
  const rowPotential = Array(taskCount + 1).fill(0)
  const columnPotential = Array(roleCount + 1).fill(0)
  const matchedRow = Array(roleCount + 1).fill(0)
  const previousColumn = Array(roleCount + 1).fill(0)
  for (let row = 1; row <= taskCount; row += 1) {
    matchedRow[0] = row
    let column = 0
    const minCost = Array(roleCount + 1).fill(Number.POSITIVE_INFINITY)
    const used = Array(roleCount + 1).fill(false)
    do {
      used[column] = true
      const currentRow = matchedRow[column]
      let delta = Number.POSITIVE_INFINITY
      let nextColumn = 0
      for (let candidate = 1; candidate <= roleCount; candidate += 1) {
        if (used[candidate]) continue
        const currentCost = costs[currentRow - 1][candidate - 1]
          - rowPotential[currentRow]
          - columnPotential[candidate]
        if (currentCost < minCost[candidate]) {
          minCost[candidate] = currentCost
          previousColumn[candidate] = column
        }
        if (minCost[candidate] < delta) {
          delta = minCost[candidate]
          nextColumn = candidate
        }
      }
      for (let candidate = 0; candidate <= roleCount; candidate += 1) {
        if (used[candidate]) {
          rowPotential[matchedRow[candidate]] += delta
          columnPotential[candidate] -= delta
        } else {
          minCost[candidate] -= delta
        }
      }
      column = nextColumn
    } while (matchedRow[column] !== 0)
    do {
      const prior = previousColumn[column]
      matchedRow[column] = matchedRow[prior]
      column = prior
    } while (column !== 0)
  }
  const assignments = Array(taskCount).fill(null)
  for (let column = 1; column <= roleCount; column += 1) {
    if (matchedRow[column] > 0) assignments[matchedRow[column] - 1] = catalogRoles[column - 1]
  }
  return assignments
}

function resolveAssignments(tasks = [], maps = {}, contract = {}) {
  if (contract.roleKeys.length > 0) {
    const unavailableKey = contract.roleKeys.find((key) => !maps.readyByKey.has(key))
    if (unavailableKey) return { errors: [roleSelectionError(unavailableKey, maps)] }
    const expandedTasks = templatesForCount(tasks, contract.roleKeys.length)
    if (!expandedTasks) {
      return { errors: [error('task_role_count_mismatch', 'The task count does not match the user-requested role set.')] }
    }
    const selectedRoles = contract.roleKeys.map((key) => maps.readyByKey.get(key))
    const uniqueRoleCount = new Set(contract.roleKeys).size
    const roles = tasks.length > 1 && uniqueRoleCount === selectedRoles.length
      ? assignRolesGlobally(expandedTasks, selectedRoles, maps.configuredByKey)
      : selectedRoles
    return { tasks: expandedTasks, roles }
  }
  if (maps.readyCatalogRoles.length === 0) {
    return { errors: [error('no_ready_roles', 'No configured agent roles are ready for delegation.')] }
  }
  if (tasks.length > maps.readyCatalogRoles.length) {
    return { errors: [error('insufficient_ready_roles', `Delegation requested ${tasks.length} distinct roles but only ${maps.readyCatalogRoles.length} are ready.`)] }
  }
  return {
    tasks,
    roles: assignRolesGlobally(tasks, maps.readyCatalogRoles, maps.configuredByKey),
  }
}

function taskWithRole(task = {}, catalogRole = {}, configuredRole = {}, index = 0, expanded = false) {
  const roleKey = clean(catalogRole?.key)
  const baseTaskId = clean(task?.task_id) || `task_${index + 1}`
  const requestedAccess = clean(task?.requested_access) === 'staged_write' ? 'staged_write' : 'read_only'
  const effectiveAccess = requestedAccess === 'staged_write' && catalogRole?.effective_access === 'staged_write'
    ? 'staged_write'
    : 'read_only'
  return {
    task_id: expanded ? `${baseTaskId}_${roleKey}_${index + 1}` : baseTaskId,
    agent_role_key: roleKey,
    agent_role_id: clean(configuredRole?.id),
    agent_role: clean(configuredRole?.name) || clean(catalogRole?.name),
    specialty: clean(task?.specialty),
    task_type: clean(task?.task_type),
    goal: clean(task?.goal),
    instruction: clean(task?.instruction),
    injected_context: String(task?.injected_context || ''),
    expected_output_format: clean(task?.expected_output_format) || DEFAULT_OUTPUT_FORMAT,
    constraints: unique([
      ...(Array.isArray(task?.constraints)
        ? task.constraints.filter((constraint) => !['read_only', 'staged_write'].includes(clean(constraint)))
        : []),
      effectiveAccess,
    ]),
  }
}

export function resolveDelegationRequest(input = {}, {
  catalog = {},
  moaRoles = [],
  moaPolicy = {},
  selectionIntent = '',
  userRequest = '',
} = {}) {
  const source = asObject(input)
  const fallbackInstruction = clean(userRequest)
  let normalizedTasks = normalizeCompactDelegationTasks(source.tasks, { fallbackInstruction })
  if (normalizedTasks.length === 0 && fallbackInstruction) {
    normalizedTasks = [normalizeCompactTask({ instruction: fallbackInstruction, paths: ['.'] })]
  }
  const maps = buildRoleMaps(catalog, moaRoles)
  const contract = userRoleContract(userRequest, maps, selectionIntent)
  if (normalizedTasks.length === 0) {
    return { ok: false, tasks: [], errors: [error('no_tasks', 'No tasks were provided for delegation.')], selection: { mode: contract.mode } }
  }
  const missingInstruction = normalizedTasks.find((task) => !clean(task?.instruction))
  if (missingInstruction) {
    return { ok: false, tasks: [], errors: [error('missing_instruction', 'A delegated task is missing its instruction.')], selection: { mode: contract.mode } }
  }
  const assignments = resolveAssignments(normalizedTasks, maps, contract)
  if (assignments.errors) {
    return { ok: false, tasks: [], errors: assignments.errors, selection: { mode: contract.mode } }
  }
  const maxTasks = normalizeCount(moaPolicy?.maxTasksPerDelegation, 6) || 6
  if (assignments.tasks.length > maxTasks) {
    return {
      ok: false,
      tasks: [],
      errors: [error('max_tasks_exceeded', `Delegation requested ${assignments.tasks.length} tasks but policy allows at most ${maxTasks}.`)],
      selection: { mode: contract.mode },
    }
  }
  const expanded = normalizedTasks.length === 1 && assignments.tasks.length > 1
  const tasks = assignments.tasks.map((task, index) => {
    const catalogRole = assignments.roles[index]
    const configuredRole = maps.configuredByKey.get(clean(catalogRole?.key)) || {}
    return taskWithRole(task, catalogRole, configuredRole, index, expanded)
  })
  return {
    ok: true,
    tasks,
    errors: [],
    selection: {
      mode: contract.mode,
      catalog_hash: clean(catalog?.hash),
      selected_role_keys: tasks.map((task) => task.agent_role_key),
    },
  }
}
