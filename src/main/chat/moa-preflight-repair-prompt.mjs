function clean(value) {
  return String(value ?? '').trim()
}

function clip(text, max = 260) {
  const s = String(text ?? '')
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 3))}...`
}

const REPAIRABLE_CODES = new Set([
  'missing_instruction',
  'missing_output_format',
  'missing_context',
  'role_not_found',
])

const NON_RETRYABLE_CODES = new Set([
  'missing_api_key',
  'max_tasks_exceeded',
  'no_tasks',
])

function isNonRetryableCode(code = '') {
  const normalized = clean(code).toLowerCase()
  return (
    NON_RETRYABLE_CODES.has(normalized)
    || normalized === 'openai_auth_blocked'
    || normalized.startsWith('account_')
  )
}

export function evaluateDelegationPreflightRepairability(preflight = {}) {
  const errors = Array.isArray(preflight?.errors) ? preflight.errors : []
  if (errors.length === 0) return { repairable: false, reason: 'no_errors' }
  const codes = errors.map((row) => clean(row?.code).toLowerCase()).filter(Boolean)
  if (codes.length === 0) return { repairable: false, reason: 'unknown_error_codes' }
  if (codes.some((code) => isNonRetryableCode(code))) {
    return { repairable: false, reason: 'contains_non_retryable_code', codes }
  }
  if (!codes.every((code) => REPAIRABLE_CODES.has(code))) {
    return { repairable: false, reason: 'contains_non_repairable_code', codes }
  }
  return { repairable: true, reason: 'shape_or_role_errors_only', codes }
}

function summarizePreflightErrors(preflight = {}) {
  const errors = Array.isArray(preflight?.errors) ? preflight.errors : []
  return errors.slice(0, 18).map((err) => {
    const taskId = clean(err?.taskId)
    const code = clean(err?.code)
    const message = clean(err?.message) || code || 'Delegation preflight failed.'
    return `- ${taskId ? `${taskId}: ` : ''}${message}${code ? ` (${code})` : ''}`
  })
}

function summarizeRepairDirectives(preflight = {}) {
  const errors = Array.isArray(preflight?.errors) ? preflight.errors : []
  const tasks = Array.isArray(preflight?.tasks) ? preflight.tasks : []
  const missingContextTaskIds = new Set(
    errors
      .filter((err) => clean(err?.code).toLowerCase() === 'missing_context')
      .map((err) => clean(err?.taskId))
      .filter(Boolean),
  )
  const missingInstructionTaskIds = new Set(
    errors
      .filter((err) => clean(err?.code).toLowerCase() === 'missing_instruction')
      .map((err) => clean(err?.taskId))
      .filter(Boolean),
  )
  const missingOutputFormatTaskIds = new Set(
    errors
      .filter((err) => clean(err?.code).toLowerCase() === 'missing_output_format')
      .map((err) => clean(err?.taskId))
      .filter(Boolean),
  )

  const lines = []
  if (missingContextTaskIds.size > 0) {
    lines.push(
      `- Missing injected_context on: ${Array.from(missingContextTaskIds).join(', ')}. Rebuild those task objects with exact file paths and the smallest relevant snippet or other self-sufficient context.`,
    )
  }
  if (missingInstructionTaskIds.size > 0) {
    lines.push(
      `- Missing instruction on: ${Array.from(missingInstructionTaskIds).join(', ')}. Rewrite each task as a concrete agent assignment, not a placeholder.`,
    )
  }
  if (missingOutputFormatTaskIds.size > 0) {
    lines.push(
      `- Missing expected_output_format on: ${Array.from(missingOutputFormatTaskIds).join(', ')}. State exactly how each agent must format the result.`,
    )
  }

  const roleErrors = errors.filter((err) => clean(err?.code).toLowerCase() === 'role_not_found')
  if (roleErrors.length > 0) {
    lines.push('- Invalid role selection detected. Repair toward semantic routing hints first, or use an exact configured agent_role_key from the role catalog.')
  }

  if (lines.length === 0 && tasks.length > 0) {
    lines.push('- Repair the malformed task objects and retry delegation once only if every task can be made valid.')
  }
  return lines
}

function sanitizeTask(task = {}, idx = 0) {
  return {
    task_id: clean(task?.task_id) || `task_${idx + 1}`,
    specialty: clean(task?.specialty),
    task_type: clean(task?.task_type),
    goal: clip(clean(task?.goal), 140),
    agent_role_key: clean(task?.agent_role_key),
    agent_role_id: clean(task?.agent_role_id),
    agent_role: clean(task?.agent_role),
    instruction: clip(clean(task?.instruction), 160),
    injected_context: clip(clean(task?.injected_context), 220),
    expected_output_format: clip(clean(task?.expected_output_format), 180),
  }
}

export function buildMoaDelegationPreflightRepairPrompt({
  preflight = {},
  allowRetry = true,
  toolName = 'delegate_to_agents',
} = {}) {
  const repairability = evaluateDelegationPreflightRepairability(preflight)
  const visibleToolName = clean(toolName) || 'delegate_to_agents'
  const universalDispatcher = visibleToolName === 'delegate_tasks'
  const lines = [
    '[MoA DELEGATION PRE-FLIGHT ERRORS]',
    `The previous ${visibleToolName} call did not run because its task payload failed MoA preflight validation.`,
  ]

  if (!allowRetry || !repairability.repairable) {
    lines.push('Do not retry delegation automatically. Proceed without delegation or ask the user to fix agent configuration/policy.')
  } else {
    lines.push(`Retry ${visibleToolName} once with a corrected payload only if you can fully repair every delegated task.`)
    lines.push('This failure happened before any agent ran. Keep the same task intent, regenerate the malformed task objects, and retry delegation once.')
    lines.push('Do not switch to unrelated tools first (for example run_command) unless delegation is clearly impossible after correction.')
    lines.push(`If you cannot fully repair all tasks, do not call ${visibleToolName} again in this turn.`)
  }

  lines.push('')
  lines.push('Fix requirements for the retry:')
  if (universalDispatcher) {
    lines.push('- Every task must include instruction plus either context or at least one workspace path.')
    lines.push('- Do not select, pin, order, or repeat roles in the payload. Submit each distinct task brief once.')
    lines.push('- ADDOM recompiles the execution plan from the user request, task meaning, and live catalog.')
    lines.push('- Do not retry with empty strings, placeholder text, or unsupported raw delegation fields.')
  } else {
    lines.push('- Repair toward semantic routing hints: specialty, task_type, goal, and optional constraints.')
    lines.push('- Every task must include: instruction, injected_context, expected_output_format, and semantic routing hints.')
    lines.push('- If you explicitly pin a configured role, prefer agent_role_key and use it exactly as listed in the role catalog.')
    lines.push('- Do not retry with empty strings, placeholder text, guessed role keys/IDs, or missing semantic hints.')
  }
  lines.push('- Keep task intent the same; only repair schema/role selection problems.')
  lines.push('')
  lines.push('Preflight errors:')
  lines.push(...summarizePreflightErrors(preflight))
  if (allowRetry && repairability.repairable) {
    const repairDirectives = summarizeRepairDirectives(preflight)
    if (repairDirectives.length > 0) {
      lines.push('')
      lines.push('Repair actions for the retry:')
      lines.push(...repairDirectives)
    }
  }

  const tasks = Array.isArray(preflight?.tasks) ? preflight.tasks : []
  if (tasks.length > 0) {
    lines.push('')
    lines.push('Sanitized invalid payload excerpt (for correction reference):')
    lines.push('```json')
    lines.push(JSON.stringify({ tasks: tasks.slice(0, 6).map(sanitizeTask) }, null, 2))
    lines.push('```')
  }

  lines.push('')
  lines.push('Minimal valid task shape reminder:')
  lines.push('```json')
  lines.push(JSON.stringify(universalDispatcher
    ? {
        tasks: [{
          kind: 'review',
          goal: 'Audit auth changes for security regressions.',
          instruction: 'Review the auth changes for concrete regressions.',
          context: 'Focus on authentication and authorization boundaries.',
          paths: ['src/auth'],
          access: 'read_only',
        }],
      }
    : {
        tasks: [{
          specialty: 'security',
          task_type: 'review',
          goal: 'Audit auth changes for security regressions.',
          instruction: 'Specific agent task instruction',
          injected_context: 'Exact code/text for the agent',
          expected_output_format: 'How the agent must format the result',
        }],
      }, null, 2))
  lines.push('```')

  return lines.join('\n')
}
