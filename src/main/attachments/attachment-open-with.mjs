import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'

const PUBLIC_DEFAULT_APPLICATION = Object.freeze({
  id: 'default',
  label: 'Default app',
  isDefault: true,
})
const PUBLIC_CHOOSE_APPLICATION = Object.freeze({
  id: 'choose',
  label: 'Choose another app...',
})

const WINDOWS_APPLICATIONS = Object.freeze([
  ['VS Code', ['LOCALAPPDATA', 'Programs', 'Microsoft VS Code', 'Code.exe']],
  ['Cursor', ['LOCALAPPDATA', 'Programs', 'cursor', 'Cursor.exe']],
  ['GitHub Desktop', ['LOCALAPPDATA', 'GitHubDesktop', 'GitHubDesktop.exe']],
])

const MACOS_APPLICATIONS = Object.freeze([
  ['VS Code', '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'],
  ['Cursor', '/Applications/Cursor.app/Contents/MacOS/Cursor'],
  ['GitHub Desktop', '/Applications/GitHub Desktop.app/Contents/MacOS/GitHub Desktop'],
])

const LINUX_APPLICATIONS = Object.freeze([
  ['VS Code', '/usr/bin/code'],
  ['Cursor', '/usr/bin/cursor'],
  ['GitHub Desktop', '/usr/bin/github-desktop'],
])

function spawnProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
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
  })
}

function capabilityId(target) {
  return `app_${createHash('sha256').update(target.toLowerCase()).digest('hex').slice(0, 16)}`
}

function normalizedTargets(applications) {
  const seen = new Set()
  const normalized = []
  for (const application of applications || []) {
    if (application?.isDefault || application?.id === 'default') continue
    const target = String(application?.target || '').trim()
    const label = String(application?.label || '').trim()
    if (!target || !label) continue
    const key = target.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push({
      id: capabilityId(target),
      label,
      target,
      argsPrefix: Array.isArray(application.argsPrefix) ? [...application.argsPrefix] : [],
      ...(application.iconDataUrl ? { iconDataUrl: application.iconDataUrl } : {}),
    })
  }
  return normalized
}

function publicApplication(application) {
  return {
    id: application.id,
    label: application.label,
    ...(application.iconDataUrl ? { iconDataUrl: application.iconDataUrl } : {}),
  }
}

export function createAttachmentApplicationRegistry() {
  const targetsById = new Map()
  return {
    publish(applications) {
      targetsById.clear()
      return normalizedTargets(applications).map((application) => {
        targetsById.set(application.id, {
          target: application.target,
          argsPrefix: application.argsPrefix,
        })
        return publicApplication(application)
      })
    },
    resolve(applicationId) {
      return targetsById.get(applicationId) || null
    },
  }
}

export function normalizeAttachmentApplications(applications) {
  const hasDefault = (applications || []).some((application) => (
    application?.isDefault || application?.id === 'default'
  ))
  const published = createAttachmentApplicationRegistry().publish(applications)
  return hasDefault ? [PUBLIC_DEFAULT_APPLICATION, ...published] : published
}

async function pathExists(target, accessImpl = access) {
  try {
    await accessImpl(target)
    return true
  } catch {
    return false
  }
}

export async function discoverAttachmentApplications(_resource, options = {}) {
  const platform = options.platform || process.platform
  const accessImpl = options.access || access
  const env = options.env || process.env
  let candidates = []
  if (platform === 'win32') {
    candidates = WINDOWS_APPLICATIONS
      .map(([label, [envName, ...segments]]) => ({
        label,
        target: env[envName] ? path.join(env[envName], ...segments) : '',
      }))
      .filter((application) => application.target)
  } else if (platform === 'darwin') {
    candidates = MACOS_APPLICATIONS.map(([label, target]) => ({ label, target }))
  } else if (platform === 'linux') {
    candidates = LINUX_APPLICATIONS.map(([label, target]) => ({ label, target }))
  }
  const discovered = await Promise.all(candidates.map(async (application) => (
    await pathExists(application.target, accessImpl) ? application : null
  )))
  return discovered.filter(Boolean)
}

export async function listAttachmentApplications(resource, options = {}) {
  const registry = options.registry || createAttachmentApplicationRegistry()
  const discover = options.discoverApplications || discoverAttachmentApplications
  const applications = await discover(resource, options)
  return [
    PUBLIC_DEFAULT_APPLICATION,
    ...registry.publish(applications),
    PUBLIC_CHOOSE_APPLICATION,
  ]
}

async function launch(command, args, options) {
  try {
    const run = options.spawnProcess || spawnProcess
    const result = await run(command, args)
    return result?.code === 0
      ? { ok: true }
      : { ok: false, error: 'open_with_failed' }
  } catch {
    return { ok: false, error: 'open_with_failed' }
  }
}

export async function openAttachmentWith(resource, applicationId, options = {}) {
  const filePath = String(resource?.path || '')
  if (!filePath) return { ok: false, error: 'attachment_unavailable' }
  if (applicationId === 'default') {
    try {
      const error = await options.shellOpenPath(filePath)
      return error ? { ok: false, error: 'open_with_failed' } : { ok: true }
    } catch {
      return { ok: false, error: 'open_with_failed' }
    }
  }
  if (applicationId === 'choose') {
    if ((options.platform || process.platform) !== 'win32') {
      return { ok: false, error: 'open_with_application_unavailable' }
    }
    return launch('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', filePath], options)
  }
  const application = options.registry?.resolve(applicationId)
  if (!application) return { ok: false, error: 'open_with_application_unavailable' }
  return launch(application.target, [...application.argsPrefix, filePath], options)
}
