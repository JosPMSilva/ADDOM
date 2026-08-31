import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { pathToFileURL } from 'node:url'

const WINDOWS_COPY_FILE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  '$path=$env:ADDOM_ATTACHMENT_CLIPBOARD_PATH',
  "if([string]::IsNullOrWhiteSpace($path)){throw 'missing_path'}",
  'Set-Clipboard -LiteralPath $path',
].join(';')

const MACOS_COPY_FILE_SCRIPT = [
  'on run argv',
  'set the clipboard to (POSIX file (item 1 of argv))',
  'end run',
].join('\n')

function spawnProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(options.input || '')
  })
}

async function commandExists(command) {
  const pathEntries = String(process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')
  for (const entry of pathEntries) {
    if (!entry) continue
    try {
      await access(`${entry}/${command}`, fsConstants.X_OK)
      return true
    } catch {
      // Try the next PATH entry.
    }
  }
  return false
}

async function runLinuxCopy(filePath, options) {
  const exists = options.commandExists || commandExists
  const run = options.spawnProcess || spawnProcess
  const uri = pathToFileURL(filePath).href
  if (await exists('wl-copy')) {
    return run('wl-copy', ['--type', 'x-special/gnome-copied-files'], {
      input: `copy\n${uri}\n`,
    })
  }
  if (await exists('xclip')) {
    return run('xclip', ['-selection', 'clipboard', '-t', 'text/uri-list', '-i'], {
      input: `${uri}\n`,
    })
  }
  return null
}

export async function copyFileResourceToClipboard(filePath, options = {}) {
  const platform = options.platform || process.platform
  const run = options.spawnProcess || spawnProcess
  try {
    let result
    if (platform === 'win32') {
      result = await run('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_COPY_FILE_SCRIPT,
      ], {
        env: { ...process.env, ADDOM_ATTACHMENT_CLIPBOARD_PATH: filePath },
      })
    } else if (platform === 'darwin') {
      result = await run('osascript', ['-e', MACOS_COPY_FILE_SCRIPT, filePath])
    } else if (platform === 'linux') {
      result = await runLinuxCopy(filePath, options)
      if (!result) return { ok: false, error: 'file_clipboard_unsupported' }
    } else {
      return { ok: false, error: 'file_clipboard_unsupported' }
    }
    return result?.code === 0
      ? { ok: true }
      : { ok: false, error: 'file_clipboard_failed' }
  } catch {
    return { ok: false, error: 'file_clipboard_failed' }
  }
}
