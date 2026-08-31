import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { buildApprovalPolicyForTool } from '../../src/main/chat/run-command-approval-policy.mjs'
import {
  resolveToolApprovalCanonicalErrorClass,
  resolveToolApprovalPromptDecision,
} from '../../src/main/chat/tool-approval-rules.mjs'
import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'
import { resolveOpenAIAuthCapabilitySupport } from '../../src/main/api-clients/openai-account-capability-contract.mjs'
import { resolveOpenAIExecutionAuth } from '../../src/main/openai-account/openai-execution-auth.mjs'

function resolveCapabilityUnsupportedClass(args = {}) {
  return resolveOpenAIAuthCapabilitySupport(args) ? '' : 'capability_unsupported'
}

function buildShellToolContext(authMethod, {
  command = [],
  commandText = '',
  cwd = '.',
  env = null,
} = {}) {
  if (authMethod === 'account') {
    return {
      toolName: 'run_command',
      toolInput: {
        command: String(commandText || command.join(' ')).trim(),
        cwd,
        shell: process.platform === 'win32' ? 'powershell' : 'bash',
        ...(env && typeof env === 'object' ? { env } : {}),
      },
    }
  }
  return {
    toolName: 'local_shell',
    toolInput: {
      action: {
        type: 'exec',
        command: Array.isArray(command) ? command : String(commandText || '').trim().split(/\s+/).filter(Boolean),
        workingDirectory: cwd,
        ...(env && typeof env === 'object' ? { env } : {}),
      },
    },
  }
}

function buildFileMutationContext(authMethod, targetPath = '') {
  if (authMethod === 'account') {
    return {
      toolName: 'file_change',
      toolInput: {
        changes: [{ path: targetPath, kind: 'modify', diff: '@@ -1 +1 @@\n-old\n+new' }],
      },
    }
  }
  return {
    toolName: 'apply_patch',
    toolInput: {
      patch: [
        '*** Begin Patch',
        `*** Update File: ${String(targetPath || '').replace(/\\/g, '/')}`,
        '@@',
        '-old',
        '+new',
        '*** End Patch',
      ].join('\n'),
    },
  }
}

async function resolveApprovalSnapshot(authMethod, kind, {
  permissionMode = 'ask',
  projectFolder = '',
  command = [],
  commandText = '',
  cwd = '.',
  env = null,
  targetPath = '',
} = {}) {
  const context = kind === 'shell'
    ? buildShellToolContext(authMethod, { command, commandText, cwd, env })
    : buildFileMutationContext(authMethod, targetPath)
  const approvalPolicy = await buildApprovalPolicyForTool({
    toolName: context.toolName,
    toolInput: context.toolInput,
    projectFolder,
    commandSafetySettings: {},
    permissionMode,
  })
  return resolveToolApprovalPromptDecision({
    toolName: context.toolName,
    projectFolder,
    approvalPolicy,
    permissionMode,
  })
}

test('provider policy parity readiness classifies covered OpenAI auth prerequisite and runtime failures canonically', () => {
  const missingApiKey = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'api_key' } },
    }),
    getKey: () => '',
  })
  const bridgeUnavailable = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: true,
        status: 'connected',
        availability: {
          supported: false,
          reason: 'bridge_unavailable',
          message: 'Bridge unavailable.',
        },
      },
      storage: {
        availability: {
          supported: false,
          reason: 'bridge_unavailable',
          message: 'Bridge unavailable.',
        },
      },
    }),
  })
  const runtimeUnsupported = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: true,
        status: 'connected',
        availability: {
          supported: true,
          reason: '',
          message: '',
        },
      },
      storage: {
        availability: {
          supported: true,
          reason: '',
          message: '',
        },
      },
    }),
  })

  assert.equal(missingApiKey.canonicalErrorClass, 'missing_prerequisite')
  assert.equal(bridgeUnavailable.canonicalErrorClass, 'provider_transport_error')
  assert.equal(runtimeUnsupported.canonicalErrorClass, 'capability_unsupported')
})

test('provider policy parity readiness keeps equivalent shell blocked states canonical across the OpenAI auth pair', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-sprint4-shell-readiness-'))
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-sprint4-shell-outside-'))

  try {
    const accountDenied = await resolveApprovalSnapshot('account', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      env: { FOO: 'bar' },
    })
    const apiKeyDenied = await resolveApprovalSnapshot('api_key', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      env: { FOO: 'bar' },
    })

    assert.equal(accountDenied.action, 'deny')
    assert.equal(accountDenied.canonicalErrorClass, 'permission_denied')
    assert.equal(apiKeyDenied.canonicalErrorClass, accountDenied.canonicalErrorClass)

    const accountPrompt = await resolveApprovalSnapshot('account', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      cwd: outsideRoot,
    })
    const apiKeyPrompt = await resolveApprovalSnapshot('api_key', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      cwd: outsideRoot,
    })

    assert.equal(accountPrompt.action, 'prompt')
    assert.equal(accountPrompt.canonicalErrorClass, 'permission_prompt_required')
    assert.equal(apiKeyPrompt.canonicalErrorClass, accountPrompt.canonicalErrorClass)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  }
})

test('provider policy parity readiness keeps equivalent file-mutation blocked states canonical across the OpenAI auth pair', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-sprint4-file-readiness-'))
  const outsideTarget = path.join(os.tmpdir(), `addom-sprint4-file-outside-${Date.now()}.txt`)

  try {
    const accountPrompt = await resolveApprovalSnapshot('account', 'file', {
      permissionMode: 'ask',
      projectFolder,
      targetPath: outsideTarget,
    })
    const apiKeyPrompt = await resolveApprovalSnapshot('api_key', 'file', {
      permissionMode: 'ask',
      projectFolder,
      targetPath: outsideTarget,
    })

    assert.equal(accountPrompt.action, 'prompt')
    assert.equal(accountPrompt.canonicalErrorClass, 'permission_prompt_required')
    assert.equal(apiKeyPrompt.canonicalErrorClass, accountPrompt.canonicalErrorClass)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('provider policy parity readiness classifies capability gaps as capability_unsupported instead of policy denial', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'account' })

  const shellApiKeyClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'shell',
    authMethod: 'api_key',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const shellAccountClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'shell',
    authMethod: 'account',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const patchApiKeyClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'apply_patch',
    authMethod: 'api_key',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const patchAccountClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'apply_patch',
    authMethod: 'account',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })

  assert.equal(shellApiKeyClass, 'capability_unsupported')
  assert.equal(shellAccountClass, 'capability_unsupported')
  assert.equal(patchApiKeyClass, 'capability_unsupported')
  assert.equal(patchAccountClass, 'capability_unsupported')
})

test('provider policy parity readiness reserves scope_denied for explicit scope failures instead of generic policy denial', () => {
  assert.equal(
    resolveToolApprovalCanonicalErrorClass({ action: 'deny', denyReason: 'scope_denied' }),
    'scope_denied',
  )
  assert.equal(
    resolveToolApprovalCanonicalErrorClass({ action: 'deny', denyReason: 'policy_denied' }),
    'permission_denied',
  )
})
