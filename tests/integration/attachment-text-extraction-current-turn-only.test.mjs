import test from 'node:test'
import assert from 'node:assert/strict'

import { applyAttachmentTextExtractionFallback } from '../../src/main/attachments/attachment-text-extraction.mjs'

test('attachment text extraction fallback scans only the active turn attachments when prior files are natively supported', async () => {
  const historyMessages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Old message with attachment.' },
        {
          type: 'file',
          mediaType: 'application/pdf',
          filename: 'legacy.pdf',
          data: 'JVBERi0xLjQK',
        },
      ],
    },
    {
      role: 'assistant',
      content: 'Noted.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Latest turn is plain text only.' },
      ],
    },
  ]

  const outcome = await applyAttachmentTextExtractionFallback({
    historyMessages,
    providerId: 'openai',
    modelAttachmentSupport: {
      supported: true,
      supportsVision: true,
      supportsPdf: true,
      inputModalities: ['text', 'image', 'file'],
    },
    projectId: 'project_1',
    threadId: 'thread_1',
    extractionSettings: {
      enabled: true,
      mode: 'fallback_only',
    },
  })

  assert.equal(outcome?.ok, true)
  assert.equal(outcome?.diagnostics?.conversion_attempted, false)
  assert.equal(outcome?.diagnostics?.converted_count, 0)
  assert.equal(outcome?.diagnostics?.failed_count, 0)
  assert.deepEqual(outcome?.history, historyMessages)
})

test('attachment text extraction fallback strips unsupported historical office docs from prior turns', async () => {
  const historyMessages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Old message with docx.' },
        {
          type: 'file',
          mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          filename: 'legacy.docx',
          data: 'UEsDBAoAAAAAA',
        },
      ],
    },
    {
      role: 'assistant',
      content: 'Noted.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Latest turn is plain text only.' },
      ],
    },
  ]

  const outcome = await applyAttachmentTextExtractionFallback({
    historyMessages,
    providerId: 'openai',
    modelAttachmentSupport: {
      supported: true,
      supportsVision: true,
      supportsPdf: true,
      inputModalities: ['text', 'image', 'file'],
    },
    projectId: 'project_1',
    threadId: 'thread_1',
    extractionSettings: {
      enabled: true,
      mode: 'fallback_only',
    },
  })

  assert.equal(outcome?.ok, true)
  assert.equal(outcome?.diagnostics?.conversion_attempted, false)
  assert.equal(outcome?.diagnostics?.converted_count, 0)
  assert.equal(Array.isArray(outcome?.history?.[0]?.content), true)
  assert.match(
    String(outcome?.history?.[0]?.content?.[1]?.text || ''),
    /\[Attachment omitted from prior turn for current model: legacy\.docx\]/,
  )
})

test('attachment text extraction fallback accepts capability-driven attachment support descriptors', async () => {
  const historyMessages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Old message with docx.' },
        {
          type: 'file',
          mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          filename: 'legacy.docx',
          data: 'UEsDBAoAAAAAA',
        },
      ],
    },
    {
      role: 'assistant',
      content: 'Noted.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Latest turn is plain text only.' },
      ],
    },
  ]

  const outcome = await applyAttachmentTextExtractionFallback({
    historyMessages,
    providerId: 'openai',
    modelAttachmentSupport: {
      supported: true,
      supportsVision: true,
      supportsPdf: true,
      inputModalities: ['text', 'image', 'file'],
    },
    projectId: 'project_1',
    threadId: 'thread_1',
    extractionSettings: {
      enabled: true,
      mode: 'fallback_only',
    },
  })

  assert.equal(outcome?.ok, true)
  assert.equal(outcome?.diagnostics?.conversion_attempted, false)
  assert.match(
    String(outcome?.history?.[0]?.content?.[1]?.text || ''),
    /\[Attachment omitted from prior turn for current model: legacy\.docx\]/,
  )
})
