import path from 'node:path'

const TURN_GRANT_TTL_MS = 6 * 60 * 60 * 1000
const MAX_TURN_GRANTS = 256
const grantsByTurn = new Map()

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizePath(value = '') {
  const normalized = path.normalize(normalizeId(value))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function turnKey(threadId = '', turnId = '') {
  const thread = normalizeId(threadId)
  const turn = normalizeId(turnId)
  return thread && turn ? `${thread}:${turn}` : ''
}

function policyPaths(policy = null) {
  if (!policy || String(policy.type || '') !== 'file_tool_policy_v1') return []
  return Array.from(new Set((Array.isArray(policy.externalPaths) ? policy.externalPaths : [])
    .map(normalizePath)
    .filter(Boolean)))
}

function prune(now = Date.now()) {
  for (const [key, value] of grantsByTurn) {
    if (now - Number(value.updatedAt || 0) > TURN_GRANT_TTL_MS) grantsByTurn.delete(key)
  }
  while (grantsByTurn.size > MAX_TURN_GRANTS) grantsByTurn.delete(grantsByTurn.keys().next().value)
}

export function hasExactFileAccessGrantForTurn({ threadId, turnId, approvalPolicy } = {}) {
  prune()
  const key = turnKey(threadId, turnId)
  const paths = policyPaths(approvalPolicy)
  if (!key || paths.length === 0) return false
  const granted = grantsByTurn.get(key)?.paths
  return granted instanceof Set && paths.every((filePath) => granted.has(filePath))
}

export function recordExactFileAccessGrantForTurn({ threadId, turnId, approvalPolicy } = {}) {
  prune()
  const key = turnKey(threadId, turnId)
  const paths = policyPaths(approvalPolicy)
  if (!key || paths.length === 0) return false
  const current = grantsByTurn.get(key)
  const nextPaths = new Set(current?.paths instanceof Set ? current.paths : [])
  for (const filePath of paths) nextPaths.add(filePath)
  grantsByTurn.set(key, { paths: nextPaths, updatedAt: Date.now() })
  return true
}
