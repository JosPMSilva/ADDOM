import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const { createOpenAIAccountSandboxPolicy } = await import(
  '../../src/main/api-clients/ai-provider-openai-account-bridge-session.mjs'
)

test('Ask mode uses the current workspace permission profile', () => {
  const projectFolder = path.resolve('C:/projects/active')

  const policy = createOpenAIAccountSandboxPolicy({
    permissionMode: 'ask',
    projectFolder,
  })

  assert.equal(policy.threadApprovalPolicy, 'on-request')
  assert.equal(policy.threadPermissions, ':workspace')
  assert.equal(policy.turnApprovalPolicy, 'on-request')
  assert.equal(policy.turnPermissions, ':workspace')
  assert.equal('threadSandbox' in policy, false)
  assert.equal('turnSandboxPolicy' in policy, false)
})

test('Ask mode without a project uses the current read-only permission profile', () => {
  const policy = createOpenAIAccountSandboxPolicy({
    permissionMode: 'ask',
  })

  assert.equal(policy.threadPermissions, ':read-only')
  assert.equal(policy.turnPermissions, ':read-only')
  assert.equal('turnSandboxPolicy' in policy, false)
})

test('full access keeps its explicit danger-full-access policy', () => {
  const policy = createOpenAIAccountSandboxPolicy({
    permissionMode: 'full_access',
    projectFolder: path.resolve('C:/projects/active'),
  })

  assert.equal(policy.threadApprovalPolicy, 'never')
  assert.equal(policy.threadPermissions, ':danger-full-access')
  assert.equal(policy.turnApprovalPolicy, 'never')
  assert.equal(policy.turnPermissions, ':danger-full-access')
  assert.equal('turnSandboxPolicy' in policy, false)
})

for (const turnMode of ['plan', 'thinking']) {
  test(`${turnMode} mode uses the current built-in read-only policy without deprecated access overrides`, () => {
    const policy = createOpenAIAccountSandboxPolicy({
      permissionMode: 'full_access',
      turnMode,
      projectFolder: path.resolve('C:/projects/active'),
    })

    assert.equal(policy.threadPermissions, ':read-only')
    assert.equal(policy.turnApprovalPolicy, 'on-request')
    assert.equal(policy.turnPermissions, ':read-only')
    assert.equal('threadSandbox' in policy, false)
    assert.equal('turnSandboxPolicy' in policy, false)
  })
}
