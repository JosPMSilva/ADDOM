import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { createCursorAgentProcessRunner } from '../../src/main/cursor-agent/cursor-agent-process.mjs'

function createChild() {
  const child = new EventEmitter()
  child.pid = 4200
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.stderr.setEncoding = () => {}
  child.stdin = { end: () => {} }
  return child
}

test('Cursor process runner keeps API keys out of arguments and streams normalized events', async () => {
  const child = createChild()
  let spawnCall = null
  const streamedEvents = []
  const runner = createCursorAgentProcessRunner({
    spawnProcess: (command, args, options) => {
      spawnCall = { command, args, options }
      queueMicrotask(() => {
        child.stdout.emit('data', '{"type":"system","subtype":"init","cwd":"C:\\\\repo","session_id":"session-1","model":"Composer 2.5"}\n')
        child.stdout.emit('data', '{"type":"result","subtype":"success","session_id":"session-1","result":"ok"}\n')
        child.emit('close', 0, null)
      })
      return child
    },
    killProcessTree: async () => true,
  })

  const run = runner.start({
    commandPath: 'C:\\runtime\\cursor-agent.cmd',
    cwd: 'C:\\repo',
    prompt: 'hello',
    apiKey: 'crsr_secret_value',
    model: 'composer-2.5',
    onEvent: (event) => streamedEvents.push(event),
  })
  const result = await run.completed

  assert.equal(spawnCall.args.includes('crsr_secret_value'), false)
  assert.equal(spawnCall.options.env.CURSOR_API_KEY, 'crsr_secret_value')
  assert.deepEqual(result.events.map((event) => event.kind), ['init', 'result'])
  assert.deepEqual(streamedEvents.map((event) => event.kind), ['init', 'result'])
  assert.doesNotMatch(JSON.stringify(result), /crsr_secret_value/)
})

test('Cursor process runner contains malformed stream errors instead of throwing from stdout callbacks', async () => {
  const child = createChild()
  let killCount = 0
  const runner = createCursorAgentProcessRunner({
    spawnProcess: () => {
      queueMicrotask(() => {
        child.stdout.emit('data', '{not-json}\n')
        child.emit('close', 1, null)
      })
      return child
    },
    killProcessTree: async () => { killCount += 1; return true },
  })

  const result = await runner.start({ commandPath: 'cursor-agent.cmd', cwd: 'C:\\repo' }).completed

  assert.equal(result.status, 'failed')
  assert.match(result.error?.message || '', /malformed cursor agent stream/i)
  assert.equal(killCount, 1)
})

test('Cursor process cancellation is idempotent and kills the exact process tree once', async () => {
  const child = createChild()
  let killCount = 0
  const runner = createCursorAgentProcessRunner({
    spawnProcess: () => child,
    killProcessTree: async (pid) => {
      assert.equal(pid, 4200)
      killCount += 1
      child.emit('close', null, 'SIGTERM')
      return true
    },
  })
  const run = runner.start({ commandPath: 'cursor-agent.cmd', cwd: 'C:\\repo' })

  const [first, second] = await Promise.all([run.cancel(), run.cancel()])

  assert.equal(first, true)
  assert.equal(second, true)
  assert.equal(killCount, 1)
  await run.completed
})
