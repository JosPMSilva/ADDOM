import electron from 'electron'
import fs from 'fs'
import path from 'path'
import * as store from '../memory/memory-store.mjs'
import { embedder } from '../memory/embedder.mjs'
import {
  listFiles as listArtifactFiles,
  listRevisions as listArtifactRevisions,
  getRevision as getArtifactRevision,
} from '../memory/artifact-store.mjs'
import { estimateTextTokens } from '../chat/token-utils.mjs'
import { sendVersioned } from '../ipc/ipc-versioning.mjs'
import { fetchTextWithSafeRedirects } from '../utils/ssrf-guard.mjs'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { applyOwnerOnlyFilePermissions } from '../utils/private-file-permissions.mjs'
import { listTerminalSessionArchives } from '../terminal/terminal-session-archive-store.mjs'

const { ipcMain, dialog } = electron

function stripHtml(input = '') {
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|br|tr|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeIngestLimit(value, fallback = 6000) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1200, Math.min(20000, Math.round(n)))
}

function estimateTokens(text = '') {
  return estimateTextTokens(text)
}

function replaceForbiddenWindowsNameChars(value = '') {
  return Array.from(String(value || ''), (char) => {
    const code = char.charCodeAt(0)
    if (code <= 0x1f || /[<>:"/\\|?*]/.test(char)) return '_'
    return char
  }).join('')
}

function buildSafeExportFileName(project = '') {
  const base = path.basename(String(project || '').trim() || 'addom-project')
  const safeBase = replaceForbiddenWindowsNameChars(base).trim() || 'addom-project'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${safeBase}.addom-context-export.${stamp}.json`
}

function withIsoTimestamps(record = {}) {
  const out = { ...record }
  if (Number.isFinite(Number(record.createdAt)) && Number(record.createdAt) > 0) {
    out.createdAtIso = new Date(Number(record.createdAt)).toISOString()
  }
  if (Number.isFinite(Number(record.updatedAt)) && Number(record.updatedAt) > 0) {
    out.updatedAtIso = new Date(Number(record.updatedAt)).toISOString()
  }
  if (Number.isFinite(Number(record.lastAccessed)) && Number(record.lastAccessed) > 0) {
    out.lastAccessedIso = new Date(Number(record.lastAccessed)).toISOString()
  }
  if (record.provenance && typeof record.provenance === 'object') {
    const acceptedAt = Number(record.provenance.acceptedAt)
    if (Number.isFinite(acceptedAt) && acceptedAt > 0) {
      out.provenance = {
        ...record.provenance,
        acceptedAtIso: new Date(acceptedAt).toISOString(),
      }
    }
  }
  return out
}

function withArchiveIsoTimestamps(record = {}) {
  const out = { ...record }
  if (Number.isFinite(Number(record.openedAt)) && Number(record.openedAt) > 0) {
    out.openedAtIso = new Date(Number(record.openedAt)).toISOString()
  }
  if (Number.isFinite(Number(record.closedAt)) && Number(record.closedAt) > 0) {
    out.closedAtIso = new Date(Number(record.closedAt)).toISOString()
  }
  return out
}

export function buildProjectExportPayload(project = '', {
  includeGlobal = false,
} = {}) {
  const memoryNodes = store.listNodes(project, {
    includeCompressed: true,
    includeDeletedThreads: true,
    includeGlobal: includeGlobal === true,
  }).map((node) => withIsoTimestamps(node))
  const archivedSessions = listTerminalSessionArchives(project, {
    limit: 1_000,
  }).map((archive) => withArchiveIsoTimestamps(archive))
  const artifactFiles = listArtifactFiles(project)
  const artifacts = artifactFiles.map((fileRow) => {
    const revisionRows = listArtifactRevisions(project, fileRow.file_path)
    const revisions = revisionRows.map((revRow) => {
      const full = getArtifactRevision(revRow.id) || {}
      const revision = {
        id: String(full.id || revRow.id || ''),
        project: String(full.project || project || ''),
        filePath: String(full.file_path || fileRow.file_path || ''),
        rev: Number(full.rev ?? revRow.rev ?? 0),
        content: String(full.content || ''),
        prevRevId: full.prev_rev_id ?? null,
        source: String(full.source || revRow.source || ''),
        note: String(full.note || revRow.note || ''),
        createdAt: Number(full.created_at || revRow.created_at || 0) || 0,
      }
      if (revision.createdAt > 0) {
        revision.createdAtIso = new Date(revision.createdAt).toISOString()
      }
      return revision
    })
    const fileRecord = {
      filePath: String(fileRow.file_path || ''),
      latestRev: Number(fileRow.latest_rev || 0),
      totalRevisions: Number(fileRow.total_revisions || 0),
      latestSource: String(fileRow.latest_source || ''),
      latestAt: Number(fileRow.latest_at || 0) || 0,
      revisions,
    }
    if (fileRecord.latestAt > 0) {
      fileRecord.latestAtIso = new Date(fileRecord.latestAt).toISOString()
    }
    return fileRecord
  })

  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    project,
    memory: {
      totalNodes: memoryNodes.length,
      nodes: memoryNodes,
    },
    terminalArchive: {
      totalSessions: archivedSessions.length,
      suggestionStatusCounts: archivedSessions.reduce((acc, archive) => {
        const status = String(archive?.memoryCandidateStatus || 'none').trim() || 'none'
        acc[status] = Number(acc[status] || 0) + 1
        return acc
      }, {}),
      linkedMemoryNodeCount: archivedSessions.filter((archive) => String(archive?.memoryNodeId || '').trim()).length,
      sessions: archivedSessions,
    },
    artifacts: {
      totalFiles: artifacts.length,
      totalRevisions: artifacts.reduce((sum, file) => sum + Number(file.revisions?.length || 0), 0),
      files: artifacts,
    },
  }
}

async function fetchWebPreview(url, maxChars) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are supported')
  }

  const limit = normalizeIngestLimit(maxChars, 6000)
  const { status, bodyText: raw, finalUrl } = await fetchTextWithSafeRedirects(parsed.toString(), {
    timeoutMs: 7000,
    maxRedirectHops: 5,
    userAgent: 'ADDOM/1.0 (+local-app)',
    accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.9',
  })
  if (status < 200 || status >= 300) {
    throw new Error(`Website fetch failed (${status})`)
  }

  parsed = new URL(finalUrl)
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const pageTitle = titleMatch?.[1]?.trim() || parsed.hostname
  const cleanText = stripHtml(raw)
  if (!cleanText) {
    throw new Error('Could not extract readable text from page')
  }

  const excerpt = cleanText.slice(0, limit)
  return {
    url: parsed.toString(),
    domain: parsed.hostname,
    title: pageTitle,
    excerpt,
    estimatedTokens: estimateTokens(excerpt),
  }
}

export function registerMemoryHandlers(getMainWindow, {
  ipcMainImpl = ipcMain,
  dialogImpl = dialog,
  storeImpl = store,
  embedderImpl = embedder,
} = {}) {

  embedderImpl.on('status', (status) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      sendVersioned(win.webContents, 'memory:embedder-status', status)
    }
  })

  handleVersioned(ipcMainImpl, 'memory:list', (_e, {
    project,
    includeCompressed = false,
    includeDeletedThreads = false,
    includeGlobal = false,
    includeProject = true,
    globalOnly = false,
    scope = '',
    scopeFilter = '',
    threadId = '',
  } = {}) => {
    return storeImpl.listNodes(project, {
      includeCompressed: !!includeCompressed,
      includeDeletedThreads: !!includeDeletedThreads,
      includeGlobal: !!includeGlobal,
      includeProject: includeProject !== false,
      globalOnly: !!globalOnly,
      scopeFilter: String(scope || scopeFilter || '').trim().toLowerCase(),
      threadId: String(threadId || '').trim(),
    })
  })

  handleVersioned(ipcMainImpl, 'memory:search', async (_e, {
    project,
    query,
    topK,
    threshold,
    includeCompressed = false,
    includeDeletedThreads = false,
    includeGlobal = false,
    includeProject = true,
    scope = '',
    scopeFilter = '',
    threadId = '',
  } = {}) => {
    return storeImpl.searchNodes(project, query, {
      topK,
      threshold,
      includeCompressed: !!includeCompressed,
      includeDeletedThreads: !!includeDeletedThreads,
      includeGlobal: !!includeGlobal,
      includeThread: !!String(threadId || '').trim(),
      includeProject: includeProject !== false,
      scopeFilter: String(scope || scopeFilter || '').trim().toLowerCase(),
      threadId: String(threadId || '').trim(),
    })
  })

  handleVersioned(ipcMainImpl, 'memory:add', async (_e, payload) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {}
    const id = await storeImpl.addNode({
      ...safePayload,
      isGlobal: !!safePayload.isGlobal,
    })
    return { id }
  })

  handleVersioned(ipcMainImpl, 'memory:promote', async (_e, payload = {}) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {}
    const node = storeImpl.promoteNode(safePayload.id, {
      targetScope: safePayload.targetScope,
      project: safePayload.project,
      threadId: safePayload.threadId,
      originThreadId: safePayload.originThreadId,
    })
    return { ok: true, node }
  })

  handleVersioned(ipcMainImpl, 'memory:demote', async (_e, payload = {}) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {}
    const node = storeImpl.demoteNode(safePayload.id, {
      targetScope: safePayload.targetScope,
      project: safePayload.project,
      threadId: safePayload.threadId,
      originThreadId: safePayload.originThreadId,
    })
    return { ok: true, node }
  })

  handleVersioned(ipcMainImpl, 'memory:invalidate', async (_e, payload = {}) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {}
    const node = storeImpl.invalidateNode(safePayload.id, {
      supersededBy: safePayload.supersededBy,
    })
    return { ok: true, node }
  })

  handleVersioned(ipcMainImpl, 'memory:preview-url', async (_event, {
    project,
    url,
    maxChars,
  } = {}) => {
    if (!project || !url) {
      throw new Error('project and url are required')
    }

    const preview = await fetchWebPreview(url, maxChars)
    return {
      url: preview.url,
      domain: preview.domain,
      title: preview.title,
      excerpt: preview.excerpt.slice(0, 1200),
      estimatedTokens: preview.estimatedTokens,
    }
  })

  handleVersioned(ipcMainImpl, 'memory:ingest-url', async (event, {
    project,
    url,
    topic,
    maxChars,
  } = {}) => {
    if (!project || !url) {
      throw new Error('project and url are required')
    }

    const preview = await fetchWebPreview(url, maxChars)
    const nodeId = await storeImpl.addNode({
      project,
      topic: topic?.trim() || `Web ingest: ${preview.title}`,
      content: `URL: ${preview.url}\n\n${preview.excerpt}`,
      tags: ['web_ingest', preview.domain],
      source: 'web_ingest',
      dataPolicy: 'standard',
    })

    if (!event.sender.isDestroyed()) {
      sendVersioned(event.sender, 'memory:updated', { count: 1 })
    }

    return {
      id: nodeId,
      url: preview.url,
      title: preview.title,
      domain: preview.domain,
      excerpt: preview.excerpt.slice(0, 900),
      estimatedTokens: preview.estimatedTokens,
    }
  })

  handleVersioned(ipcMainImpl, 'memory:update', async (_e, { id, ...fields }) => {
    await storeImpl.updateNode(id, fields)
    return { ok: true }
  })

  handleVersioned(ipcMainImpl, 'memory:delete', (_e, { id, force }) => {
    return storeImpl.deleteNode(id, !!force)
  })

  handleVersioned(ipcMainImpl, 'memory:clear', (event, { project, all = false } = {}) => {
    const count = all ? storeImpl.clearNodes(null) : storeImpl.clearNodes(project || null)
    if (!event.sender.isDestroyed()) {
      sendVersioned(event.sender, 'memory:updated', { count })
    }
    return { ok: true, count }
  })

  handleVersioned(ipcMainImpl, 'memory:pin', async (_e, { id, pinned }) => {
    await storeImpl.updateNode(id, { pinned })
    return { ok: true }
  })

  handleVersioned(ipcMainImpl, 'memory:embedder-status', () => {
    return { ready: embedderImpl.isReady }
  })

  handleVersioned(ipcMainImpl, 'memory:export-project-json', async (_event, { project, includeGlobal = false } = {}) => {
    const normalizedProject = String(project || '').trim()
    if (!normalizedProject) {
      return { ok: false, error: 'project is required' }
    }

    const payload = buildProjectExportPayload(normalizedProject, {
      includeGlobal: includeGlobal === true,
    })
    const win = getMainWindow?.()
    const saveOptions = {
      title: 'Export ADDOM Context JSON',
      defaultPath: path.join(normalizedProject, buildSafeExportFileName(normalizedProject)),
      filters: [
        { name: 'JSON', extensions: ['json'] },
      ],
    }
    const safeWin = win && !win.isDestroyed() ? win : null
    const result = safeWin
      ? await dialogImpl.showSaveDialog(safeWin, saveOptions)
      : await dialogImpl.showSaveDialog(saveOptions)

    if (result.canceled || !result.filePath) {
      return { ok: false, cancelled: true }
    }

    const json = JSON.stringify(payload, null, 2)
    fs.writeFileSync(result.filePath, json, { encoding: 'utf8', mode: 0o600 })
    applyOwnerOnlyFilePermissions(result.filePath)

    return {
      ok: true,
      filePath: result.filePath,
      memoryNodeCount: Number(payload.memory.totalNodes || 0),
      artifactFileCount: Number(payload.artifacts.totalFiles || 0),
      artifactRevisionCount: Number(payload.artifacts.totalRevisions || 0),
    }
  })
}
