import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import {
  stageAttachmentBatch,
  statCachedAttachment,
  openCachedAttachment,
} from '../attachments/attachment-cache.mjs'
import { getMarkItDownRuntimeStatus } from '../attachments/markitdown-runtime.mjs'
import { normalizeAttachmentActionDescriptor } from '../attachments/attachment-action-resource.mjs'
import { createAttachmentActionsService } from '../attachments/attachment-actions-service.mjs'

function normalizeActionPayload(payload = {}) {
  const input = payload && typeof payload === 'object' ? payload : {}
  return {
    attachment: normalizeAttachmentActionDescriptor(input.attachment),
    applicationId: String(input.applicationId || '').trim(),
    scope: {
      projectId: String(input.projectId || '').trim(),
      threadId: String(input.threadId || '').trim(),
    },
  }
}

export function registerAttachmentHandlers(options = {}) {
  const ipcMain = options.ipcMain
  const shell = options.shell
  const service = options.service || createAttachmentActionsService(options)

  handleVersioned(ipcMain, 'attachments:stage', async (_event, payload = {}) => {
    const input = payload && typeof payload === 'object' ? payload : {}
    return await stageAttachmentBatch({
      projectId: input.projectId,
      threadId: input.threadId,
      turnId: input.turnId,
      attachments: Array.isArray(input.attachments) ? input.attachments : [],
    })
  })

  handleVersioned(ipcMain, 'attachments:stat', async (_event, { attachmentId } = {}) => {
    return await statCachedAttachment(attachmentId)
  })

  handleVersioned(ipcMain, 'attachments:open', async (_event, { attachmentId } = {}) => {
    return openCachedAttachment(attachmentId, async (absolutePath) => shell.openPath(absolutePath))
  })

  handleVersioned(ipcMain, 'attachments:text-extraction-status', async (_event, payload = {}) => {
    const input = payload && typeof payload === 'object' ? payload : {}
    return getMarkItDownRuntimeStatus({
      forceRefresh: input.forceRefresh === true,
      timeoutMs: Number(input.timeoutMs || 0) || undefined,
    })
  })

  handleVersioned(ipcMain, 'attachments:copy', async (_event, payload = {}) => {
    const input = normalizeActionPayload(payload)
    return service.copy(input.attachment, input.scope)
  })

  handleVersioned(ipcMain, 'attachments:reveal', async (_event, payload = {}) => {
    const input = normalizeActionPayload(payload)
    return service.reveal(input.attachment, input.scope)
  })

  handleVersioned(ipcMain, 'attachments:save-as', async (_event, payload = {}) => {
    const input = normalizeActionPayload(payload)
    return service.saveAs(input.attachment, input.scope)
  })

  handleVersioned(ipcMain, 'attachments:list-open-with', async (_event, payload = {}) => {
    const input = normalizeActionPayload(payload)
    return service.listOpenWith(input.attachment, input.scope)
  })

  handleVersioned(ipcMain, 'attachments:open-with', async (_event, payload = {}) => {
    const input = normalizeActionPayload(payload)
    return service.openWith(input.attachment, input.applicationId, input.scope)
  })
}
