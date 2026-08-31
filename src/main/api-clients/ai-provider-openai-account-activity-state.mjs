import { countLineDelta } from '../chat/diff-math.mjs'
import { buildPreviewableUnifiedDiff } from '../tools/apply-patch-core.mjs'
import {
  normalizeId,
  normalizeObject,
} from './ai-provider-openai-account-shared.mjs'

const ACCOUNT_NATIVE_PROVIDER_TOOL_NAMES = Object.freeze({
  plan: 'plan',
  webSearch: 'web_search',
  commandExecution: 'command_execution',
  fileChange: 'file_change',
  mcpToolCall: 'mcp_tool_call',
  imageView: 'image_view',
  imageGeneration: 'image_generation',
  enteredReviewMode: 'review_mode',
  exitedReviewMode: 'review_mode',
})

export function createAccountCompactionState() {
  return {
    started: false,
    completed: false,
    itemIds: [],
  }
}

export function trackAccountCompactionItem(state = null, item = null, phase = '') {
  const target = state && typeof state === 'object' ? state : createAccountCompactionState()
  const itemId = normalizeId(item?.id)
  if (phase === 'started') target.started = true
  if (phase === 'completed') {
    target.started = true
    target.completed = true
  }
  if (itemId && !target.itemIds.includes(itemId)) {
    target.itemIds.push(itemId)
  }
  return target
}

function pushUniqueValue(target = [], value = '') {
  const normalizedValue = normalizeId(value)
  if (!normalizedValue || target.includes(normalizedValue)) return target
  target.push(normalizedValue)
  return target
}

export function cloneAccountCompactionState(state = null) {
  const source = state && typeof state === 'object' ? state : null
  if (!source) return null
  return {
    started: source.started === true,
    completed: source.completed === true,
    itemIds: Array.isArray(source.itemIds) ? [...source.itemIds] : [],
  }
}

function createAccountNativeActivityBucket() {
  return {
    started: false,
    completed: false,
    itemIds: [],
    statuses: [],
  }
}

export function createAccountNativeActivityState() {
  return {
    webSearch: {
      ...createAccountNativeActivityBucket(),
      queries: [],
      actionTypes: [],
      urls: [],
      patterns: [],
    },
    commandExecution: {
      ...createAccountNativeActivityBucket(),
      commands: [],
      cwds: [],
      exitCodes: [],
      durationsMs: [],
      commandActionKinds: [],
      aggregatedOutput: '',
    },
    fileChange: {
      ...createAccountNativeActivityBucket(),
      changes: [],
      paths: [],
      changeKinds: [],
      outputPreview: '',
    },
    mcpToolCall: {
      ...createAccountNativeActivityBucket(),
      servers: [],
      tools: [],
      errorMessages: [],
    },
    imageView: {
      ...createAccountNativeActivityBucket(),
      paths: [],
    },
    imageGeneration: {
      ...createAccountNativeActivityBucket(),
      revisedPrompts: [],
      savedPaths: [],
      resultAvailable: false,
    },
    plan: {
      ...createAccountNativeActivityBucket(),
      text: '',
    },
    reviewMode: {
      itemIds: [],
      reviewIds: [],
      itemTypes: [],
      entered: false,
      exited: false,
    },
  }
}

function normalizeStringList(values = []) {
  return Array.isArray(values) ? values.map((value) => normalizeId(value)).filter(Boolean) : []
}

function normalizeNumberList(values = []) {
  return Array.isArray(values)
    ? values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    : []
}

function normalizeAccountNativeFileChangeKind(value = '') {
  const candidate = value && typeof value === 'object'
    ? (
        value.kind
        ?? value.type
        ?? value.name
        ?? value.action
        ?? value.op
        ?? value.operation
        ?? value.value
        ?? ''
      )
    : value
  const normalized = normalizeId(candidate).toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return ''
  if (normalized === 'add' || normalized === 'added' || normalized === 'create' || normalized === 'created') return 'create'
  if (normalized === 'apply' || normalized === 'applied' || normalized === 'patch') return 'apply'
  if (
    normalized === 'edit'
    || normalized === 'edited'
    || normalized === 'modify'
    || normalized === 'modified'
    || normalized === 'update'
    || normalized === 'updated'
  ) return 'modify'
  if (normalized === 'delete' || normalized === 'deleted' || normalized === 'remove' || normalized === 'removed') return 'delete'
  if (normalized === 'move' || normalized === 'moved' || normalized === 'rename' || normalized === 'renamed') return 'rename'
  if (
    normalized === 'rollback'
    || normalized === 'rolled_back'
    || normalized === 'roll_back'
    || normalized === 'revert'
    || normalized === 'reverted'
  ) return 'rollback'
  return normalized
}

function cloneAccountNativeFileChanges(values = []) {
  if (!Array.isArray(values)) return []
  return values
    .filter((value) => value && typeof value === 'object')
    .map((value) => ({
      ...value,
      ...(value.kind && typeof value.kind === 'object' ? { kind: { ...value.kind } } : {}),
    }))
}

function mergeAccountNativeFileChanges(currentValues = [], nextValues = []) {
  const next = cloneAccountNativeFileChanges(currentValues)
  const indexByKey = new Map()
  next.forEach((value, index) => {
    const key = normalizeId(value?.path || value?.filePath || value?.targetPath || value?.filename || value?.file)
      || `index:${index}`
    indexByKey.set(key, index)
  })
  for (const value of cloneAccountNativeFileChanges(nextValues)) {
    const key = normalizeId(value?.path || value?.filePath || value?.targetPath || value?.filename || value?.file)
      || `index:${next.length}`
    if (indexByKey.has(key)) {
      next[indexByKey.get(key)] = value
      continue
    }
    indexByKey.set(key, next.length)
    next.push(value)
  }
  return next
}

function trimPreview(value = '', maxLength = 4000) {
  const text = String(value || '')
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function cloneAccountNativeActivityBucket(state = null) {
  const source = state && typeof state === 'object' ? state : null
  if (!source) return null
  return {
    started: source.started === true,
    completed: source.completed === true,
    itemIds: normalizeStringList(source.itemIds),
    statuses: normalizeStringList(source.statuses),
  }
}

export function cloneAccountNativeActivityState(state = null) {
  const source = state && typeof state === 'object' ? state : null
  if (!source) return null
  const webSearch = cloneAccountNativeActivityBucket(source.webSearch) || createAccountNativeActivityBucket()
  const commandExecution = cloneAccountNativeActivityBucket(source.commandExecution) || createAccountNativeActivityBucket()
  const fileChange = cloneAccountNativeActivityBucket(source.fileChange) || createAccountNativeActivityBucket()
  const mcpToolCall = cloneAccountNativeActivityBucket(source.mcpToolCall) || createAccountNativeActivityBucket()
  const imageView = cloneAccountNativeActivityBucket(source.imageView) || createAccountNativeActivityBucket()
  const imageGeneration = cloneAccountNativeActivityBucket(source.imageGeneration) || createAccountNativeActivityBucket()
  const plan = cloneAccountNativeActivityBucket(source.plan) || createAccountNativeActivityBucket()
  return {
    webSearch: {
      ...webSearch,
      queries: normalizeStringList(source.webSearch?.queries),
      actionTypes: normalizeStringList(source.webSearch?.actionTypes),
      urls: normalizeStringList(source.webSearch?.urls),
      patterns: normalizeStringList(source.webSearch?.patterns),
    },
    commandExecution: {
      ...commandExecution,
      commands: normalizeStringList(source.commandExecution?.commands),
      cwds: normalizeStringList(source.commandExecution?.cwds),
      exitCodes: normalizeNumberList(source.commandExecution?.exitCodes),
      durationsMs: normalizeNumberList(source.commandExecution?.durationsMs),
      commandActionKinds: normalizeStringList(source.commandExecution?.commandActionKinds),
      aggregatedOutput: trimPreview(source.commandExecution?.aggregatedOutput),
    },
    fileChange: {
      ...fileChange,
      changes: cloneAccountNativeFileChanges(source.fileChange?.changes),
      paths: normalizeStringList(source.fileChange?.paths),
      changeKinds: normalizeStringList(source.fileChange?.changeKinds),
      outputPreview: trimPreview(source.fileChange?.outputPreview),
    },
    mcpToolCall: {
      ...mcpToolCall,
      servers: normalizeStringList(source.mcpToolCall?.servers),
      tools: normalizeStringList(source.mcpToolCall?.tools),
      errorMessages: normalizeStringList(source.mcpToolCall?.errorMessages),
    },
    imageView: {
      ...imageView,
      paths: normalizeStringList(source.imageView?.paths),
    },
    imageGeneration: {
      ...imageGeneration,
      revisedPrompts: normalizeStringList(source.imageGeneration?.revisedPrompts)
        .map((value) => trimPreview(value)),
      savedPaths: normalizeStringList(source.imageGeneration?.savedPaths),
      resultAvailable: source.imageGeneration?.resultAvailable === true,
    },
    plan: {
      ...plan,
      text: String(source.plan?.text || '').trim(),
    },
    reviewMode: {
      itemIds: normalizeStringList(source.reviewMode?.itemIds),
      reviewIds: normalizeStringList(source.reviewMode?.reviewIds),
      itemTypes: normalizeStringList(source.reviewMode?.itemTypes),
      entered: source.reviewMode?.entered === true,
      exited: source.reviewMode?.exited === true,
    },
  }
}

function hasAccountNativeActivityBucketState(state = null) {
  return !!(
    state
    && (
      state.started === true
      || state.completed === true
      || normalizeStringList(state.itemIds).length > 0
      || normalizeStringList(state.statuses).length > 0
    )
  )
}

export function hasAccountNativeActivityState(state = null) {
  const source = cloneAccountNativeActivityState(state)
  if (!source) return false
  return (
    hasAccountNativeActivityBucketState(source.webSearch)
    || normalizeStringList(source.webSearch?.queries).length > 0
    || normalizeStringList(source.webSearch?.actionTypes).length > 0
    || normalizeStringList(source.webSearch?.urls).length > 0
    || normalizeStringList(source.webSearch?.patterns).length > 0
    || hasAccountNativeActivityBucketState(source.commandExecution)
    || normalizeStringList(source.commandExecution?.commands).length > 0
    || normalizeStringList(source.commandExecution?.cwds).length > 0
    || normalizeNumberList(source.commandExecution?.exitCodes).length > 0
    || normalizeNumberList(source.commandExecution?.durationsMs).length > 0
    || normalizeStringList(source.commandExecution?.commandActionKinds).length > 0
    || String(source.commandExecution?.aggregatedOutput || '').trim().length > 0
    || hasAccountNativeActivityBucketState(source.fileChange)
    || cloneAccountNativeFileChanges(source.fileChange?.changes).length > 0
    || normalizeStringList(source.fileChange?.paths).length > 0
    || normalizeStringList(source.fileChange?.changeKinds).length > 0
    || String(source.fileChange?.outputPreview || '').trim().length > 0
    || hasAccountNativeActivityBucketState(source.mcpToolCall)
    || normalizeStringList(source.mcpToolCall?.servers).length > 0
    || normalizeStringList(source.mcpToolCall?.tools).length > 0
    || normalizeStringList(source.mcpToolCall?.errorMessages).length > 0
    || hasAccountNativeActivityBucketState(source.imageView)
    || normalizeStringList(source.imageView?.paths).length > 0
    || hasAccountNativeActivityBucketState(source.imageGeneration)
    || normalizeStringList(source.imageGeneration?.revisedPrompts).length > 0
    || normalizeStringList(source.imageGeneration?.savedPaths).length > 0
    || source.imageGeneration?.resultAvailable === true
    || hasAccountNativeActivityBucketState(source.plan)
    || String(source.plan?.text || '').trim().length > 0
    || normalizeStringList(source.reviewMode?.itemIds).length > 0
    || normalizeStringList(source.reviewMode?.reviewIds).length > 0
    || normalizeStringList(source.reviewMode?.itemTypes).length > 0
    || source.reviewMode?.entered === true
    || source.reviewMode?.exited === true
  )
}

function extractWebSearchAction(source = null) {
  const action = normalizeObject(source?.action)
  return {
    type: normalizeId(action?.type || source?.actionType),
    url: normalizeId(action?.url),
    pattern: normalizeId(action?.pattern),
    query: normalizeId(action?.query),
    queries: Array.isArray(action?.queries) ? action.queries.map((value) => normalizeId(value)).filter(Boolean) : [],
  }
}

export function normalizeAccountNativeProviderToolName(itemType = '') {
  return ACCOUNT_NATIVE_PROVIDER_TOOL_NAMES[normalizeId(itemType)] || ''
}

export function buildAccountNativeActivityDetail(item = null) {
  const source = normalizeObject(item)
  const itemType = normalizeId(source.type)
  if (!itemType) return ''

  if (itemType === 'webSearch') {
    const action = extractWebSearchAction(source)
    const queries = [
      normalizeId(source.query),
      action.query,
      ...action.queries,
    ].filter(Boolean)
    return [
      queries.length > 0 ? `query: ${queries.join(' | ')}` : '',
      action.type ? `action: ${action.type}` : '',
      action.url ? `url: ${action.url}` : '',
      action.pattern ? `pattern: ${action.pattern}` : '',
    ].filter(Boolean).join('\n')
  }

  if (itemType === 'commandExecution') {
    return [
      source.command ? `command: ${String(source.command)}` : '',
      source.cwd ? `cwd: ${String(source.cwd)}` : '',
      source.status ? `status: ${String(source.status)}` : '',
    ].filter(Boolean).join('\n')
  }

  if (itemType === 'fileChange') {
    const changes = Array.isArray(source.changes) ? source.changes : []
    const paths = changes
      .map((change) => normalizeId(change?.path))
      .filter(Boolean)
    return [
      source.status ? `status: ${String(source.status)}` : '',
      paths.length > 0 ? `paths: ${paths.join(', ')}` : '',
    ].filter(Boolean).join('\n')
  }

  if (itemType === 'mcpToolCall') {
    return [
      source.server ? `server: ${String(source.server)}` : '',
      source.tool ? `tool: ${String(source.tool)}` : '',
      source.status ? `status: ${String(source.status)}` : '',
    ].filter(Boolean).join('\n')
  }

  if (itemType === 'imageView') {
    return source.path ? `path: ${String(source.path)}` : ''
  }

  if (itemType === 'imageGeneration') {
    return [
      source.status ? `status: ${String(source.status)}` : '',
      source.savedPath ? `saved_path: ${String(source.savedPath)}` : '',
      source.revisedPrompt ? `revised_prompt: ${trimPreview(source.revisedPrompt)}` : '',
    ].filter(Boolean).join('\n')
  }

  if (itemType === 'plan') {
    return trimPreview(source.text)
  }

  if (itemType === 'enteredReviewMode' || itemType === 'exitedReviewMode') {
    return [
      `state: ${itemType === 'enteredReviewMode' ? 'entered' : 'exited'}`,
      source.review?.id ? `review_id: ${String(source.review.id)}` : '',
    ].filter(Boolean).join('\n')
  }

  return ''
}

export function buildAccountNativeActivityOutput(item = null) {
  const source = normalizeObject(item)
  const itemType = normalizeId(source.type)
  if (!itemType) return null

  if (itemType === 'webSearch') {
    const action = extractWebSearchAction(source)
    return {
      type: itemType,
      query: normalizeId(source.query),
      action: {
        ...(action.type ? { type: action.type } : {}),
        ...(action.url ? { url: action.url } : {}),
        ...(action.pattern ? { pattern: action.pattern } : {}),
        ...(action.query ? { query: action.query } : {}),
        ...(action.queries.length > 0 ? { queries: action.queries } : {}),
      },
      status: normalizeId(source.status),
    }
  }

  if (itemType === 'commandExecution') {
    return {
      type: itemType,
      command: String(source.command || ''),
      cwd: String(source.cwd || ''),
      status: normalizeId(source.status),
      aggregatedOutput: trimPreview(source.aggregatedOutput),
      exitCode: Number.isFinite(Number(source.exitCode)) ? Number(source.exitCode) : null,
      durationMs: Number.isFinite(Number(source.durationMs)) ? Number(source.durationMs) : null,
      commandActions: Array.isArray(source.commandActions) ? source.commandActions : [],
    }
  }

  if (itemType === 'fileChange') {
    const normalizedChanges = normalizeAccountNativeProviderFileChanges(source.changes)
    return {
      type: itemType,
      status: normalizeId(source.status),
      changes: normalizedChanges,
    }
  }

  if (itemType === 'mcpToolCall') {
    return {
      type: itemType,
      server: String(source.server || ''),
      tool: String(source.tool || ''),
      status: normalizeId(source.status),
      arguments: source.arguments ?? null,
      result: source.result ?? null,
      error: source.error ?? null,
    }
  }

  if (itemType === 'imageView') {
    return {
      type: itemType,
      path: String(source.path || ''),
      status: normalizeId(source.status),
    }
  }

  if (itemType === 'imageGeneration') {
    return {
      type: itemType,
      status: normalizeId(source.status),
      revisedPrompt: trimPreview(source.revisedPrompt),
      savedPath: String(source.savedPath || ''),
      resultAvailable: String(source.result || '').length > 0,
    }
  }

  if (itemType === 'plan') {
    return {
      type: itemType,
      text: String(source.text || ''),
      status: normalizeId(source.status),
    }
  }

  if (itemType === 'enteredReviewMode' || itemType === 'exitedReviewMode') {
    return {
      type: itemType,
      review: source.review ?? null,
      status: normalizeId(source.status),
    }
  }

  return null
}

function readFiniteNumberOrNull(...values) {
  for (const value of values) {
    const numericValue = Number(value)
    if (Number.isFinite(numericValue)) return numericValue
  }
  return null
}

function normalizeAccountNativeProviderFileChange(change = null) {
  const source = normalizeObject(change)
  const filePath = normalizeId(
    source.path
    || source.filePath
    || source.targetPath
    || source.filename
    || source.file,
  )
  if (!filePath) return null

  const changeKind = normalizeAccountNativeFileChangeKind(
    source.kind
    ?? source.changeType
    ?? source.change
    ?? source.type
    ?? '',
  )
  const rawDiff = String(
    source.diff
    ?? source.diffText
    ?? source.patch
    ?? source.unifiedDiff
    ?? '',
  ).replace(/\r\n/g, '\n').trim()
  const previousContent = changeKind === 'delete' ? rawDiff : ''
  const nextContent = changeKind === 'create' ? rawDiff : ''
  const previewableDiff = buildPreviewableUnifiedDiff({
    diffText: rawDiff,
    previousContent,
    nextContent,
  })
  const explicitAddedLines = readFiniteNumberOrNull(
    source.addedLines,
    source.linesAdded,
    source.insertions,
    source.additions,
  )
  const explicitRemovedLines = readFiniteNumberOrNull(
    source.removedLines,
    source.linesRemoved,
    source.deletions,
    source.removals,
  )
  const canDeriveLineDelta = changeKind === 'create' || changeKind === 'delete'
  const derivedLineDelta = canDeriveLineDelta
    ? countLineDelta(previousContent, nextContent)
    : { addedLines: 0, removedLines: 0 }
  const addedLines = explicitAddedLines ?? (canDeriveLineDelta ? Number(derivedLineDelta.addedLines || 0) || 0 : null)
  const removedLines = explicitRemovedLines ?? (canDeriveLineDelta ? Number(derivedLineDelta.removedLines || 0) || 0 : null)
  const oldPath = normalizeId(source.oldPath || source.renamedFrom || source.previousPath)
  const hasRenderableMetadata = (
    !!previewableDiff
    || addedLines !== null
    || removedLines !== null
    || !!normalizeId(source.newRevId || source.newRevisionId)
    || !!normalizeId(source.prevRevId || source.previousRevId)
  )
  if (!hasRenderableMetadata) return null

  return {
    path: filePath,
    ...(oldPath ? { oldPath } : {}),
    ...(changeKind ? { kind: { type: changeKind } } : {}),
    ...(previewableDiff ? { diff: previewableDiff } : {}),
    ...(addedLines !== null ? { addedLines } : {}),
    ...(removedLines !== null ? { removedLines } : {}),
    ...(normalizeId(source.newRevId || source.newRevisionId)
      ? { newRevId: normalizeId(source.newRevId || source.newRevisionId) }
      : {}),
    ...(normalizeId(source.prevRevId || source.previousRevId)
      ? { prevRevId: normalizeId(source.prevRevId || source.previousRevId) }
      : {}),
  }
}

function normalizeAccountNativeProviderFileChanges(values = []) {
  if (!Array.isArray(values)) return []
  return values
    .map((value) => normalizeAccountNativeProviderFileChange(value))
    .filter(Boolean)
}

export function trackAccountNativeActivityItem(state = null, item = null, phase = '') {
  const target = state && typeof state === 'object' ? state : createAccountNativeActivityState()
  const itemType = normalizeId(item?.type)
  const itemId = normalizeId(item?.id)
  const status = normalizeId(item?.status)

  if (itemType === 'webSearch') {
    const bucket = target.webSearch
    if (phase === 'started') bucket.started = true
    if (phase === 'completed') bucket.completed = true
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    if (status) pushUniqueValue(bucket.statuses, status)
    const action = extractWebSearchAction(item)
    const queries = [
      normalizeId(item?.query),
      action.query,
      ...action.queries,
    ].filter(Boolean)
    for (const query of queries) pushUniqueValue(bucket.queries, query)
    if (action.type) pushUniqueValue(bucket.actionTypes, action.type)
    if (action.url) pushUniqueValue(bucket.urls, action.url)
    if (action.pattern) pushUniqueValue(bucket.patterns, action.pattern)
    return target
  }

  if (itemType === 'commandExecution') {
    const bucket = target.commandExecution
    if (phase === 'started') bucket.started = true
    if (phase === 'completed') bucket.completed = true
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    if (status) pushUniqueValue(bucket.statuses, status)
    pushUniqueValue(bucket.commands, item?.command)
    pushUniqueValue(bucket.cwds, item?.cwd)
    const exitCode = Number(item?.exitCode)
    if (Number.isFinite(exitCode) && !bucket.exitCodes.includes(exitCode)) bucket.exitCodes.push(exitCode)
    const durationMs = Number(item?.durationMs)
    if (Number.isFinite(durationMs) && !bucket.durationsMs.includes(durationMs)) bucket.durationsMs.push(durationMs)
    const commandActions = Array.isArray(item?.commandActions) ? item.commandActions : []
    for (const action of commandActions) {
      pushUniqueValue(bucket.commandActionKinds, action?.type || action?.kind || action?.action)
    }
    bucket.aggregatedOutput = syncAggregatedText(
      bucket.aggregatedOutput,
      trimPreview(item?.aggregatedOutput),
      null,
    )
    return target
  }

  if (itemType === 'fileChange') {
    const bucket = target.fileChange
    if (phase === 'started') bucket.started = true
    if (phase === 'completed') bucket.completed = true
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    if (status) pushUniqueValue(bucket.statuses, status)
    const changes = Array.isArray(item?.changes) ? item.changes : []
    bucket.changes = mergeAccountNativeFileChanges(bucket.changes, changes)
    for (const change of changes) {
      pushUniqueValue(bucket.paths, change?.path)
      pushUniqueValue(bucket.changeKinds, normalizeAccountNativeFileChangeKind(change?.kind))
    }
    return target
  }

  if (itemType === 'mcpToolCall') {
    const bucket = target.mcpToolCall
    if (phase === 'started') bucket.started = true
    if (phase === 'completed') bucket.completed = true
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    if (status) pushUniqueValue(bucket.statuses, status)
    pushUniqueValue(bucket.servers, item?.server)
    pushUniqueValue(bucket.tools, item?.tool)
    const errorMessage = normalizeId(item?.error?.message || item?.error)
    if (errorMessage) pushUniqueValue(bucket.errorMessages, errorMessage)
    return target
  }

  if (itemType === 'imageView') {
    const bucket = target.imageView
    if (phase === 'started') bucket.started = true
    if (phase === 'completed') bucket.completed = true
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    if (status) pushUniqueValue(bucket.statuses, status)
    pushUniqueValue(bucket.paths, item?.path)
    return target
  }

  if (itemType === 'imageGeneration') {
    const bucket = target.imageGeneration
    if (phase === 'started') bucket.started = true
    if (phase === 'completed') bucket.completed = true
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    if (status) pushUniqueValue(bucket.statuses, status)
    pushUniqueValue(bucket.revisedPrompts, trimPreview(item?.revisedPrompt))
    pushUniqueValue(bucket.savedPaths, item?.savedPath)
    if (String(item?.result || '').length > 0) bucket.resultAvailable = true
    return target
  }

  if (itemType === 'plan') {
    const bucket = target.plan
    if (phase === 'started') bucket.started = true
    if (phase === 'completed') bucket.completed = true
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    if (status) pushUniqueValue(bucket.statuses, status)
    bucket.text = syncAggregatedText(bucket.text, item?.text, null)
    return target
  }

  if (itemType === 'enteredReviewMode' || itemType === 'exitedReviewMode') {
    const bucket = target.reviewMode
    if (itemId) pushUniqueValue(bucket.itemIds, itemId)
    pushUniqueValue(bucket.itemTypes, itemType)
    pushUniqueValue(bucket.reviewIds, item?.review?.id || item?.reviewId)
    if (itemType === 'enteredReviewMode') bucket.entered = true
    if (itemType === 'exitedReviewMode') bucket.exited = true
  }
  return target
}

export function trackAccountNativeActivityDelta(state = null, {
  itemType = '',
  itemId = '',
  delta = '',
  params = null,
} = {}) {
  const target = state && typeof state === 'object' ? state : createAccountNativeActivityState()
  const normalizedItemType = normalizeId(itemType)
  const normalizedItemId = normalizeId(itemId)
  const text = String(delta || '')
  if (!normalizedItemType || !text) return target

  if (normalizedItemType === 'commandExecution') {
    const bucket = target.commandExecution
    bucket.started = true
    if (normalizedItemId) pushUniqueValue(bucket.itemIds, normalizedItemId)
    bucket.aggregatedOutput = syncAggregatedText(
      bucket.aggregatedOutput,
      `${bucket.aggregatedOutput || ''}${text}`,
      null,
    )
    return target
  }

  if (normalizedItemType === 'fileChange') {
    const bucket = target.fileChange
    bucket.started = true
    if (normalizedItemId) pushUniqueValue(bucket.itemIds, normalizedItemId)
    bucket.outputPreview = syncAggregatedText(
      bucket.outputPreview,
      `${bucket.outputPreview || ''}${text}`,
      null,
    )
    return target
  }

  if (normalizedItemType === 'plan') {
    const bucket = target.plan
    bucket.started = true
    if (normalizedItemId) pushUniqueValue(bucket.itemIds, normalizedItemId)
    bucket.text = syncAggregatedText(
      bucket.text,
      `${bucket.text || ''}${text}`,
      null,
    )
    return target
  }

  if (normalizedItemType === 'enteredReviewMode' || normalizedItemType === 'exitedReviewMode') {
    return trackAccountNativeActivityItem(target, {
      id: normalizedItemId,
      type: normalizedItemType,
      review: normalizeObject(params?.review),
    }, 'started')
  }

  return target
}

export function syncAggregatedText(currentValue = '', nextValue = '', emitChunk = null) {
  const current = String(currentValue || '')
  const next = String(nextValue || '')
  if (!next) return current
  if (next === current) return current
  if (next.startsWith(current)) {
    const delta = next.slice(current.length)
    if (delta && typeof emitChunk === 'function') emitChunk(delta)
    return next
  }
  return next
}
