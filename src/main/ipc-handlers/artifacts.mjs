import * as electron from 'electron'
import fs   from 'fs'
import path from 'path'
import {
  listFiles,
  listRevisions,
  getRevision,
  getLatestRevision,
  recordWrite,
  deleteFile,
  deleteRevision,
  buildArtifactReviewContext,
} from '../memory/artifact-store.mjs'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import { generateMergeProposal } from '../chat/merge-resolution.mjs'
import { evaluateMergeResolutionApplyState } from '../artifacts/merge-resolution-guards.mjs'
import * as vault from '../vault.mjs'
import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'

const { ipcMain } = electron

export function registerArtifactHandlers({ ipcMain: ipcMainImpl = ipcMain } = {}) {
  function emitArtifactFileUpdated(event, filePath, {
    projectPath = '',
    treeChanged = false,
    source = 'artifacts',
  } = {}) {
    if (!event || event.sender.isDestroyed()) return
    const normalizedPath = String(filePath || '').trim().replace(/\\/g, '/')
    sendVersioned(event.sender, 'artifacts:updated', { filePath: normalizedPath || null })
    if (!treeChanged || !normalizedPath) return
    sendVersioned(event.sender, 'file:tree-changed', {
      projectPath: String(projectPath || '').trim(),
      filePath: normalizedPath,
      eventType: 'change',
      changedAt: Date.now(),
      source,
    })
  }

  function resolveProjectPath(project, filePath) {
    const abs = path.resolve(project, filePath)
    const rel = path.relative(project, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { ok: false, error: 'Path escapes project root.' }
    }
    return { ok: true, abs }
  }

  function readFileIfExists(absPath) {
    try {
      if (fs.existsSync(absPath)) return fs.readFileSync(absPath, 'utf8')
    } catch {
      // non-fatal
    }
    return null
  }

  function writeRevisionToDisk(project, filePath, revision, {
    source = 'manual_rollback',
    note = '',
    event,
  } = {}) {
    const resolved = resolveProjectPath(project, filePath)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const prevContent = readFileIfExists(resolved.abs)
    try {
      fs.mkdirSync(path.dirname(resolved.abs), { recursive: true })
      fs.writeFileSync(resolved.abs, String(revision?.content ?? ''), 'utf8')
    } catch (err) {
      return { ok: false, error: `Write failed: ${err.message}` }
    }

    const { newRevId, rev: newRev } = recordWrite({
      project,
      filePath,
      newContent: String(revision?.content ?? ''),
      prevContent,
      source,
      note,
    })

    emitArtifactFileUpdated(event, filePath, {
      projectPath: project,
      treeChanged: true,
      source: 'artifacts-write',
    })
    return { ok: true, newRevId, newRev, mode: 'rollback' }
  }

  function deleteCreatedFile(project, filePath, {
    source = 'manual_rollback',
    note = '',
    event,
  } = {}) {
    const resolved = resolveProjectPath(project, filePath)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const prevContent = readFileIfExists(resolved.abs)
    try {
      if (fs.existsSync(resolved.abs)) fs.unlinkSync(resolved.abs)
    } catch (err) {
      return { ok: false, error: `Delete failed: ${err.message}` }
    }

    const { newRevId, rev: newRev } = recordWrite({
      project,
      filePath,
      newContent: '',
      prevContent,
      source,
      note,
    })

    emitArtifactFileUpdated(event, filePath, {
      projectPath: project,
      treeChanged: true,
      source: 'artifacts-delete',
    })
    return { ok: true, newRevId, newRev, mode: 'delete_created', deleted: true }
  }

  function evaluateUndoConflict(project, filePath, expectedNewRevId) {
    const latest = getLatestRevision(project, filePath)
    const latestId = String(latest?.id || '')
    if (expectedNewRevId && latestId && latestId !== expectedNewRevId) {
      return {
        conflict: true,
        latestId,
        latestRev: Number(latest?.rev || 0) || 0,
      }
    }
    return {
      conflict: false,
      latestId,
      latestRev: Number(latest?.rev || 0) || 0,
    }
  }

  function undoFileChangeInternal(event, {
    project,
    filePath,
    newRevId = '',
    prevRevId = '',
    changeType = '',
  } = {}) {
    if (!project || !filePath) {
      return { ok: false, error: 'Missing required fields.' }
    }

    const normalizedPath = String(filePath || '').trim()
    const expectedNewRevId = String(newRevId || '').trim()
    const previousRevId = String(prevRevId || '').trim()
    const normalizedType = String(changeType || '').trim().toLowerCase()

    const conflict = evaluateUndoConflict(project, normalizedPath, expectedNewRevId)
    if (conflict.conflict) {
      return {
        ok: false,
        conflict: true,
        reason: 'changed_since_turn',
        latestId: conflict.latestId,
        latestRev: conflict.latestRev,
      }
    }

    if (previousRevId) {
      const rev = getRevision(previousRevId)
      if (!rev) return { ok: false, error: 'Revision not found.' }
      return writeRevisionToDisk(project, normalizedPath, rev, {
        source: 'manual_rollback',
        note: `Rolled back to rev ${Number(rev.rev || 0) || 'n/a'}`,
        event,
      })
    }

    if (normalizedType === 'created' || !previousRevId) {
      return deleteCreatedFile(project, normalizedPath, {
        source: 'manual_rollback',
        note: 'Undid created file change',
        event,
      })
    }

    return { ok: false, error: 'Undo action is not supported for this file change.' }
  }


  handleVersioned(ipcMainImpl, 'artifacts:listFiles', (_event, { project, threadId = '' }) => {
    if (!project) return []
    return listFiles(project, { threadId })
  })

  handleVersioned(ipcMainImpl, 'artifacts:listRevisions', (_event, { project, filePath }) => {
    if (!project || !filePath) return []
    return listRevisions(project, filePath)
  })

  handleVersioned(ipcMainImpl, 'artifacts:getRevision', (_event, { id }) => {
    if (!id) return null
    return getRevision(id)
  })

  handleVersioned(ipcMainImpl, 'artifacts:review-context', (_event, { project, ...opts } = {}) => {
    if (!project) {
      return {
        context: 'No project selected.',
        traceSummary: 'missing_project',
        files: [],
      }
    }
    return buildArtifactReviewContext(project, opts || {})
  })

  handleVersioned(ipcMainImpl, 'artifacts:rollback', async (event, { project, filePath, revId }) => {
    if (!project || !filePath || !revId) {
      return { ok: false, error: 'Missing required fields.' }
    }

    const rev = getRevision(revId)
    if (!rev) return { ok: false, error: 'Revision not found.' }

    return writeRevisionToDisk(project, filePath, rev, {
      source: 'manual_rollback',
      note: `Rolled back to rev ${Number(rev.rev || 0) || 'n/a'}`,
      event,
    })
  })

  handleVersioned(ipcMainImpl, 'artifacts:deleteFile', (event, { project, filePath }) => {
    if (!project || !filePath) return { ok: false, error: 'Missing fields.' }
    deleteFile(project, filePath)
    emitArtifactFileUpdated(event, filePath)
    return { ok: true }
  })

  handleVersioned(ipcMainImpl, 'artifacts:deleteRevision', (event, { filePath, id }) => {
    if (!id) return { ok: false, error: 'Missing revision id.' }
    deleteRevision(id)
    emitArtifactFileUpdated(event, filePath)
    return { ok: true }
  })

  handleVersioned(ipcMainImpl, 'artifacts:applyToDisk', async (event, { project, filePath, revId }) => {
    if (!project || !filePath || !revId) {
      return { ok: false, error: 'Missing required fields.' }
    }

    const rev = getRevision(revId)
    if (!rev) return { ok: false, error: 'Revision not found.' }

    return writeRevisionToDisk(project, filePath, rev, {
      source: 'ai_write',
      note: `Applied suggestion (from rev ${Number(rev.rev || 0) || 'n/a'})`,
      event,
    })
  })

  handleVersioned(ipcMainImpl, 'artifacts:getLatestForFiles', (_event, { project, filePaths = [] } = {}) => {
    if (!project || !Array.isArray(filePaths)) return { ok: false, rows: [] }
    const rows = []
    const uniquePaths = Array.from(new Set(filePaths.map((p) => String(p || '').trim()).filter(Boolean)))
    for (const filePath of uniquePaths) {
      const latest = getLatestRevision(project, filePath)
      rows.push({
        filePath,
        latestId: String(latest?.id || ''),
        latestRev: Number(latest?.rev || 0) || 0,
        latestSource: String(latest?.source || ''),
        latestNote: String(latest?.note || ''),
        latestPrevRevId: String(latest?.prev_rev_id || ''),
        latestContentLength: String(latest?.content || '').length,
        latestAt: Number(latest?.created_at || 0) || 0,
      })
    }
    return { ok: true, rows }
  })

  handleVersioned(ipcMainImpl, 'artifacts:undoFileChange', (event, payload = {}) => {
    return undoFileChangeInternal(event, payload || {})
  })

  handleVersioned(ipcMainImpl, 'artifacts:undoTurnFileChanges', (event, { project, changes = [] } = {}) => {
    if (!project || !Array.isArray(changes)) {
      return { ok: false, error: 'Missing required fields.', results: [], summary: { success: 0, conflicts: 0, failed: 0 } }
    }
    const normalized = changes
      .map((row) => ({
        project,
        filePath: String(row?.filePath || '').trim(),
        newRevId: String(row?.newRevId || '').trim(),
        prevRevId: String(row?.prevRevId || '').trim(),
        changeType: String(row?.changeType || '').trim().toLowerCase(),
        sequence: Number(row?.sequence || 0) || 0,
      }))
      .filter((row) => row.filePath)
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))

    const results = normalized.map((row) => {
      const res = undoFileChangeInternal(event, row)
      return {
        filePath: row.filePath,
        ok: !!res?.ok,
        mode: String(res?.mode || ''),
        conflict: !!res?.conflict,
        reason: String(res?.reason || ''),
        error: String(res?.error || ''),
        newRevId: String(res?.newRevId || ''),
        newRev: Number(res?.newRev || 0) || 0,
        deleted: !!res?.deleted,
      }
    })

    const summary = results.reduce((acc, row) => {
      if (row.ok) acc.success += 1
      else if (row.conflict) acc.conflicts += 1
      else acc.failed += 1
      return acc
    }, { success: 0, conflicts: 0, failed: 0 })

    return { ok: true, results, summary }
  })

  // ── Merge resolution ────────────────────────────────────────────────────

  handleVersioned(ipcMainImpl, 'artifacts:requestMergeProposal', async (_event, {
    project,
    conflictBaseRevId = '',
    conflictActualRevId = '',
    newRevId = '',
    filePath = '',
    providerId = '',
    model = '',
  } = {}) => {
    if (!project || !filePath) {
      return { ok: false, error: 'Missing required fields (project, filePath).' }
    }
    if (!newRevId || !conflictActualRevId) {
      return { ok: false, error: 'Missing revision ids for conflict resolution.' }
    }

    // Fetch the three revisions
    const baseRev = conflictBaseRevId ? getRevision(conflictBaseRevId) : null
    const theirsRev = getRevision(conflictActualRevId)
    const oursRev = getRevision(newRevId)

    if (!theirsRev) return { ok: false, error: `"Theirs" revision not found: ${conflictActualRevId}` }
    if (!oursRev) return { ok: false, error: `"Ours" revision not found: ${newRevId}` }

    const baseContent = String(baseRev?.content ?? '')
    const theirsContent = String(theirsRev.content ?? '')
    const oursContent = String(oursRev.content ?? '')

    const resolvedProviderId = String(providerId || '').trim()
    const resolvedModel = String(model || '').trim()
    if (!resolvedProviderId || !resolvedModel) {
      return { ok: false, error: 'No AI provider or model specified for merge resolution.' }
    }
    const normalizedProviderId = resolvedProviderId.toLowerCase()
    const openAIExecutionAuth = normalizedProviderId === 'openai'
      ? resolveOpenAIExecutionAuth()
      : null
    if (normalizedProviderId === 'openai' && openAIExecutionAuth?.ok !== true) {
      return {
        ok: false,
        error: String(
          openAIExecutionAuth?.userFacingBlockedMessage
          || openAIExecutionAuth?.blockedMessage
          || 'OpenAI authentication is unavailable for merge resolution.',
        ),
      }
    }
    const apiKey = normalizedProviderId === 'openai'
      ? String(openAIExecutionAuth?.apiKey || '')
      : (vault.getKey(resolvedProviderId) ?? '')

    return generateMergeProposal({
      baseContent,
      oursContent,
      theirsContent,
      filePath,
      providerId: resolvedProviderId,
      apiKey,
      model: resolvedModel,
    })
  })

  handleVersioned(ipcMainImpl, 'artifacts:applyMergeResolution', async (event, {
    project,
    filePath = '',
    mergedContent = '',
    conflictId = '',
    conflictBaseRevId = '',
    conflictActualRevId = '',
    newRevId = '',
  } = {}) => {
    if (!project || !filePath) {
      return { ok: false, error: 'Missing required fields (project, filePath).' }
    }
    if (typeof mergedContent !== 'string') {
      return { ok: false, error: 'Missing merged content.' }
    }

    // Write to disk and record in the artifact store in a single step.
    // We pass the merged content as a synthetic revision object to
    // writeRevisionToDisk which handles both the fs write and the
    // recordWrite call — avoiding the double-recording that would occur
    // if we called recordWrite separately before writeRevisionToDisk.
    const resolved = resolveProjectPath(project, filePath)
    if (!resolved.ok) return { ok: false, error: resolved.error }

    const guard = evaluateMergeResolutionApplyState({
      project,
      filePath,
      absPath: resolved.abs,
      expectedLatestRevId: String(newRevId || '').trim(),
    })
    if (!guard.ok) {
      return {
        ok: false,
        conflict: !!guard.conflict,
        reason: String(guard.reason || ''),
        latestId: String(guard.latestId || ''),
        latestRev: Number(guard.latestRev || 0) || 0,
        error: String(guard.error || 'Merge apply is no longer valid for this file.'),
      }
    }

    const prevContent = readFileIfExists(resolved.abs)
    try {
      fs.mkdirSync(path.dirname(resolved.abs), { recursive: true })
      fs.writeFileSync(resolved.abs, mergedContent, 'utf8')
    } catch (err) {
      return { ok: false, error: `Write failed: ${err.message}` }
    }

    const mergeNote = [
      'AI-assisted merge of conflicting revisions',
      conflictId ? `conflictId=${conflictId}` : '',
      conflictBaseRevId ? `base=${conflictBaseRevId}` : '',
      conflictActualRevId ? `theirs=${conflictActualRevId}` : '',
      newRevId ? `ours=${newRevId}` : '',
    ].filter(Boolean).join(' | ')

    const { newRevId: mergeRevId, rev: mergeRev } = recordWrite({
      project,
      filePath,
      newContent: mergedContent,
      prevContent,
      source: 'merge_resolution',
      note: mergeNote,
    })

    emitArtifactFileUpdated(event, filePath, {
      projectPath: project,
      treeChanged: true,
      source: 'artifacts-merge',
    })

    return {
      ok: true,
      newRevId: mergeRevId,
      newRev: mergeRev,
      conflictId,
    }
  })
}
