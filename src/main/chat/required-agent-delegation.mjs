export async function runRequiredAgentDelegationBeforeRoot({
  requiredAgentDelegation = null,
  orchestratorIntent = '',
  delegationSelectionIntent = '',
  history = [],
  loop,
  projectFolder = '',
  moaRoles = [],
  moaPolicy = null,
  moaBudgetPolicy = null,
  agentSettings = null,
  providerRuntimeSettings = null,
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  turnToolResults = [],
  send = () => {},
  persistTimelineEvent = () => {},
  requestFanoutConfirmation = () => Promise.resolve(null),
  moaRetryState = null,
  orchestratorProviderId = '',
  orchestratorModel = '',
  assistantCommentaryPhase = '',
  activeToolDefinitions = {},
  toolExecutionMap = {},
  stepSequence = 0,
  stepStartedAt = Date.now(),
  helpers = {},
} = {}) {
  const tasks = Array.isArray(requiredAgentDelegation?.tasks)
    ? requiredAgentDelegation.tasks
    : []
  if (tasks.length === 0 || loop?.cancelled) return { stepSequence, handled: false }

  const runDelegationToolCall = helpers.runDelegationToolCall
    || helpers.toolBatchHelpers?.runDelegationToolCall
  if (typeof runDelegationToolCall !== 'function') {
    throw new Error('Required agent delegation runtime is unavailable.')
  }

  const nextSequence = stepSequence + 1
  const stepId = `${activeTurnId}:step:${nextSequence}`
  const visibleDelegationToolName = Object.keys(activeToolDefinitions || {}).find((toolName) => (
    toolName === 'delegate_to_agents'
    || String(toolExecutionMap?.[toolName] || '').trim() === 'delegate_to_agents'
  )) || 'delegate_to_agents'
  const assistantTc = {
    id: `${activeTurnId}:required-agent-delegation`,
    name: visibleDelegationToolName,
    input: { tasks },
  }
  const tc = visibleDelegationToolName === 'delegate_to_agents'
    ? assistantTc
    : {
        ...assistantTc,
        name: 'delegate_to_agents',
        visibleToolName: visibleDelegationToolName,
      }
  const buildAssistantToolUseMessage = helpers.buildAssistantToolUseMessage
  const assistantToolUse = typeof buildAssistantToolUseMessage === 'function'
    ? buildAssistantToolUseMessage('', [assistantTc], { phase: assistantCommentaryPhase })
    : { role: 'assistant', content: [{ type: 'tool_use', ...assistantTc }] }
  history.push(assistantToolUse)

  const outcome = await runDelegationToolCall({
    tc,
    toolInput: tc.input,
    stepId,
    stepSequence: nextSequence,
    stepStartedAt,
    activeThreadId,
    activeTurnId,
    activeAssistantMessageId,
    projectFolder,
    loop,
    moaRoles,
    moaPolicy,
    moaBudgetPolicy,
    agentSettings,
    requestFanoutConfirmation,
    history,
    turnToolResults,
    send,
    persistTimelineEvent,
    providerRuntimeSettings,
    moaRetryState,
    allowPreflightRepairRetry: false,
    orchestratorProviderId,
    orchestratorModel,
    orchestratorIntent,
    delegationSelectionIntent,
    isPreflightRepairRetryAttempt: false,
  })

  if (Array.isArray(outcome?.pendingSynthesisMessages) && outcome.pendingSynthesisMessages.length > 0) {
    history.push(...outcome.pendingSynthesisMessages)
  } else if (outcome?.pendingSynthesisPrompt) {
    history.push({ role: 'system', content: outcome.pendingSynthesisPrompt })
  }
  return {
    stepSequence: nextSequence,
    handled: outcome?.handled === true,
  }
}
