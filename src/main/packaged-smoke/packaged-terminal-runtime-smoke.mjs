import fs from 'node:fs/promises'
import path from 'node:path'

function normalizeTimeoutMs(value, fallback = 30_000) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.max(10_000, Math.round(numeric))
}

async function waitForMainWindowLoad(mainWindow, timeoutMs) {
  if (!mainWindow?.webContents) {
    throw new Error('Main window was not created for packaged smoke.')
  }
  if (!mainWindow.webContents.isLoadingMainFrame()) return

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for the packaged window to finish loading after ${timeoutMs}ms.`))
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      mainWindow.webContents.removeListener('did-finish-load', handleLoad)
      mainWindow.webContents.removeListener('did-fail-load', handleFailure)
    }
    const handleLoad = () => {
      cleanup()
      resolve()
    }
    const handleFailure = (_event, errorCode, errorDescription) => {
      cleanup()
      reject(new Error(`Packaged window failed to load (${errorCode}): ${String(errorDescription || 'unknown load failure')}`))
    }
    mainWindow.webContents.once('did-finish-load', handleLoad)
    mainWindow.webContents.once('did-fail-load', handleFailure)
  })
}

async function waitForRendererTerminalBridge(mainWindow, timeoutMs) {
  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs, 45_000)
  return await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const deadline = Date.now() + ${effectiveTimeoutMs}
      while (Date.now() < deadline) {
        const rootMounted = Number(document.getElementById('root')?.childElementCount || 0) > 0
        const terminalReady = typeof window.addom?.terminal?.getRuntimeHealth === 'function'
          && typeof window.addom?.terminal?.createSession === 'function'
          && typeof window.addom?.terminal?.writeSession === 'function'
          && typeof window.addom?.terminal?.attachSession === 'function'
          && typeof window.addom?.terminal?.closeSession === 'function'
        if (rootMounted && terminalReady) {
          return {
            rootMounted,
            terminalReady,
            locationHref: String(window.location.href || ''),
          }
        }
        await delay(75)
      }
      throw new Error('Timed out waiting for the renderer terminal bridge to become ready.')
    })()
  `, true)
}

async function evaluateTerminalRuntimeHealth(mainWindow, timeoutMs) {
  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs, 45_000)
  return await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

      async function waitForMarkers(sessionId, markers, timeoutMs) {
        const deadline = Date.now() + timeoutMs
        let lastSequence = 0
        let output = ''
        const requiredMarkers = Array.isArray(markers) ? markers.filter(Boolean) : [markers].filter(Boolean)
        while (Date.now() < deadline) {
          const attach = await window.addom.terminal.attachSession(sessionId, { sinceSequence: lastSequence })
          if (attach?.ok !== true) {
            throw new Error(String(attach?.message || attach?.error || 'terminal_session_attach_failed'))
          }
          const chunks = Array.isArray(attach?.output?.chunks) ? attach.output.chunks : []
          output += chunks.map((entry) => String(entry?.data || '')).join('')
          lastSequence = Number(attach?.output?.nextSequence || lastSequence) || lastSequence
          if (requiredMarkers.every((marker) => output.includes(marker))) {
            return {
              output,
              lastSequence,
            }
          }
          await delay(75)
        }
        throw new Error('Packaged terminal smoke timed out waiting for shell output.')
      }

      async function runTerminalScenario({
        platform,
        shell = 'default',
        command = '',
        markers = [],
        timeoutMs,
        keepOpen = false,
      }) {
        const createResult = await window.addom.terminal.createSession({
          cwd: '.',
          shell,
          cols: 100,
          rows: 30,
        })
        if (createResult?.ok !== true || !createResult?.session?.id) {
          throw new Error(String(createResult?.message || createResult?.error || 'terminal_session_create_failed'))
        }

        const sessionId = String(createResult.session.id)
        try {
          await delay(150)
          const writeResult = await window.addom.terminal.writeSession(sessionId, command)
          if (writeResult?.ok !== true) {
            throw new Error(String(writeResult?.message || writeResult?.error || 'terminal_session_write_failed'))
          }
          const observed = await waitForMarkers(sessionId, markers, timeoutMs)
          return {
            sessionId,
            shell,
            platform,
            markers,
            outputTail: String(observed?.output || '').slice(-500),
          }
        } finally {
          if (!keepOpen) {
            await window.addom.terminal.closeSession(sessionId).catch(() => null)
          }
        }
      }

      try {
        const hasAddom = typeof window.addom === 'object' && window.addom !== null
        const hasTerminalApi = typeof window.addom?.terminal?.getRuntimeHealth === 'function'
        const runtimeHealth = hasTerminalApi ? await window.addom.terminal.getRuntimeHealth() : null
        let sessionSmoke = null

        if (hasTerminalApi && runtimeHealth?.status === 'supported') {
          const platform = String(runtimeHealth?.platform || '').trim().toLowerCase()
          const echoCommand = platform === 'win32'
            ? 'echo ADDOM_PACKAGED_TERMINAL_OK\\r'
            : "printf '%s\\\\n' 'ADDOM_PACKAGED_TERMINAL_OK'\\r"
          const redrawProgram = 'let i=0; const timer=setInterval(()=>{ i+=1; process.stdout.write("\\rADDOM_PACKAGED_REDRAW_"+i); if(i>=4){ clearInterval(timer); process.stdout.write("\\r\\nADDOM_PACKAGED_REDRAW_OK\\r\\n"); } }, 25)'
          const redrawCommand = 'node -e ' + JSON.stringify(redrawProgram) + '\\r'
          const tuiCommand = platform === 'win32'
            ? 'node tests/live/fixtures/terminal-tui-smoke-app.mjs\\r'
            : 'node tests/live/fixtures/terminal-tui-smoke-app.mjs\\r'

          const echoScenario = await runTerminalScenario({
            platform,
            command: echoCommand,
            markers: ['ADDOM_PACKAGED_TERMINAL_OK'],
            timeoutMs: ${effectiveTimeoutMs},
          })
          const redrawScenario = await runTerminalScenario({
            platform,
            command: redrawCommand,
            markers: ['ADDOM_PACKAGED_REDRAW_OK'],
            timeoutMs: ${effectiveTimeoutMs},
          })
          const tuiScenario = await runTerminalScenario({
            platform,
            command: tuiCommand,
            markers: ['ADDOM_TUI_READY'],
            timeoutMs: ${effectiveTimeoutMs},
            keepOpen: true,
          })

          sessionSmoke = {
            echo: echoScenario,
            redraw: redrawScenario,
            tui: tuiScenario,
          }
        }

        if (sessionSmoke?.tui?.sessionId) {
          const sessionId = String(sessionSmoke.tui.sessionId)
          try {
            await delay(150)
            await window.addom.terminal.writeSession(sessionId, '\\u001b[D\\u001b[C\\u001b[A\\u001b[B')
            await window.addom.terminal.writeSession(sessionId, '\\u007f')
            await window.addom.terminal.writeSession(sessionId, '\\u001b[3~')
            await window.addom.terminal.writeSession(sessionId, 'PASTE_OK')
            await window.addom.terminal.writeSession(sessionId, 'UTF8_\\u20ac\\u00e1')
            await waitForMarkers(sessionId, [
              'ADDOM_TUI_ARROW_LEFT',
              'ADDOM_TUI_ARROW_RIGHT',
              'ADDOM_TUI_ARROW_UP',
              'ADDOM_TUI_ARROW_DOWN',
              'ADDOM_TUI_BACKSPACE',
              'ADDOM_TUI_DELETE',
              'ADDOM_TUI_PASTE',
              'ADDOM_TUI_UTF8',
            ], ${effectiveTimeoutMs})
            await delay(150)
            await window.addom.terminal.writeSession(sessionId, 'q')
            const tuiObserved = await waitForMarkers(sessionId, [
              'ADDOM_TUI_EXIT',
            ], ${effectiveTimeoutMs})
            sessionSmoke = {
              ...sessionSmoke,
              tui: {
                ...sessionSmoke.tui,
                outputTail: String(tuiObserved?.output || '').slice(-500),
              },
            }
          } finally {
            await window.addom.terminal.closeSession(sessionId).catch(() => null)
          }
        }

        return {
          hasAddom,
          hasTerminalApi,
          runtimeHealth,
          sessionSmoke,
        }
      } catch (error) {
        return {
          hasAddom: false,
          hasTerminalApi: false,
          runtimeHealth: null,
          sessionSmoke: null,
          error: String(error?.message || error || 'terminal_runtime_eval_failed'),
        }
      }
    })()
  `, true)
}

async function writeSmokeResult(resultPath = '', payload = {}) {
  const targetPath = String(resultPath || '').trim()
  if (!targetPath) return
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function runPackagedTerminalRuntimeSmoke({
  app,
  mainWindow,
  resultPath = '',
  timeoutMs = process.env.ADDOM_PACKAGED_TERMINAL_SMOKE_TIMEOUT_MS,
} = {}) {
  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs)
  const result = {
    ok: false,
    startedAt: new Date().toISOString(),
    userDataPath: String(app?.getPath?.('userData') || '').trim(),
  }

  try {
    await waitForMainWindowLoad(mainWindow, effectiveTimeoutMs)
    result.rendererReady = await waitForRendererTerminalBridge(mainWindow, effectiveTimeoutMs)
    result.preload = await evaluateTerminalRuntimeHealth(mainWindow, effectiveTimeoutMs)

    if (result.preload?.hasAddom !== true) {
      throw new Error('Packaged terminal smoke did not observe the preload bridge.')
    }
    if (result.preload?.hasTerminalApi !== true) {
      throw new Error('Packaged terminal smoke did not observe addom.terminal.getRuntimeHealth.')
    }
    if (result.preload?.runtimeHealth?.status !== 'supported') {
      throw new Error(`Packaged terminal runtime health was not supported: ${JSON.stringify(result.preload?.runtimeHealth || null)}`)
    }
    if (
      !result.preload?.sessionSmoke?.echo?.sessionId
      || !String(result.preload?.sessionSmoke?.echo?.outputTail || '').includes('ADDOM_PACKAGED_TERMINAL_OK')
    ) {
      throw new Error(`Packaged terminal smoke did not observe live shell I/O: ${JSON.stringify(result.preload?.sessionSmoke || null)}`)
    }

    result.ok = true
  } catch (error) {
    result.error = String(error?.message || error || 'packaged_terminal_runtime_smoke_failed')
  } finally {
    result.finishedAt = new Date().toISOString()
    await writeSmokeResult(resultPath, result)
  }

  return result
}
