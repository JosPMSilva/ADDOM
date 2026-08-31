import crypto from 'node:crypto'
import path from 'node:path'
import { requestApproval } from '../chat/approval-flow.mjs'
import { countLineDelta } from '../chat/diff-math.mjs'
import { buildApprovalPolicyForTool } from '../chat/run-command-approval-policy.mjs'
import { recordApprovedRiskyActionSession } from '../chat/risky-action-session-state.mjs'
import { resolveToolApprovalPromptDecision } from '../chat/tool-approval-rules.mjs'
import { buildPreviewableUnifiedDiff, resolveApplyPatchPreview } from '../tools/apply-patch-core.mjs'
import { normalizeId, normalizeProjectFolder } from './ai-provider-openai-account-shared.mjs'
import {
  buildDeniedOpenAIAccountPermissionResponse,
  normalizeOpenAIAccountPermissionRequest,
} from './ai-provider-openai-account-permissions.mjs'

export function createOpenAIAccountApprovalBridge({
  projectFolder = '',
  appThreadId = '',
  permissionMode = 'ask',
  commandSafety = {},
  approvalSender = null,
  openAIAccountRequestApproval = null,
  accountNativeItemsById = null,
  getBridgeThreadId = () => '',
  getActiveTurnId = () => '',
} = {}) {
  const readItemById = (itemId = '') => {
    if (!accountNativeItemsById || typeof accountNativeItemsById.get !== 'function') return {}
    return accountNativeItemsById.get(itemId) || {}
  }

  const normalizeApprovalDecisions = (value = null) => {
    const normalized = new Set()
    for (const entry of Array.isArray(value) ? value : []) {
      const decision = normalizeId(entry).toLowerCase()
      if (decision) normalized.add(decision)
    }
    if (normalized.size === 0) {
      normalized.add('accept')
      normalized.add('decline')
      normalized.add('cancel')
    }
    return normalized
  }

  const supportsApprovalDecision = (availableDecisions = null, decision = '') => (
    normalizeApprovalDecisions(availableDecisions).has(normalizeId(decision).toLowerCase())
  )

  const resolveApprovedDecision = (availableDecisions = null, { preferSession = false } = {}) => {
    if (preferSession && supportsApprovalDecision(availableDecisions, 'acceptForSession')) {
      return 'acceptForSession'
    }
    if (supportsApprovalDecision(availableDecisions, 'accept')) return 'accept'
    if (supportsApprovalDecision(availableDecisions, 'cancel')) return 'cancel'
    return 'decline'
  }

  const resolveDeniedDecision = (availableDecisions = null, denyReason = '') => {
    const normalizedReason = normalizeId(denyReason).toLowerCase()
    if (normalizedReason === 'cancelled' || normalizedReason === 'renderer_unavailable') {
      if (supportsApprovalDecision(availableDecisions, 'cancel')) return 'cancel'
    }
    if (supportsApprovalDecision(availableDecisions, 'decline')) return 'decline'
    return supportsApprovalDecision(availableDecisions, 'cancel') ? 'cancel' : 'decline'
  }

  const normalizeWorkspaceComparablePath = (targetPath = '') => (
    process.platform === 'win32'
      ? String(targetPath || '').toLowerCase()
      : String(targetPath || '')
  )

  const isPathWithinWorkspace = (workspaceRoot = '', targetPath = '') => {
    const normalizedWorkspaceRoot = normalizeProjectFolder(workspaceRoot)
    if (!normalizedWorkspaceRoot) return false
    const rawTargetPath = normalizeId(targetPath)
    if (!rawTargetPath) return false
    let resolvedTargetPath = rawTargetPath
    try {
      resolvedTargetPath = path.isAbsolute(rawTargetPath)
        ? path.resolve(rawTargetPath)
        : path.resolve(normalizedWorkspaceRoot, rawTargetPath)
    } catch {
      resolvedTargetPath = rawTargetPath
    }
    const workspaceComparable = normalizeWorkspaceComparablePath(normalizedWorkspaceRoot)
    const targetComparable = normalizeWorkspaceComparablePath(resolvedTargetPath)
    if (targetComparable === workspaceComparable) return true
    const separator = workspaceComparable.endsWith(path.sep) ? '' : path.sep
    return targetComparable.startsWith(`${workspaceComparable}${separator}`)
  }

  const collectRequestedFileChanges = (item = null, params = null) => {
    const sourceItem = item && typeof item === 'object' ? item : {}
    const sourceParams = params && typeof params === 'object' ? params : {}
    const changes = Array.isArray(sourceItem.changes)
      ? sourceItem.changes
      : (Array.isArray(sourceParams.changes) ? sourceParams.changes : [])
    return changes
      .map((change) => (change && typeof change === 'object' ? { ...change } : null))
      .filter(Boolean)
  }

  const normalizeAbsoluteApprovalPath = (value = '') => {
    const raw = normalizeId(value)
    if (!raw) return ''
    try {
      return path.resolve(raw)
    } catch {
      return raw
    }
  }

  const normalizeApprovalRootList = (values = []) => {
    const unique = new Map()
    for (const entry of Array.isArray(values) ? values : []) {
      const normalized = normalizeAbsoluteApprovalPath(entry)
      if (!normalized) continue
      const key = normalizeWorkspaceComparablePath(normalized)
      if (!unique.has(key)) unique.set(key, normalized)
    }
    return Array.from(unique.values())
  }

  const relativizeProjectFilePath = (targetPath = '') => {
    const rawTargetPath = normalizeId(targetPath)
    const normalizedProjectRoot = normalizeProjectFolder(projectFolder)
    if (!normalizedProjectRoot || !rawTargetPath) return rawTargetPath
    try {
      const resolvedTargetPath = path.isAbsolute(rawTargetPath)
        ? path.resolve(rawTargetPath)
        : path.resolve(normalizedProjectRoot, rawTargetPath)
      if (!isPathWithinWorkspace(normalizedProjectRoot, resolvedTargetPath)) return rawTargetPath
      const relativePath = path.relative(normalizedProjectRoot, resolvedTargetPath)
      return relativePath ? relativePath.replace(/\\/g, '/') : rawTargetPath
    } catch {
      return rawTargetPath
    }
  }

  const normalizeAccountNativeFileChangeForProject = (change = null) => {
    const source = change && typeof change === 'object' ? change : null
    if (!source) return null
    const pathValue = relativizeProjectFilePath(
      source.path
      || source.filePath
      || source.targetPath
      || source.filename
      || source.file
      || '',
    )
    if (!pathValue) return null
    return {
      ...source,
      path: pathValue,
      ...(source.oldPath || source.renamedFrom || source.previousPath
        ? {
            oldPath: relativizeProjectFilePath(source.oldPath || source.renamedFrom || source.previousPath || ''),
          }
        : {}),
    }
  }

  const normalizeAccountNativeActivityItemForProject = (item = null) => {
    const source = item && typeof item === 'object' ? item : null
    if (!source) return null
    if (normalizeId(source.type) !== 'fileChange') return source
    const normalizedChanges = Array.isArray(source.changes)
      ? source.changes
        .map((change) => normalizeAccountNativeFileChangeForProject(change))
        .filter(Boolean)
      : []
    return {
      ...source,
      changes: normalizedChanges,
    }
  }

  const buildSyntheticApplyPatchFileChangeItem = ({
    toolCall = null,
    responsePayload = null,
  } = {}) => {
    const normalizedToolName = normalizeId(toolCall?.toolName).toLowerCase()
    if (normalizedToolName !== 'apply_patch') return null
    if (!projectFolder) return null
    if (responsePayload?.isError === true || responsePayload?.success === false) return null
    try {
      const preview = resolveApplyPatchPreview({
        projectRoot: projectFolder,
        toolInput: toolCall?.input,
      })
      const changes = Array.isArray(preview?.changes)
        ? preview.changes
          .map((change) => {
            const changeType = String(change?.type || '').trim().toLowerCase()
            const previousContent = String(change?.previousContent ?? '')
            const nextContent = String(change?.nextContent ?? '')
            const lineDelta = countLineDelta(previousContent, nextContent)
            const normalizedPath = relativizeProjectFilePath(
              change?.targetRelativePath
              || change?.relativePath
              || '',
            )
            if (!normalizedPath) return null
            return {
              path: normalizedPath,
              kind: {
                type: changeType === 'create_file'
                  ? 'create'
                  : changeType === 'delete_file'
                    ? 'delete'
                    : changeType === 'move_file'
                      ? 'rename'
                      : 'modify',
              },
              diff: buildPreviewableUnifiedDiff({
                diffText: String(change?.diffText || ''),
                previousContent,
                nextContent,
              }),
              addedLines: Number(lineDelta?.addedLines || 0) || 0,
              removedLines: Number(lineDelta?.removedLines || 0) || 0,
              ...(changeType === 'move_file' && change?.relativePath
                ? { oldPath: relativizeProjectFilePath(change.relativePath) }
                : {}),
            }
          })
          .filter(Boolean)
        : []
      if (changes.length <= 0) return null
      return {
        id: normalizeId(toolCall?.id),
        type: 'fileChange',
        status: 'completed',
        changes,
      }
    } catch {
      return null
    }
  }

  const collectApprovalWritableRootsFromPermissions = (additionalPermissions = null) => {
    const source = additionalPermissions && typeof additionalPermissions === 'object' ? additionalPermissions : null
    if (!source) return []
    const candidateRoots = []
    const containers = [
      source,
      source.workspaceWrite,
      source.filesystem,
      source.permissions,
      source.permissions?.filesystem,
      source.sandboxPolicy,
      source.sandboxPolicy?.workspaceWrite,
    ].filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    for (const container of containers) {
      const rootLists = [
        container.writableRoots,
        container.writeRoots,
      ]
      for (const rootList of rootLists) {
        if (!Array.isArray(rootList)) continue
        for (const entry of rootList) candidateRoots.push(entry)
      }
    }
    return normalizeApprovalRootList(candidateRoots)
  }

  const resolveApprovalRootContext = ({
    projectRoot = '',
    grantRoot = '',
    additionalPermissions = null,
  } = {}) => {
    const roots = normalizeApprovalRootList([
      projectRoot,
      grantRoot,
      ...collectApprovalWritableRootsFromPermissions(additionalPermissions),
    ])
    return {
      roots,
      primaryRoot: roots[0] || '',
    }
  }

  const isPathWithinAnyApprovalRoot = (approvalRoots = [], targetPath = '') => (
    normalizeApprovalRootList(approvalRoots).some((rootPath) => isPathWithinWorkspace(rootPath, targetPath))
  )

  const normalizeExecpolicyAmendment = (value = null) => {
    const amendment = Array.isArray(value)
      ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
      : []
    return amendment.length > 0 ? amendment : null
  }

  const resolveCommandApprovalAmendment = ({
    availableDecisions = null,
    proposedExecpolicyAmendment = null,
    additionalPermissions = null,
    approvalRoots = [],
  } = {}) => {
    if (!supportsApprovalDecision(availableDecisions, 'acceptWithExecpolicyAmendment')) return null
    const amendment = normalizeExecpolicyAmendment(proposedExecpolicyAmendment)
    if (!amendment) return null
    const trustedRoots = normalizeApprovalRootList(approvalRoots)
    if (trustedRoots.length === 0) return null
    const requestedWritableRoots = collectApprovalWritableRootsFromPermissions(additionalPermissions)
    if (requestedWritableRoots.length === 0) return null
    const inScopeRoots = requestedWritableRoots.filter((rootPath) => (
      isPathWithinAnyApprovalRoot(trustedRoots, rootPath)
    ))
    const hasOutsideScopeRoot = requestedWritableRoots.some((rootPath) => (
      !isPathWithinAnyApprovalRoot(trustedRoots, rootPath)
    ))
    if (!hasOutsideScopeRoot || inScopeRoots.length === 0) return null
    return {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: amendment,
      },
    }
  }

  const requestAccountToolApproval = async ({
    itemId = '',
    toolName = '',
    toolInput = {},
    availableDecisions = [],
    approvalKind = '',
    approvalPolicy = null,
    projectRootOverride = '',
    grantRoot = '',
    changes = [],
    turnIdOverride = '',
  } = {}) => {
    const approvalProjectRoot = normalizeProjectFolder(projectRootOverride || projectFolder)
    const normalizedGrantRoot = normalizeProjectFolder(grantRoot) || normalizeId(grantRoot)
    const resolvedTurnId = normalizeId(turnIdOverride) || normalizeId(getActiveTurnId())
    const approvalThreadId = normalizeId(appThreadId) || normalizeId(getBridgeThreadId())
    const normalizedChanges = Array.isArray(changes)
      ? changes
        .map((change) => (change && typeof change === 'object' ? { ...change } : null))
        .filter(Boolean)
      : []
    if (typeof openAIAccountRequestApproval === 'function') {
      return await openAIAccountRequestApproval({
        itemId: normalizeId(itemId),
        toolName,
        toolInput,
        availableDecisions: Array.from(normalizeApprovalDecisions(availableDecisions)),
        approvalKind: normalizeId(approvalKind),
        approvalPolicy,
        threadId: approvalThreadId,
        providerThreadId: normalizeId(getBridgeThreadId()),
        turnId: resolvedTurnId,
        projectFolder: approvalProjectRoot,
        ...(normalizedGrantRoot ? { grantRoot: normalizedGrantRoot } : {}),
        ...(normalizedChanges.length > 0 ? { changes: normalizedChanges } : {}),
      })
    }

    if (!approvalSender) {
      return {
        decision: 'denied',
        denyReason: 'renderer_unavailable',
      }
    }

    const approvalId = [
      'openai-account',
      normalizeId(itemId) || crypto.randomUUID().slice(0, 8),
      Date.now(),
      crypto.randomUUID().slice(0, 8),
    ].join(':')

    return await requestApproval(
      approvalSender,
      approvalId,
      toolName,
      toolInput,
      approvalProjectRoot,
      null,
      null,
      () => {},
      {
        threadId: approvalThreadId,
        turnId: resolvedTurnId,
        availableDecisions: Array.from(normalizeApprovalDecisions(availableDecisions)),
        approvalKind: normalizeId(approvalKind),
        ...(normalizedGrantRoot ? { grantRoot: normalizedGrantRoot } : {}),
        ...(normalizedChanges.length > 0 ? { changes: normalizedChanges } : {}),
        ...(approvalPolicy && typeof approvalPolicy === 'object'
          ? {
              policy: approvalPolicy,
              policyDecision: approvalPolicy.policyDecision,
              executionTarget: approvalPolicy.executionTarget,
              elevationRequired: !!approvalPolicy.elevationRequired,
            }
          : {}),
      },
    )
  }

  const resolveCommandApprovalResponse = async (params = null) => {
    const source = params && typeof params === 'object' ? params : {}
    const itemId = normalizeId(source.itemId)
    const item = readItemById(itemId)
    const availableDecisions = Array.from(normalizeApprovalDecisions(source.availableDecisions))
    const bridgeThreadId = normalizeId(getBridgeThreadId())
    const activeTurnId = normalizeId(getActiveTurnId())
    const toolInput = {
      command: String(source.command || item.command || ''),
      cwd: String(source.cwd || item.cwd || projectFolder || '.'),
      env: source.env && typeof source.env === 'object'
        ? source.env
        : (item.env && typeof item.env === 'object' ? item.env : null),
      reason: String(source.reason || ''),
      commandActions: Array.isArray(source.commandActions)
        ? source.commandActions
        : (Array.isArray(item.commandActions) ? item.commandActions : []),
      proposedExecpolicyAmendment: source.proposedExecpolicyAmendment ?? item.proposedExecpolicyAmendment ?? null,
      networkApprovalContext: source.networkApprovalContext ?? null,
      additionalPermissions: source.additionalPermissions ?? null,
    }
    const approvalRootContext = resolveApprovalRootContext({
      projectRoot: projectFolder,
      additionalPermissions: toolInput.additionalPermissions,
    })
    const effectiveApprovalRoot = approvalRootContext.primaryRoot
    const isNetworkSpecificApproval = !!(
      toolInput.networkApprovalContext
      && typeof toolInput.networkApprovalContext === 'object'
    )

    if (!effectiveApprovalRoot && !isNetworkSpecificApproval) {
      return resolveDeniedDecision(availableDecisions, 'scope_denied')
    }

    const approvalPolicy = await buildApprovalPolicyForTool({
      toolName: 'run_command',
      toolInput: {
        command: toolInput.command,
        cwd: toolInput.cwd,
        shell: 'auto',
        env: toolInput.env,
        background: false,
      },
      projectFolder: effectiveApprovalRoot || projectFolder,
      commandSafetySettings: commandSafety,
      permissionMode,
      threadId: bridgeThreadId,
      turnId: activeTurnId,
    })
    const approvalPromptDecision = resolveToolApprovalPromptDecision({
      toolName: 'run_command',
      projectFolder: effectiveApprovalRoot || projectFolder,
      approvalPolicy,
      permissionMode,
    })
    const trustedApprovalRoots = effectiveApprovalRoot ? [effectiveApprovalRoot] : []
    const safeAmendmentDecision = resolveCommandApprovalAmendment({
      availableDecisions,
      proposedExecpolicyAmendment: toolInput.proposedExecpolicyAmendment,
      additionalPermissions: toolInput.additionalPermissions,
      approvalRoots: trustedApprovalRoots,
    })
    const amendmentRequired = (
      collectApprovalWritableRootsFromPermissions(toolInput.additionalPermissions)
        .some((rootPath) => !isPathWithinAnyApprovalRoot(trustedApprovalRoots, rootPath))
    )

    if (amendmentRequired && !safeAmendmentDecision) {
      return resolveDeniedDecision(availableDecisions, 'scope_denied')
    }

    if (approvalPromptDecision?.action === 'deny') {
      return resolveDeniedDecision(availableDecisions, 'policy_denied')
    }

    if (approvalPromptDecision?.action === 'approve') {
      if (amendmentRequired) return safeAmendmentDecision
      return resolveApprovedDecision(availableDecisions, {
        preferSession: (
          approvalPromptDecision.source === 'risky_action_session'
          || approvalPromptDecision.source === 'permission_mode_full_access'
        ),
      })
    }

    const approval = await requestAccountToolApproval({
      itemId,
      toolName: 'run_command',
      toolInput,
      availableDecisions,
      approvalKind: 'command_execution',
      approvalPolicy,
      projectRootOverride: effectiveApprovalRoot,
      turnIdOverride: source.turnId,
    })

    if (approval?.decision === 'approved') {
      const requestedDecision = normalizeId(approval?.approvalMeta?.remoteApproval?.decision).toLowerCase()
      if (requestedDecision === 'acceptforsession' && supportsApprovalDecision(availableDecisions, 'acceptForSession')) {
        return 'acceptForSession'
      }
      if (approvalPromptDecision?.riskyActionSessionCandidate) {
        recordApprovedRiskyActionSession(approvalPromptDecision.riskyActionSessionCandidate)
      }
      if (amendmentRequired) return safeAmendmentDecision
      return 'accept'
    }

    return resolveDeniedDecision(availableDecisions, approval?.denyReason)
  }

  const resolveFileChangeApprovalResponse = async (params = null) => {
    const source = params && typeof params === 'object' ? params : {}
    const itemId = normalizeId(source.itemId)
    const item = readItemById(itemId)
    const availableDecisions = Array.from(normalizeApprovalDecisions(source.availableDecisions))
    const requestedChanges = collectRequestedFileChanges(item, source)
    const changedPaths = requestedChanges
      .map((change) => normalizeId(change?.path))
      .filter(Boolean)
    const bridgeThreadId = normalizeId(getBridgeThreadId())
    const activeTurnId = normalizeId(getActiveTurnId())
    const approvalRootContext = resolveApprovalRootContext({
      projectRoot: projectFolder,
      grantRoot: source.grantRoot ?? item.grantRoot ?? '',
    })
    const effectiveApprovalRoot = approvalRootContext.primaryRoot

    if (!effectiveApprovalRoot) return resolveDeniedDecision(availableDecisions, 'scope_denied')
    if (changedPaths.length === 0) return resolveDeniedDecision(availableDecisions, 'scope_denied')

    const approvalPolicy = await buildApprovalPolicyForTool({
      toolName: 'file_change',
      toolInput: {
        reason: String(source.reason || ''),
        changes: requestedChanges,
        grantRoot: normalizeProjectFolder(source.grantRoot ?? item.grantRoot ?? ''),
      },
      projectFolder: effectiveApprovalRoot || projectFolder,
      commandSafetySettings: commandSafety,
      permissionMode,
      threadId: bridgeThreadId,
      turnId: activeTurnId,
    })
    const approvalPromptDecision = resolveToolApprovalPromptDecision({
      toolName: 'file_change',
      projectFolder: effectiveApprovalRoot || projectFolder,
      approvalPolicy,
      permissionMode,
    })

    if (approvalPromptDecision?.action === 'deny') {
      return resolveDeniedDecision(availableDecisions, 'policy_denied')
    }

    if (approvalPromptDecision?.action === 'approve') {
      return resolveApprovedDecision(availableDecisions, {
        preferSession: (
          approvalPromptDecision.source === 'risky_action_session'
          || approvalPromptDecision.source === 'permission_mode_full_access'
        ),
      })
    }

    const approval = await requestAccountToolApproval({
      itemId,
      toolName: 'file_change',
      toolInput: {
        reason: String(source.reason || ''),
        changes: requestedChanges,
        grantRoot: normalizeProjectFolder(source.grantRoot ?? item.grantRoot ?? ''),
      },
      availableDecisions,
      approvalKind: 'file_change',
      approvalPolicy,
      projectRootOverride: effectiveApprovalRoot,
      grantRoot: source.grantRoot ?? item.grantRoot ?? '',
      changes: requestedChanges,
      turnIdOverride: source.turnId,
    })

    if (approval?.decision !== 'approved') {
      return resolveDeniedDecision(availableDecisions, approval?.denyReason)
    }

    const requestedDecision = normalizeId(approval?.approvalMeta?.remoteApproval?.decision).toLowerCase()
    if (requestedDecision === 'acceptforsession' && supportsApprovalDecision(availableDecisions, 'acceptForSession')) {
      return 'acceptForSession'
    }

    return resolveApprovedDecision(availableDecisions)
  }

  const resolvePermissionApprovalResponse = async (params = null) => {
    const source = params && typeof params === 'object' ? params : {}
    const normalized = normalizeOpenAIAccountPermissionRequest(source.permissions)
    if (!normalized.valid || !normalized.hasRequestedPermissions) {
      return buildDeniedOpenAIAccountPermissionResponse()
    }

    const approval = await requestAccountToolApproval({
      itemId: normalizeId(source.itemId),
      toolName: 'permission_request',
      toolInput: {
        reason: normalizeId(source.reason),
        permissions: normalized.permissions,
      },
      availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
      approvalKind: 'permission_request',
      turnIdOverride: source.turnId,
    })
    if (approval?.decision !== 'approved') {
      return buildDeniedOpenAIAccountPermissionResponse()
    }

    const requestedDecision = normalizeId(
      approval?.approvalMeta?.remoteApproval?.decision,
    ).toLowerCase()
    return {
      scope: requestedDecision === 'acceptforsession' ? 'session' : 'turn',
      permissions: normalized.permissions,
    }
  }

  return {
    buildSyntheticApplyPatchFileChangeItem,
    normalizeAccountNativeActivityItemForProject,
    resolveCommandApprovalResponse,
    resolveFileChangeApprovalResponse,
    resolvePermissionApprovalResponse,
    supportsApprovalDecision,
  }
}
