import path from 'node:path'
import { stageAttachmentFromLocalFile } from '../attachments/attachment-local-file-staging.mjs'

const IMAGE_MEDIA_TYPE_BY_EXTENSION = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
])

function clean(value = '') {
  return String(value || '').trim()
}

function imageCandidateFromPath(sourcePath = '') {
  const normalizedSourcePath = clean(sourcePath)
  if (!normalizedSourcePath) return null
  const fileName = path.basename(normalizedSourcePath)
  const mediaType = IMAGE_MEDIA_TYPE_BY_EXTENSION.get(path.extname(fileName).toLowerCase()) || ''
  if (!mediaType) return null
  return {
    sourcePath: normalizedSourcePath,
    mediaType,
    fileName,
  }
}

export function collectGeneratedImageCandidates(providerToolOutput = null) {
  const source = providerToolOutput && typeof providerToolOutput === 'object'
    ? providerToolOutput
    : {}
  const output = source.output && typeof source.output === 'object'
    ? source.output
    : {}
  const rawPaths = [
    output.savedPath,
    output.path,
    ...(Array.isArray(output.savedPaths) ? output.savedPaths : []),
    ...(Array.isArray(output.paths) ? output.paths : []),
  ]
  const seen = new Set()
  const candidates = []
  for (const rawPath of rawPaths) {
    const candidate = imageCandidateFromPath(rawPath)
    if (!candidate) continue
    const identity = process.platform === 'win32'
      ? candidate.sourcePath.toLowerCase()
      : candidate.sourcePath
    if (seen.has(identity)) continue
    seen.add(identity)
    candidates.push(candidate)
  }
  return candidates
}

export function normalizeGeneratedArtifacts(values = []) {
  const source = Array.isArray(values) ? values : []
  const seen = new Set()
  const artifacts = []
  for (const raw of source) {
    const value = raw && typeof raw === 'object' ? raw : {}
    const attachmentId = clean(value.attachmentId)
    const previewUrl = clean(value.previewUrl)
    if (!attachmentId || !previewUrl.startsWith('addom-attachment://attachment/')) continue
    if (seen.has(attachmentId)) continue
    seen.add(attachmentId)
    artifacts.push({
      artifactId: clean(value.artifactId) || `generated:${attachmentId}`,
      attachmentId,
      toolCallId: clean(value.toolCallId),
      toolName: clean(value.toolName),
      sourcePath: clean(value.sourcePath),
      kind: 'image',
      mediaType: clean(value.mediaType) || 'image/png',
      fileName: clean(value.fileName),
      sizeBytes: Math.max(0, Number(value.sizeBytes || 0) || 0),
      previewUrl,
    })
  }
  return artifacts
}

export async function stageGeneratedArtifactsFromProviderOutput({
  projectId = '',
  threadId = '',
  turnId = '',
  providerToolOutput = null,
} = {}) {
  const source = providerToolOutput && typeof providerToolOutput === 'object'
    ? providerToolOutput
    : {}
  const candidates = collectGeneratedImageCandidates(source)
  const artifacts = []
  const errors = []
  for (const candidate of candidates) {
    const staged = await stageAttachmentFromLocalFile({
      projectId,
      threadId,
      turnId,
      sourcePath: candidate.sourcePath,
      kind: 'image',
      mediaType: candidate.mediaType,
      fileName: candidate.fileName,
    })
    if (!staged?.ok || !staged?.descriptor) {
      errors.push({
        sourcePath: candidate.sourcePath,
        error: clean(staged?.error) || 'generated_artifact_stage_failed',
      })
      continue
    }
    artifacts.push({
      ...staged.descriptor,
      artifactId: `generated:${staged.descriptor.attachmentId}`,
      toolCallId: clean(source.toolCallId),
      toolName: clean(source.toolName),
      sourcePath: candidate.sourcePath,
    })
  }
  return {
    artifacts: normalizeGeneratedArtifacts(artifacts),
    errors,
  }
}
