import { normalizeFileChangeList } from './turn-file-changes.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function trimDetail(value = '', maxLength = 2000) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function asStringList(values = []) {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : []
}

function asNumberList(values = []) {
  return Array.isArray(values)
    ? values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : []
}

export function buildOpenAIAccountNativeActivityRows(
  payload = {},
  translate = (_key, defaultValue) => String(defaultValue || ''),
) {
  const native = payload?.accountNativeActivity && typeof payload.accountNativeActivity === 'object'
    ? payload.accountNativeActivity
    : {}
  const accountProtocol = payload?.accountProtocol && typeof payload.accountProtocol === 'object'
    ? payload.accountProtocol
    : {}
  const unknownActivities = Array.isArray(accountProtocol.unknownActivities)
    ? accountProtocol.unknownActivities.filter((entry) => entry && typeof entry === 'object')
    : []
  if (Object.keys(native).length === 0 && unknownActivities.length === 0) return []

  const threadId = normalizeId(payload?.threadId)
  const turnId = normalizeId(payload?.turnId)
  const rows = []
  const pushRow = (suffix = '', {
    type = 'info',
    label = '',
    detail = '',
    ...rest
  } = {}) => {
    const normalizedLabel = String(label || '').trim()
    const normalizedDetail = String(detail || '').trim()
    if (!normalizedLabel && !normalizedDetail) return
    rows.push({
      id: ['openai_account_native', turnId || 'turn', suffix].filter(Boolean).join(':'),
      coalesce: true,
      type,
      threadId,
      turnId,
      authMethod: 'account',
      eventKind: `openai_account_native_${suffix}`,
      label: normalizedLabel || translate(
        'core:executionStream.bridge.native.activity',
        'Codex app-server activity',
      ),
      detail: normalizedDetail,
      ...rest,
    })
  }

  const webSearch = native.webSearch && typeof native.webSearch === 'object' ? native.webSearch : null
  if (webSearch && (asStringList(webSearch.itemIds).length > 0 || asStringList(webSearch.queries).length > 0)) {
    pushRow('web_search', {
      type: 'provider_tool',
      label: translate(
        'core:executionStream.bridge.native.webSearch',
        'Codex app-server web search',
      ),
      detail: [
        asStringList(webSearch.queries).length > 0 ? `queries: ${asStringList(webSearch.queries).join(' | ')}` : '',
        asStringList(webSearch.actionTypes).length > 0 ? `actions: ${asStringList(webSearch.actionTypes).join(', ')}` : '',
        asStringList(webSearch.urls).length > 0 ? `urls: ${asStringList(webSearch.urls).join(', ')}` : '',
        asStringList(webSearch.patterns).length > 0 ? `patterns: ${asStringList(webSearch.patterns).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  const commandExecution = native.commandExecution && typeof native.commandExecution === 'object'
    ? native.commandExecution
    : null
  if (commandExecution && (asStringList(commandExecution.itemIds).length > 0 || asStringList(commandExecution.commands).length > 0)) {
    pushRow('command_execution', {
      type: 'provider_tool',
      label: translate(
        'core:executionStream.bridge.native.command',
        'Codex app-server command: {{commandName}}',
        { commandName: asStringList(commandExecution.commands)[0] || 'command' },
      ),
      detail: [
        asStringList(commandExecution.cwds).length > 0 ? `cwd: ${asStringList(commandExecution.cwds).join(', ')}` : '',
        asStringList(commandExecution.statuses).length > 0 ? `statuses: ${asStringList(commandExecution.statuses).join(', ')}` : '',
        asNumberList(commandExecution.exitCodes).length > 0 ? `exit_codes: ${asNumberList(commandExecution.exitCodes).join(', ')}` : '',
        asNumberList(commandExecution.durationsMs).length > 0 ? `durations_ms: ${asNumberList(commandExecution.durationsMs).join(', ')}` : '',
        asStringList(commandExecution.commandActionKinds).length > 0
          ? `actions: ${asStringList(commandExecution.commandActionKinds).join(', ')}`
          : '',
        trimDetail(commandExecution.aggregatedOutput) ? `output: ${trimDetail(commandExecution.aggregatedOutput)}` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  const fileChange = native.fileChange && typeof native.fileChange === 'object' ? native.fileChange : null
  const normalizedNativeFileChanges = normalizeFileChangeList(
    Array.isArray(fileChange?.changes) ? fileChange.changes : [],
    { defaultSource: 'file_change' },
  )
  if (fileChange && normalizedNativeFileChanges.length > 0) {
    pushRow('file_change', {
      type: 'file_change',
      label: translate(
        asStringList(fileChange.paths).length === 1
          ? 'core:executionStream.bridge.native.fileChangeOne'
          : 'core:executionStream.bridge.native.fileChangeOther',
        asStringList(fileChange.paths).length === 1
          ? 'Codex app-server file change'
          : 'Codex app-server file changes',
      ),
      detail: [
        asStringList(fileChange.paths).length > 0 ? `paths: ${asStringList(fileChange.paths).join(', ')}` : '',
        asStringList(fileChange.changeKinds).length > 0 ? `change_kinds: ${asStringList(fileChange.changeKinds).join(', ')}` : '',
        asStringList(fileChange.statuses).length > 0 ? `statuses: ${asStringList(fileChange.statuses).join(', ')}` : '',
        trimDetail(fileChange.outputPreview) ? `output: ${trimDetail(fileChange.outputPreview)}` : '',
      ].filter(Boolean).join('\n'),
      toolName: 'file_change',
      fileChanges: normalizedNativeFileChanges,
      fileChange: normalizedNativeFileChanges[0] || null,
    })
  }

  const mcpToolCall = native.mcpToolCall && typeof native.mcpToolCall === 'object' ? native.mcpToolCall : null
  if (mcpToolCall && (asStringList(mcpToolCall.itemIds).length > 0 || asStringList(mcpToolCall.tools).length > 0)) {
    pushRow('mcp_tool', {
      type: 'provider_tool',
      label: translate(
        'core:executionStream.bridge.native.mcpTool',
        'Codex app-server MCP tool: {{toolName}}',
        { toolName: asStringList(mcpToolCall.tools)[0] || 'tool' },
      ),
      detail: [
        asStringList(mcpToolCall.servers).length > 0 ? `servers: ${asStringList(mcpToolCall.servers).join(', ')}` : '',
        asStringList(mcpToolCall.statuses).length > 0 ? `statuses: ${asStringList(mcpToolCall.statuses).join(', ')}` : '',
        asStringList(mcpToolCall.errorMessages).length > 0 ? `errors: ${asStringList(mcpToolCall.errorMessages).join(' | ')}` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  const imageView = native.imageView && typeof native.imageView === 'object' ? native.imageView : null
  if (imageView && (asStringList(imageView.itemIds).length > 0 || asStringList(imageView.paths).length > 0)) {
    pushRow('image_view', {
      label: translate(
        'core:executionStream.bridge.native.imageView',
        'Codex app-server image view',
      ),
      detail: [
        asStringList(imageView.paths).length > 0 ? `paths: ${asStringList(imageView.paths).join(', ')}` : '',
        asStringList(imageView.statuses).length > 0 ? `statuses: ${asStringList(imageView.statuses).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  const imageGeneration = native.imageGeneration && typeof native.imageGeneration === 'object'
    ? native.imageGeneration
    : null
  const imageGenerationItemIds = asStringList(imageGeneration?.itemIds)
  const imageGenerationStatuses = asStringList(imageGeneration?.statuses)
    .map((status) => status.toLowerCase())
  if (imageGeneration && (
    imageGenerationItemIds.length > 0
    || asStringList(imageGeneration.savedPaths).length > 0
    || imageGeneration.resultAvailable === true
  )) {
    const completed = imageGeneration.completed === true
      || imageGeneration.resultAvailable === true
      || imageGenerationStatuses.some((status) => ['completed', 'done', 'success', 'succeeded'].includes(status))
    const failed = !completed
      && imageGenerationStatuses.some((status) => ['cancelled', 'canceled', 'error', 'failed', 'interrupted'].includes(status))
    pushRow('image_generation', {
      type: completed || failed ? 'result' : 'provider_tool',
      toolName: 'image_generation',
      ...(imageGenerationItemIds[0] ? { stepId: imageGenerationItemIds[0] } : {}),
      ...(failed ? { isError: true } : {}),
      label: translate(
        'core:executionStream.bridge.providerTool.imageGenerated',
        'Image generated by OpenAI provider tool.',
      ),
      detail: [
        asStringList(imageGeneration.savedPaths).length > 0
          ? `saved_path: ${asStringList(imageGeneration.savedPaths).join(', ')}`
          : '',
        imageGenerationStatuses.length > 0
          ? `statuses: ${imageGenerationStatuses.join(', ')}`
          : '',
        asStringList(imageGeneration.revisedPrompts).length > 0
          ? `revised_prompt: ${trimDetail(asStringList(imageGeneration.revisedPrompts).join(' | '))}`
          : '',
        imageGeneration.resultAvailable === true ? 'result_available: true' : '',
      ].filter(Boolean).join('\n'),
    })
  }

  const plan = native.plan && typeof native.plan === 'object' ? native.plan : null
  if (plan && (asStringList(plan.itemIds).length > 0 || trimDetail(plan.text))) {
    pushRow('plan', {
      label: translate(
        'core:executionStream.bridge.native.planGenerated',
        'Codex app-server plan generated',
      ),
      detail: [
        asStringList(plan.statuses).length > 0 ? `statuses: ${asStringList(plan.statuses).join(', ')}` : '',
        trimDetail(plan.text) ? `text: ${trimDetail(plan.text)}` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  const reviewMode = native.reviewMode && typeof native.reviewMode === 'object' ? native.reviewMode : null
  if (reviewMode && (
    asStringList(reviewMode.itemIds).length > 0
    || reviewMode.entered === true
    || reviewMode.exited === true
  )) {
    pushRow('review_mode', {
      label: translate(
        'core:executionStream.bridge.native.reviewMode',
        'Codex review mode activity',
      ),
      detail: [
        reviewMode.entered === true ? 'entered: true' : '',
        reviewMode.exited === true ? 'exited: true' : '',
        asStringList(reviewMode.reviewIds).length > 0 ? `review_ids: ${asStringList(reviewMode.reviewIds).join(', ')}` : '',
        asStringList(reviewMode.itemTypes).length > 0 ? `item_types: ${asStringList(reviewMode.itemTypes).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  return rows
}
