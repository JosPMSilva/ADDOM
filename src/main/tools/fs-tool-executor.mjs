import { applyArtifactRevision } from './artifact-apply-tool.mjs'
import { fetchPage } from './web-fetch-tool.mjs'
import { browserAction } from './browser-tool.mjs'
import { executeApplyPatchOperation } from './apply-patch-core.mjs'
import {
  createDirectory,
  deleteFile,
  editFile,
  findFiles,
  grepFile,
  listDirectory,
  readFile,
  renameFile,
  rollbackFile,
  searchCode,
  viewFileRange,
  writeFile,
} from './file-tools.mjs'
import { gitCheckoutFile, gitCommit, gitDiff, gitLog, gitStatus } from './git-tools.mjs'
import { isWorkerTool, runFileToolInWorker } from './file-tools-worker-runner.mjs'
import { isCapabilityCatalogVirtualPath } from './capability-catalog-virtual-fs.mjs'
import {
  listBackgroundCommands,
  runCommand,
  stopAllBackgroundCommands,
  stopBackgroundCommand,
} from './command-tools.mjs'
import { questionUser } from './question-tools.mjs'
import { suggestTerminalMemory } from './terminal-memory-suggestion-tool.mjs'
import { installCuratedSkill, listCuratedSkills } from './local-skill-tools.mjs'
import {
  planDirectionFinalize,
  planDirectionUpdate,
  planDocumentWrite,
  planRead,
  planUpdate,
  todoRead,
  todoWrite,
} from './todo-tools.mjs'
import { planningSkillRead } from '../chat/plan-authoring-profiles.mjs'

const TOOL_FNS = {
  read_file: readFile,
  write_file: writeFile,
  edit_file: editFile,
  apply_patch: (projectRoot, toolInput, options = {}) => executeApplyPatchOperation({
    projectRoot,
    toolInput,
    signal: options?.signal,
    fileSystemHostFullAccess: options?.fileSystemHostFullAccess === true,
  }),
  delete_file: deleteFile,
  rename_file: renameFile,
  list_directory: listDirectory,
  create_directory: createDirectory,
  search_code: searchCode,
  view_file_range: viewFileRange,
  grep_file: grepFile,
  rollback_file: rollbackFile,
  find_files: findFiles,
  plan_read: planRead,
  plan_update: planUpdate,
  plan_direction_update: planDirectionUpdate,
  plan_direction_finalize: planDirectionFinalize,
  plan_document_write: planDocumentWrite,
  planning_skill_read: planningSkillRead,
  todo_read: todoRead,
  todo_write: todoWrite,
  question_user: questionUser,
  terminal_memory_suggest: suggestTerminalMemory,
  list_curated_skills: (_projectRoot, toolInput, options = {}) => listCuratedSkills(toolInput, options),
  install_curated_skill: (_projectRoot, toolInput, options = {}) => installCuratedSkill(toolInput, options),
  git_status: gitStatus,
  git_diff: gitDiff,
  git_log: gitLog,
  git_commit: gitCommit,
  git_checkout_file: gitCheckoutFile,
  apply_artifact_revision: applyArtifactRevision,
  run_command: runCommand,
  fetch_page: fetchPage,
  browser_action: browserAction,
}

const PROJECT_ROOT_OPTIONAL_TOOL_NAMES = new Set([
  'list_curated_skills',
  'install_curated_skill',
  'planning_skill_read',
])

const VIRTUAL_CATALOG_READ_TOOL_NAMES = new Set(['read_file', 'search_code'])

function rejectVirtualCatalogMutation(toolName = '', toolInput = {}) {
  if (VIRTUAL_CATALOG_READ_TOOL_NAMES.has(toolName)) return
  const candidates = [
    toolInput?.path,
    toolInput?.old_path,
    toolInput?.new_path,
    toolInput?.file_path,
    toolInput?.target_path,
  ]
  const patchText = String(toolInput?.patch ?? toolInput?.diff ?? '')
  const patchTargetsVirtualCatalog = patchText
    .split(/\r?\n/g)
    .some((line) => {
      const match = line.match(/^\*\*\* (?:Add File|Delete File|Update File|Move to):\s+(.+)$/)
      return match ? isCapabilityCatalogVirtualPath(match[1]) : false
    })
  if (candidates.some((value) => isCapabilityCatalogVirtualPath(value)) || patchTargetsVirtualCatalog) {
    throw new Error('addom://capabilities is a virtual read-only catalog. Use read_file or search_code to inspect it; write and mutate tools cannot modify it.')
  }
}

/**
 * Execute an approved tool call.
 * @returns {Promise<{ result: string, prevContent?: string|null, artifactApply?: object|null }>}
 */
export async function executeTool(projectRoot, toolName, toolInput, options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const fn = TOOL_FNS[toolName]
  if (!fn) throw new Error(`Unknown tool: ${toolName}`)
  rejectVirtualCatalogMutation(toolName, toolInput)
  const normalizedProjectRoot = String(projectRoot || '').trim()
  if (!normalizedProjectRoot && !PROJECT_ROOT_OPTIONAL_TOOL_NAMES.has(String(toolName || '').trim())) {
    throw new Error('No project folder selected.')
  }

  let raw
  const shouldUseWorker = (
    isWorkerTool(toolName)
    && opts.fileSystemHostFullAccess !== true
    && !(toolName === 'search_code' && isCapabilityCatalogVirtualPath(toolInput?.path))
  )
  if (shouldUseWorker) {
    try {
      raw = await runFileToolInWorker(toolName, normalizedProjectRoot, toolInput)
    } catch {
      // Fallback keeps tool behavior available if the worker fails.
      raw = await fn(normalizedProjectRoot, toolInput, opts)
    }
  } else {
    raw = await fn(normalizedProjectRoot, toolInput, opts)
  }

  if (toolName === 'write_file' && raw && typeof raw === 'object') {
    return { result: raw.message, prevContent: raw.prevContent ?? null }
  }
  if (toolName === 'edit_file' && raw && typeof raw === 'object') {
    return { result: raw.message, prevContent: raw.prevContent ?? null }
  }
  if (toolName === 'delete_file' && raw && typeof raw === 'object') {
    return { result: raw.message, prevContent: raw.prevContent ?? null }
  }
  if (toolName === 'apply_patch' && raw && typeof raw === 'object') {
    return {
      result: raw.message,
      prevContent: raw.prevContent ?? null,
      applyPatchMeta: raw.applyPatchMeta && typeof raw.applyPatchMeta === 'object'
        ? { ...raw.applyPatchMeta }
        : null,
      applyPatchChanges: Array.isArray(raw.applyPatchChanges)
        ? raw.applyPatchChanges.map((entry) => ({ ...(entry && typeof entry === 'object' ? entry : {}) }))
        : [],
    }
  }
  if (toolName === 'rename_file' && raw && typeof raw === 'object') {
    return {
      result: raw.message,
      prevContent: raw.prevContent ?? null,
      renameMeta: { oldPath: raw.oldPath, newPath: raw.newPath },
    }
  }
  if (toolName === 'rollback_file' && raw && typeof raw === 'object' && raw.prevContent !== undefined) {
    return { result: raw.message, prevContent: raw.prevContent ?? null }
  }
  if (toolName === 'apply_artifact_revision' && raw && typeof raw === 'object') {
    return {
      result: String(raw.message || ''),
      prevContent: raw.prevContent ?? null,
      artifactApply: {
        filePath: String(raw.filePath || ''),
        appliedRevisionId: String(raw.appliedRevisionId || ''),
        appliedFromRev: Number(raw.appliedFromRev || 0) || 0,
        newRevId: String(raw.newRevId || ''),
        prevRevId: String(raw.prevRevId || ''),
        newRev: Number(raw.newRev || 0) || 0,
        contentBytes: Number(raw.contentBytes || 0) || 0,
        changeType: String(raw.changeType || ''),
        renamedFrom: String(raw.renamedFrom || ''),
        auxiliaryPaths: Array.isArray(raw.auxiliaryPaths)
          ? raw.auxiliaryPaths.map((value) => String(value || ''))
          : [],
      },
    }
  }
  if (toolName === 'browser_action' && raw && typeof raw === 'object' && raw.__browserScreenshot) {
    return {
      result: String(raw.result || ''),
      prevContent: null,
      screenshotBase64: String(raw.screenshotBase64 || ''),
      screenshotMediaType: String(raw.mediaType || 'image/jpeg'),
      screenshotFilepath: String(raw.filepath || ''),
    }
  }
  return { result: raw, prevContent: null }
}

export {
  listBackgroundCommands,
  stopBackgroundCommand,
  stopAllBackgroundCommands,
}
