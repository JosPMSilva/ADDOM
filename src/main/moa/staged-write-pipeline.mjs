import fs from 'fs'
import path from 'path'

import { countLineDelta } from '../chat/diff-math.mjs'
import { recordWrite } from '../memory/artifact-store.mjs'
import { normalizeApplyPatchInput, resolveApplyPatchPreview } from '../tools/apply-patch-core.mjs'
import { buildStagedArtifactNote } from '../tools/staged-artifact-note.mjs'

function safeProjectPath(projectRoot, filePath) {
  const abs = path.resolve(projectRoot, filePath)
  const rel = path.relative(projectRoot, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${filePath}" escapes the project root. Access denied.`)
  }
  return abs
}

export function ensureStagedState(runtime = {}) {
  if (!runtime.stagedState || typeof runtime.stagedState !== 'object') {
    runtime.stagedState = {
      totalFiles: 0,
      totalBytes: 0,
      byTask: new Map(),
    }
  }
  if (!(runtime.stagedState.byTask instanceof Map)) {
    runtime.stagedState.byTask = new Map()
  }
  if (!Array.isArray(runtime.stagedChanges)) {
    runtime.stagedChanges = []
  }
  return runtime.stagedState
}

function normalizeAgentWriteInput(input = {}) {
  return {
    path: String(input.path || '').trim(),
    content: String(input.content ?? ''),
  }
}

function normalizeAgentPatchInput(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    patch: typeof source.patch === 'string' ? source.patch : '',
  }
}

export function toStageError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function buildStageNote({
  delegationId,
  taskId,
  roleId,
  role,
  reason = '',
  operationType = '',
  originalPath = '',
  targetPath = '',
}) {
  return buildStagedArtifactNote({
    source: 'moa_agent_stage',
    delegationId: String(delegationId || ''),
    taskId: String(taskId || ''),
    roleId: String(roleId || ''),
    role: String(role || ''),
    reason: String(reason || '').trim().slice(0, 200),
    operationType: String(operationType || '').trim(),
    originalPath: String(originalPath || '').trim(),
    targetPath: String(targetPath || '').trim(),
  })
}

function readExistingTextFile(absPath, displayPath) {
  if (!fs.existsSync(absPath)) return null
  const stat = fs.statSync(absPath)
  if (stat.isDirectory()) {
    throw toStageError('invalid_target', `"${displayPath}" is a directory, not a file.`)
  }
  if (stat.size > 1_048_576) return null
  return fs.readFileSync(absPath, 'utf8')
}

function applyManagedWorkspaceChange({
  runtime,
  projectFolder,
  operationType,
  originalPath,
  targetPath,
  content,
}) {
  const mode = String(runtime?.agentWorkspace?.mode || '').trim()
  if (!mode) return
  if (!['local_overlay', 'local_worktree'].includes(mode)) {
    throw toStageError(
      'workspace_not_locally_writable',
      `Workspace mode "${mode}" does not permit local staged writes.`,
    )
  }
  const target = safeProjectPath(projectFolder, targetPath)
  if (operationType === 'delete_file') {
    fs.rmSync(target, { force: true })
    return
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
  if (operationType === 'move_file') {
    const original = safeProjectPath(projectFolder, originalPath)
    if (original !== target) fs.rmSync(original, { force: true })
  }
}

function enforceStageLimits({
  state,
  taskId,
  bytes,
  policy,
}) {
  const taskState = state.byTask.get(taskId) || { files: 0, bytes: 0 }
  if (taskState.files + 1 > Number(policy.maxAgentStagedFilesPerTask || 0)) {
    throw toStageError(
      'staged_task_file_limit',
      `Task "${taskId}" exceeded maxAgentStagedFilesPerTask (${Number(policy.maxAgentStagedFilesPerTask || 0)}).`,
    )
  }
  if (state.totalFiles + 1 > Number(policy.maxAgentStagedFilesPerDelegation || 0)) {
    throw toStageError(
      'staged_delegation_file_limit',
      `Delegation exceeded maxAgentStagedFilesPerDelegation (${Number(policy.maxAgentStagedFilesPerDelegation || 0)}).`,
    )
  }
  if (state.totalBytes + bytes > Number(policy.maxAgentStagedTotalBytesPerDelegation || 0)) {
    throw toStageError(
      'staged_delegation_byte_limit',
      `Delegation exceeded maxAgentStagedTotalBytesPerDelegation (${Number(policy.maxAgentStagedTotalBytesPerDelegation || 0)} bytes).`,
    )
  }
  return taskState
}

function commitStagedChange({
  state,
  taskId,
  bytes,
  change,
  runtime,
}) {
  const taskState = state.byTask.get(taskId) || { files: 0, bytes: 0 }
  state.totalFiles += 1
  state.totalBytes += bytes
  state.byTask.set(taskId, {
    files: taskState.files + 1,
    bytes: taskState.bytes + bytes,
  })
  runtime.stagedChanges.push(change)
}

function emitStagedChange({
  emit,
  threadId,
  turnId,
  stepId,
  delegationId,
  taskId,
  roleId,
  role,
  stagedChange,
}) {
  emit('moa:agent-file-staged', {
    threadId,
    turnId,
    stepId,
    delegationId,
    taskId,
    agentRoleId: roleId,
    agentRole: role,
    filePath: stagedChange.filePath,
    renamedFrom: String(stagedChange.renamedFrom || ''),
    changeType: String(stagedChange.changeType || ''),
    revisionId: stagedChange.revisionId,
    rev: stagedChange.rev,
    prevRevisionId: stagedChange.prevRevisionId,
    contentBytes: stagedChange.bytes,
    addedLines: stagedChange.addedLines,
    removedLines: stagedChange.removedLines,
    status: 'staged',
    startedAt: stagedChange.createdAt,
    finishedAt: stagedChange.createdAt,
    durationMs: 0,
  })
}

export function stageAgentWrite({
  projectFolder,
  taskId,
  roleId,
  role,
  delegationId,
  turnId,
  threadId,
  stepId,
  toolInput,
  policy,
  runtime,
  emit,
}) {
  const state = ensureStagedState(runtime)
  const normalized = normalizeAgentWriteInput(toolInput)
  if (!normalized.path) {
    throw toStageError('missing_path', 'write_file requires a non-empty "path".')
  }

  const bytes = Buffer.byteLength(normalized.content, 'utf8')
  if (bytes > Number(policy.maxAgentStagedBytesPerFile || 0)) {
    throw toStageError(
      'staged_file_too_large',
      `Staged write exceeds maxAgentStagedBytesPerFile (${Number(policy.maxAgentStagedBytesPerFile || 0)} bytes).`,
    )
  }
  enforceStageLimits({ state, taskId, bytes, policy })

  const abs = safeProjectPath(projectFolder, normalized.path)
  const prevContent = readExistingTextFile(abs, normalized.path)
  const createdAt = Date.now()
  const note = buildStageNote({
    delegationId,
    taskId,
    roleId,
    role,
    reason: 'agent_write_file',
    operationType: 'write_file',
    originalPath: normalized.path,
    targetPath: normalized.path,
  })
  const artifactRecord = recordWrite({
    project: runtime.sourceProjectFolder || projectFolder,
    filePath: normalized.path,
    newContent: normalized.content,
    prevContent,
    source: 'ai_suggestion',
    note,
    threadId,
    turnId,
  })
  applyManagedWorkspaceChange({
    runtime,
    projectFolder,
    operationType: 'write_file',
    originalPath: normalized.path,
    targetPath: normalized.path,
    content: normalized.content,
  })

  const lineDelta = countLineDelta(prevContent ?? '', normalized.content)
  const stagedChange = {
    filePath: normalized.path,
    revisionId: String(artifactRecord?.newRevId || ''),
    rev: Number(artifactRecord?.rev || 0) || 0,
    prevRevisionId: String(artifactRecord?.prevRevId || ''),
    taskId: String(taskId || ''),
    roleId: String(roleId || ''),
    role: String(role || ''),
    bytes,
    addedLines: Number(lineDelta?.addedLines || 0) || 0,
    removedLines: Number(lineDelta?.removedLines || 0) || 0,
    createdAt,
    changeType: 'write_file',
    renamedFrom: '',
  }

  commitStagedChange({
    state,
    taskId,
    bytes,
    change: stagedChange,
    runtime,
  })
  emitStagedChange({
    emit,
    threadId,
    turnId,
    stepId,
    delegationId,
    taskId,
    roleId,
    role,
    stagedChange,
  })
  return stagedChange
}

export function stageAgentPatch({
  projectFolder,
  taskId,
  roleId,
  role,
  delegationId,
  turnId,
  threadId,
  stepId,
  toolInput,
  policy,
  runtime,
  emit,
}) {
  const state = ensureStagedState(runtime)
  const normalized = normalizeAgentPatchInput(toolInput)
  if (!normalized.patch.trim()) {
    throw toStageError('missing_operation', 'apply_patch requires a non-empty patch string.')
  }

  const parsed = normalizeApplyPatchInput({
    toolInput: { patch: normalized.patch },
  })
  if (parsed.operations.length !== 1) {
    throw toStageError('multi_file_patch_not_supported', 'MoA staged apply_patch currently supports one patch block at a time.')
  }

  const preview = resolveApplyPatchPreview({
    projectRoot: projectFolder,
    toolInput: { patch: normalized.patch },
  })
  const operationType = String(preview.type || '').trim().toLowerCase()
  const originalPath = String(preview.relativePath || '').trim()
  const targetPath = String(preview.targetRelativePath || preview.relativePath || '').trim()
  const previousContent = String(preview.previousContent ?? '')
  const nextContent = String(preview.nextContent ?? '')
  const bytes = Buffer.byteLength(nextContent, 'utf8')

  if (bytes > Number(policy.maxAgentStagedBytesPerFile || 0)) {
    throw toStageError(
      'staged_file_too_large',
      `Staged patch exceeds maxAgentStagedBytesPerFile (${Number(policy.maxAgentStagedBytesPerFile || 0)} bytes).`,
    )
  }
  enforceStageLimits({ state, taskId, bytes, policy })

  const createdAt = Date.now()
  const note = buildStageNote({
    delegationId,
    taskId,
    roleId,
    role,
    reason: 'agent_apply_patch',
    operationType,
    originalPath,
    targetPath,
  })
  const artifactRecord = recordWrite({
    project: runtime.sourceProjectFolder || projectFolder,
    filePath: targetPath,
    newContent: nextContent,
    prevContent: previousContent,
    source: 'ai_suggestion',
    note,
    threadId,
    turnId,
  })
  applyManagedWorkspaceChange({
    runtime,
    projectFolder,
    operationType,
    originalPath,
    targetPath,
    content: nextContent,
  })

  const lineDelta = countLineDelta(previousContent, nextContent)
  const stagedChange = {
    filePath: targetPath,
    revisionId: String(artifactRecord?.newRevId || ''),
    rev: Number(artifactRecord?.rev || 0) || 0,
    prevRevisionId: String(artifactRecord?.prevRevId || ''),
    taskId: String(taskId || ''),
    roleId: String(roleId || ''),
    role: String(role || ''),
    bytes,
    addedLines: Number(lineDelta?.addedLines || 0) || 0,
    removedLines: Number(lineDelta?.removedLines || 0) || 0,
    createdAt,
    changeType: operationType,
    renamedFrom: operationType === 'move_file' ? originalPath : '',
  }

  commitStagedChange({
    state,
    taskId,
    bytes,
    change: stagedChange,
    runtime,
  })
  emitStagedChange({
    emit,
    threadId,
    turnId,
    stepId,
    delegationId,
    taskId,
    roleId,
    role,
    stagedChange,
  })
  return stagedChange
}
