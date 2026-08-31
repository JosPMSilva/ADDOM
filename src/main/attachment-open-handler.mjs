import path from 'node:path'
import { handleVersioned } from './ipc/ipc-versioning.mjs'
import { validateAttachmentOpenRequest } from './utils/shell-open-guards.mjs'
import {
  ATTACHMENT_ACTION_TEMP_DIR,
  materializeLegacyAttachment,
} from './attachments/attachment-action-resource.mjs'

export const ATTACHMENT_TEMP_DIR = ATTACHMENT_ACTION_TEMP_DIR

export function registerAttachmentOpenHandler({
  ipcMain,
  attachmentTempDir = ATTACHMENT_TEMP_DIR,
  openPath = async () => 'attachment_open_unavailable',
} = {}) {
  handleVersioned(ipcMain, 'shell:openAttachmentFile', async (_event, payload = {}) => {
    const resource = await materializeLegacyAttachment(payload, { attachmentTempDir })
    if (!resource.ok) return resource
    const openValidation = validateAttachmentOpenRequest({
      mediaType: resource.mediaType,
      extension: path.extname(resource.path),
    })
    if (!openValidation.ok) return openValidation

    try {
      const openError = await openPath(resource.path)
      if (openError) return { ok: false, error: String(openError) }
      return { ok: true, path: resource.path }
    } catch (error) {
      return { ok: false, error: String(error?.message || error || 'open_attachment_failed') }
    }
  })
}
