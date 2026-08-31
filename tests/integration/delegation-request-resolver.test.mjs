import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAgentCatalogSnapshot } from '../../src/main/moa/agent-catalog-service.mjs'
import { resolveDelegationRequest } from '../../src/main/moa/delegation-request-resolver.mjs'

const ROLES = [{
  id: 'role_security',
  roleKey: 'security_reviewer',
  name: 'Security Reviewer',
  providerId: 'openrouter',
  model: 'anthropic/claude-sonnet',
  systemPrompt: 'Review authentication, authorization, and security vulnerabilities.',
  canWriteFiles: false,
}, {
  id: 'role_docs',
  roleKey: 'docs_writer',
  name: 'Docs Writer',
  providerId: 'openrouter',
  model: 'google/gemini-pro',
  systemPrompt: 'Write documentation, READMEs, and migration guides.',
  canWriteFiles: true,
}, {
  id: 'role_architecture',
  roleKey: 'architecture_reviewer',
  name: 'Architecture Reviewer',
  providerId: 'openai',
  model: 'gpt-5.4',
  systemPrompt: 'Review architecture, system boundaries, and maintainability.',
  canWriteFiles: false,
}, {
  id: 'role_tests',
  roleKey: 'test_automator',
  name: 'Test Automator',
  providerId: 'ollama',
  model: 'qwen-coder',
  systemPrompt: 'Create regression tests and inspect test coverage.',
  canWriteFiles: true,
}]

const VERBOSE_PROFILE_ROLES = [{
  id: 'role_security_verbose',
  name: 'Security Reviewer',
  providerId: 'openrouter',
  model: 'anthropic/claude-haiku',
  systemPrompt: 'Inspect repository layout, dependencies, entry points, configuration, files, documentation, evidence, and security weaknesses. Review everything read-only.',
  canWriteFiles: false,
}, {
  id: 'role_docs_concise',
  name: 'Docs Writer',
  providerId: 'openrouter',
  model: 'deepseek/deepseek',
  systemPrompt: 'Write concise, accurate documentation.',
  canWriteFiles: false,
}, {
  id: 'role_vulnerability_verbose',
  name: 'Security Vulnerability Analyzer',
  providerId: 'openai',
  model: 'gpt-5.6-luna',
  systemPrompt: 'Analyze repository files and evidence for security vulnerabilities and unsafe dependencies.',
  canWriteFiles: false,
}, {
  id: 'role_architecture_concise',
  name: 'Architecture Reviewer',
  providerId: 'openrouter',
  model: 'google/gemini',
  systemPrompt: 'Analyze architecture, structure, boundaries, entry points, and dependencies.',
  canWriteFiles: false,
}]

const POLICY = {
  maxTasksPerDelegation: 6,
  agentWriteAccessEnabled: true,
  agentWriteMode: 'staged',
}

function catalogFor(roles = ROLES) {
  return buildAgentCatalogSnapshot({
    moaRoles: roles,
    moaPolicy: POLICY,
    resolveReadiness: () => ({ ready: true, toolSupportMode: 'native_tools' }),
  })
}

test('application-owned all-role intent expands one task template across every ready role exactly once', () => {
  const result = resolveDelegationRequest({
    tasks: [{
      instruction: 'Inspect the repository from your specialty.',
      context: 'Do not modify files.',
      paths: ['src', 'tests'],
    }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
    selectionIntent: 'all_configured_roles',
  })

  assert.equal(result.ok, true)
  assert.equal(result.tasks.length, 4)
  assert.deepEqual(
    result.tasks.map((task) => task.agent_role_key),
    ['architecture_reviewer', 'docs_writer', 'security_reviewer', 'test_automator'],
  )
  assert.equal(new Set(result.tasks.map((task) => task.agent_role_key)).size, 4)
  assert.equal(result.tasks[0].instruction, 'Inspect the repository from your specialty.')
  assert.equal(
    result.tasks[0].injected_context,
    'Do not modify files.\n\nRelevant workspace paths:\n- src\n- tests',
  )
  assert.deepEqual(result.tasks[0].constraints, ['read_only'])
})

test('controller all-configured intent overrides a polluted auto payload and preserves named task-role pairing', () => {
  const result = resolveDelegationRequest({
    tasks: [{
      instruction: 'Role: Security Reviewer. Perform the security review.',
      paths: ['.'],
    }, {
      instruction: 'Role: Docs Writer. Review the documentation.',
      paths: ['.'],
    }, {
      instruction: 'Role: Test Automator. Review the tests.',
      paths: ['.'],
    }, {
      instruction: 'Role: Architecture Reviewer. Review the architecture.',
      paths: ['.'],
    }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
    selectionIntent: 'all_configured_roles',
  })

  assert.equal(result.ok, true)
  assert.equal(result.selection.mode, 'all_configured_roles')
  assert.deepEqual(
    result.tasks.map((task) => task.agent_role_key),
    ['security_reviewer', 'docs_writer', 'test_automator', 'architecture_reviewer'],
  )
  assert.equal(new Set(result.tasks.map((task) => task.agent_role_key)).size, 4)
})

test('controller all-configured intent reports an unavailable configured role instead of substituting', () => {
  const catalog = catalogFor()
  catalog.roles = catalog.roles.map((role) => role.key === 'docs_writer'
    ? { ...role, status: 'unavailable', readiness_reason: 'missing_api_key' }
    : role)

  const result = resolveDelegationRequest({
    tasks: [{ instruction: 'Review the repository from your specialty.', paths: ['.'] }],
  }, {
    catalog,
    moaRoles: ROLES,
    moaPolicy: POLICY,
    selectionIntent: 'all_configured_roles',
  })

  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, 'role_unavailable')
  assert.equal(result.errors[0].role_key, 'docs_writer')
  assert.equal(result.errors[0].reason, 'missing_api_key')
})

test('semantic routing assigns a distinct runtime role to every task', () => {
  const result = resolveDelegationRequest({
    tasks: [{
      instruction: 'Use the configured role named exactly: Security Reviewer. Review security design issues.',
    }, {
      instruction: 'Use the configured role named exactly: Docs Writer. Review README, PLAN, and developer documentation.',
    }, {
      instruction: 'Use the configured role named exactly: Security Vulnerability Analyzer. Review plausible vulnerabilities.',
    }, {
      instruction: 'Use the configured role named exactly: Architecture Reviewer. Review structure, boundaries, entry points, and dependencies.',
    }],
  }, {
    catalog: catalogFor(VERBOSE_PROFILE_ROLES),
    moaRoles: VERBOSE_PROFILE_ROLES,
    moaPolicy: POLICY,
  })

  assert.equal(result.ok, true)
  assert.equal(result.tasks.length, 4)
  assert.deepEqual(
    result.tasks.map((task) => task.agent_role_key),
    ['security_reviewer', 'docs_writer', 'security_vulnerability_analyzer', 'architecture_reviewer'],
  )
})

test('a user-requested repeated named role expands one template into one parallel task per sample', () => {
  const result = resolveDelegationRequest({
    tasks: [{ specialty: 'security', instruction: 'Perform an independent security review.' }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
    userRequest: 'Run two independent reviews using the same Security Reviewer role twice.',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.tasks.map((task) => task.agent_role_key),
    ['security_reviewer', 'security_reviewer'],
  )
})

test('a user-named role is authoritative and model role pins cannot substitute another role', () => {
  const result = resolveDelegationRequest({
    tasks: [{
      agent_role_key: 'security_reviewer',
      instruction: 'Review package.json for documentation quality.',
      access: 'staged_write',
    }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
    userRequest: 'Use exactly the configured Docs Writer role once.',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks.map((task) => task.agent_role_key), ['docs_writer'])
  assert.deepEqual(result.tasks[0].constraints, ['staged_write'])
})

test('a user-named configured-but-unavailable role is reported distinctly', () => {
  const catalog = catalogFor()
  catalog.roles = catalog.roles.map((role) => role.key === 'docs_writer'
    ? { ...role, status: 'unavailable', readiness_reason: 'missing_api_key' }
    : role)
  const result = resolveDelegationRequest({
    tasks: [{ instruction: 'Review the docs.' }],
  }, {
    catalog,
    moaRoles: ROLES,
    moaPolicy: POLICY,
    userRequest: 'Use the Docs Writer role.',
  })

  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, 'role_unavailable')
  assert.equal(result.errors[0].reason, 'missing_api_key')
})

test('model role pins are advisory and cannot cross-wire semantic task assignments', () => {
  const result = resolveDelegationRequest({
    tasks: [{
      agent_role_key: 'security_reviewer',
      instruction: 'Review package.json for documentation quality and developer experience.',
    }, {
      agent_role_key: 'docs_writer',
      instruction: 'Review package.json for architecture and module boundaries.',
    }, {
      agent_role_key: 'architecture_reviewer',
      instruction: 'Review package.json for authentication and access-control security.',
    }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks.map((task) => task.agent_role_key), [
    'docs_writer',
    'architecture_reviewer',
    'security_reviewer',
  ])
})

test('expanded requests are rejected before execution when they exceed policy', () => {
  const result = resolveDelegationRequest({
    tasks: [{ instruction: 'Inspect the repository.' }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: {
      ...POLICY,
      maxTasksPerDelegation: 2,
    },
    selectionIntent: 'all_configured_roles',
  })

  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, 'max_tasks_exceeded')
  assert.equal(result.tasks.length, 0)
})

test('global semantic assignment preserves the best specialist pairing across the whole batch', () => {
  const result = resolveDelegationRequest({
    tasks: [{
      instruction: 'Review package.json for security design.',
    }, {
      instruction: 'Review package.json for documentation quality and developer experience.',
    }, {
      instruction: 'Review package.json for vulnerability exposure.',
    }, {
      instruction: 'Review package.json for architecture.',
    }],
  }, {
    catalog: catalogFor(VERBOSE_PROFILE_ROLES),
    moaRoles: VERBOSE_PROFILE_ROLES,
    moaPolicy: POLICY,
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks.map((task) => task.agent_role_key), [
    'security_reviewer',
    'docs_writer',
    'security_vulnerability_analyzer',
    'architecture_reviewer',
  ])
})

test('recoverable malformed task payloads use the current user request before preflight', () => {
  const result = resolveDelegationRequest({
    tasks: [{ paths: ['package.json'] }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
    userRequest: 'Use exactly the Docs Writer role once to review package.json for documentation quality.',
  })

  assert.equal(result.ok, true)
  assert.equal(result.tasks.length, 1)
  assert.equal(result.tasks[0].agent_role_key, 'docs_writer')
  assert.match(result.tasks[0].instruction, /Docs Writer role once/i)
})

test('an instruction-only task receives runtime-owned workspace context before preflight', () => {
  const result = resolveDelegationRequest({
    tasks: [{ instruction: 'Review package.json for documentation quality.' }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
  })

  assert.equal(result.ok, true)
  assert.match(result.tasks[0].injected_context, /scope.*instruction/i)
})

test('duplicate model instruction and context still receive runtime-owned workspace context', () => {
  const result = resolveDelegationRequest({
    tasks: [{
      instruction: 'Review package.json for documentation quality.',
      context: 'Review package.json for documentation quality.',
    }],
  }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
    userRequest: 'Use exactly the Docs Writer role once.',
  })

  assert.equal(result.ok, true)
  assert.equal(result.tasks[0].agent_role_key, 'docs_writer')
  assert.match(result.tasks[0].injected_context, /scope.*instruction/i)
})

test('an empty task array compiles the bounded current user request instead of surfacing model variance', () => {
  const result = resolveDelegationRequest({ tasks: [] }, {
    catalog: catalogFor(),
    moaRoles: ROLES,
    moaPolicy: POLICY,
    userRequest: 'Run the same Security Reviewer role twice to inspect package.json read-only.',
  })

  assert.equal(result.ok, true)
  assert.equal(result.tasks.length, 2)
  assert.deepEqual(result.tasks.map((task) => task.agent_role_key), [
    'security_reviewer',
    'security_reviewer',
  ])
  assert.ok(result.tasks.every((task) => /package\.json/i.test(task.instruction)))
})
