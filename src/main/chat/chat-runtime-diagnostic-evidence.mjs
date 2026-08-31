const ACCOUNT_NATIVE_TOOL_BUCKETS = Object.freeze({
  webSearch: 'web_search',
  commandExecution: 'command_execution',
  fileChange: 'file_change',
  mcpToolCall: 'mcp',
  imageView: 'image_view',
  imageGeneration: 'image_generation',
})

function normalizeId(value = '') {
  return String(value || '').trim()
}

function addToolEvidence(target, identity = '', toolName = '') {
  const normalizedIdentity = normalizeId(identity)
  if (!normalizedIdentity) return
  const normalizedToolName = normalizeId(toolName)
  if (!target.has(normalizedIdentity) || normalizedToolName) {
    target.set(normalizedIdentity, normalizedToolName || target.get(normalizedIdentity) || '')
  }
}

function addAccountNativeActivityEvidence(target, activity = null, eventId = 0) {
  const source = activity && typeof activity === 'object' ? activity : {}
  for (const [bucketName, toolName] of Object.entries(ACCOUNT_NATIVE_TOOL_BUCKETS)) {
    const bucket = source[bucketName] && typeof source[bucketName] === 'object'
      ? source[bucketName]
      : null
    if (!bucket) continue
    const itemIds = Array.isArray(bucket.itemIds)
      ? bucket.itemIds.map(normalizeId).filter(Boolean)
      : []
    if (itemIds.length > 0) {
      for (const itemId of itemIds) addToolEvidence(target, `provider:${itemId}`, toolName)
      continue
    }
    if (bucket.started === true || bucket.completed === true) {
      addToolEvidence(target, `provider:aggregate:${eventId}:${bucketName}`, toolName)
    }
  }
}

export function summarizeCanonicalTurnToolEvidence(events = [], { turnId = '' } = {}) {
  const normalizedTurnId = normalizeId(turnId)
  const localTools = new Map()
  const providerTools = new Map()
  let providerRuntimeVersion = ''

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue
    if (normalizedTurnId && normalizeId(event.turnId) !== normalizedTurnId) continue
    const kind = normalizeId(event.kind)
    const meta = event.meta && typeof event.meta === 'object' ? event.meta : {}
    if (kind === 'tool_executing') {
      const identity = normalizeId(meta.stepId || meta.toolCallId) || `event:${Number(event.eventId || 0) || localTools.size + 1}`
      addToolEvidence(localTools, `local:${identity}`, meta.toolName)
      continue
    }
    if (kind === 'provider_tool_output') {
      const identity = normalizeId(meta.toolCallId || meta.itemId) || `event:${Number(event.eventId || 0) || providerTools.size + 1}`
      addToolEvidence(providerTools, `provider:${identity}`, meta.toolName)
      continue
    }
    if (kind !== 'openai_continuity_status') continue
    const runtimeVersion = normalizeId(meta.accountProtocol?.runtime?.version)
    if (runtimeVersion) providerRuntimeVersion = runtimeVersion
    addAccountNativeActivityEvidence(providerTools, meta.accountNativeActivity, Number(event.eventId || 0))
  }

  const usedTools = Array.from(new Set([
    ...localTools.values(),
    ...providerTools.values(),
  ].filter(Boolean))).sort()
  return {
    available: true,
    localToolCallCount: localTools.size,
    providerToolCallCount: providerTools.size,
    totalToolCallCount: localTools.size + providerTools.size,
    usedTools,
    providerRuntimeVersion,
  }
}

export function buildRuntimeEvidenceDiagnosticLines(source = {}) {
  const lines = []
  const evidenceSource = normalizeId(source.toolActivityEvidenceSource).toLowerCase()
  const localCount = Math.max(0, Number(source.localToolCallCount || 0) || 0)
  const providerCount = Math.max(0, Number(source.providerToolCallCount || 0) || 0)
  const totalCount = Math.max(0, Number(source.toolCallCount || 0) || 0)
  if (evidenceSource) lines.push(`tool_activity_evidence: ${evidenceSource}`)
  if (localCount > 0 || providerCount > 0 || evidenceSource === 'canonical_timeline') {
    lines.push(`tool_activity_counts: local=${localCount}, provider_native=${providerCount}, total=${totalCount}`)
  }
  const runtimeVersion = normalizeId(source.providerRuntimeVersion)
  if (runtimeVersion) lines.push(`provider_runtime_version: ${runtimeVersion}`)

  const buildParts = [
    normalizeId(source.addomBuildVersion) ? `version=${normalizeId(source.addomBuildVersion)}` : '',
    normalizeId(source.addomBuildMode) ? `mode=${normalizeId(source.addomBuildMode).toLowerCase()}` : '',
    Number(source.addomProcessId || 0) > 0 ? `process_id=${Number(source.addomProcessId)}` : '',
    normalizeId(source.addomProcessStartedAt) ? `started_at=${normalizeId(source.addomProcessStartedAt)}` : '',
  ].filter(Boolean)
  if (buildParts.length > 0) lines.push(`addom_build_identity: ${buildParts.join(', ')}`)

  const imageStatus = normalizeId(source.imageGenerationSupportStatus).toLowerCase()
  if (imageStatus) {
    const supportParts = [
      normalizeId(source.imageGenerationHandlerId) ? `handler=${normalizeId(source.imageGenerationHandlerId)}` : '',
      normalizeId(source.imageGenerationQualificationStatus)
        ? `qualification=${normalizeId(source.imageGenerationQualificationStatus).toLowerCase()}`
        : '',
      normalizeId(source.imageGenerationQualificationFixtureId)
        ? `fixture=${normalizeId(source.imageGenerationQualificationFixtureId)}`
        : '',
    ].filter(Boolean)
    lines.push(`image_generation_protocol_support: ${imageStatus}${supportParts.length > 0 ? ` (${supportParts.join(', ')})` : ''}`)
  }
  return lines
}
