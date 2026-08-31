import test from 'node:test'
import assert from 'node:assert/strict'

import {
  partitionAttachmentsByCapability,
  resolveAttachmentCapabilityGates,
} from '../../src/renderer/components/chat/chat-panel-helpers.mjs'

test('attachment capability gates split files and images independently', () => {
  const noFallback = resolveAttachmentCapabilityGates({
    providerId: 'groq',
    modelManifest: {
      capabilities: {
        inputModalities: ['text'],
        attachment: { supported: false, kinds: [], modalities: ['text'] },
      },
    },
    attachmentTextExtractionEnabled: true,
    attachmentTextExtractionRuntimeReady: false,
  })
  assert.equal(noFallback.imageAttachmentsEnabled, false)
  assert.equal(noFallback.fileAttachmentsEnabled, false)
  assert.equal(noFallback.attachmentsEnabled, false)

  const fallbackReady = resolveAttachmentCapabilityGates({
    providerId: 'groq',
    modelManifest: {
      capabilities: {
        inputModalities: ['text'],
        attachment: { supported: false, kinds: [], modalities: ['text'] },
      },
    },
    attachmentTextExtractionEnabled: true,
    attachmentTextExtractionRuntimeReady: true,
  })
  assert.equal(fallbackReady.imageAttachmentsEnabled, false)
  assert.equal(fallbackReady.fileAttachmentsEnabled, true)
  assert.equal(fallbackReady.attachmentsEnabled, true)

  const nativeVision = resolveAttachmentCapabilityGates({
    providerId: 'openai',
    modelManifest: {
      capabilities: {
        inputModalities: ['text', 'image', 'file'],
        attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
      },
    },
    attachmentTextExtractionEnabled: false,
    attachmentTextExtractionRuntimeReady: false,
  })
  assert.equal(nativeVision.imageAttachmentsEnabled, true)
  assert.equal(nativeVision.fileAttachmentsEnabled, true)
  assert.equal(nativeVision.attachmentsEnabled, true)
})

test('attachment partitioning blocks only unsupported kinds for current capability gates', () => {
  const attachments = [
    { kind: 'image', mediaType: 'image/png', fileName: 'diagram.png' },
    { kind: 'file', mediaType: 'application/pdf', fileName: 'spec.pdf' },
  ]

  const fileOnly = partitionAttachmentsByCapability(attachments, {
    fileAttachmentsEnabled: true,
    imageAttachmentsEnabled: false,
  })
  assert.equal(fileOnly.allowed.length, 1)
  assert.equal(fileOnly.blocked.length, 1)
  assert.equal(fileOnly.allowed[0].fileName, 'spec.pdf')
  assert.equal(fileOnly.blocked[0].reason, 'images_disabled')

  const imagesOnly = partitionAttachmentsByCapability(attachments, {
    fileAttachmentsEnabled: false,
    imageAttachmentsEnabled: true,
  })
  assert.equal(imagesOnly.allowed.length, 1)
  assert.equal(imagesOnly.blocked.length, 1)
  assert.equal(imagesOnly.allowed[0].fileName, 'diagram.png')
  assert.equal(imagesOnly.blocked[0].reason, 'files_disabled')
})
