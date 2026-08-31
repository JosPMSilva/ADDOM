const IPC_VERSION = 'v1'
const LEGACY_RECEIVE_WARNED_CHANNELS = new Set()

function hasVersionPrefix(channel = '') {
  return String(channel || '').startsWith(`${IPC_VERSION}:`)
}

export function toVersionedChannel(channel = '') {
  const normalized = String(channel || '').trim()
  if (!normalized) return ''
  if (hasVersionPrefix(normalized)) return normalized
  return `${IPC_VERSION}:${normalized}`
}

function warnLegacyReceive(channel = '') {
  const normalized = String(channel || '').trim()
  if (!normalized || LEGACY_RECEIVE_WARNED_CHANNELS.has(normalized)) return
  LEGACY_RECEIVE_WARNED_CHANNELS.add(normalized)
  try {
    console.warn(`[ipc] Legacy bare channel received: "${normalized}". Prefer "${toVersionedChannel(normalized)}".`)
  } catch {
    // Non-fatal logging failure.
  }
}

export function onVersioned(ipcMain, channel, listener) {
  const base = String(channel || '').trim()
  if (!base || typeof listener !== 'function') return
  const versioned = toVersionedChannel(base)
  ipcMain.on(versioned, listener)
  if (!versioned || versioned === base) return
  ipcMain.on(base, (...args) => {
    warnLegacyReceive(base)
    return listener(...args)
  })
}

export function handleVersioned(ipcMain, channel, listener) {
  const base = String(channel || '').trim()
  if (!base || typeof listener !== 'function') return
  const versioned = toVersionedChannel(base)
  ipcMain.handle(versioned, listener)
  if (!versioned || versioned === base) return
  ipcMain.handle(base, (...args) => {
    warnLegacyReceive(base)
    return listener(...args)
  })
}

export function sendVersioned(sender, channel, payload) {
  if (!sender || typeof sender.send !== 'function') return
  const base = String(channel || '').trim()
  if (!base) return
  const versioned = toVersionedChannel(base)
  if (!versioned) return
  sender.send(versioned, payload)
}

export { IPC_VERSION }
