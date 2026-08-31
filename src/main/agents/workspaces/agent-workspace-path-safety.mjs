import { promises as fs } from 'node:fs'
import path from 'node:path'

function escapesRoot(root, target) {
  const relative = path.relative(root, target)
  return relative.startsWith('..') || path.isAbsolute(relative)
}

export async function assertWorkspaceSymlinksOwned(projectViewRootInput) {
  const root = path.resolve(String(projectViewRootInput || '').trim() || '.')
  const rootStat = await fs.stat(root).catch(() => null)
  if (!rootStat?.isDirectory()) {
    throw new TypeError('Workspace project view must be an existing directory')
  }
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        const link = await fs.readlink(absolute)
        const resolved = path.resolve(directory, link)
        if (escapesRoot(root, resolved)) {
          throw new TypeError(`Workspace symbolic link escapes the owned project view: ${absolute}`)
        }
        continue
      }
      if (entry.isDirectory()) await visit(absolute)
    }
  }
  await visit(root)
  return { safe: true, projectViewRoot: root }
}
