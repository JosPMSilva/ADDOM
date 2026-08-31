const STAGED_NOTE_PREFIX = 'staged:'

function normalizePayload(input = {}) {
  return input && typeof input === 'object' ? input : {}
}

export function buildStagedArtifactNote(payload = {}) {
  return `${STAGED_NOTE_PREFIX}${JSON.stringify(normalizePayload(payload))}`
}

export function parseStagedArtifactNote(note = '') {
  const raw = String(note || '').trim()
  if (!raw.startsWith(STAGED_NOTE_PREFIX)) return null
  try {
    const parsed = JSON.parse(raw.slice(STAGED_NOTE_PREFIX.length))
    return normalizePayload(parsed)
  } catch {
    return null
  }
}
