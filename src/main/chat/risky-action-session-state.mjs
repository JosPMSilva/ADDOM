import path from 'node:path'

const projectSessionApprovals = new Map()

function normalizeWorkspaceRoot(projectFolder = '') {
  const raw = String(projectFolder || '').trim()
  if (!raw) return ''
  try {
    return path.resolve(raw)
  } catch {
    return raw
  }
}

function normalizeRootKey(root = '') {
  const value = String(root || '').trim()
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function normalizeOriginKey(origin = '') {
  const raw = String(origin || '').trim()
  if (!raw) return ''
  if (raw === 'about:blank') return raw
  try {
    return new URL(raw).origin.toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

function buildProjectScopeKey(projectFolder = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  return workspaceRoot ? normalizeRootKey(workspaceRoot) : ''
}

export function buildRiskyActionSessionCandidate({
  toolName,
  projectFolder,
  approvalPolicy,
} = {}) {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  if (!workspaceRoot) return null

  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  if (normalizedToolName === 'fetch_page') {
    return {
      type: 'risky_action_session_candidate_v1',
      scope: 'project_session',
      workspaceRoot,
      sessionKey: 'network_fetch',
      key: `project|${buildProjectScopeKey(workspaceRoot)}|risky|network_fetch`,
      toolName: normalizedToolName,
      label: 'Web fetches for this project in this app session',
      commandClass: '',
    }
  }

  const browserPolicy = approvalPolicy && typeof approvalPolicy === 'object'
    ? approvalPolicy
    : null
  if (normalizedToolName === 'browser_action' && String(browserPolicy?.type || '').trim() === 'browser_action_policy_v1') {
    const approvalClass = String(browserPolicy.approvalClass || '').trim().toLowerCase()
    if (!approvalClass) return null
    const originKey = approvalClass === 'browser_recording'
      ? ''
      : normalizeOriginKey(browserPolicy.targetOrigin)
    const sessionKey = originKey ? `${approvalClass}|${originKey}` : approvalClass
    const labels = {
      browser_public_network: 'Public browser navigation and interaction for this project in this app session',
      browser_private_network: 'Localhost/private-network browser navigation and interaction for this project in this app session',
      browser_public_execute_js: 'Public-site browser JavaScript execution for this project in this app session',
      browser_private_execute_js: 'Localhost/private-network browser JavaScript execution for this project in this app session',
      browser_recording: 'Browser recording for this project in this app session',
    }
    return {
      type: 'risky_action_session_candidate_v1',
      scope: 'project_session',
      workspaceRoot,
      sessionKey,
      key: `project|${buildProjectScopeKey(workspaceRoot)}|risky|${sessionKey}`,
      toolName: normalizedToolName,
      label: originKey ? `${labels[approvalClass] || approvalClass} (${originKey})` : (labels[approvalClass] || approvalClass),
      commandClass: '',
    }
  }

  const policy = approvalPolicy && typeof approvalPolicy === 'object' ? approvalPolicy : null
  if (!policy || String(policy.type || '').trim() !== 'run_command_policy_v1') return null

  const commandClass = String(policy.commandClass || '').trim().toLowerCase()
  if (!commandClass || policy.elevationRequired === true) return null

  if (commandClass === 'dependency_install_project') {
    return {
      type: 'risky_action_session_candidate_v1',
      scope: 'project_session',
      workspaceRoot,
      sessionKey: 'dependency_install_project',
      key: `project|${buildProjectScopeKey(workspaceRoot)}|risky|dependency_install_project`,
      toolName: normalizedToolName,
      label: 'Project dependency installs for this app session',
      commandClass,
    }
  }

  return null
}

export function hasApprovedRiskyActionSession(candidate) {
  const normalizedCandidate = candidate && typeof candidate === 'object' ? candidate : null
  if (!normalizedCandidate?.key || !normalizedCandidate?.workspaceRoot) return false
  const projectKey = buildProjectScopeKey(normalizedCandidate.workspaceRoot)
  if (!projectKey) return false
  const approvals = projectSessionApprovals.get(projectKey)
  return approvals instanceof Set && approvals.has(String(normalizedCandidate.key))
}

export function recordApprovedRiskyActionSession(candidate) {
  const normalizedCandidate = candidate && typeof candidate === 'object' ? candidate : null
  if (!normalizedCandidate?.key || !normalizedCandidate?.workspaceRoot) return false
  const projectKey = buildProjectScopeKey(normalizedCandidate.workspaceRoot)
  if (!projectKey) return false
  const next = projectSessionApprovals.get(projectKey) instanceof Set
    ? projectSessionApprovals.get(projectKey)
    : new Set()
  const approvalKey = String(normalizedCandidate.key)
  const changed = !next.has(approvalKey)
  next.add(approvalKey)
  projectSessionApprovals.set(projectKey, next)
  return changed
}

export function clearRiskyActionSessionState() {
  projectSessionApprovals.clear()
}

export function getRiskyActionSessionSnapshot() {
  return Array.from(projectSessionApprovals.entries()).map(([projectKey, approvals]) => ({
    projectKey,
    approvals: Array.from(approvals instanceof Set ? approvals : []),
  }))
}
