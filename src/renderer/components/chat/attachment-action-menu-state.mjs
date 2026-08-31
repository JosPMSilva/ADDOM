export function resolveAttachmentActionKinds({ kind = 'file', descriptor = null } = {}) {
  const cached = Boolean(String(descriptor?.attachmentId || '').trim())
  const base = cached ? ['copy', 'show_in_folder', 'save_as'] : ['copy', 'save_as']
  return String(kind || '').toLowerCase() === 'image'
    ? base
    : [...base, 'open_with']
}

export function resolveAttachmentMenuPosition(point = {}, menuSize = {}, viewport = {}, margin = 8) {
  const width = Math.max(0, Number(menuSize.width || 0))
  const height = Math.max(0, Number(menuSize.height || 0))
  const viewportWidth = Math.max(0, Number(viewport.width || 0))
  const viewportHeight = Math.max(0, Number(viewport.height || 0))
  const inset = Math.max(0, Number(margin || 0))
  return {
    left: Math.max(inset, Math.min(Number(point.x || 0), viewportWidth - width - inset)),
    top: Math.max(inset, Math.min(Number(point.y || 0), viewportHeight - height - inset)),
  }
}

export function resolveAttachmentSubmenuSide({
  menuRight = 0,
  submenuWidth = 0,
  viewportWidth = 0,
  margin = 8,
} = {}) {
  return Number(menuRight) + Number(submenuWidth) + Number(margin) > Number(viewportWidth)
    ? 'left'
    : 'right'
}

export function resolveNextMenuItemIndex(entries = [], currentIndex = -1, direction = 1) {
  if (!Array.isArray(entries) || entries.length === 0) return -1
  const step = direction < 0 ? -1 : 1
  let index = Number.isInteger(currentIndex) ? currentIndex : -1
  for (let count = 0; count < entries.length; count += 1) {
    index = (index + step + entries.length) % entries.length
    if (!entries[index]?.disabled) return index
  }
  return -1
}

export function normalizeAttachmentMenuDescriptor(part = {}) {
  const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
  const kind = String(part?.kind || part?.type || '').trim().toLowerCase() === 'image'
    || mediaType.startsWith('image/')
    ? 'image'
    : 'file'
  return {
    attachmentId: String(part?.attachmentId || '').trim(),
    kind,
    mediaType,
    fileName: String(part?.fileName || part?.filename || '').trim(),
    data: String(part?.data || part?.image || '').trim(),
  }
}
