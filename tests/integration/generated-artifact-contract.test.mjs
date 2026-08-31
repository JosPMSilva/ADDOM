import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectGeneratedImageCandidates,
  normalizeGeneratedArtifacts,
} from '../../src/main/chat/generated-artifact-contract.mjs'
import { buildHydratedAssistantMessage } from '../../src/renderer/store/chat/timeline-hydration-assistant-message.mjs'

test('generated artifact discovery is provider-neutral and accepts local image results', () => {
  const candidates = collectGeneratedImageCandidates({
    toolCallId: 'image-call-1',
    toolName: 'vendor_specific_image_tool',
    output: {
      status: 'completed',
      savedPath: 'C:/workspace/generated/hero.webp',
      resultAvailable: true,
    },
  })

  assert.deepEqual(candidates, [{
    sourcePath: 'C:/workspace/generated/hero.webp',
    mediaType: 'image/webp',
    fileName: 'hero.webp',
  }])
})

test('generated artifact normalization keeps only durable safe renderer descriptors', () => {
  const artifacts = normalizeGeneratedArtifacts([{
    artifactId: 'artifact-1',
    attachmentId: 'att-1',
    toolCallId: 'image-call-1',
    toolName: 'vendor_specific_image_tool',
    sourcePath: 'C:\\workspace\\generated\\hero.png',
    kind: 'image',
    mediaType: 'image/png',
    fileName: 'hero.png',
    sizeBytes: 42,
    previewUrl: 'addom-attachment://attachment/att-1',
    rawBytes: 'must-not-survive',
  }])

  assert.deepEqual(artifacts, [{
    artifactId: 'artifact-1',
    attachmentId: 'att-1',
    toolCallId: 'image-call-1',
    toolName: 'vendor_specific_image_tool',
    sourcePath: 'C:\\workspace\\generated\\hero.png',
    kind: 'image',
    mediaType: 'image/png',
    fileName: 'hero.png',
    sizeBytes: 42,
    previewUrl: 'addom-attachment://attachment/att-1',
  }])
})

test('assistant hydration preserves generated artifact references across restart', () => {
  const generatedArtifacts = [{
    artifactId: 'generated:att-1',
    attachmentId: 'att-1',
    toolCallId: 'image-call-1',
    toolName: 'vendor_image',
    sourcePath: 'C:/workspace/generated/hero.png',
    kind: 'image',
    mediaType: 'image/png',
    fileName: 'hero.png',
    sizeBytes: 42,
    previewUrl: 'addom-attachment://attachment/att-1',
  }]
  const message = buildHydratedAssistantMessage({
    eventKey: 'event:1',
    turnId: 'turn-1',
    content: '![Hero](<C:/workspace/generated/hero.png>)',
    meta: {
      assistantMessageId: 'assistant-1',
      generatedArtifacts,
    },
  })

  assert.deepEqual(message.generatedArtifacts, generatedArtifacts)
})
