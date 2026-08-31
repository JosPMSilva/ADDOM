import { createHash } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'

import { resolveOwnedWorkspacePath } from './agent-workspace-cleanup.mjs'
import { assertWorkspaceSymlinksOwned } from './agent-workspace-path-safety.mjs'

/**
 * Directory names never copied into an overlay. Git-backed projects use worktrees, which already
 * materialize tracked files only, so this fallback needs its own guard against dependency and
 * build trees that dwarf the source they surround.
 */
const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  '.gradle',
  '.next',
  '.nuxt',
  '.pytest_cache',
  '.svelte-kit',
  '.terraform',
  '.tox',
  '.turbo',
  '.venv',
  '__pycache__',
  'bower_components',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'venv',
  'vendor',
])

function relativeEscapes(relative) {
  return !relative || relative.startsWith('..') || path.isAbsolute(relative)
}

async function hashTree(root) {
  const hash = createHash('sha256')
  async function visit(current, relative = '') {
    const entries = await fs.readdir(current, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name
      const absolute = path.join(current, entry.name)
      hash.update(`${entry.isDirectory() ? 'd' : entry.isSymbolicLink() ? 'l' : 'f'}:${nextRelative}\0`)
      if (entry.isDirectory()) {
        await visit(absolute, nextRelative)
      } else if (entry.isSymbolicLink()) {
        hash.update(await fs.readlink(absolute))
      } else {
        hash.update(await fs.readFile(absolute))
      }
    }
  }
  await visit(root)
  return `snapshot:${hash.digest('hex')}`
}

export function createAgentStagedOverlay({ storageRoot } = {}) {
  const root = path.resolve(String(storageRoot || '').trim() || '.')

  async function create({ workspaceId, projectRoot: projectRootInput }) {
    const projectRoot = path.resolve(String(projectRootInput || '').trim() || '.')
    const stat = await fs.stat(projectRoot).catch(() => null)
    if (!stat?.isDirectory()) throw new TypeError('Overlay project root must be an existing directory')
    await fs.mkdir(root, { recursive: true })
    const workspaceRoot = resolveOwnedWorkspacePath(root, workspaceId)
    const rootRelativeToProject = path.relative(projectRoot, root)
    const storageInsideProject = !relativeEscapes(rootRelativeToProject)
    try {
      await fs.cp(projectRoot, workspaceRoot, {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
        mode: fsConstants.COPYFILE_FICLONE,
        async filter(source) {
          const absolute = path.resolve(source)
          if (storageInsideProject && (
            absolute === root
            || (!relativeEscapes(path.relative(root, absolute)))
          )) return false
          if (!EXCLUDED_DIRECTORY_NAMES.has(path.basename(absolute))) return true
          const entry = await fs.lstat(absolute).catch(() => null)
          return !entry?.isDirectory()
        },
      })
      await assertWorkspaceSymlinksOwned(workspaceRoot)
      return {
        sourceRoot: projectRoot,
        workspaceRoot,
        projectViewRoot: workspaceRoot,
        baseRevision: await hashTree(workspaceRoot),
      }
    } catch (error) {
      await fs.rm(workspaceRoot, { recursive: true, force: true })
      throw error
    }
  }

  async function remove(workspaceRootInput) {
    const workspaceRoot = path.resolve(String(workspaceRootInput || '').trim() || '.')
    const relative = path.relative(root, workspaceRoot)
    if (relativeEscapes(relative)) {
      throw new TypeError('Overlay removal target is not an owned workspace root')
    }
    await fs.rm(workspaceRoot, { recursive: true, force: true })
    return { removed: true, workspaceRoot }
  }

  return Object.freeze({ create, remove, storageRoot: root })
}
