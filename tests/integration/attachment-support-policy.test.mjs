import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveRegistryModel } from '../../src/common/api-clients/model-registry.mjs'
import {
  DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS,
  normalizeAttachmentTextExtractionSettings,
  resolveAttachmentExtension,
  isSupportedTextExtractionExtension,
  resolveModelAttachmentSupport,
  supportsNativeImageAttachmentForSelection,
  supportsNativeFileAttachmentForSelection,
  supportsNativeFileAttachmentForProvider,
  supportsNativeFileMediaTypeForSelection,
  supportsNativeFileMediaTypeForProvider,
} from '../../src/common/attachments/attachment-support-policy.mjs'

test('normalizeAttachmentTextExtractionSettings enforces v1 defaults and clamps', () => {
  const normalized = normalizeAttachmentTextExtractionSettings({
    enabled: true,
    engine: 'custom_engine',
    mode: 'always',
    maxCharsPerAttachment: 9999999,
    maxCharsPerTurn: -3,
    maxAttachmentsPerTurn: 50,
    timeoutMs: 1,
    includeImages: true,
    supportedExtensions: ['.pdf'],
  })

  assert.equal(normalized.enabled, true)
  assert.equal(normalized.engine, 'markitdown_local')
  assert.equal(normalized.mode, 'fallback_only')
  assert.equal(normalized.includeImages, false)
  assert.equal(normalized.maxCharsPerAttachment, 200000)
  assert.equal(normalized.maxCharsPerTurn, 2000)
  assert.equal(normalized.maxAttachmentsPerTurn, 16)
  assert.equal(normalized.timeoutMs, 2000)
  assert.deepEqual(
    normalized.supportedExtensions,
    DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS.supportedExtensions,
  )
})

test('resolveAttachmentExtension and supported-extension checks handle filename + media type', () => {
  assert.equal(resolveAttachmentExtension({ fileName: 'report.PDF' }), '.pdf')
  assert.equal(resolveAttachmentExtension({ mediaType: 'text/csv' }), '.csv')
  assert.equal(resolveAttachmentExtension({ fileName: 'archive.bin' }), '.bin')

  assert.equal(isSupportedTextExtractionExtension({ fileName: 'deck.pptx' }), true)
  assert.equal(isSupportedTextExtractionExtension({ mediaType: 'application/json' }), true)
  assert.equal(isSupportedTextExtractionExtension({ fileName: 'archive.bin' }), false)
})

test('native attachment support stays model-driven with explicit file-only runtime blocks', () => {
  assert.equal(
    supportsNativeFileAttachmentForSelection({ providerId: 'groq' }),
    false,
  )
  assert.equal(
    supportsNativeImageAttachmentForSelection({
      providerId: 'groq',
      modelManifest: { vision: true },
    }),
    true,
  )
  assert.equal(
    supportsNativeImageAttachmentForSelection({
      providerId: 'gemini',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image'],
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
        },
      },
    }),
    true,
  )
  assert.equal(
    supportsNativeImageAttachmentForSelection({
      providerId: 'deepseek',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image'],
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
        },
      },
    }),
    true,
  )
  assert.equal(
    supportsNativeImageAttachmentForSelection({
      providerId: 'ollama',
      modelManifest: { vision: true },
    }),
    true,
  )
  assert.equal(
    supportsNativeImageAttachmentForSelection({
      providerId: 'lmstudio',
      modelManifest: { vision: true },
    }),
    true,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'openai',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
    }),
    true,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'openai',
      modelManifest: { vision: false },
    }),
    false,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'moonshot',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image'],
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
        },
      },
    }),
    false,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({ providerId: 'gemini' }),
    false,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'deepseek',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
    }),
    false,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'ollama',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
    }),
    false,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'lmstudio',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
    }),
    false,
  )

  assert.equal(
    supportsNativeFileAttachmentForProvider({
      providerId: 'openai',
      modelAttachmentSupport: resolveModelAttachmentSupport({
        capabilities: {
          inputModalities: ['text', 'file'],
          attachment: { supported: true, kinds: ['pdf'], modalities: ['text', 'file'] },
        },
      }),
    }),
    true,
  )
  assert.equal(
    supportsNativeFileAttachmentForProvider({
      providerId: 'openai',
      modelAttachmentSupport: {
        supported: false,
        supportsVision: false,
        supportsPdf: false,
        inputModalities: ['text'],
      },
    }),
    false,
  )
  assert.equal(
    supportsNativeFileAttachmentForProvider({
      providerId: 'moonshot',
      modelAttachmentSupport: {
        supported: true,
        supportsVision: true,
        supportsPdf: false,
        inputModalities: ['text', 'image'],
      },
    }),
    false,
  )
})

test('native file support becomes media-type aware for locally extracted office docs', () => {
  assert.equal(
    supportsNativeFileMediaTypeForSelection({
      providerId: 'openai',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
      mediaType: 'application/pdf',
      fileName: 'spec.pdf',
    }),
    true,
  )
  assert.equal(
    supportsNativeFileMediaTypeForSelection({
      providerId: 'openai',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'brief.docx',
    }),
    false,
  )

  assert.equal(
    supportsNativeFileMediaTypeForProvider({
      providerId: 'openai',
      modelAttachmentSupport: resolveModelAttachmentSupport({
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      }),
      mediaType: 'application/pdf',
      fileName: 'spec.pdf',
    }),
    true,
  )
  assert.equal(
    supportsNativeFileMediaTypeForProvider({
      providerId: 'openai',
      modelAttachmentSupport: resolveModelAttachmentSupport({
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      }),
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'brief.docx',
    }),
    false,
  )
  assert.equal(
    supportsNativeFileMediaTypeForSelection({
      providerId: 'ollama',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
      mediaType: 'application/pdf',
      fileName: 'spec.pdf',
    }),
    false,
  )
  assert.equal(
    supportsNativeFileMediaTypeForSelection({
      providerId: 'lmstudio',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
      mediaType: 'application/pdf',
      fileName: 'spec.pdf',
    }),
    false,
  )
})

test('moonshot keeps native image support while routing files through fallback extraction', () => {
  assert.equal(
    supportsNativeFileMediaTypeForSelection({
      providerId: 'moonshot',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image'],
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
        },
      },
      mediaType: 'image/png',
      fileName: 'diagram.png',
    }),
    false,
  )
  assert.equal(
    supportsNativeFileMediaTypeForSelection({
      providerId: 'moonshot',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image'],
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
        },
      },
      mediaType: 'application/pdf',
      fileName: 'spec.pdf',
    }),
    false,
  )
})

test('resolveModelAttachmentSupport derives image and file truth from capability-only manifests', () => {
  const support = resolveModelAttachmentSupport({
    capabilities: {
      inputModalities: ['text', 'image', 'file'],
      attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
    },
  })

  assert.equal(support.supported, true)
  assert.equal(support.supportsVision, true)
  assert.equal(support.supportsPdf, true)
  assert.deepEqual(support.inputModalities, ['text', 'image', 'file'])
  assert.deepEqual(support.kinds, ['image', 'pdf'])
})

test('openrouter attachment support follows reviewed-route generated catalog facts', () => {
  const reviewed = resolveRegistryModel('openrouter', 'openai/gpt-5.4')?.model

  assert.ok(reviewed)
  assert.equal(
    supportsNativeImageAttachmentForSelection({
      providerId: 'openrouter',
      modelManifest: reviewed,
    }),
    true,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'openrouter',
      modelManifest: reviewed,
    }),
    true,
  )
  assert.equal(
    supportsNativeImageAttachmentForSelection({
      providerId: 'openrouter',
      modelManifest: null,
    }),
    false,
  )
  assert.equal(
    supportsNativeFileAttachmentForSelection({
      providerId: 'openrouter',
      modelManifest: null,
    }),
    false,
  )
})
