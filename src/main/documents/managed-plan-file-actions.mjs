import fs from 'node:fs/promises'
import path from 'node:path'
import { readManagedPlanDocument } from '../chat/plan-runtime-state.mjs'
import { isManagedPlanStoragePath } from '../chat/managed-plan-storage-paths.mjs'

function readDocument(payload, { userDataPath } = {}) {
  const { projectRoot, threadId, planId } = payload
  if (![projectRoot, threadId, planId].every((value) => typeof value === 'string' && value.trim())) {
    return { ok: false, error: 'plan_document_unavailable' }
  }
  return readManagedPlanDocument(projectRoot, { threadId, planId, userDataPath })
}

export async function revealManagedPlan(payload = {}, deps = {}) {
  const document = readDocument(payload, deps)
  if (!document.ok) return document
  await deps.showItemInFolder(document.document.filePath)
  return { ok: true }
}

export async function saveManagedPlanCopy(payload = {}, deps = {}) {
  // Capture the revision the user is viewing before opening the native dialog.
  const document = readDocument(payload, deps)
  if (!document.ok) return document
  if (!Number.isInteger(payload.expectedRevision) || payload.expectedRevision !== document.revision) {
    return { ok: false, error: 'plan_revision_conflict' }
  }
  const result = await deps.showSaveDialog({
    defaultPath: path.join(payload.projectRoot, 'Plan.md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true }
  const current = readDocument(payload, deps)
  if (!current.ok || current.revision !== document.revision) {
    return { ok: false, error: 'plan_revision_conflict' }
  }
  const destination = path.resolve(result.filePath)
  // An export must not overwrite any runtime-managed plan, including through a link.
  const realDestination = await fs.realpath(destination).catch(async (error) => {
    if (error.code !== 'ENOENT') throw error
    return path.join(await fs.realpath(path.dirname(destination)), path.basename(destination))
  })
  if ([destination, realDestination].some((filePath) => isManagedPlanStoragePath(filePath, deps))) {
    return { ok: false, error: 'managed_plan_destination' }
  }
  await fs.writeFile(destination, current.content, { encoding: 'utf8', mode: 0o600 })
  return { ok: true, filePath: destination }
}
