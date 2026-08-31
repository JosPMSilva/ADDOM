import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mapOpenAIAccountLegacyReviewDecision,
  normalizeOpenAIAccountLegacyApplyPatchApproval,
  normalizeOpenAIAccountLegacyExecCommandApproval,
} from '../../src/main/api-clients/ai-provider-openai-account-legacy-approvals.mjs'

const PROJECT_ROOT = 'C:\\work\\addom-project'

test('legacy exec approval translates the qualified schema into the canonical command approval domain', () => {
  const result = normalizeOpenAIAccountLegacyExecCommandApproval({
    conversationId: 'provider-thread',
    callId: 'call-1',
    approvalId: 'approval-1',
    command: ['python', '-c', 'print("ok")'],
    cwd: PROJECT_ROOT,
    parsedCmd: [{
      type: 'read',
      cmd: 'python -c print("ok")',
      name: 'python',
      path: `${PROJECT_ROOT}\\script.py`,
    }],
    reason: 'Run the project check.',
  }, {
    runtimeVersion: '0.145.0',
    bridgeThreadId: 'provider-thread',
    activeTurnId: 'turn-1',
  })

  assert.equal(result.valid, true)
  assert.deepEqual(result.params, {
    approvalId: 'approval-1',
    itemId: 'call-1',
    threadId: 'provider-thread',
    turnId: 'turn-1',
    command: 'python -c print("ok")',
    cwd: PROJECT_ROOT,
    commandActions: [{
      type: 'read',
      command: 'python -c print("ok")',
      name: 'python',
      path: `${PROJECT_ROOT}\\script.py`,
    }],
    reason: 'Run the project check.',
    availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
  })
})

test('legacy apply-patch approval translates file changes into the canonical file approval domain', () => {
  const result = normalizeOpenAIAccountLegacyApplyPatchApproval({
    conversationId: 'provider-thread',
    callId: 'patch-1',
    fileChanges: {
      'src/new.mjs': { type: 'add', content: 'export const value = 1\n' },
      'src/old.mjs': { type: 'delete', content: 'obsolete\n' },
      'src/moved.mjs': {
        type: 'update',
        unified_diff: '@@ -1 +1 @@\n-old\n+new',
        move_path: 'src/renamed.mjs',
      },
    },
    grantRoot: null,
    reason: 'Apply the implementation.',
  }, {
    runtimeVersion: '0.116.0',
    bridgeThreadId: 'provider-thread',
    activeTurnId: 'turn-1',
  })

  assert.equal(result.valid, true)
  assert.deepEqual(result.params, {
    itemId: 'patch-1',
    threadId: 'provider-thread',
    turnId: 'turn-1',
    reason: 'Apply the implementation.',
    availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
    changes: [
      {
        path: 'src/new.mjs',
        kind: { type: 'create' },
        content: 'export const value = 1\n',
      },
      {
        path: 'src/old.mjs',
        kind: { type: 'delete' },
        content: 'obsolete\n',
      },
      {
        path: 'src/renamed.mjs',
        oldPath: 'src/moved.mjs',
        kind: { type: 'rename' },
        diff: '@@ -1 +1 @@\n-old\n+new',
      },
    ],
  })
})

test('legacy approvals fail closed outside qualified runtime versions and provider thread scope', () => {
  const base = {
    conversationId: 'provider-thread',
    callId: 'call-1',
    command: ['git', 'status'],
    cwd: PROJECT_ROOT,
    parsedCmd: [{ type: 'unknown', cmd: 'git status' }],
  }

  assert.deepEqual(
    normalizeOpenAIAccountLegacyExecCommandApproval(base, {
      runtimeVersion: '0.146.0',
      bridgeThreadId: 'provider-thread',
      activeTurnId: 'turn-1',
    }),
    { valid: false, failureReason: 'unqualified_runtime_version' },
  )
  assert.deepEqual(
    normalizeOpenAIAccountLegacyExecCommandApproval(base, {
      runtimeVersion: '0.145.0',
      bridgeThreadId: 'another-thread',
      activeTurnId: 'turn-1',
    }),
    { valid: false, failureReason: 'thread_scope_mismatch' },
  )
})

test('legacy response adapter preserves approval, session, decline, cancel, and amendments', () => {
  assert.deepEqual(mapOpenAIAccountLegacyReviewDecision('accept'), { decision: 'approved' })
  assert.deepEqual(mapOpenAIAccountLegacyReviewDecision('acceptForSession'), {
    decision: 'approved_for_session',
  })
  assert.deepEqual(mapOpenAIAccountLegacyReviewDecision('decline'), {
    decision: { denied: { rejection: 'user_denied' } },
  })
  assert.deepEqual(mapOpenAIAccountLegacyReviewDecision('cancel'), { decision: 'abort' })
  assert.deepEqual(mapOpenAIAccountLegacyReviewDecision({
    acceptWithExecpolicyAmendment: {
      execpolicy_amendment: ['prefix_rule(pattern=["git", "status"])'],
    },
  }), {
    decision: {
      approved_execpolicy_amendment: {
        proposed_execpolicy_amendment: ['prefix_rule(pattern=["git", "status"])'],
      },
    },
  })
})
