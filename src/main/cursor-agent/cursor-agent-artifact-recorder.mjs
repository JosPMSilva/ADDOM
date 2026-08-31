import path from 'node:path'
import fs from 'node:fs'
import { recordWrite } from '../memory/artifact-store.mjs'

function relativeProjectPath(projectPath = '', filePath = '') {
  const root = path.resolve(String(projectPath || '').trim())
  const resolved = path.resolve(String(filePath || '').trim())
  const relative = path.relative(root, resolved)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return ''
  }
  return relative.replace(/\\/g, '/')
}

export function recordCursorAgentFileChange({
  projectPath = '',
  filePath = '',
  changeType = 'modified',
  newContent,
  prevContent = null,
  threadId = '',
  turnId = '',
} = {}) {
  const artifactFilePath = relativeProjectPath(projectPath, filePath)
  if (!artifactFilePath) return null
  let resolvedContent = typeof newContent === 'string' ? newContent : null
  if (resolvedContent === null && changeType !== 'deleted') {
    try {
      resolvedContent = fs.readFileSync(filePath, 'utf8')
    } catch {
      return null
    }
  }
  if (changeType === 'deleted') resolvedContent = ''
  const record = recordWrite({
    project: projectPath,
    filePath: artifactFilePath,
    newContent: resolvedContent,
    prevContent: prevContent === null ? null : String(prevContent),
    source: 'cursor_agent',
    note: `Cursor ${String(changeType || 'modified')} this file.`,
    threadId,
    turnId,
  })
  return {
    ...record,
    artifactFilePath,
    contentBytes: Buffer.byteLength(resolvedContent, 'utf8'),
  }
}

export const __testCursorAgentArtifactRecorderInternals = Object.freeze({ relativeProjectPath })
