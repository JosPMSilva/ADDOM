function clean(value = '') {
  return String(value || '').trim()
}

function normalizeReference(value = '') {
  let normalized = clean(value)
  if (!normalized) return ''
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // Preserve the literal reference when it is not valid percent-encoding.
  }
  normalized = normalized.replace(/\\/g, '/')
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeGeneratedArtifactMarkdownImages(markdown = '', generatedArtifacts = []) {
  let normalized = String(markdown ?? '')
  const artifacts = Array.isArray(generatedArtifacts) ? generatedArtifacts : []
  for (const rawArtifact of artifacts) {
    const sourcePath = clean(rawArtifact?.sourcePath)
    if (!sourcePath || !sourcePath.includes('\\')) continue
    const imageDestination = new RegExp(
      `(!\\[[^\\]\\r\\n]*\\]\\()\\s*${escapeRegExp(sourcePath)}\\s*(\\))`,
      'g',
    )
    const portablePath = sourcePath.replace(/\\/g, '/')
    normalized = normalized.replace(imageDestination, `$1<${portablePath}>$2`)
  }
  return normalized
}

export function resolveGeneratedArtifactImage(src = '', generatedArtifacts = []) {
  const reference = normalizeReference(src)
  if (!reference) return null
  const artifacts = Array.isArray(generatedArtifacts) ? generatedArtifacts : []
  for (const rawArtifact of artifacts) {
    const artifact = rawArtifact && typeof rawArtifact === 'object' ? rawArtifact : {}
    const attachmentId = clean(artifact.attachmentId)
    const artifactId = clean(artifact.artifactId)
    const aliases = [
      artifact.previewUrl,
      artifact.sourcePath,
      attachmentId ? `generated-artifact:${attachmentId}` : '',
      attachmentId ? `generated-artifact://${attachmentId}` : '',
      artifactId ? `generated-artifact:${artifactId}` : '',
      artifactId ? `generated-artifact://${artifactId}` : '',
    ].map(normalizeReference).filter(Boolean)
    if (!aliases.includes(reference)) continue
    const previewUrl = clean(artifact.previewUrl)
    if (!previewUrl.startsWith('addom-attachment://attachment/')) return null
    return {
      ...artifact,
      previewUrl,
    }
  }
  return null
}
