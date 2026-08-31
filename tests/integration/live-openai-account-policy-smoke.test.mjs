import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getOpenAIAccountAuthService } from '../../src/main/openai-account/openai-account-auth-service.mjs'
import { resolveOpenAIExecutionAuth } from '../../src/main/openai-account/openai-execution-auth.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { buildApprovalPolicyForTool } from '../../src/main/chat/run-command-approval-policy.mjs'
import { resolveToolApprovalPromptDecision } from '../../src/main/chat/tool-approval-rules.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'

function isEnabled(env = process.env) {
  const value = String(env?.ADDOM_LIVE_OPENAI_AUTH_SMOKE || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function resolveSmokeModelId(env = process.env) {
  return String(env?.ADDOM_LIVE_OPENAI_AUTH_MODEL || '').trim() || 'gpt-5.4'
}

function buildShellToolContext(authMethod, {
  cwd = '.',
  env = null,
} = {}) {
  if (authMethod === 'account') {
    return {
      toolName: 'run_command',
      toolInput: {
        command: 'git status',
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
        command: ['git', 'status'],
        workingDirectory: cwd,
        ...(env && typeof env === 'object' ? { env } : {}),
      },
    },
  }
}

function toPatchPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/')
}

function buildFileMutationToolContext(authMethod, targetPath = '') {
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
  cwd = '.',
  env = null,
  targetPath = '',
} = {}) {
  const context = kind === 'shell'
    ? buildShellToolContext(authMethod, { cwd, env })
    : buildFileMutationToolContext(authMethod, targetPath)
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
    policyDecision: String(approvalPolicy?.policyDecision || ''),
    pathScope: String(approvalPolicy?.pathScope || ''),
    action: String(approvalPrompt?.action || ''),
    canonicalErrorClass: String(approvalPrompt?.canonicalErrorClass || ''),
  }
}

function buildAddomTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

async function resolveDelegationSnapshot(authMethod, modelId) {
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
        delegationBackendPreference: 'auto',
        nativeCollaborationModeId: 'default',
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

function resolveCurrentAuthReadiness(env = process.env) {
  const apiKey = String(env?.OPENAI_API_KEY || '').trim()
  const accountState = getOpenAIAccountAuthService().getState()
  const apiKeyAuth = resolveOpenAIExecutionAuth({
    apiKey,
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'api_key' } },
    }),
    getKey: () => apiKey,
  })
  const accountAuth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => accountState,
    allowAccountRuntime: true,
  })

  return {
    apiKeyAuth,
    accountAuth,
    accountState,
  }
}

test('opt-in openai auth live smoke stays narrow to the landed and partial protected rows', async (t) => {
  if (!isEnabled(process.env)) {
    await t.test('openai auth live smoke disabled', { skip: true }, () => {})
    return
  }

  const modelId = resolveSmokeModelId(process.env)
  const { apiKeyAuth, accountAuth, accountState } = resolveCurrentAuthReadiness(process.env)

  t.diagnostic(`openai_auth_smoke_model: ${modelId}`)
  t.diagnostic(`openai_auth_smoke_api_key_ok: ${apiKeyAuth.ok ? 'true' : 'false'}`)
  t.diagnostic(`openai_auth_smoke_api_key_class: ${apiKeyAuth.canonicalErrorClass || 'ok'}`)
  t.diagnostic(`openai_auth_smoke_account_ok: ${accountAuth.ok ? 'true' : 'false'}`)
  t.diagnostic(`openai_auth_smoke_account_class: ${accountAuth.canonicalErrorClass || 'ok'}`)
  t.diagnostic(`openai_auth_smoke_account_session: ${String(accountState?.sessionSummary?.status || 'unknown')}`)

  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-auth-live-smoke-'))
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-auth-live-outside-'))
  const outsideTarget = path.join(os.tmpdir(), `addom-openai-auth-live-target-${Date.now()}.txt`)

  try {
    await t.test('shell env and cwd parity smoke', async () => {
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

      assert.deepEqual(apiKeyDenied, accountDenied)
      assert.equal(accountDenied.action, 'deny')
      assert.equal(accountDenied.canonicalErrorClass, 'permission_denied')

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

      assert.deepEqual(apiKeyPrompt, accountPrompt)
      assert.equal(accountPrompt.action, 'prompt')
      assert.equal(accountPrompt.canonicalErrorClass, 'permission_prompt_required')
    })

    await t.test('outside-workspace file-mutation parity smoke', async () => {
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

      assert.deepEqual(apiKeyPrompt, accountPrompt)
      assert.equal(accountPrompt.pathScope, 'external_requested')
      assert.equal(accountPrompt.action, 'prompt')
      assert.equal(accountPrompt.canonicalErrorClass, 'permission_prompt_required')
    })

    await t.test('delegation default and visibility parity smoke', async () => {
      const account = await resolveDelegationSnapshot('account', modelId)
      const apiKey = await resolveDelegationSnapshot('api_key', modelId)

      assert.deepEqual(apiKey, account)
      assert.equal(account.delegationBackend, 'addom_moa')
      assert.equal(account.delegationBackendReason, 'capability_default')
    })

    await t.test('readiness and canonical error classification smoke', async () => {
      assert.ok(['', 'missing_prerequisite'].includes(apiKeyAuth.canonicalErrorClass))
      assert.ok([
        '',
        'missing_prerequisite',
        'provider_transport_error',
        'capability_unsupported',
      ].includes(accountAuth.canonicalErrorClass))

      if (apiKeyAuth.ok) {
        assert.equal(apiKeyAuth.canonicalErrorClass, '')
      } else {
        assert.equal(apiKeyAuth.canonicalErrorClass, 'missing_prerequisite')
      }

      if (accountAuth.ok) {
        assert.equal(accountAuth.canonicalErrorClass, '')
      } else {
        assert.ok(accountAuth.userFacingBlockedReason.length > 0)
        assert.ok(accountAuth.userFacingBlockedMessage.length > 0)
      }
    })
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  }
})
