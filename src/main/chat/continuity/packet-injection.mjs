function isSystemMessage(row) {
  return String(row?.role || '').trim().toLowerCase() === 'system'
}

export function isContinuityPacketMessage(row) {
  return isSystemMessage(row) && String(row?.content || '').includes('[ADDOM Continuity Packet]')
}

export function stripContinuityPacketMessages(history = []) {
  const rows = Array.isArray(history) ? [...history] : []
  let removedCount = 0
  const next = rows.filter((row) => {
    if (isContinuityPacketMessage(row)) {
      removedCount += 1
      return false
    }
    return true
  })
  return { history: next, removedCount }
}

export function upsertContinuityPacketMessage(history = [], packetText = '') {
  const packet = String(packetText || '').trim()
  if (!packet) return Array.isArray(history) ? [...history] : []
  const stripped = stripContinuityPacketMessages(history)
  const rows = Array.isArray(stripped.history) ? [...stripped.history] : []
  const firstSystemIdx = rows.findIndex((row) => isSystemMessage(row))
  if (firstSystemIdx >= 0) {
    rows.splice(firstSystemIdx + 1, 0, { role: 'system', content: packet })
    return rows
  }
  rows.unshift({ role: 'system', content: packet })
  return rows
}
