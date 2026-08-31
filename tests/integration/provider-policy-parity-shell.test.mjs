import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { buildApprovalPolicyForTool } from '../../src/main/chat/run-command-approval-policy.mjs'
import { resolveToolApprovalPromptDecision } from '../../src/main/chat/tool-approval-rules.mjs'

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

async function resolveShellParitySnapshot(authMethod, {
  permissionMode = 'ask',
  projectFolder = '',
  command = [],
  commandText = '',
  cwd = '.',
  env = null,
} = {}) {
  const context = buildShellToolContext(authMethod, {
    command,
    commandText,
    cwd,
    env,
  })
  const approvalPolicy = await buildApprovalPolicyForTool({
    toolName: context.toolName,
    toolInput: context.toolInput,
    projectFolder,
    commandSafetySettings: {},
    permissionMode,
  })
  const approvalPrompt = resolveToolApprovalPromptDecision({
    toolName: context.toolName,
    projectFolder,
    approvalPolicy,
    permissionMode,
  })

  return {
    policyDecision: approvalPolicy?.policyDecision,
    executionTarget: approvalPolicy?.executionTarget,
    elevationRequired: approvalPolicy?.elevationRequired,
    promptAction: approvalPrompt?.action,
    promptSource: approvalPrompt?.source,
    reasons: Array.isArray(approvalPolicy?.policyReasons) ? approvalPolicy.policyReasons : [],
  }
}

test('OpenAI auth shell parity denies env overrides through one shared policy outcome', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-shell-parity-env-'))
  try {
    for (const permissionMode of ['ask', 'autonomy', 'full_access']) {
      const account = await resolveShellParitySnapshot('account', {
        permissionMode,
        projectFolder,
        command: ['git', 'status'],
        commandText: 'git status',
        env: { FOO: 'bar' },
      })
      const apiKey = await resolveShellParitySnapshot('api_key', {
        permissionMode,
        projectFolder,
        command: ['git', 'status'],
        commandText: 'git status',
        env: { FOO: 'bar' },
      })

      assert.equal(account.policyDecision, 'deny')
      assert.equal(account.promptAction, 'deny')
      assert.equal(apiKey.policyDecision, account.policyDecision)
      assert.equal(apiKey.promptAction, account.promptAction)
      assert.deepEqual(apiKey.reasons, account.reasons)
    }
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('OpenAI auth shell parity keeps in-workspace cwd approval outcomes aligned', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-shell-parity-in-workspace-'))
  const nested = path.join(projectFolder, 'nested')
  fs.mkdirSync(nested, { recursive: true })

  try {
    const account = await resolveShellParitySnapshot('account', {
      permissionMode: 'ask',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      cwd: 'nested',
    })
    const apiKey = await resolveShellParitySnapshot('api_key', {
      permissionMode: 'ask',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      cwd: 'nested',
    })

    assert.equal(account.policyDecision, 'allow')
    assert.equal(account.promptAction, 'approve')
    assert.deepEqual(apiKey, account)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('OpenAI auth shell parity normalizes out-of-workspace cwd outcomes by permission mode', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-shell-parity-outside-cwd-'))
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-shell-parity-outside-target-'))

  try {
    for (const permissionMode of ['ask', 'autonomy']) {
      const account = await resolveShellParitySnapshot('account', {
        permissionMode,
        projectFolder,
        command: ['git', 'status'],
        commandText: 'git status',
        cwd: outsideRoot,
      })
      const apiKey = await resolveShellParitySnapshot('api_key', {
        permissionMode,
        projectFolder,
        command: ['git', 'status'],
        commandText: 'git status',
        cwd: outsideRoot,
      })

      assert.equal(account.policyDecision, 'require_elevation')
      assert.equal(account.promptAction, 'prompt')
      assert.deepEqual(apiKey, account)
    }

    const accountFullAccess = await resolveShellParitySnapshot('account', {
      permissionMode: 'full_access',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      cwd: outsideRoot,
    })
    const apiKeyFullAccess = await resolveShellParitySnapshot('api_key', {
      permissionMode: 'full_access',
      projectFolder,
      command: ['git', 'status'],
      commandText: 'git status',
      cwd: outsideRoot,
    })

    assert.equal(accountFullAccess.policyDecision, 'allow')
    assert.equal(accountFullAccess.promptAction, 'approve')
    assert.deepEqual(apiKeyFullAccess, accountFullAccess)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  }
})
