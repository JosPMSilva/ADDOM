const SUPPORTED_TEXT_EXTRACTION_EXTENSIONS = Object.freeze([
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.html',
  '.xml',
])

const EXTENSION_BY_MEDIA_TYPE = new Map([
  ['application/pdf', '.pdf'],
  ['application/x-pdf', '.pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['text/plain', '.txt'],
  ['text/markdown', '.md'],
  ['text/csv', '.csv'],
  ['application/json', '.json'],
  ['application/ld+json', '.json'],
  ['text/html', '.html'],
  ['application/xhtml+xml', '.html'],
  ['application/xml', '.xml'],
  ['text/xml', '.xml'],
])

// These are ADDOM runtime constraints, not factual model metadata. Image support
// is now model-driven; only native non-image file/PDF input remains provider-blocked.
const PROVIDER_NATIVE_FILE_BLOCKLIST = Object.freeze(new Set([
  'groq',
  'deepseek',
  'ollama',
  'lmstudio',
]))

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function providerBlocksNativeFiles(providerId = '') {
  return PROVIDER_NATIVE_FILE_BLOCKLIST.has(normalizeProviderId(providerId))
}

function normalizeMediaType(value = '', fallback = '') {
  const mediaType = String(value || '').trim().toLowerCase()
  return mediaType || String(fallback || '').trim().toLowerCase()
}

function normalizeExtension(value = '') {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  return raw.startsWith('.') ? raw : `.${raw}`
}

function uniqueNormalizedStrings(values = []) {
  const seen = new Set()
  const output = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }
  return output
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

export const ATTACHMENT_TEXT_EXTRACTION_SETTINGS_SECTION_ID = 'attachment_text_extraction'

export const DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS = Object.freeze({
  enabled: false,
  engine: 'markitdown_local',
  mode: 'fallback_only',
  maxCharsPerAttachment: 12_000,
  maxCharsPerTurn: 60_000,
  maxAttachmentsPerTurn: 4,
  timeoutMs: 20_000,
  includeImages: false,
  supportedExtensions: [...SUPPORTED_TEXT_EXTRACTION_EXTENSIONS],
})

export function listSupportedTextExtractionExtensions() {
  return [...SUPPORTED_TEXT_EXTRACTION_EXTENSIONS]
}

export function normalizeAttachmentTextExtractionSettings(raw = {}, fallback = DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_ATTACHMENT_TEXT_EXTRACTION_SETTINGS

  return {
    enabled: source.enabled === true,
    engine: 'markitdown_local',
    mode: 'fallback_only',
    maxCharsPerAttachment: clampInt(
      source.maxCharsPerAttachment,
      clampInt(base.maxCharsPerAttachment, 12_000, 500, 200_000),
      500,
      200_000,
    ),
    maxCharsPerTurn: clampInt(
      source.maxCharsPerTurn,
      clampInt(base.maxCharsPerTurn, 60_000, 2_000, 500_000),
      2_000,
      500_000,
    ),
    maxAttachmentsPerTurn: clampInt(
      source.maxAttachmentsPerTurn,
      clampInt(base.maxAttachmentsPerTurn, 4, 1, 16),
      1,
      16,
    ),
    timeoutMs: clampInt(
      source.timeoutMs,
      clampInt(base.timeoutMs, 20_000, 2_000, 120_000),
      2_000,
      120_000,
    ),
    includeImages: false,
    supportedExtensions: [...SUPPORTED_TEXT_EXTRACTION_EXTENSIONS],
  }
}

export function isImageMediaType(mediaType = '') {
  return normalizeMediaType(mediaType).startsWith('image/')
}

export function resolveAttachmentExtension({
  fileName = '',
  mediaType = '',
} = {}) {
  const media = normalizeMediaType(mediaType)
  const mapped = EXTENSION_BY_MEDIA_TYPE.get(media)
  if (mapped) return mapped
  const name = String(fileName || '').trim().toLowerCase()
  const dotIndex = name.lastIndexOf('.')
  const ext = dotIndex > 0 && dotIndex < (name.length - 1)
    ? normalizeExtension(name.slice(dotIndex))
    : ''
  if (/^\.[a-z0-9]{1,10}$/i.test(ext)) return ext
  return ''
}

export function isSupportedTextExtractionExtension({
  fileName = '',
  mediaType = '',
} = {}) {
  const ext = resolveAttachmentExtension({ fileName, mediaType })
  return !!ext && SUPPORTED_TEXT_EXTRACTION_EXTENSIONS.includes(ext)
}

function resolveLegacyAttachmentSupport(modelManifest = null) {
  const model = modelManifest && typeof modelManifest === 'object'
    ? modelManifest
    : null
  const supportsVision = model?.vision === true
  const supportsPdf = (
    model?.supportsPdf === true
    || model?.pdf === true
  )
  return {
    supported: supportsVision || supportsPdf,
    supportsVision,
    supportsPdf,
    kinds: uniqueNormalizedStrings([
      ...(supportsVision ? ['image'] : []),
      ...(supportsPdf ? ['pdf'] : []),
    ]),
    inputModalities: uniqueNormalizedStrings([
      'text',
      ...(supportsVision ? ['image'] : []),
      ...(supportsPdf ? ['file'] : []),
    ]),
    source: 'legacy_manifest',
  }
}

function resolveBooleanCapability(value) {
  if (value === true) return true
  if (value === false) return false
  return null
}

export function resolveModelAttachmentSupport(modelManifest = null) {
  const model = modelManifest && typeof modelManifest === 'object'
    ? modelManifest
    : null

  const attachmentDescriptor = model?.attachment && typeof model.attachment === 'object'
    ? model.attachment
    : null
  const attachmentCapability = model?.capabilities?.attachment && typeof model.capabilities.attachment === 'object'
    ? model.capabilities.attachment
    : null

  const explicitSupported = resolveBooleanCapability(
    attachmentDescriptor?.supported ?? attachmentCapability?.supported,
  )
  const explicitVision = resolveBooleanCapability(attachmentDescriptor?.supportsVision)
  const explicitPdf = resolveBooleanCapability(attachmentDescriptor?.supportsPdf)

  const kinds = uniqueNormalizedStrings([
    ...(Array.isArray(attachmentDescriptor?.kinds) ? attachmentDescriptor.kinds : []),
    ...(Array.isArray(attachmentCapability?.kinds) ? attachmentCapability.kinds : []),
  ])
  const capabilityModalities = uniqueNormalizedStrings([
    ...(Array.isArray(attachmentDescriptor?.inputModalities) ? attachmentDescriptor.inputModalities : []),
    ...(Array.isArray(model?.capabilities?.inputModalities) ? model.capabilities.inputModalities : []),
    ...(Array.isArray(attachmentCapability?.modalities) ? attachmentCapability.modalities : []),
  ])

  const hasStructuredCapability = (
    explicitSupported !== null
    || explicitVision !== null
    || explicitPdf !== null
    || kinds.length > 0
    || capabilityModalities.length > 0
  )
  if (!hasStructuredCapability) {
    return resolveLegacyAttachmentSupport(model)
  }

  const supportsVision = explicitVision !== null
    ? explicitVision
    : (
        kinds.includes('image')
        || capabilityModalities.includes('image')
      )
  const supportsPdf = explicitPdf !== null
    ? explicitPdf
    : (
        kinds.includes('pdf')
        || kinds.includes('file')
        || capabilityModalities.includes('file')
        || capabilityModalities.includes('pdf')
      )

  return {
    supported: explicitSupported !== null ? explicitSupported : (supportsVision || supportsPdf),
    supportsVision,
    supportsPdf,
    kinds: uniqueNormalizedStrings([
      ...kinds,
      ...(supportsVision ? ['image'] : []),
      ...(supportsPdf ? ['pdf'] : []),
    ]),
    inputModalities: uniqueNormalizedStrings([
      'text',
      ...capabilityModalities,
      ...(supportsVision ? ['image'] : []),
      ...(supportsPdf ? ['file'] : []),
    ]),
    source: 'capabilities',
  }
}

export function resolveAttachmentSupportFamily(attachmentSupport = null) {
  const support = attachmentSupport && typeof attachmentSupport === 'object'
    ? attachmentSupport
    : null
  const supportsVision = support?.supportsVision === true
  const supportsPdf = support?.supportsPdf === true
  if (supportsVision && supportsPdf) return 'image_and_file_input'
  if (supportsVision) return 'image_input'
  if (supportsPdf) return 'file_input'
  return 'text_only'
}

function resolveProviderAttachmentSupport({
  providerId = '',
  modelManifest = null,
  modelAttachmentSupport = null,
} = {}) {
  const provider = normalizeProviderId(providerId)
  if (!provider) {
    return {
      supported: false,
      supportsVision: false,
      supportsPdf: false,
      kinds: [],
      inputModalities: ['text'],
      source: 'missing_provider',
    }
  }

  const baseSupport = modelAttachmentSupport && typeof modelAttachmentSupport === 'object'
    ? {
        supported: modelAttachmentSupport.supported === true,
        supportsVision: modelAttachmentSupport.supportsVision === true,
        supportsPdf: modelAttachmentSupport.supportsPdf === true,
        kinds: uniqueNormalizedStrings(modelAttachmentSupport.kinds),
        inputModalities: uniqueNormalizedStrings([
          'text',
          ...(Array.isArray(modelAttachmentSupport.inputModalities) ? modelAttachmentSupport.inputModalities : []),
        ]),
        source: String(modelAttachmentSupport.source || 'attachment_support').trim().toLowerCase() || 'attachment_support',
      }
    : (
        modelManifest && typeof modelManifest === 'object'
          ? resolveModelAttachmentSupport(modelManifest)
          : {
              supported: false,
              supportsVision: false,
              supportsPdf: false,
              kinds: [],
              inputModalities: ['text'],
              source: 'missing_model',
            }
      )

  const supportsVision = baseSupport.supportsVision === true
  const supportsPdf = (
    !providerBlocksNativeFiles(provider)
    && baseSupport.supportsPdf === true
  )

  return {
    supported: supportsVision || supportsPdf,
    supportsVision,
    supportsPdf,
    kinds: uniqueNormalizedStrings([
      ...(supportsVision ? ['image'] : []),
      ...(supportsPdf ? ['pdf'] : []),
    ]),
    inputModalities: uniqueNormalizedStrings([
      'text',
      ...(supportsVision ? ['image'] : []),
      ...(supportsPdf ? ['file'] : []),
    ]),
    source: baseSupport.source,
  }
}

export function supportsNativeImageAttachmentForSelection({
  providerId = '',
  modelManifest = null,
} = {}) {
  return resolveProviderAttachmentSupport({ providerId, modelManifest }).supportsVision
}

export function supportsNativeFileAttachmentForSelection({
  providerId = '',
  modelManifest = null,
} = {}) {
  return resolveProviderAttachmentSupport({ providerId, modelManifest }).supportsPdf
}

function resolveKnownFileSupportMode({
  fileName = '',
  mediaType = '',
} = {}) {
  const extension = resolveAttachmentExtension({ fileName, mediaType })
  if (!extension) return ''
  if (extension === '.pdf') return 'pdf'
  if (SUPPORTED_TEXT_EXTRACTION_EXTENSIONS.includes(extension)) {
    return 'local_text_extraction_only'
  }
  return ''
}

export function supportsNativeFileAttachmentForProvider({
  providerId = '',
  modelManifest = null,
  modelAttachmentSupport = null,
} = {}) {
  return resolveProviderAttachmentSupport({
    providerId,
    modelManifest,
    modelAttachmentSupport,
  }).supportsPdf
}

export function supportsNativeFileMediaTypeForSelection({
  providerId = '',
  modelManifest = null,
  mediaType = '',
  fileName = '',
} = {}) {
  if (isImageMediaType(mediaType)) return false
  const supportMode = resolveKnownFileSupportMode({ fileName, mediaType })
  if (supportMode === 'local_text_extraction_only') return false
  return supportsNativeFileAttachmentForSelection({
    providerId,
    modelManifest,
  })
}

export function supportsNativeFileMediaTypeForProvider({
  providerId = '',
  modelManifest = null,
  modelAttachmentSupport = null,
  mediaType = '',
  fileName = '',
} = {}) {
  if (isImageMediaType(mediaType)) return false
  const supportMode = resolveKnownFileSupportMode({ fileName, mediaType })
  if (supportMode === 'local_text_extraction_only') return false
  return supportsNativeFileAttachmentForProvider({
    providerId,
    modelManifest,
    modelAttachmentSupport,
  })
}
