import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'
import { resolveOpenAIAuthCapabilitySupport } from '../../src/main/api-clients/openai-account-capability-contract.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { buildApprovalPolicyForTool } from '../../src/main/chat/run-command-approval-policy.mjs'
import { resolveToolApprovalPromptDecision } from '../../src/main/chat/tool-approval-rules.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'
import { resolveOpenAIExecutionAuth } from '../../src/main/openai-account/openai-execution-auth.mjs'

function resolveCapabilityUnsupportedClass(args = {}) {
  return resolveOpenAIAuthCapabilitySupport(args) ? '' : 'capability_unsupported'
}

function buildShellToolContext(authMethod, {
  command = ['git', 'status'],
  commandText = 'git status',
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

function toPatchPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/')
}

function buildFileMutationToolContext(authMethod, {
  kind = 'modify',
  targetPath = '',
  oldPath = '',
} = {}) {
  if (authMethod === 'account') {
    return {
      toolName: 'file_change',
      toolInput: {
        changes: [
          {
            path: targetPath,
            ...(oldPath ? { oldPath } : {}),
            kind,
            diff: '@@ -1 +1 @@\n-old\n+new',
          },
        ],
      },
    }
  }
  if (kind === 'rename') {
    return {
      toolName: 'rename_file',
      toolInput: {
        old_path: oldPath,
        new_path: targetPath,
      },
    }
  }
  if (kind === 'delete') {
    return {
      toolName: 'delete_file',
      toolInput: {
        path: targetPath,
      },
    }
  }
  return {
    toolName: 'apply_patch',
    toolInput: {
      patch: [
        '*** Begin Patch',
        `*** Update File: ${toPatchPath(targetPath)}`,
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
  command = ['git', 'status'],
  commandText = 'git status',
  cwd = '.',
  env = null,
  targetPath = '',
  oldPath = '',
} = {}) {
  const context = kind === 'shell'
    ? buildShellToolContext(authMethod, { command, commandText, cwd, env })
    : buildFileMutationToolContext(authMethod, { kind, targetPath, oldPath })
  const approvalPolicy = await buildApprovalPolicyForTool({
    toolName: context.toolName,
    toolInput: context.toolInput,
    projectFolder,
    permissionMode,
    commandSafetySettings: {},
  })
  const approvalPrompt = resolveToolApprovalPromptDecision({
    toolName: context.toolName,
    projectFolder,
    approvalPolicy,
    permissionMode,
  })

  return {
    policyType: String(approvalPolicy?.type || ''),
    policyDecision: String(approvalPolicy?.policyDecision || ''),
    pathScope: String(approvalPolicy?.pathScope || ''),
    changeKinds: Array.isArray(approvalPolicy?.changeKinds) ? [...approvalPolicy.changeKinds].sort() : [],
    hostAccessRequired: approvalPolicy?.hostAccessRequired === true,
    action: String(approvalPrompt?.action || ''),
    canonicalErrorClass: String(approvalPrompt?.canonicalErrorClass || ''),
    source: String(approvalPrompt?.source || ''),
  }
}

function buildAddomTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

async function resolveDelegationSnapshot(authMethod, {
  modelId = 'gpt-5.4',
  delegationBackendPreference = 'auto',
  nativeCollaborationModeId = 'default',
} = {}) {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId,
    mode: 'execute',
    userMessage: 'Use one agent if helpful.',
    addomTools: buildAddomTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', modelId, { authMethod }),
    providerRuntimeSettings: {
      openai: {
        delegationBackendPreference,
        nativeCollaborationModeId,
      },
    },
  })

  return {
    delegationBackend: String(surface?.resolvedToolSurface?.delegationBackend || ''),
    delegationBackendReason: String(surface?.resolvedToolSurface?.delegationBackendReason || ''),
    visibleDelegationTools: Object.keys(surface?.resolvedToolSurface?.tools || {})
      .filter((toolName) => toolName.startsWith('delegate_'))
      .sort(),
  }
}

test('openai account policy parity consolidates shell parity for the auth pair', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-auth-shell-closeout-'))
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-auth-shell-outside-'))

  try {
    const accountDenied = await resolveApprovalSnapshot('account', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      env: { FOO: 'bar' },
    })
    const apiKeyDenied = await resolveApprovalSnapshot('api_key', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      env: { FOO: 'bar' },
    })

    assert.equal(accountDenied.policyDecision, 'deny')
    assert.equal(accountDenied.action, 'deny')
    assert.equal(accountDenied.canonicalErrorClass, 'permission_denied')
    assert.deepEqual(apiKeyDenied, accountDenied)

    const accountPrompt = await resolveApprovalSnapshot('account', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      cwd: outsideRoot,
    })
    const apiKeyPrompt = await resolveApprovalSnapshot('api_key', 'shell', {
      permissionMode: 'ask',
      projectFolder,
      cwd: outsideRoot,
    })

    assert.equal(accountPrompt.policyDecision, 'require_elevation')
    assert.equal(accountPrompt.action, 'prompt')
    assert.equal(accountPrompt.canonicalErrorClass, 'permission_prompt_required')
    assert.deepEqual(apiKeyPrompt, accountPrompt)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  }
})

test('openai account policy parity consolidates file-mutation parity for the auth pair', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-auth-file-closeout-'))
  const outsideTarget = path.join(os.tmpdir(), `addom-openai-auth-file-outside-${Date.now()}.txt`)
  const sourcePath = path.join(projectFolder, 'src', 'before.txt')
  const targetPath = path.join(projectFolder, 'src', 'after.txt')

  try {
    const accountOutside = await resolveApprovalSnapshot('account', 'modify', {
      permissionMode: 'ask',
      projectFolder,
      targetPath: outsideTarget,
    })
    const apiKeyOutside = await resolveApprovalSnapshot('api_key', 'modify', {
      permissionMode: 'ask',
      projectFolder,
      targetPath: outsideTarget,
    })

    assert.equal(accountOutside.policyType, 'file_tool_policy_v1')
    assert.equal(accountOutside.pathScope, 'external_requested')
    assert.equal(accountOutside.action, 'prompt')
    assert.equal(accountOutside.canonicalErrorClass, 'permission_prompt_required')
    assert.deepEqual(apiKeyOutside, accountOutside)

    const accountRename = await resolveApprovalSnapshot('account', 'rename', {
      permissionMode: 'ask',
      projectFolder,
      targetPath,
      oldPath: sourcePath,
    })
    const apiKeyRename = await resolveApprovalSnapshot('api_key', 'rename', {
      permissionMode: 'ask',
      projectFolder,
      targetPath,
      oldPath: sourcePath,
    })

    assert.equal(accountRename.policyType, 'file_tool_policy_v1')
    assert.deepEqual(accountRename.changeKinds, ['rename'])
    assert.equal(accountRename.action, 'prompt')
    assert.deepEqual(apiKeyRename, accountRename)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('openai account policy parity consolidates delegation default and visibility parity without flattening native account capability', async () => {
  const accountAuto = await resolveDelegationSnapshot('account', {
    delegationBackendPreference: 'auto',
  })
  const apiKeyAuto = await resolveDelegationSnapshot('api_key', {
    delegationBackendPreference: 'auto',
  })

  assert.equal(accountAuto.delegationBackend, 'addom_moa')
  assert.equal(accountAuto.delegationBackendReason, 'capability_default')
  assert.deepEqual(apiKeyAuto, accountAuto)

  const accountNative = await resolveDelegationSnapshot('account', {
    delegationBackendPreference: 'openai_native',
  })
  const apiKeyNative = await resolveDelegationSnapshot('api_key', {
    delegationBackendPreference: 'openai_native',
  })

  assert.equal(accountNative.delegationBackend, 'openai_native')
  assert.equal(accountNative.delegationBackendReason, 'runtime_preference')
  assert.equal(apiKeyNative.delegationBackend, 'addom_moa')
  assert.equal(apiKeyNative.delegationBackendReason, 'runtime_preference_unavailable')
  assert.deepEqual(apiKeyNative.visibleDelegationTools, accountNative.visibleDelegationTools)
})

test('openai account policy parity consolidates readiness and canonical error classification parity for the covered auth rows', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-auth-readiness-closeout-'))
  const outsideTarget = path.join(os.tmpdir(), `addom-openai-auth-readiness-${Date.now()}.txt`)

  try {
    const accountPrompt = await resolveApprovalSnapshot('account', 'modify', {
      permissionMode: 'ask',
      projectFolder,
      targetPath: outsideTarget,
    })
    const apiKeyPrompt = await resolveApprovalSnapshot('api_key', 'modify', {
      permissionMode: 'ask',
      projectFolder,
      targetPath: outsideTarget,
    })

    assert.equal(accountPrompt.canonicalErrorClass, 'permission_prompt_required')
    assert.equal(apiKeyPrompt.canonicalErrorClass, accountPrompt.canonicalErrorClass)

    const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'api_key' })
    const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'account' })

    for (const capabilityId of ['shell', 'apply_patch']) {
      const apiKeyClass = resolveCapabilityUnsupportedClass({
        capabilityId,
        authMethod: 'api_key',
        apiKeySupport,
        accountSupport,
        contract: accountSupport.accountCapabilityContract,
      })
      const accountClass = resolveCapabilityUnsupportedClass({
        capabilityId,
        authMethod: 'account',
        apiKeySupport,
        accountSupport,
        contract: accountSupport.accountCapabilityContract,
      })

      assert.equal(apiKeyClass, 'capability_unsupported', capabilityId)
      assert.equal(accountClass, apiKeyClass, capabilityId)
    }

    const apiKeyBlocked = resolveOpenAIExecutionAuth({
      getSettingsFn: () => ({
        providerAuthSettings: { openai: { authMethod: 'api_key' } },
      }),
      getKey: () => '',
    })
    const accountBlocked = resolveOpenAIExecutionAuth({
      getSettingsFn: () => ({
        providerAuthSettings: { openai: { authMethod: 'account' } },
      }),
      getOpenAIAccountState: () => ({
        sessionSummary: {
          hasSession: false,
          status: 'disconnected',
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
      allowAccountRuntime: true,
    })

    assert.equal(apiKeyBlocked.userFacingBlockedReason, 'missing_prerequisite')
    assert.equal(accountBlocked.userFacingBlockedReason, apiKeyBlocked.userFacingBlockedReason)
    assert.equal(accountBlocked.userFacingBlockedMessage, apiKeyBlocked.userFacingBlockedMessage)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})
