import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { ipcMain } from '../electron-api.mjs'
import {
  commitGitStaged,
  discardGitHunk,
  discardGitLines,
  getGitFileDiff,
  getGitHeaderStatus,
  getGitRepositoryStatus,
  restoreGitFile,
  stageGitAll,
  stageGitFile,
  stageGitLines,
  stageGitHunk,
  unstageGitFile,
  unstageGitAll,
  unstageGitHunk,
  unstageGitLines,
} from '../tools/git-tools.mjs'

function readProjectFolder(payload = {}) {
  return String(payload?.projectFolder || '').trim()
}

function readFilePath(payload = {}) {
  return String(payload?.filePath || payload?.path || '').trim()
}

function readPreviousFilePath(payload = {}) {
  return String(payload?.previousFilePath || payload?.previousPath || '').trim()
}

function readHunkId(payload = {}) {
  return String(payload?.hunkId || '').trim()
}

function readScope(payload = {}) {
  return String(payload?.scope || '').trim().toLowerCase() === 'staged' ? 'staged' : 'unstaged'
}

function readLineSelection(payload = {}) {
  const startLine = Number(payload?.startLine || payload?.startLineNumber || 0)
  const endLine = Number(payload?.endLine || payload?.endLineNumber || 0)
  return {
    startLine: Number.isFinite(startLine) ? Math.max(0, Math.trunc(startLine)) : 0,
    endLine: Number.isFinite(endLine) ? Math.max(0, Math.trunc(endLine)) : 0,
  }
}

export function registerGitHandlers(ipcMainImpl = ipcMain) {
  handleVersioned(ipcMainImpl, 'git:getHeaderStatus', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    try {
      return await getGitHeaderStatus(projectFolder)
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_get_header_status_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:getFileDiff', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const scope = readScope(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    try {
      return await getGitFileDiff(projectFolder, { filePath, scope })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_get_file_diff_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:getRepositoryStatus', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    try {
      return await getGitRepositoryStatus(projectFolder)
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_get_repository_status_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:stageHunk', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const hunkId = readHunkId(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    if (!hunkId) return { ok: false, error: 'no_hunk_id' }
    try {
      return await stageGitHunk(projectFolder, { filePath, hunkId })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_stage_hunk_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:discardHunk', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const hunkId = readHunkId(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    if (!hunkId) return { ok: false, error: 'no_hunk_id' }
    try {
      return await discardGitHunk(projectFolder, { filePath, hunkId })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_discard_hunk_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:unstageHunk', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const hunkId = readHunkId(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    if (!hunkId) return { ok: false, error: 'no_hunk_id' }
    try {
      return await unstageGitHunk(projectFolder, { filePath, hunkId })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_unstage_hunk_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:restoreFile', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    try {
      return await restoreGitFile(projectFolder, { filePath })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_restore_file_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:stageFile', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const previousFilePath = readPreviousFilePath(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    try {
      return await stageGitFile(projectFolder, { filePath, previousFilePath })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_stage_file_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:unstageFile', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const previousFilePath = readPreviousFilePath(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    try {
      return await unstageGitFile(projectFolder, { filePath, previousFilePath })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_unstage_file_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:stageAll', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    try {
      return await stageGitAll(projectFolder)
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_stage_all_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:unstageAll', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    try {
      return await unstageGitAll(projectFolder)
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_unstage_all_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:stageLines', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const hunkId = readHunkId(payload)
    const lineSelection = readLineSelection(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    if (!lineSelection.startLine || !lineSelection.endLine) return { ok: false, error: 'no_line_selection' }
    try {
      return await stageGitLines(projectFolder, {
        filePath,
        hunkId,
        startLine: lineSelection.startLine,
        endLine: lineSelection.endLine,
      })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_stage_lines_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:unstageLines', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const hunkId = readHunkId(payload)
    const lineSelection = readLineSelection(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    if (!lineSelection.startLine || !lineSelection.endLine) return { ok: false, error: 'no_line_selection' }
    try {
      return await unstageGitLines(projectFolder, {
        filePath,
        hunkId,
        startLine: lineSelection.startLine,
        endLine: lineSelection.endLine,
      })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_unstage_lines_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:discardLines', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const filePath = readFilePath(payload)
    const hunkId = readHunkId(payload)
    const lineSelection = readLineSelection(payload)
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!filePath) return { ok: false, error: 'no_file_path' }
    if (!lineSelection.startLine || !lineSelection.endLine) return { ok: false, error: 'no_line_selection' }
    try {
      return await discardGitLines(projectFolder, {
        filePath,
        hunkId,
        startLine: lineSelection.startLine,
        endLine: lineSelection.endLine,
      })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_discard_lines_failed'),
      }
    }
  })

  handleVersioned(ipcMainImpl, 'git:commitStaged', async (_event, payload = {}) => {
    const projectFolder = readProjectFolder(payload)
    const message = String(payload?.message || '').trim()
    if (!projectFolder) return { ok: false, error: 'no_project_folder' }
    if (!message) return { ok: false, error: 'no_commit_message' }
    try {
      return await commitGitStaged(projectFolder, { message })
    } catch (error) {
      return {
        ok: false,
        error: 'git_error',
        message: String(error?.message || error || 'git_commit_staged_failed'),
      }
    }
  })
}
