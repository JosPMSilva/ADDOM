import { resolveProviderCredentialReadiness } from '../moa/provider-credential-readiness.mjs'

function clean(value) {
  return String(value || '').trim()
}

function unavailable(reason, message) {
  return {
    supported: false,
    reason: clean(reason) || 'conversation_followup_unavailable',
    message: clean(message),
  }
}

export function createAgentConversationContinuationRouteResolver({
  db,
  getSettings,
  getKey,
  resolveCredentialReadiness = resolveProviderCredentialReadiness,
} = {}) {
  if (!db?.prepare) throw new TypeError('db is required')
  if (typeof getSettings !== 'function') throw new TypeError('getSettings is required')
  if (typeof getKey !== 'function') throw new TypeError('getKey is required')

  return function resolveAgentConversationContinuationRoute(conversation = {}) {
    const settings = getSettings()
    const roles = Array.isArray(settings?.moaRoles) ? settings.moaRoles : []
    const role = roles.find((candidate) => clean(candidate?.id) === clean(conversation?.roleId))
    if (!role) {
      return unavailable(
        'agent_role_unavailable',
        'The agent role used by this conversation is no longer configured.',
      )
    }

    const expectedProviderId = clean(conversation?.providerRoute?.providerId).toLowerCase()
    const expectedModelId = clean(conversation?.providerRoute?.modelId)
    if (
      clean(role.providerId).toLowerCase() !== expectedProviderId
      || clean(role.model) !== expectedModelId
    ) {
      return unavailable(
        'agent_route_changed',
        'The configured agent role no longer matches this conversation provider route.',
      )
    }

    const project = db.prepare('SELECT path FROM workspace_projects WHERE id = ?')
      .get(clean(conversation?.projectId))
    const projectFolder = clean(project?.path)
    if (!projectFolder) {
      return unavailable(
        'project_unavailable',
        'The project used by this conversation is no longer available.',
      )
    }

    const readiness = resolveCredentialReadiness(role.providerId, {
      requireConfiguredApiKey: settings?.moaPolicy?.requireConfiguredApiKey,
      getApiKey: getKey,
      allowOpenAIAccountRuntime: true,
    })
    if (readiness?.ready !== true) {
      return unavailable(
        readiness?.code || 'provider_access_unavailable',
        readiness?.message || 'The provider used by this conversation is not currently available.',
      )
    }

    const openAIExecutionAuthSnapshot = clean(role.providerId).toLowerCase() === 'openai'
      ? {
          ok: true,
          authMethod: clean(readiness.authMethod),
          apiKey: clean(readiness.apiKey),
          blockedReason: '',
          blockedMessage: '',
        }
      : null

    return {
      supported: true,
      role,
      apiKey: clean(readiness.apiKey || getKey(role.providerId)),
      projectFolder,
      policyProfileId: clean(settings?.agentSettings?.defaultProfile) || 'balanced',
      agentRuntime: {
        policy: settings?.moaPolicy,
        providerRuntimeSettings: settings?.providerRuntimeSettings,
        getApiKey: getKey,
        ...(openAIExecutionAuthSnapshot ? { openAIExecutionAuthSnapshot } : {}),
      },
    }
  }
}
