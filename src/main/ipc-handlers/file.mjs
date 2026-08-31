/**
 * IPC handlers for human-initiated file operations in the Editor panel.
 *
 * These are not subject to the AI tool approval gate because the human is the actor.
 */

import * as electron from 'electron'
import fs from 'fs'
import path from 'path'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import { recordManualEditSave } from '../memory/artifact-store.mjs'
import { listProjects } from '../workspace/workspace-store.mjs'
import {
  decodeTextFileBuffer,
  encodeTextFileContent,
} from './file-text-codec.mjs'

const { ipcMain } = electron

const TEXT_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.pyw', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.php', '.swift', '.kt', '.scala', '.r',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.md', '.mdx', '.txt', '.rst', '.csv',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql',
  '.xml', '.svg',
  '.dockerfile', '.gitignore', '.gitattributes', '.editorconfig',
  '.lock', '.log',
])

const IGNORED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', '.nuxt', 'out', 'target', '.idea', '.vscode'])
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db'])

function safePath(projectRoot, filePath) {
  const abs = path.resolve(projectRoot, filePath)
  const rel = path.relative(projectRoot, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${filePath}" escapes the project root.`)
  }

  const realProjectRoot = fs.realpathSync(projectRoot)
  let existingAncestor = abs
  const missingSegments = []
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor)
    if (parent === existingAncestor) break
    missingSegments.unshift(path.basename(existingAncestor))
    existingAncestor = parent
  }
  const resolvedThroughLinks = path.resolve(fs.realpathSync(existingAncestor), ...missingSegments)
  const realRel = path.relative(realProjectRoot, resolvedThroughLinks)
  if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
    throw new Error(`Path "${filePath}" escapes the project root through a symbolic link.`)
  }
  return abs
}

function buildTree(projectRoot, dirAbs, relBase = '', depth = 0) {
  const MAX_DEPTH = 12
  if (depth > MAX_DEPTH) return []

  let entries
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  } catch {
    return []
  }

  const dirs = []
  const files = []

  for (const entry of entries) {
    if (IGNORED_FILES.has(entry.name)) continue
    if (entry.name.startsWith('.') && entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue

    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name
    const absPath = path.join(dirAbs, entry.name)

    if (entry.isDirectory()) {
      dirs.push({
        name: entry.name,
        path: relPath,
        type: 'dir',
        children: buildTree(projectRoot, absPath, relPath, depth + 1),
      })
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    const isText = TEXT_EXTS.has(ext) || ext === '' || TEXT_EXTS.has(entry.name.toLowerCase())
    files.push({
      name: entry.name,
      path: relPath,
      type: 'file',
      isText,
      ext: ext || null,
    })
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  return [...dirs, ...files]
}

function normalizeProjectFilePath(filePath = '') {
  return String(filePath || '').trim().replace(/\\/g, '/')
}

function isRegisteredProjectPath(project = '', listProjectsImpl = listProjects) {
  const rawCandidate = String(project || '').trim()
  if (!rawCandidate || typeof listProjectsImpl !== 'function') return false
  const candidate = path.resolve(rawCandidate)
  const normalizedCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate
  return listProjectsImpl().some((entry) => {
    const rawConfigured = String(entry?.path || '').trim()
    if (!rawConfigured) return false
    const configured = path.resolve(rawConfigured)
    const normalizedConfigured = process.platform === 'win32' ? configured.toLowerCase() : configured
    return normalizedConfigured === normalizedCandidate
  })
}

function readExistingDecodedContent(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null
    const raw = fs.readFileSync(absPath)
    return decodeTextFileBuffer(raw).content
  } catch {
    return null
  }
}

function emitEditorSaveEvents(sender, project, filePath) {
  if (!sender || sender.isDestroyed?.()) return
  const normalizedFilePath = normalizeProjectFilePath(filePath)
  sendVersioned(sender, 'artifacts:updated', { filePath: normalizedFilePath || null })
  sendVersioned(sender, 'file:tree-changed', {
    projectPath: path.resolve(project),
    filePath: normalizedFilePath,
    eventType: 'change',
    changedAt: Date.now(),
    source: 'editor-save',
  })
}

export function registerFileHandlers({
  ipcMain: ipcMainImpl = ipcMain,
  listProjectsImpl = listProjects,
} = {}) {
  handleVersioned(ipcMainImpl, 'file:listTree', (_event, { project }) => {
    if (!project) return []
    if (!isRegisteredProjectPath(project, listProjectsImpl)) return []
    if (!fs.existsSync(project)) return []
    return buildTree(project, project)
  })

  handleVersioned(ipcMainImpl, 'file:readFile', (_event, { project, filePath }) => {
    if (!project || !filePath) return { ok: false, error: 'Missing fields.' }
    if (!isRegisteredProjectPath(project, listProjectsImpl)) return { ok: false, error: 'project_not_registered' }

    let abs
    try {
      abs = safePath(project, filePath)
    } catch (error) {
      return { ok: false, error: error.message }
    }

    if (!fs.existsSync(abs)) return { ok: false, error: 'File not found.' }
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) return { ok: false, error: 'Path is a directory.' }
    if (stat.size > 2_097_152) return { ok: false, error: 'File too large to open (> 2 MB).' }

    try {
      const raw = fs.readFileSync(abs)
      const decoded = decodeTextFileBuffer(raw)
      return {
        ok: true,
        content: decoded.content,
        encoding: decoded.encoding,
      }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })

  handleVersioned(ipcMainImpl, 'file:saveFile', (event, { project, filePath, content, encoding }) => {
    if (!project || !filePath || content == null) return { ok: false, error: 'Missing fields.' }
    if (!isRegisteredProjectPath(project, listProjectsImpl)) return { ok: false, error: 'project_not_registered' }

    let abs
    try {
      abs = safePath(project, filePath)
    } catch (error) {
      return { ok: false, error: error.message }
    }

    try {
      const prevContent = readExistingDecodedContent(abs)
      const nextContent = String(content ?? '')
      const unchanged = prevContent !== null && prevContent === nextContent
      if (!unchanged) {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, encodeTextFileContent(nextContent, encoding))
      }
      const artifactRecord = recordManualEditSave({
        project,
        filePath,
        newContent: nextContent,
        prevContent,
      })
      if (artifactRecord.recorded) {
        emitEditorSaveEvents(event?.sender, project, filePath)
      }
      return {
        ok: true,
        source: 'manual_edit',
        prevRevId: String(artifactRecord?.prevRevId || ''),
        newRevId: String(artifactRecord?.newRevId || ''),
        rev: Number(artifactRecord?.rev || 0) || 0,
        unchanged: artifactRecord?.skippedReason === 'unchanged',
        artifactRecorded: artifactRecord?.recorded === true,
      }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })
}
