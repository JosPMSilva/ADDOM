import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let AttachedImagePreview = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/AttachedImagePreview.jsx')
  AttachedImagePreview = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('AttachedImagePreview renders PDF attachment as file card instead of image', () => {
  assert.equal(typeof AttachedImagePreview, 'function')

  const html = renderToStaticMarkup(
    React.createElement(AttachedImagePreview, {
      images: [{
        id: 'pdf-1',
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        mediaType: 'application/pdf',
        fileName: 'parecer.pdf',
      }],
      onRemove: () => {},
    }),
  )

  assert.match(html, /data-ui="attached-pdf-preview"/)
  assert.match(html, /parecer\.pdf/)
  assert.doesNotMatch(html, /<img\b/i)
})

test('AttachedImagePreview keeps image attachments as image thumbnails', () => {
  assert.equal(typeof AttachedImagePreview, 'function')

  const html = renderToStaticMarkup(
    React.createElement(AttachedImagePreview, {
      images: [{
        id: 'img-1',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
        mediaType: 'image/png',
        fileName: 'diagram.png',
      }],
      onRemove: () => {},
    }),
  )

  assert.match(html, /<img\b/i)
  assert.doesNotMatch(html, /data-ui="attached-pdf-preview"/)
})

test('AttachedImagePreview shows OpenAI knowledge-base actions for non-image attachments', () => {
  assert.equal(typeof AttachedImagePreview, 'function')

  const html = renderToStaticMarkup(
    React.createElement(AttachedImagePreview, {
      images: [{
        id: 'file-1',
        attachmentId: 'att_1',
        mediaType: 'text/plain',
        fileName: 'notes.txt',
      }],
      onRemove: () => {},
      openAIKnowledgeBaseEnabled: true,
      openAIKnowledgeBaseStateByAttachmentId: {
        att_1: 'uploaded',
      },
      openAIKnowledgeBaseBusyAttachmentIds: [],
      onAddToOpenAIKnowledgeBase: () => {},
    }),
  )

  assert.match(html, /Uploaded/)
  assert.match(html, /data-ui="attached-knowledge-state"/)
  assert.match(html, /data-ui="attached-knowledge-action"/)
  assert.match(html, /data-ui="attached-preview-item"/)
  assert.match(html, /data-attachment-id="att_1"/)
  assert.match(html, /data-knowledge-state="uploaded"/)
  assert.match(html, />Attach</)
  assert.match(html, /aria-label="Attach notes.txt to OpenAI knowledge base"/)
  assert.match(html, /notes\.txt/)
})

test('AttachedImagePreview keeps OpenAI knowledge-base states compact', () => {
  assert.equal(typeof AttachedImagePreview, 'function')

  const html = renderToStaticMarkup(
    React.createElement(AttachedImagePreview, {
      images: [
        {
          id: 'file-local',
          attachmentId: 'att_local',
          mediaType: 'text/plain',
          fileName: 'local.txt',
        },
        {
          id: 'file-attached',
          attachmentId: 'att_attached',
          mediaType: 'text/plain',
          fileName: 'attached.txt',
        },
        {
          id: 'file-busy',
          attachmentId: 'att_busy',
          mediaType: 'text/plain',
          fileName: 'busy.txt',
        },
      ],
      onRemove: () => {},
      openAIKnowledgeBaseEnabled: true,
      openAIKnowledgeBaseStateByAttachmentId: {
        att_attached: 'attached',
      },
      openAIKnowledgeBaseBusyAttachmentIds: ['att_busy'],
      onAddToOpenAIKnowledgeBase: () => {},
    }),
  )

  assert.match(html, /data-knowledge-state="local"/)
  assert.match(html, /data-knowledge-state="attached"/)
  assert.match(html, /data-knowledge-state="adding"/)
  assert.match(html, /data-knowledge-state="local"[^>]*>[\s\S]*?>Local</)
  assert.match(html, />Add</)
  assert.match(html, />Added</)
  assert.match(html, /aria-label="Added attached.txt to OpenAI knowledge base"/)
  assert.match(html, />Adding</)
  assert.match(html, /aria-label="Adding busy.txt to OpenAI knowledge base"/)
})
