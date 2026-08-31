import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { validateAgentArtifact } from '../../../common/agents/agent-artifact-contract.mjs'

const EMPTY_DIGEST = digest(Buffer.alloc(0))
const SAFE_PROVIDER_IMPORT_OPERATIONS = new Set([
  'provider_import',
  'write_file',
  'create_file',
  'update_file',
  'delete_file',
])

function digest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function relativePath(root, absolute) {
  const relative = path.relative(root, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TypeError('Workspace artifact path escaped the project view root')
  }
  return relative.split(path.sep).join('/')
}

async function listRegularFiles(root) {
  const files = new Map()
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolute)
        continue
      }
      if (!entry.isFile()) continue
      const content = await fs.readFile(absolute)
      const key = relativePath(root, absolute)
      files.set(key, {
        absolute,
        digest: digest(content),
        sizeBytes: content.byteLength,
      })
    }
  }
  await visit(root)
  return files
}

function readWorkspace(db, workspaceId) {
  const row = db.prepare(`
    SELECT * FROM agent_workspaces WHERE id = ?
  `).get(String(workspaceId || '').trim())
  if (!row) throw new TypeError(`Agent workspace ${workspaceId} was not found`)
  return {
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    attemptId: row.attempt_id,
    mode: row.mode,
    projectViewRoot: row.project_view_root,
    baseRevision: row.base_revision,
    ownership: parseJson(row.ownership_json),
  }
}

export function createAgentWorkspaceArtifacts({
  db,
  eventStore = null,
  now = Date.now,
  idFactory = () => `artifact_${randomUUID()}`,
} = {}) {
  if (!db) throw new TypeError('Workspace artifact reconciliation requires db')

  async function snapshotBase(workspaceId) {
    const workspace = readWorkspace(db, workspaceId)
    if (!['local_overlay', 'local_worktree'].includes(workspace.mode)) return []
    const root = path.resolve(String(workspace.projectViewRoot || '').trim())
    const files = await listRegularFiles(root)
    const insert = db.prepare(`
      INSERT INTO agent_workspace_base_files (
        workspace_id, relative_path, content_digest, size_bytes
      ) VALUES (?, ?, ?, ?)
    `)
    const persist = db.transaction(() => {
      db.prepare('DELETE FROM agent_workspace_base_files WHERE workspace_id = ?')
        .run(workspace.id)
      for (const [filePath, file] of files) {
        insert.run(workspace.id, filePath, file.digest, file.sizeBytes)
      }
    })
    persist()
    return [...files.keys()]
  }

  function existingArtifacts(workspaceId) {
    return db.prepare(`
      SELECT projection_json
      FROM agent_artifact_projections
      WHERE json_extract(projection_json, '$.workspaceId') = ?
      ORDER BY created_at ASC, artifact_id ASC
    `).all(workspaceId)
      .map((row) => validateAgentArtifact(parseJson(row.projection_json)))
  }

  async function capture(workspaceId) {
    const workspace = readWorkspace(db, workspaceId)
    if (!['local_overlay', 'local_worktree'].includes(workspace.mode)) return []
    const existing = existingArtifacts(workspace.id)
    if (existing.length > 0) return existing
    const baseRows = db.prepare(`
      SELECT relative_path, content_digest, size_bytes
      FROM agent_workspace_base_files
      WHERE workspace_id = ?
      ORDER BY relative_path ASC
    `).all(workspace.id)
    const base = new Map(baseRows.map((row) => [row.relative_path, {
      digest: row.content_digest,
      sizeBytes: Number(row.size_bytes || 0),
    }]))
    const current = await listRegularFiles(path.resolve(workspace.projectViewRoot))
    const changedPaths = [...new Set([...base.keys(), ...current.keys()])]
      .filter((filePath) => base.get(filePath)?.digest !== current.get(filePath)?.digest)
      .sort((left, right) => left.localeCompare(right))
    const artifacts = changedPaths.map((filePath) => {
      const before = base.get(filePath)
      const after = current.get(filePath)
      const operationType = !before
        ? 'create_file'
        : !after
          ? 'delete_file'
          : 'update_file'
      return validateAgentArtifact({
        schemaVersion: 1,
        id: idFactory(),
        runId: workspace.runId,
        nodeId: workspace.nodeId,
        attemptId: workspace.attemptId,
        workspaceId: workspace.id,
        workspaceMode: workspace.mode,
        baseRevision: workspace.baseRevision,
        baseContentDigest: before?.digest || EMPTY_DIGEST,
        kind: 'file_snapshot',
        operationType,
        path: filePath,
        originalPath: null,
        digest: after?.digest || EMPTY_DIGEST,
        sizeBytes: after?.sizeBytes || 0,
        dependencies: [],
        provenance: {
          origin: 'local_workspace',
          verifiedLocalImport: false,
          providerArtifactId: null,
        },
        createdAt: now(),
        metadata: after ? { contentPath: filePath } : { deleted: true },
      })
    })
    for (const artifact of artifacts) {
      eventStore?.append({
        runId: artifact.runId,
        nodeId: artifact.nodeId,
        parentNodeId: workspace.ownership.parentNodeId || null,
        attemptId: artifact.attemptId,
        providerEventId: null,
        providerCorrelationKey: null,
        idempotencyKey: `${artifact.runId}:agent_artifact_staged:${artifact.id}`,
        kind: 'agent_artifact_staged',
        payload: {
          artifactId: artifact.id,
          workspaceMode: artifact.workspaceMode,
          path: artifact.path,
          artifact,
        },
        createdAt: artifact.createdAt,
      })
    }
    return artifacts
  }

  function importProviderArtifact(workspaceId, input = {}) {
    if (!eventStore) {
      throw new TypeError('Verified provider imports require a canonical event store')
    }
    const workspace = readWorkspace(db, workspaceId)
    if (workspace.mode === 'opaque_no_write_surface') {
      throw new TypeError('Opaque workspaces cannot import mergeable artifacts')
    }
    if (workspace.mode !== 'remote_provider_workspace') {
      throw new TypeError('Verified provider imports require a remote provider workspace')
    }
    const providerArtifactId = String(input.providerArtifactId || '').trim()
    if (!providerArtifactId) throw new TypeError('providerArtifactId is required')
    const operationType = String(input.operationType || 'provider_import').trim()
    if (!SAFE_PROVIDER_IMPORT_OPERATIONS.has(operationType)) {
      throw new TypeError('Provider artifact operation is not safe for local import')
    }
    const content = String(input.content ?? '')
    const contentDigest = digest(Buffer.from(content, 'utf8'))
    if (String(input.contentDigest || '').trim() !== contentDigest) {
      throw new TypeError('Provider artifact content digest could not be verified locally')
    }
    const artifact = validateAgentArtifact({
      schemaVersion: 1,
      id: idFactory(),
      runId: workspace.runId,
      nodeId: workspace.nodeId,
      attemptId: workspace.attemptId,
      workspaceId: workspace.id,
      workspaceMode: workspace.mode,
      baseRevision: workspace.baseRevision,
      baseContentDigest: String(input.baseContentDigest || '').trim(),
      kind: 'provider_reference',
      operationType,
      path: input.path,
      originalPath: input.originalPath ?? null,
      digest: contentDigest,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      dependencies: Array.isArray(input.dependencies) ? input.dependencies : [],
      provenance: {
        origin: 'provider_reference',
        verifiedLocalImport: true,
        providerArtifactId,
        importedAt: now(),
        importDigest: contentDigest,
      },
      createdAt: now(),
      metadata: { content },
    })
    eventStore.append({
      runId: artifact.runId,
      nodeId: artifact.nodeId,
      parentNodeId: workspace.ownership.parentNodeId || null,
      attemptId: artifact.attemptId,
      providerEventId: null,
      providerCorrelationKey: null,
      idempotencyKey: `${artifact.runId}:provider_artifact_imported:${providerArtifactId}`,
      kind: 'agent_artifact_staged',
      payload: {
        artifactId: artifact.id,
        workspaceMode: artifact.workspaceMode,
        path: artifact.path,
        artifact,
      },
      createdAt: artifact.createdAt,
    })
    return artifact
  }

  return Object.freeze({ capture, importProviderArtifact, snapshotBase })
}
