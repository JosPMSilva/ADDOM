import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-bridge-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  OpenAIAccountBridge,
  __testOpenAIAccountBridgeInternals,
} = await import('../../src/main/openai-account/openai-account-bridge.mjs')

function createChildProcessStub() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.stderr.setEncoding = () => {}
  child.writes = []
  child.stdin = {
    write: (line, _encoding, callback) => {
      const payload = JSON.parse(String(line || '').trim())
      child.writes.push(payload)
      queueMicrotask(() => {
        if (payload.method === 'initialize') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: { platformFamily: 'desktop', platformOs: 'windows' },
          })}\n`)
        } else if (payload.method === 'account/read') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: {
              authMode: 'chatgpt',
              user: { email: 'dev@example.com' },
            },
          })}\n`)
        } else if (payload.method === 'account/login/start') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: { loginId: 'login_1', authUrl: 'https://chatgpt.com/auth' },
          })}\n`)
          child.stdout.emit('data', `${JSON.stringify({
            method: 'account/login/completed',
            params: { loginId: 'login_1', success: true, error: null },
          })}\n`)
        } else if (payload.method === 'account/login/cancel') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: { ok: true },
          })}\n`)
        } else if (payload.method === 'account/logout') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: { ok: true },
          })}\n`)
        } else if (payload.method === 'account/rateLimits/read') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: { tier: 'plus' },
          })}\n`)
        } else if (payload.method === 'thread/compact/start') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: {},
          })}\n`)
        } else if (payload.method === 'collaborationMode/list') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: {
              collaborationModes: [
                { id: 'default', name: 'Default', default: true },
                { id: 'plan', name: 'Plan' },
              ],
            },
          })}\n`)
        }
        callback?.(null)
      })
    },
  }
  child.kill = () => {
    child.emit('exit', 0, 'SIGTERM')
  }
  return child
}

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('bridge launch spec isolates Codex home and writes config under ADDOM-owned storage', () => {
  const spec = __testOpenAIAccountBridgeInternals.buildOpenAIAccountBridgeLaunchSpec({
    userDataPath,
    env: {
      ...process.env,
      ADDOM_CODEX_EXECUTABLE: 'codex-custom',
      ADDOM_UNRELATED_SECRET: 'should-not-leak',
    },
    platform: 'win32',
  })

  assert.equal(spec.command, 'codex-custom')
  assert.deepEqual(spec.args, ['app-server', '--listen', 'stdio://'])
  assert.equal(spec.env.CODEX_HOME, spec.paths.codexHomePath)
  assert.equal(spec.env.CODEX_CONFIG, spec.configPath)
  assert.equal(spec.env.ADDOM_UNRELATED_SECRET, undefined)
  assert.equal(fs.existsSync(spec.configPath), true)
  const configText = fs.readFileSync(spec.configPath, 'utf8')
  assert.match(configText, /history\.persistence = "none"/)
  assert.match(configText, /cli_auth_credentials_store = "file"/)
  assert.match(configText, /log_dir = /)
})

test('bridge launch spec seeds a managed JS skill installer into the ADDOM-owned Codex home', () => {
  const spec = __testOpenAIAccountBridgeInternals.buildOpenAIAccountBridgeLaunchSpec({
    userDataPath,
    env: process.env,
    platform: 'win32',
  })

  const skillInstallerPath = path.join(spec.paths.codexHomePath, 'skills', '.system', 'skill-installer')
  const skillInstallerMarkdownPath = path.join(skillInstallerPath, 'SKILL.md')
  const listSkillsScriptPath = path.join(skillInstallerPath, 'scripts', 'list-skills.mjs')
  const installSkillScriptPath = path.join(skillInstallerPath, 'scripts', 'install-skill-from-github.mjs')

  assert.equal(fs.existsSync(skillInstallerMarkdownPath), true)
  assert.equal(fs.existsSync(listSkillsScriptPath), true)
  assert.equal(fs.existsSync(installSkillScriptPath), true)

  const skillMarkdown = fs.readFileSync(skillInstallerMarkdownPath, 'utf8')
  const installSkillScript = fs.readFileSync(installSkillScriptPath, 'utf8')
  assert.match(skillMarkdown, /node scripts\/list-skills\.mjs/)
  assert.match(skillMarkdown, /node scripts\/install-skill-from-github\.mjs/)
  assert.match(skillMarkdown, /`skills\/\.curated` and `skills\/\.experimental` are directories, not file manifests\./)
  assert.match(skillMarkdown, /Do not use `Get-Content`, `cat`, zip extraction shortcuts/)
  assert.match(skillMarkdown, /Restart ADDOM to pick up new skills\./)
  assert.doesNotMatch(skillMarkdown, /Restart Codex to pick up new skills\./)
  assert.match(installSkillScript, /Restart ADDOM to pick up new skills\./)
  assert.doesNotMatch(installSkillScript, /Restart Codex to pick up new skills\./)
  assert.doesNotMatch(skillMarkdown, /install-skill-from-github\.py|list-skills\.py/)
})

test('bridge launch spec writes Codex account auto-compaction settings into managed config when enabled', () => {
  const spec = __testOpenAIAccountBridgeInternals.buildOpenAIAccountBridgeLaunchSpec({
    userDataPath,
    runtimeSettings: {
      codexAutoThreadCompactionEnabled: true,
      codexAutoThreadCompactionTokenLimit: 180000,
      codexAutoThreadCompactionInstructions: 'Preserve decisions.\nKeep unresolved work.',
    },
    env: process.env,
    platform: 'win32',
  })

  const configText = fs.readFileSync(spec.configPath, 'utf8')
  assert.match(configText, /model_auto_compact_token_limit = 180000/)
  assert.equal(
    configText.includes('compact_prompt = "Preserve decisions.\\nKeep unresolved work."'),
    true,
  )
  assert.equal(spec.runtimeSettings.codexAutoThreadCompactionEnabled, true)
  assert.equal(spec.runtimeSettings.codexAutoThreadCompactionTokenLimit, 180000)
})

test('bridge launch spec keeps account auto-compaction enabled when token limit is automatic', () => {
  const spec = __testOpenAIAccountBridgeInternals.buildOpenAIAccountBridgeLaunchSpec({
    userDataPath,
    runtimeSettings: {
      codexAutoThreadCompactionEnabled: true,
      codexAutoThreadCompactionTokenLimit: 0,
      codexAutoThreadCompactionInstructions: 'Preserve decisions.',
    },
    env: process.env,
    platform: 'win32',
  })

  const configText = fs.readFileSync(spec.configPath, 'utf8')
  assert.doesNotMatch(configText, /model_auto_compact_token_limit/)
  assert.doesNotMatch(configText, /compact_prompt/)
  assert.equal(spec.runtimeSettings.codexAutoThreadCompactionEnabled, true)
  assert.equal(spec.runtimeSettings.codexAutoThreadCompactionTokenLimit, 0)
})

test('bridge sends JSONL requests and emits account notifications from stdout', async () => {
  const child = createChildProcessStub()
  child.stdin.write = (line, _encoding, callback) => {
    const payload = JSON.parse(String(line || '').trim())
    child.writes.push(payload)
    queueMicrotask(() => {
      if (payload.method === 'initialize') {
        child.stdout.emit('data', `${JSON.stringify({
          id: payload.id,
          result: { platformFamily: 'desktop', platformOs: 'windows' },
        })}\n`)
      } else if (payload.method === 'account/login/start') {
        child.stdout.emit('data', `${JSON.stringify({
          id: payload.id,
          result: {
            loginId: 'login_1',
            authUrl: 'https://chatgpt.com/auth?code=abc123',
            callbackUrl: 'https://localhost:3210/callback?code=abc123&state=xyz',
            access_token: 'tok_123',
          },
        })}\n`)
        child.stderr.emit('data', 'callback failed at https://localhost:3210/callback?code=abc123&state=xyz token=tok_123')
        child.stdout.emit('data', `${JSON.stringify({
          method: 'account/login/completed',
          params: { loginId: 'login_1', success: true, error: null },
        })}\n`)
      }
      callback?.(null)
    })
  }
  const calls = []
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    execFileImpl: async () => ({ stdout: 'Codex 1.0.0', stderr: '' }),
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options })
      return child
    },
  })

  const completedEvents = []
  bridge.on('account/login/completed', (payload) => {
    completedEvents.push(payload)
  })

  const result = await bridge.startLogin({ type: 'chatgpt' })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, ['app-server', '--listen', 'stdio://'])
  assert.deepEqual(child.writes.map((entry) => entry.method), ['initialize', 'initialized', 'account/login/start'])
  assert.equal(child.writes[0]?.params?.capabilities?.experimentalApi, true)
  assert.equal(child.writes[0]?.params?.capabilities?.mcpServerOpenaiFormElicitation, true)
  assert.equal(child.writes[0]?.params?.capabilities?.requestAttestation, false)
  assert.equal(result.loginId, 'login_1')
  assert.equal(result.authUrl, 'https://chatgpt.com/auth?code=abc123')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(completedEvents.length, 1)
  assert.equal(completedEvents[0].loginId, 'login_1')

  const logPath = bridge.logFilePath
  const logText = fs.readFileSync(logPath, 'utf8')
  assert.doesNotMatch(logText, /code=abc123|token=tok_123/i)
  assert.match(logText, /\[redacted-authurl\]/i)
  assert.match(logText, /\[redacted-callbackurl\]/i)
  assert.match(logText, /"access_token":"\[redacted\]"/i)
  assert.match(logText, /\[redacted-query\]/i)
})

test('bridge emits server-initiated JSON-RPC requests separately from responses', async () => {
  const child = createChildProcessStub()
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    execFileImpl: async () => ({ stdout: 'Codex 1.0.0', stderr: '' }),
    spawnImpl: () => child,
  })

  const requests = []
  bridge.on('server-request', (payload) => {
    requests.push(payload)
  })

  await bridge.ensureInitialized()
  child.stdout.emit('data', `${JSON.stringify({
    id: 99,
    method: 'item/commandExecution/requestApproval',
    params: { threadId: 'thr_1', turnId: 'turn_1', itemId: 'item_1' },
  })}\n`)

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].id, 99)
  assert.equal(requests[0].method, 'item/commandExecution/requestApproval')
})

test('bridge lists collaboration modes and caches the normalized presets', async () => {
  const child = createChildProcessStub()
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    execFileImpl: async () => ({ stdout: 'Codex 1.0.0', stderr: '' }),
    spawnImpl: () => child,
  })

  const first = await bridge.listCollaborationModes()
  const second = await bridge.listCollaborationModes()

  assert.deepEqual(first, [
    {
      id: 'default',
      name: 'Default',
      description: '',
      isDefault: true,
      raw: { id: 'default', name: 'Default', default: true },
    },
    {
      id: 'plan',
      name: 'Plan',
      description: '',
      isDefault: false,
      raw: { id: 'plan', name: 'Plan' },
    },
  ])
  assert.deepEqual(second, first)
  assert.equal(
    child.writes.filter((entry) => entry.method === 'collaborationMode/list').length,
    1,
  )
})

test('bridge resolves bare codex command through where.exe on Windows before probe and spawn', async () => {
  const child = createChildProcessStub()
  const calls = []
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    platform: 'win32',
    execFileImpl: async (command, args) => {
      calls.push({ command, args })
      if (command === 'where.exe') {
        return {
          stdout: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.313.5234.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe\r\n',
          stderr: '',
        }
      }
      if (command.endsWith('codex.exe') && Array.isArray(args) && args[0] === '--version') {
        return { stdout: 'Codex 1.0.0', stderr: '' }
      }
      throw new Error(`Unexpected exec call: ${command} ${String(args || []).join(' ')}`)
    },
    spawnImpl: (command, args) => {
      calls.push({ command, args, spawned: true })
      return child
    },
  })

  await bridge.ensureInitialized()

  assert.equal(calls[0]?.command, 'where.exe')
  assert.equal(calls[1]?.command.endsWith('codex.exe'), true)
  assert.equal(calls[2]?.command.endsWith('codex.exe'), true)
  assert.deepEqual(calls[2]?.args, ['app-server', '--listen', 'stdio://'])
})

test('bridge uses an explicit managed executable path without shell resolution', async () => {
  const child = createChildProcessStub()
  const calls = []
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    platform: 'win32',
    codexExecutablePath: 'C:\\managed-runtime\\codex.exe',
    execFileImpl: async (command, args) => {
      calls.push({ command, args })
      if (command === 'C:\\managed-runtime\\codex.exe' && Array.isArray(args) && args[0] === '--version') {
        return { stdout: 'Codex 1.0.0', stderr: '' }
      }
      throw new Error(`Unexpected exec call: ${command} ${String(args || []).join(' ')}`)
    },
    spawnImpl: (command, args) => {
      calls.push({ command, args, spawned: true })
      return child
    },
  })

  await bridge.ensureInitialized()

  assert.equal(calls.some((entry) => entry.command === 'where.exe'), false)
  assert.equal(calls[0]?.command, 'C:\\managed-runtime\\codex.exe')
  assert.equal(calls[1]?.command, 'C:\\managed-runtime\\codex.exe')
  assert.deepEqual(calls[1]?.args, ['app-server', '--listen', 'stdio://'])
})

test('bridge compatibility smoke test verifies required auth endpoints', async () => {
  const child = createChildProcessStub()
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    execFileImpl: async () => ({ stdout: 'Codex 1.0.0', stderr: '' }),
    spawnImpl: () => child,
  })

  const result = await bridge.runCompatibilitySmokeTest()

  assert.equal(result.ok, true)
  assert.equal(result.account?.authMode, 'chatgpt')
  assert.equal(result.login?.loginId, 'login_1')
  assert.equal(result.rateLimits?.tier, 'plus')
  assert.deepEqual(
    child.writes.map((entry) => entry.method),
    [
      'initialize',
      'initialized',
      'account/read',
      'account/login/start',
      'account/login/cancel',
      'account/logout',
      'account/rateLimits/read',
    ],
  )
})

test('bridge wraps thread/compact/start for manual Codex account compaction', async () => {
  const child = createChildProcessStub()
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    execFileImpl: async () => ({ stdout: 'Codex 1.0.0', stderr: '' }),
    spawnImpl: () => child,
  })

  const result = await bridge.startThreadCompaction('thr_compact_1')

  assert.deepEqual(result, {})
  assert.equal(
    child.writes.some((entry) => entry.method === 'thread/compact/start' && entry.params?.threadId === 'thr_compact_1'),
    true,
  )
})

test('bridge records the executable version and initialize platform as loaded runtime identity', async () => {
  const child = createChildProcessStub()
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    codexExecutablePath: 'C:\\tools\\codex.exe',
    execFileImpl: async () => ({ stdout: 'codex-cli 0.124.0\n', stderr: '' }),
    spawnImpl: () => child,
  })

  await bridge.probeCompatibility()

  assert.deepEqual(bridge.getRuntimeIdentity(), {
    executable: 'codex.exe',
    version: '0.124.0',
    platformFamily: 'desktop',
    platformOs: 'windows',
  })
})

test('bridge fails closed when initialize response is incompatible with required protocol shape', async () => {
  const child = createChildProcessStub()
  child.stdin.write = (line, _encoding, callback) => {
    const payload = JSON.parse(String(line || '').trim())
    child.writes.push(payload)
    queueMicrotask(() => {
      if (payload.method === 'initialize') {
        child.stdout.emit('data', `${JSON.stringify({
          id: payload.id,
          result: {},
        })}\n`)
      }
      callback?.(null)
    })
  }
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    execFileImpl: async () => ({ stdout: 'Codex 1.0.0', stderr: '' }),
    spawnImpl: () => child,
  })

  await assert.rejects(
    () => bridge.ensureInitialized(),
    /initialize response is incompatible/i,
  )
  assert.equal(bridge.getAvailability().supported, false)
  assert.equal(bridge.getAvailability().reason, 'bridge_protocol_incompatible')
})

test('bridge compatibility probe fails closed on incompatible initialize responses before readiness is reported', async () => {
  const child = createChildProcessStub()
  child.stdin.write = (line, _encoding, callback) => {
    const payload = JSON.parse(String(line || '').trim())
    child.writes.push(payload)
    queueMicrotask(() => {
      if (payload.method === 'initialize') {
        child.stdout.emit('data', `${JSON.stringify({
          id: payload.id,
          result: {},
        })}\n`)
      }
      callback?.(null)
    })
  }
  const bridge = new OpenAIAccountBridge({
    userDataPath,
    execFileImpl: async () => ({ stdout: 'Codex 1.0.0', stderr: '' }),
    spawnImpl: () => child,
  })

  const availability = await bridge.probeCompatibility()

  assert.equal(availability.supported, false)
  assert.equal(availability.reason, 'bridge_protocol_incompatible')
})
