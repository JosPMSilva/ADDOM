import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { safePath } from '../../tools/path-guards.mjs'

const MERGE_PATH_BOUNDARY_ERROR = 'AGENT_MERGE_PATH_BOUNDARY'

function text(value, field, maxLength = 1_024) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new TypeError(`${field} is required`)
  if (normalized.length > maxLength) {
    throw new TypeError(`${field} exceeds ${maxLength} characters`)
  }
  return normalized
}

function digest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function resolveMergePath(rootPath, relativePath, field = 'artifact path') {
  const root = path.resolve(text(rootPath, 'project root', 4_000))
  const requestedPath = text(relativePath, field, 2_000)
  try {
    return safePath(root, requestedPath)
  } catch (cause) {
    const error = new TypeError(`${field} violates the project path boundary`)
    error.code = MERGE_PATH_BOUNDARY_ERROR
    error.field = field
    error.cause = cause
    throw error
  }
}

async function readPathState(root, relativePath, field) {
  const target = resolveMergePath(root, relativePath, field)
  try {
    const stat = await fs.stat(target)
    if (stat.isDirectory()) throw new TypeError(`Merge target is a directory: ${relativePath}`)
    const content = await fs.readFile(resolveMergePath(root, relativePath, field))
    return { exists: true, digest: digest(content) }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, digest: digest(Buffer.alloc(0)) }
    throw error
  }
}

function sameState(actual, expected) {
  return actual.exists === expected.exists
    && (!expected.exists || actual.digest === expected.digest)
}

async function atomicWrite(root, relativePath, content) {
  let target = resolveMergePath(root, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  target = resolveMergePath(root, relativePath)
  const temporaryName = `.${path.basename(target)}.addom-${randomUUID()}.tmp`
  const temporaryRelative = path.join(path.dirname(relativePath), temporaryName)
  let temporary = resolveMergePath(root, temporaryRelative, 'merge temporary path')
  try {
    await fs.writeFile(temporary, content, { flag: 'wx' })
    target = resolveMergePath(root, relativePath)
    temporary = resolveMergePath(root, temporaryRelative, 'merge temporary path')
    await fs.rename(temporary, target)
  } finally {
    try {
      temporary = resolveMergePath(root, temporaryRelative, 'merge temporary path')
      await fs.rm(temporary, { force: true })
    } catch {
      // Never follow a replaced parent merely to clean up a temporary file.
    }
  }
}

async function readArtifactContent(artifact, workspace) {
  if (typeof artifact.metadata?.content === 'string') {
    return Buffer.from(artifact.metadata.content, 'utf8')
  }
  const contentPath = String(artifact.metadata?.contentPath || '').trim()
  if (!contentPath) {
    throw new TypeError(`Artifact ${artifact.id} has no retained merge content`)
  }
  const root = workspace.project_view_root || workspace.workspace_root
  return fs.readFile(resolveMergePath(root, contentPath, 'artifact content path'))
}

function recoveryConflict(plan, actual) {
  return {
    status: 'conflicted',
    conflict: {
      reason: 'merge_recovery_diverged',
      path: plan.targetPath,
      expectedBefore: plan.targetBefore,
      expectedAfter: plan.targetAfter,
      actualTarget: actual.target,
      actualSource: actual.source,
    },
  }
}

export function isMergePathBoundaryError(error) {
  return error?.code === MERGE_PATH_BOUNDARY_ERROR
}

export function createAgentMergeOperationExecutor({
  journal,
  now = Date.now,
  operationCheckpoint = null,
} = {}) {
  if (!journal) throw new TypeError('Agent merge operation executor requires journal')

  async function prepare(entry, artifact, workspace) {
    const projectRoot = text(workspace.source_root, 'workspace source root', 4_000)
    const sameMovePath = artifact.operationType === 'move_file'
      && path.normalize(artifact.originalPath) === path.normalize(artifact.path)
    const operationType = sameMovePath ? 'write_file' : artifact.operationType
    const targetBefore = await readPathState(
      projectRoot,
      artifact.path,
      'artifact path',
    )
    const sourceBefore = operationType === 'move_file'
      ? await readPathState(
        projectRoot,
        artifact.originalPath,
        'artifact original path',
      )
      : null
    const baseState = sourceBefore || targetBefore
    if (baseState.digest !== artifact.baseContentDigest) {
      return {
        status: 'conflicted',
        conflict: {
          reason: 'base_content_changed',
          path: sourceBefore ? artifact.originalPath : artifact.path,
          expectedDigest: artifact.baseContentDigest,
          actualDigest: baseState.digest,
          detectedAt: now(),
        },
      }
    }
    if (sourceBefore && targetBefore.exists) {
      return {
        status: 'conflicted',
        conflict: {
          reason: 'move_target_occupied',
          path: artifact.path,
          detectedAt: now(),
        },
      }
    }

    if (operationType !== 'delete_file') {
      const content = await readArtifactContent(artifact, workspace)
      if (digest(content) !== artifact.digest) {
        return {
          status: 'failed',
          error: {
            reason: 'artifact_digest_mismatch',
            detectedAt: now(),
          },
        }
      }
    }

    const plan = {
      schemaVersion: 1,
      operationType,
      targetPath: artifact.path,
      sourcePath: sourceBefore ? artifact.originalPath : null,
      targetBefore,
      targetAfter: operationType === 'delete_file'
        ? { exists: false, digest: digest(Buffer.alloc(0)) }
        : { exists: true, digest: artifact.digest },
      sourceBefore,
      sourceAfter: sourceBefore
        ? { exists: false, digest: digest(Buffer.alloc(0)) }
        : null,
    }
    return {
      status: 'prepared',
      operation: journal.prepare({ entry, artifact, plan }),
    }
  }

  async function checkpoint(mergeId, checkpointName) {
    await operationCheckpoint?.({
      mergeId,
      checkpoint: checkpointName,
    })
  }

  async function executePrepared(entry, artifact, workspace, operation, resuming) {
    const plan = operation.plan
    const projectRoot = text(workspace.source_root, 'workspace source root', 4_000)
    const target = await readPathState(projectRoot, plan.targetPath, 'artifact path')
    const source = plan.sourcePath
      ? await readPathState(projectRoot, plan.sourcePath, 'artifact original path')
      : null

    if (plan.operationType !== 'move_file') {
      if (sameState(target, plan.targetAfter)) {
        return { status: 'applied', recovered: resuming }
      }
      if (!sameState(target, plan.targetBefore)) {
        return recoveryConflict(plan, { target, source })
      }
      if (plan.operationType === 'delete_file') {
        await fs.rm(
          resolveMergePath(projectRoot, plan.targetPath, 'artifact path'),
          { force: true },
        )
      } else {
        const content = await readArtifactContent(artifact, workspace)
        if (digest(content) !== plan.targetAfter.digest) {
          return {
            status: 'failed',
            error: { reason: 'artifact_digest_mismatch', detectedAt: now() },
          }
        }
        await atomicWrite(projectRoot, plan.targetPath, content)
      }
      await checkpoint(entry.id, 'after_target_mutation')
      journal.setPhase(entry.id, 'target_mutated')
      return { status: 'applied', recovered: resuming }
    }

    const targetIsBefore = sameState(target, plan.targetBefore)
    const targetIsAfter = sameState(target, plan.targetAfter)
    const sourceIsBefore = sameState(source, plan.sourceBefore)
    const sourceIsAfter = sameState(source, plan.sourceAfter)
    if (targetIsAfter && sourceIsAfter) {
      return { status: 'applied', recovered: resuming }
    }
    if (!targetIsAfter && !(targetIsBefore && sourceIsBefore)) {
      return recoveryConflict(plan, { target, source })
    }
    if (targetIsBefore && sourceIsBefore) {
      const content = await readArtifactContent(artifact, workspace)
      if (digest(content) !== plan.targetAfter.digest) {
        return {
          status: 'failed',
          error: { reason: 'artifact_digest_mismatch', detectedAt: now() },
        }
      }
      await atomicWrite(projectRoot, plan.targetPath, content)
      await checkpoint(entry.id, 'after_target_mutation')
      journal.setPhase(entry.id, 'target_mutated')
    }
    const currentSource = await readPathState(
      projectRoot,
      plan.sourcePath,
      'artifact original path',
    )
    if (!sameState(currentSource, plan.sourceBefore)) {
      const currentTarget = await readPathState(
        projectRoot,
        plan.targetPath,
        'artifact path',
      )
      if (sameState(currentSource, plan.sourceAfter)
        && sameState(currentTarget, plan.targetAfter)) {
        return { status: 'applied', recovered: true }
      }
      return recoveryConflict(plan, {
        source: currentSource,
        target: currentTarget,
      })
    }
    await fs.rm(
      resolveMergePath(projectRoot, plan.sourcePath, 'artifact original path'),
      { force: true },
    )
    await checkpoint(entry.id, 'after_source_removal')
    journal.setPhase(entry.id, 'source_removed')
    return { status: 'applied', recovered: resuming }
  }

  async function apply(entry, artifact, workspace) {
    let operation = journal.get(entry.id)
    const resuming = !!operation
    if (!operation) {
      const prepared = await prepare(entry, artifact, workspace)
      if (prepared.status !== 'prepared') return prepared
      operation = prepared.operation
    }
    const result = await executePrepared(
      entry,
      artifact,
      workspace,
      operation,
      resuming,
    )
    if (result.status !== 'applied') return result
    return {
      status: 'applied',
      decision: {
        appliedAt: now(),
        path: artifact.path,
        digest: artifact.digest,
        recovered: result.recovered === true,
      },
    }
  }

  return Object.freeze({ apply })
}
