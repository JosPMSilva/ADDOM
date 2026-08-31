import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('Agents settings uses the canonical settings contract and removes dormant MoA policy dashboards', () => {
  const root = readSource('src/renderer/components/settings/SettingsPanelRoot.jsx')
  const sections = readSource('src/renderer/components/settings/SettingsPanelSections.jsx')
  const manager = readSource('src/renderer/components/settings/SettingsSubagentsManager.jsx')
  const summary = readSource('src/renderer/components/settings/SettingsSubagentsSummary.jsx')

  assert.match(root, /normalizeAgentSettings/)
  assert.match(root, /const \[agentSettings, setAgentSettings\]/)
  assert.doesNotMatch(root, /normalizeMoaPolicyForUi|normalizeMoaBudgetPolicyForUi|normalizeMoaUserTier/)
  assert.match(sections, /agentSettings=\{agentSettings\}/)
  assert.match(manager, /AgentPolicySettings/)
  assert.match(summary, /agentSettings/)
  assert.equal(fs.existsSync(path.join(repoRoot, 'src/renderer/components/settings/MoaPolicySection.jsx')), false)
  assert.equal(fs.existsSync(path.join(repoRoot, 'src/renderer/components/settings/MoaBudgetPolicySection.jsx')), false)
  assert.equal(fs.existsSync(path.join(repoRoot, 'src/renderer/components/settings/MoaTierSelector.jsx')), false)
})

test('Agents policy UI persists only the canonical agentSettings object', () => {
  const source = readSource('src/renderer/components/settings/AgentPolicySettings.jsx')

  assert.match(source, /window\.addom\.settings\.set\(\{ agentSettings: normalized \}\)/)
  assert.match(source, /isolationDescription/)
  assert.match(source, /maxLiveAgents/)
  assert.match(source, /maxDepth/)
  assert.match(source, /maxDescendants/)
  assert.match(source, /maxTotalTokens/)
  assert.match(source, /maxCostUsd/)
  assert.match(source, /maxDurationMs/)
  assert.match(source, /fanoutConfirmationThreshold/)
  assert.doesNotMatch(source, /moaPolicy|moaBudgetPolicy|runtimeRole/)
})

test('Agents policy UI keeps everyday controls compact and advanced limits disclosed', () => {
  const source = readSource('src/renderer/components/settings/AgentPolicySettings.jsx')

  assert.match(source, /role="switch"/)
  assert.match(source, /inline-flex h-5 w-9 items-center/)
  assert.match(source, /translate-x-4/)
  assert.match(source, /data-ui="agent-policy-advanced"/)
  assert.match(source, /aria-expanded=\{advancedOpen\}/)
  assert.match(source, /persistAgentSettings/)
  assert.doesNotMatch(source, /pointer-events-none/)
  assert.doesNotMatch(source, /grid-cols-2 gap-x-3 gap-y-3/)
})

test('chat delegation forwards Agent settings through standard and OpenAI-account execution', () => {
  const handlerSource = readSource('src/main/ipc-handlers/chat-stream-handler.mjs')
  const accountExecutorSource = readSource(
    'src/main/ipc-handlers/chat-stream-handler-account-tool-executor.mjs',
  )

  assert.ok(
    handlerSource.match(/\n\s+agentSettings,/g)?.length >= 2,
    'expected both execution paths to receive Agent settings',
  )
  assert.match(accountExecutorSource, /agentSettings,[\s\S]{0,120}requestFanoutConfirmation/)
})
