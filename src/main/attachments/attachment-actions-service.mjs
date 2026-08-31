import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveAttachmentActionResource } from './attachment-action-resource.mjs'
import { copyFileResourceToClipboard } from './attachment-file-clipboard.mjs'
import {
  createAttachmentApplicationRegistry,
  listAttachmentApplications,
  openAttachmentWith,
} from './attachment-open-with.mjs'

const PUBLIC_ERRORS = new Set([
  'attachment_materialization_failed',
  'attachment_not_found',
  'attachment_scope_violation',
  'attachment_too_large',
  'attachment_unavailable',
  'attachment_unreadable',
  'file_clipboard_failed',
  'file_clipboard_unsupported',
  'image_clipboard_failed',
  'invalid_attachment_data',
  'open_with_application_unavailable',
  'open_with_failed',
  'reveal_attachment_failed',
  'save_attachment_failed',
])

function normalizeError(error, fallback = 'attachment_unavailable') {
  const value = String(error?.error || error?.message || error || '').trim()
  return PUBLIC_ERRORS.has(value) ? value : fallback
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function safeClipboardFileName(fileName = '', mediaType = '') {
  const source = path.basename(String(fileName || '').trim() || 'attachment')
  const sanitized = Array.from(source.replace(/[<>:"/\\|?*]/g, '_'), (character) => (
    character.charCodeAt(0) < 32 ? '_' : character
  )).join('').replace(/^\.+/, '').trim()
  if (sanitized) return sanitized.slice(0, 120)
  return String(mediaType || '').startsWith('text/') ? 'attachment.txt' : 'attachment.bin'
}

export async function materializeFileClipboardResource(resource = {}, deps = {}) {
  const bytes = Buffer.isBuffer(resource.bytes) ? resource.bytes : null
  if (!bytes?.length) throw new Error('file_clipboard_failed')
  const root = String(deps.clipboardTempRoot || '').trim()
    || path.join(os.tmpdir(), 'addom-attachment-clipboard')
  const directory = path.join(root, sha256(bytes).slice(0, 20))
  const filePath = path.join(directory, safeClipboardFileName(resource.fileName, resource.mediaType))
  const mkdir = deps.mkdir || fs.mkdir
  const writeFile = deps.writeFile || fs.writeFile
  await mkdir(directory, { recursive: true })
  await writeFile(filePath, bytes, { mode: 0o600 })
  return filePath
}

export function createAttachmentActionsService(deps = {}) {
  const resolveResource = deps.resolveResource || resolveAttachmentActionResource
  const registry = deps.registry || createAttachmentApplicationRegistry()

  async function withResource(descriptor, scope, operation) {
    try {
      const resource = await resolveResource(descriptor, scope)
      if (!resource?.ok) return { ok: false, error: normalizeError(resource?.error) }
      return await operation(resource)
    } catch (error) {
      return { ok: false, error: normalizeError(error) }
    }
  }

  return {
    copy(descriptor, scope) {
      return withResource(descriptor, scope, async (resource) => {
        if (resource.kind !== 'image') {
          try {
            const materialize = deps.materializeClipboardFile || materializeFileClipboardResource
            const clipboardPath = await materialize(resource)
            const copyFile = deps.copyFileToClipboard || copyFileResourceToClipboard
            return copyFile(clipboardPath, {
              platform: deps.platform,
              spawnProcess: deps.spawnProcess,
              commandExists: deps.commandExists,
            })
          } catch {
            return { ok: false, error: 'file_clipboard_failed' }
          }
        }
        try {
          const image = deps.nativeImage?.createFromBuffer(resource.bytes)
          if (!image || image.isEmpty()) return { ok: false, error: 'image_clipboard_failed' }
          deps.clipboard?.writeImage(image)
          return { ok: true }
        } catch {
          return { ok: false, error: 'image_clipboard_failed' }
        }
      })
    },

    reveal(descriptor, scope) {
      return withResource(descriptor, scope, async (resource) => {
        try {
          deps.shell.showItemInFolder(resource.path)
          return { ok: true }
        } catch {
          return { ok: false, error: 'reveal_attachment_failed' }
        }
      })
    },

    saveAs(descriptor, scope) {
      return withResource(descriptor, scope, async (resource) => {
        try {
          const parent = deps.getMainWindow?.()
          const options = {
            title: 'Save attachment as',
            defaultPath: resource.fileName || 'attachment',
          }
          const result = parent
            ? await deps.dialog.showSaveDialog(parent, options)
            : await deps.dialog.showSaveDialog(options)
          if (result.canceled || !result.filePath) return { ok: false, canceled: true }
          const copyFile = deps.copyFile || fs.copyFile
          await copyFile(resource.path, result.filePath)
          return { ok: true, sha256: sha256(resource.bytes) }
        } catch {
          return { ok: false, error: 'save_attachment_failed' }
        }
      })
    },

    listOpenWith(descriptor, scope) {
      return withResource(descriptor, scope, async (resource) => ({
        ok: true,
        applications: await listAttachmentApplications(resource, {
          registry,
          discoverApplications: deps.discoverApplications,
          platform: deps.platform,
        }),
      }))
    },

    openWith(descriptor, applicationId, scope) {
      return withResource(descriptor, scope, (resource) => openAttachmentWith(
        resource,
        applicationId,
        {
          registry,
          platform: deps.platform,
          shellOpenPath: (filePath) => deps.shell.openPath(filePath),
          spawnProcess: deps.spawnProcess,
        },
      ))
    },
  }
}
