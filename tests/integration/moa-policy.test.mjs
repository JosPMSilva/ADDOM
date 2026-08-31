import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_MOA_POLICY,
  normalizeMoaPolicy,
  normalizeDelegationTask,
  resolveRoleByIdentity,
  resolveDelegationRole,
  preflightDelegation,
} from '../../src/main/moa/moa-policy.mjs'
import { setSettingsPatch } from '../../src/main/settings.mjs'
import {
  resolveProviderAgentReadiness,
  resolveProviderCredentialReadiness,
} from '../../src/main/moa/provider-credential-readiness.mjs'

test('resolveProviderCredentialReadiness blocks Cursor as a delegated leaf until isolation exists', () => {
  for (const requireConfiguredApiKey of [true, false]) {
    const readiness = resolveProviderCredentialReadiness('cursor', {
      requireConfiguredApiKey,
      getApiKey: () => 'configured-but-not-safe',
    })

    assert.equal(readiness.ready, false)
    assert.equal(readiness.code, 'delegated_runtime_unavailable')
    assert.match(readiness.message, /isolated delegated workspace/i)
  }
})

test('resolveProviderAgentReadiness rejects a configured model that cannot run ADDOM agent tools', () => {
  const readiness = resolveProviderAgentReadiness('openrouter', {
    model: 'vendor/text-only-model',
    requireConfiguredApiKey: true,
    getApiKey: () => 'configured',
    getCachedCapabilities: (providerId, model) => ({
      providerId,
      model,
      supportsTools: false,
      toolSupportMode: 'unsupported',
    }),
  })

  assert.equal(readiness.ready, false)
  assert.equal(readiness.code, 'delegated_model_tools_unavailable')
  assert.match(readiness.message, /cannot run ADDOM's delegated agent tools/i)
})

test('preflightDelegation rejects Cursor roles before execution', () => {
  const roles = [
    { id: 'role_cursor', name: 'Security Reviewer', providerId: 'cursor', model: 'cursor-grok-4.5-high-fast' },
  ]
  const tasks = [{
    task_id: 'task_1',
    agent_role_id: 'role_cursor',
    instruction: 'Review auth logic',
    injected_context: 'const x = 1',
    expected_output_format: 'bullet list',
  }]

  const result = preflightDelegation(
    tasks,
    roles,
    () => '',
    DEFAULT_MOA_POLICY,
    (providerId, options = {}) => resolveProviderCredentialReadiness(providerId, options),
  )

  assert.equal(result.ok, false)
  assert.match(JSON.stringify(result.errors), /isolated delegated workspace/i)
})

test('preflightDelegation semantically routes only across roles whose providers are ready', () => {
  const roles = [
    {
      id: 'role_unavailable',
      name: 'Repository Verification Security Reviewer',
      providerId: 'shared-provider',
      model: 'unavailable-review-model',
      systemPrompt: 'Inspect and verify repository files for malformed or inconsistent security issues.',
    },
    {
      id: 'role_ready',
      name: 'Repository Reviewer',
      providerId: 'shared-provider',
      model: 'ready-review-model',
      systemPrompt: 'Review repository files and report concrete findings.',
    },
  ]
  const tasks = [{
    task_id: 'task_1',
    specialty: 'review',
    task_type: 'review',
    instruction: 'Inspect and verify the repository files for malformed or inconsistent content.',
    injected_context: 'Task scope and context are contained in the instruction.',
    expected_output_format: 'Return concise findings with file references.',
  }]

  const result = preflightDelegation(
    tasks,
    roles,
    () => '',
    DEFAULT_MOA_POLICY,
    (providerId, options = {}) => options.model === 'ready-review-model'
      ? { ready: true, providerId, authMethod: 'api_key' }
      : {
        ready: false,
        providerId,
        code: 'delegated_runtime_unavailable',
        message: 'This provider cannot run delegated agents in the current ADDOM runtime.',
      },
  )

  assert.equal(result.ok, true)
  assert.equal(result.tasks[0].agent_role_id, 'role_ready')
  assert.equal(result.tasks[0].agent_role, 'Repository Reviewer')
})

test('preflightDelegation accepts the closest reasonable runnable role for compact automatic routing', () => {
  const roles = [
    {
      id: 'role_verifier',
      name: 'Alpha Agent',
      providerId: 'ready-provider',
      model: 'review-model',
      systemPrompt: 'Repository status file layout tests.',
    },
    {
      id: 'role_architect',
      name: 'Beta Agent',
      providerId: 'ready-provider',
      model: 'architecture-model',
      systemPrompt: 'Repository status file tests.',
    },
  ]
  const tasks = [{
    task_id: 'task_1',
    role_routing_mode: 'best_available',
    instruction: 'Perform a read-only verification of repository status, file layout, and likely test/config files.',
    injected_context: 'Task scope and context are contained in the instruction.',
    expected_output_format: 'Return concise findings with file references.',
    constraints: ['read_only'],
  }]

  const result = preflightDelegation(
    tasks,
    roles,
    () => '',
    DEFAULT_MOA_POLICY,
    (providerId) => ({ ready: true, providerId }),
  )

  assert.equal(result.ok, true)
  assert.equal(result.tasks[0].agent_role_id, 'role_verifier')
  assert.equal(result.tasks[0].role_resolution_strategy, 'semantic')
})

test('preflightDelegation keeps an explicit any-agent request runnable when no role vocabulary overlaps', () => {
  const roles = [
    {
      id: 'role_available',
      name: 'General Agent',
      providerId: 'ready-provider',
      model: 'ready-model',
      systemPrompt: 'Complete bounded delegated work and report the result.',
    },
  ]
  const tasks = [{
    task_id: 'task_1',
    role_routing_mode: 'best_available',
    instruction: 'Classify basalt samples by vesicle density.',
    injected_context: 'Task scope and context are contained in the instruction.',
    expected_output_format: 'Return concise findings.',
    constraints: ['read_only'],
  }]

  const result = preflightDelegation(
    tasks,
    roles,
    () => '',
    DEFAULT_MOA_POLICY,
    (providerId) => ({ ready: true, providerId }),
  )

  assert.equal(result.ok, true)
  assert.equal(result.tasks[0].agent_role_id, 'role_available')
})

test('normalizeMoaPolicy clamps and defaults correctly', () => {
  const normalized = normalizeMoaPolicy({
    maxTasksPerDelegation: 999,
    maxAgentRounds: 0,
    maxDelegationDurationMs: 1,
    agentStreamIdleTimeoutMs: 1,
    localAgentStreamIdleTimeoutMs: 999_999,
    maxLoopRecoveryAttempts: 99,
    maxTotalTokensPerDelegation: 'invalid',
    maxAgentOutputChars: -5,
    requireConfiguredApiKey: false,
    agentWriteAccessEnabled: true,
    agentWriteMode: 'invalid-mode',
    maxAgentStagedFilesPerTask: 999,
    maxAgentStagedFilesPerDelegation: 0,
    maxAgentStagedBytesPerFile: 10,
    maxAgentStagedTotalBytesPerDelegation: 100,
  })

  assert.equal(normalized.maxTasksPerDelegation, 512)
  assert.equal(normalized.maxAgentRounds, 1)
  assert.equal(normalized.maxDelegationDurationMs, 10_000)
  assert.equal(normalized.agentStreamIdleTimeoutMs, 5_000)
  assert.equal(normalized.localAgentStreamIdleTimeoutMs, 300_000)
  assert.equal(normalized.maxLoopRecoveryAttempts, 3)
  assert.equal(normalized.maxTotalTokensPerDelegation, DEFAULT_MOA_POLICY.maxTotalTokensPerDelegation)
  assert.equal(normalized.maxAgentOutputChars, 500)
  assert.equal(normalized.requireConfiguredApiKey, false)
  assert.equal(normalized.agentWriteAccessEnabled, true)
  assert.equal(normalized.agentWriteMode, 'staged')
  assert.equal(normalized.maxAgentStagedFilesPerTask, 20)
  assert.equal(normalized.maxAgentStagedFilesPerDelegation, 1)
  assert.equal(normalized.maxAgentStagedBytesPerFile, 1_024)
  assert.equal(normalized.maxAgentStagedTotalBytesPerDelegation, 4_096)
  assert.equal('maxEphemeralRolesPerTurn' in normalized, false)
  assert.equal('runtimeRoleAllowedToolClasses' in normalized, false)
})

test('resolveRoleByIdentity prioritizes role id over role name', () => {
  const roles = [
    { id: 'role_a', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
    { id: 'role_b', name: 'Performance Reviewer', providerId: 'openai', model: 'gpt-5-mini' },
  ]
  const task = {
    agent_role_id: 'role_b',
    agent_role: 'Security Reviewer',
  }

  const resolved = resolveRoleByIdentity(task, roles)
  assert.equal(resolved?.id, 'role_b')
})

test('preflightDelegation reports max task, missing role, and missing key errors', () => {
  const roles = [
    { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
  ]
  const tasks = [
    {
      task_id: 'task_1',
      agent_role_id: 'role_sec',
      instruction: 'Review auth logic',
      injected_context: 'const x = 1',
      expected_output_format: 'bullet list',
    },
    {
      task_id: 'task_2',
      agent_role: 'Unknown Role',
      instruction: 'Review cache',
      injected_context: 'const y = 2',
      expected_output_format: 'bullet list',
    },
  ]

  const result = preflightDelegation(
    tasks,
    roles,
    () => '',
    { ...DEFAULT_MOA_POLICY, maxTasksPerDelegation: 1, requireConfiguredApiKey: true },
  )

  assert.equal(result.ok, false)
  const codes = new Set(result.errors.map((e) => e.code))
  assert.ok(codes.has('max_tasks_exceeded'))
  assert.ok(codes.has('missing_api_key'))
  assert.ok(codes.has('role_not_found'))
})

test('preflightDelegation allows local provider roles without API key', () => {
  const roles = [
    { id: 'role_local', name: 'Local Agent', providerId: 'ollama', model: 'qwen3:latest' },
  ]
  const tasks = [
    {
      task_id: 'task_local',
      agent_role_id: 'role_local',
      instruction: 'Inspect code',
      injected_context: 'function test() {}',
      expected_output_format: 'summary',
    },
  ]
  const result = preflightDelegation(
    tasks,
    roles,
    () => '',
    DEFAULT_MOA_POLICY,
    (providerId, options = {}) => resolveProviderCredentialReadiness(providerId, {
      ...options,
      allowOpenAIAccountRuntime: false,
    }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.errors.length, 0)
})

test('preflightDelegation reports account-specific OpenAI auth blocks instead of missing_api_key', async () => {
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'account',
      },
    },
  })

  const roles = [
    { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
  ]
  const tasks = [{
    task_id: 'task_1',
    agent_role_id: 'role_sec',
    instruction: 'Review auth logic',
    injected_context: 'const x = 1',
    expected_output_format: 'bullet list',
  }]

  const result = preflightDelegation(
    tasks,
    roles,
    () => '',
    DEFAULT_MOA_POLICY,
    (providerId, options = {}) => resolveProviderCredentialReadiness(providerId, {
      ...options,
      allowOpenAIAccountRuntime: false,
    }),
  )

  assert.equal(result.ok, false)
  assert.notEqual(result.errors[0]?.code, 'missing_api_key')
  assert.match(String(result.errors[0]?.code || ''), /bridge_not_checked|account_/i)
  assert.match(String(result.errors[0]?.message || ''), /OpenAI account|bridge/i)
  assert.equal(result.errors[0]?.canonicalErrorClass, 'provider_transport_error')
})

test('resolveDelegationRole can route a semantic task to the best configured role', () => {
  const roles = [
    { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5', templateLabel: 'Security Analyst' },
    { id: 'role_perf', name: 'Performance Analyst', providerId: 'openai', model: 'gpt-5-mini' },
  ]

  const resolved = resolveDelegationRole({
    specialty: 'security',
    task_type: 'review',
    goal: 'Audit the auth flow for broken access control and injection risk.',
    instruction: 'Review the auth/session changes for exploitable security issues.',
    injected_context: 'src/auth/session.ts',
    expected_output_format: 'JSON findings',
  }, roles)

  assert.equal(resolved.role?.id, 'role_sec')
  assert.equal(resolved.strategy, 'semantic')
  assert.ok(resolved.score >= 5)
})

test('preflightDelegation resolves semantic routing into an explicit configured role', () => {
  const roles = [
    { id: 'role_test', name: 'Test Engineer', providerId: 'openai', model: 'gpt-5-mini', systemPrompt: 'Create tests and coverage improvements.' },
  ]
  const tasks = [{
    task_id: 'task_tests',
    specialty: 'testing',
    task_type: 'implementation',
    goal: 'Add regression coverage for this bug fix.',
    instruction: 'Write focused regression tests for the touched auth code.',
    injected_context: 'tests missing around login flow',
    expected_output_format: 'test plan',
  }]

  const result = preflightDelegation(tasks, roles, () => 'key', DEFAULT_MOA_POLICY)

  assert.equal(result.ok, true)
  assert.equal(result.tasks[0].agent_role_id, 'role_test')
  assert.equal(result.tasks[0].agent_role, 'Test Engineer')
  assert.equal(result.tasks[0].role_resolution_strategy, 'semantic')
})

test('resolveDelegationRole rejects stale explicit role names even when semantic hints are present', () => {
  const roles = [
    { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5', templateLabel: 'Security Analyst' },
    { id: 'role_perf', name: 'Performance Reviewer', providerId: 'openai', model: 'gpt-5-mini' },
  ]

  const resolved = resolveDelegationRole({
    agent_role: 'Legacy Reviewer Name',
    specialty: 'security',
    task_type: 'review',
    goal: 'Audit auth changes for security regressions.',
    instruction: 'Review the auth/session flow for security issues.',
    injected_context: 'src/auth/session.ts',
    expected_output_format: 'JSON findings',
  }, roles)

  assert.equal(resolved.role, null)
  assert.equal(resolved.strategy, 'invalid_explicit_pin')
})

test('default policy keeps agent staged writes disabled', () => {
  const normalized = normalizeMoaPolicy({})
  assert.equal(normalized.agentWriteAccessEnabled, false)
  assert.equal(normalized.agentWriteMode, 'staged')
})

test('normalizeDelegationTask preserves explicit output contract overrides', () => {
  const normalized = normalizeDelegationTask({
    task_id: 'task_score',
    instruction: 'Score the proposed architecture.',
    injected_context: 'File: src/auth.mjs',
    expected_output_format: 'Return JSON scorecard.',
    outputContractType: 'scorecard',
  })

  assert.equal(normalized.outputContractType, 'scorecard')
})
