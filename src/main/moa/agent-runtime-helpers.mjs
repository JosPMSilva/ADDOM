import { toAISDKTools } from '../tools/tool-definitions.mjs'
import { buildAgentOutputContractHint, resolveAgentOutputContractType } from './agent-output-contract.mjs'

export function isNaturalAgentOutput(task = {}) {
  return String(task?.outputPresentation || task?.output_presentation || '').trim().toLowerCase() === 'natural'
}

export function normalizeOpenAIExecutionAuthSnapshot(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const authMethod = String(snapshot.authMethod || 'api_key').trim().toLowerCase() === 'account'
    ? 'account'
    : 'api_key'
  return {
    ok: snapshot.ok === true,
    authMethod,
    apiKey: String(snapshot.apiKey || '').trim(),
    blockedReason: String(snapshot.blockedReason || '').trim(),
    blockedMessage: String(snapshot.blockedMessage || '').trim(),
    canonicalErrorClass: String(snapshot.canonicalErrorClass || '').trim(),
    userFacingBlockedReason: String(snapshot.userFacingBlockedReason || '').trim(),
    userFacingBlockedMessage: String(snapshot.userFacingBlockedMessage || '').trim(),
    availability: snapshot.availability && typeof snapshot.availability === 'object'
      ? { ...snapshot.availability }
      : null,
    sessionSummary: snapshot.sessionSummary && typeof snapshot.sessionSummary === 'object'
      ? { ...snapshot.sessionSummary }
      : null,
    activeLogin: snapshot.activeLogin && typeof snapshot.activeLogin === 'object'
      ? { ...snapshot.activeLogin }
      : null,
  }
}

export function buildAgentTools(canWriteFiles = false, additionalTools = {}) {
  const all = toAISDKTools('ask', false)
  const tools = {
    read_file: all.read_file,
    list_directory: all.list_directory,
    search_code: all.search_code,
    plan_read: all.plan_read,
    plan_update: all.plan_update,
  }
  if (canWriteFiles && all.write_file) {
    tools.write_file = all.write_file
  }
  if (canWriteFiles && all.apply_patch) {
    tools.apply_patch = all.apply_patch
  }
  if (canWriteFiles && all.create_directory) {
    tools.create_directory = all.create_directory
  }
  return { ...tools, ...additionalTools }
}

function normalizeToolNameList(toolNames = [], fallback = []) {
  const source = Array.isArray(toolNames) && toolNames.length > 0 ? toolNames : fallback
  const seen = new Set()
  const out = []
  for (const value of source) {
    const normalized = String(value || '').trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

export function buildAgentMessages(task, role, { canWriteFiles = false, toolNames = null } = {}) {
  const fallbackTools = canWriteFiles
    ? ['read_file', 'list_directory', 'search_code', 'plan_read', 'plan_update', 'apply_patch', 'create_directory', 'write_file']
    : ['read_file', 'list_directory', 'search_code', 'plan_read', 'plan_update']
  const resolvedToolNames = Array.isArray(toolNames)
    ? normalizeToolNameList(toolNames, [])
    : normalizeToolNameList([], fallbackTools)
  const toolList = resolvedToolNames.length > 0 ? resolvedToolNames.join(', ') : 'none'
  const hasWriteTool = resolvedToolNames.includes('write_file') || resolvedToolNames.includes('apply_patch')
  const hasShellTool = resolvedToolNames.includes('run_command')
    || resolvedToolNames.includes('shell')
    || resolvedToolNames.includes('local_shell')
  const outputContractType = resolveAgentOutputContractType(task)
  const naturalOutput = isNaturalAgentOutput(task)
  const outputInstruction = naturalOutput
    ? [
        'Write a normal user-facing Markdown final response, not JSON or an internal transport payload.',
        'Lead with the outcome. Include only the evidence, file references, changes, or limitations needed to make the result useful.',
        'Do not narrate that you are about to answer, and do not expose orchestration metadata.',
      ].join('\n')
    : buildAgentOutputContractHint(task)
  const agentSystemPrompt = [
    `You are a specialized background agent AI. Your role: ${role.name}.`,
    role.systemPrompt ? role.systemPrompt : '',
    `You have tool access to: ${toolList}.`,
    'Always respond in the same language as the task instruction. If the task is in English, respond in English. Do not use the operating system locale for your output language.',
    resolvedToolNames.includes('apply_patch')
      ? 'If you use apply_patch, your file changes are staged suggestions only (not directly applied to disk), including create, update, move, and delete operations.'
      : hasWriteTool
        ? 'If you use write_file, your writes are staged suggestions only (not directly applied to disk).'
        : 'You do NOT write files unless a listed tool explicitly allows it.',
    hasShellTool
      ? 'If a shell tool is listed, keep commands tightly scoped to the assigned task and workspace guardrails.'
      : 'You do NOT run commands unless a listed tool explicitly allows it.',
    outputInstruction,
    naturalOutput ? '' : `Resolved output contract: ${outputContractType}.`,
    `Output format required: ${task.expected_output_format}`,
  ].filter(Boolean).join('\n')

  const agentUserPrompt = [
    `Task: ${task.instruction}`,
    '',
    'Context provided:',
    task.injected_context,
    task.runtime_handoff
      ? '\nStructured upstream step contract (JSON). Treat it as the authoritative pipeline state from completed prior steps:\n'
      : '',
    task.runtime_handoff ? String(task.runtime_handoff) : '',
  ].join('\n')

  return [
    { role: 'system', content: agentSystemPrompt },
    { role: 'user', content: agentUserPrompt },
  ]
}

export function truncateOutput(text, maxChars) {
  const source = String(text ?? '')
  if (source.length <= maxChars) {
    return { output: source, truncated: false, originalChars: source.length }
  }
  return {
    output: `${source.slice(0, maxChars)}\n... [truncated]`,
    truncated: true,
    originalChars: source.length,
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
