import test from 'node:test'
import assert from 'node:assert/strict'

import { executePipeline } from '../../src/main/moa/pipeline-executor.mjs'

test('executePipeline chains outputs from envelope.agents into the next step context', async () => {
  const seenTasks = []
  const seenContexts = []
  const result = await executePipeline({
    id: 'pipe_chain',
    name: 'Chain',
    steps: [
      {
        stepId: 'step_a',
        roleId: 'role_a',
        roleName: 'Reviewer',
        instruction: 'Inspect the current implementation.',
      },
      {
        stepId: 'step_b',
        roleId: 'role_b',
        roleName: 'Fixer',
        instruction: 'Apply the follow-up changes.',
      },
    ],
  }, {
    projectFolder: process.cwd(),
    moaRoles: [],
    vaultGetKey: () => 'sk-test',
    emitMoaEvent: () => {},
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    executeDelegationFn: async (tasks, _roles, _vault, _folder, _emit, _signal, context) => {
      seenTasks.push(tasks[0])
      seenContexts.push(context)
      return {
        status: 'completed',
        agents: [{
          taskId: tasks[0].task_id,
          status: 'completed',
          output: tasks[0].task_id === 'step_a' ? 'step-a-output' : 'step-b-output',
        }],
      }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(seenTasks.length, 2)
  assert.match(String(seenTasks[1]?.injected_context || ''), /step-a-output/)
  assert.equal(seenContexts[0].projectId, 'project_01')
  assert.equal(seenContexts[0].threadId, 'thread_01')
  assert.equal(seenContexts[0].turnId, 'turn_01')
  assert.equal(result.finalOutput, 'step-b-output')
})

test('executePipeline treats non-completed delegated agent statuses as step failures', async () => {
  const result = await executePipeline({
    id: 'pipe_fail',
    name: 'Failing Chain',
    steps: [{
      stepId: 'step_fail',
      roleId: 'role_a',
      roleName: 'Reviewer',
      instruction: 'Inspect the current implementation.',
    }],
  }, {
    projectFolder: process.cwd(),
    moaRoles: [],
    vaultGetKey: () => 'sk-test',
    emitMoaEvent: () => {},
    executeDelegationFn: async () => ({
      status: 'completed_with_errors',
      agents: [{
        taskId: 'step_fail',
        status: 'rate_limited',
        output: '',
      }],
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'step_failed')
  assert.equal(result.failedStep, 'step_fail')
  assert.equal(result.steps[0]?.status, 'rate_limited')
})
