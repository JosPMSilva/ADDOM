import {
  buildAttachmentCapabilityNoticeMessage,
  normalizeStagedAttachmentDescriptor,
  readFileAsDataUrl,
} from './chat-panel-composer-action-utils.mjs'
import { partitionAttachmentsByCapability } from './chat-panel-helpers.mjs'

export async function stageComposerAttachmentFiles({
  activeProjectId = '',
  activeThreadId = '',
  fileAttachmentsEnabled = false,
  imageAttachmentsEnabled = false,
  files = [],
  pushNotice = () => {},
  selectedModel = '',
  selectedProvider = '',
  setAttachedImages = () => {},
} = {}) {
  const entries = Array.from(files || []).filter((file) => file && typeof file === 'object')
  if (entries.length === 0) return

  const projectId = String(activeProjectId || '').trim()
  const threadId = String(activeThreadId || '').trim()
  if (!projectId || !threadId) return

  const candidateEntries = entries.map((file) => {
    const mediaType = String(file?.type || '').trim().toLowerCase()
    const fileName = String(file?.name || '').trim()
    const imageByExtension = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i.test(fileName)
    return {
      file,
      mediaType,
      fileName,
      kind: mediaType.startsWith('image/') || imageByExtension ? 'image' : 'file',
    }
  })

  const partitioned = partitionAttachmentsByCapability(candidateEntries, {
    fileAttachmentsEnabled,
    imageAttachmentsEnabled,
  })
  const allowedEntries = partitioned.allowed
    .map((entry) => (entry && typeof entry === 'object' ? entry : null))
    .filter(Boolean)

  if (partitioned.blocked.length > 0) {
    const providerLabel = String(selectedProvider || 'selected provider')
    const modelLabel = String(selectedModel || 'selected model')
    pushNotice({
      type: 'warning',
      text: buildAttachmentCapabilityNoticeMessage({
        blocked: partitioned.blocked,
        providerLabel,
        modelLabel,
      }),
      threadId: activeThreadId,
    })
  }
  if (allowedEntries.length === 0) return

  const payloads = []
  for (const candidate of allowedEntries) {
    const file = candidate.file
    let dataUrl = ''
    try {
      dataUrl = await readFileAsDataUrl(file)
    } catch {
      dataUrl = ''
    }
    if (!dataUrl) continue
    const mediaType = String(candidate.mediaType || '').trim().toLowerCase()
    payloads.push({
      kind: String(candidate.kind || '').trim().toLowerCase() || (mediaType.startsWith('image/') ? 'image' : 'file'),
      mediaType,
      fileName: String(candidate.fileName || file?.name || '').trim(),
      dataUrl,
    })
  }
  if (payloads.length === 0) return

  const attachmentApi = typeof window !== 'undefined' ? window?.addom?.attachments : null
  if (!attachmentApi || typeof attachmentApi.stage !== 'function') {
    const fallbackRows = payloads.map((entry) => ({
      id: crypto.randomUUID(),
      kind: String(entry.kind || '').trim().toLowerCase() === 'image' ? 'image' : 'file',
      mediaType: String(entry.mediaType || '').trim() || 'application/octet-stream',
      fileName: String(entry.fileName || '').trim(),
      dataUrl: String(entry.dataUrl || ''),
    }))
    setAttachedImages((prev) => [...prev, ...fallbackRows])
    return
  }

  try {
    const staged = await attachmentApi.stage(projectId, threadId, payloads)
    const rows = Array.isArray(staged?.attachments)
      ? staged.attachments.map(normalizeStagedAttachmentDescriptor).filter((entry) => entry && entry.id)
      : []
    if (rows.length > 0) {
      setAttachedImages((prev) => [...prev, ...rows])
    }
  } catch {
    // Ignore stage failures; user can retry attachment selection.
  }
}
