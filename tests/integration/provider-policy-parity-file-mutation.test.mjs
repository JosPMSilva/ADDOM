import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { buildApprovalPolicyForTool } from '../../src/main/chat/run-command-approval-policy.mjs'
import { resolveToolApprovalPromptDecision } from '../../src/main/chat/tool-approval-rules.mjs'

function toPatchPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/')
}

function buildApiKeyFileMutationContext(kind, {
  targetPath = '',
  oldPath = '',
} = {}) {
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

function buildAccountFileMutationContext(kind, {
  targetPath = '',
  oldPath = '',
} = {}) {
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

async function resolveFileMutationParitySnapshot(authMethod, {
  kind = 'modify',
  permissionMode = 'ask',
  projectFolder = '',
  targetPath = '',
  oldPath = '',
} = {}) {
  const context = authMethod === 'account'
    ? buildAccountFileMutationContext(kind, { targetPath, oldPath })
    : buildApiKeyFileMutationContext(kind, { targetPath, oldPath })
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
    hostAccessRequired: approvalPolicy?.hostAccessRequired === true,
    pathScope: String(approvalPolicy?.pathScope || ''),
    changeKinds: Array.isArray(approvalPolicy?.changeKinds) ? approvalPolicy.changeKinds : [],
    externalPathCount: Array.isArray(approvalPolicy?.externalPaths) ? approvalPolicy.externalPaths.length : 0,
    promptAction: String(approvalPrompt?.action || ''),
    promptSource: String(approvalPrompt?.source || ''),
    approvalMeta: approvalPrompt?.approvalMeta ?? null,
  }
}

test('OpenAI auth file-mutation parity routes native fileChange outside-workspace edits through the shared policy contract', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-mutation-parity-outside-'))
  const outsideTarget = path.join(os.tmpdir(), `addom-file-mutation-outside-${Date.now()}.txt`)

  try {
    for (const permissionMode of ['ask', 'autonomy']) {
      const account = await resolveFileMutationParitySnapshot('account', {
        permissionMode,
        projectFolder,
        kind: 'modify',
        targetPath: outsideTarget,
      })
      const apiKey = await resolveFileMutationParitySnapshot('api_key', {
        permissionMode,
        projectFolder,
        kind: 'modify',
        targetPath: outsideTarget,
      })

      assert.equal(account.policyType, 'file_tool_policy_v1')
      assert.equal(account.hostAccessRequired, true)
      assert.equal(account.pathScope, 'external_requested')
      assert.equal(account.externalPathCount, 1)
      assert.equal(account.promptAction, 'prompt')
      assert.deepEqual(apiKey, account)
    }

    const accountFullAccess = await resolveFileMutationParitySnapshot('account', {
      permissionMode: 'full_access',
      projectFolder,
      kind: 'modify',
      targetPath: outsideTarget,
    })
    const apiKeyFullAccess = await resolveFileMutationParitySnapshot('api_key', {
      permissionMode: 'full_access',
      projectFolder,
      kind: 'modify',
      targetPath: outsideTarget,
    })

    assert.equal(accountFullAccess.policyType, 'file_tool_policy_v1')
    assert.equal(accountFullAccess.hostAccessRequired, true)
    assert.equal(accountFullAccess.promptAction, 'approve')
    assert.equal(accountFullAccess.approvalMeta?.fileSystem?.hostFullAccess, true)
    assert.deepEqual(apiKeyFullAccess, accountFullAccess)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('OpenAI auth file-mutation parity keeps destructive rename and delete thresholds aligned', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-mutation-parity-destructive-'))
  const sourcePath = path.join(projectFolder, 'src', 'before.txt')
  const targetPath = path.join(projectFolder, 'src', 'after.txt')

  try {
    for (const kind of ['rename', 'delete']) {
      for (const permissionMode of ['ask', 'autonomy']) {
        const account = await resolveFileMutationParitySnapshot('account', {
          permissionMode,
          projectFolder,
          kind,
          targetPath,
          oldPath: sourcePath,
        })
        const apiKey = await resolveFileMutationParitySnapshot('api_key', {
          permissionMode,
          projectFolder,
          kind,
          targetPath,
          oldPath: sourcePath,
        })

        assert.equal(account.policyType, 'file_tool_policy_v1')
        assert.equal(account.hostAccessRequired, false)
        assert.ok(account.changeKinds.includes(kind))
        assert.equal(account.promptAction, 'prompt')
        assert.deepEqual(apiKey, account)
      }

      const accountFullAccess = await resolveFileMutationParitySnapshot('account', {
        permissionMode: 'full_access',
        projectFolder,
        kind,
        targetPath,
        oldPath: sourcePath,
      })
      const apiKeyFullAccess = await resolveFileMutationParitySnapshot('api_key', {
        permissionMode: 'full_access',
        projectFolder,
        kind,
        targetPath,
        oldPath: sourcePath,
      })

      assert.equal(accountFullAccess.policyType, 'file_tool_policy_v1')
      assert.ok(accountFullAccess.changeKinds.includes(kind))
      assert.equal(accountFullAccess.promptAction, 'approve')
      assert.equal(accountFullAccess.approvalMeta?.fileSystem?.hostFullAccess, true)
      assert.deepEqual(apiKeyFullAccess, accountFullAccess)
    }
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})
