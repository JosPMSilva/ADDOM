const APP_VERSION_ARG_PREFIX = '--addom-app-version='
const INITIAL_APPEARANCE_ARG_PREFIX = '--addom-initial-appearance='

function readVersionFromProcessArgs() {
  const argv = Array.isArray(process?.argv) ? process.argv : []
  for (const entry of argv) {
    const value = String(entry || '')
    if (!value.startsWith(APP_VERSION_ARG_PREFIX)) continue
    const version = value.slice(APP_VERSION_ARG_PREFIX.length).trim()
    if (version) return version
  }
  return ''
}

function resolveAppVersion() {
  const envVersion = String(process?.env?.npm_package_version || '').trim()
  if (envVersion) return envVersion
  const argvVersion = readVersionFromProcessArgs()
  if (argvVersion) return argvVersion
  return '0.1.0-alpha'
}

function resolveInitialAppearance() {
  const argv = Array.isArray(process?.argv) ? process.argv : []
  for (const entry of argv) {
    const value = String(entry || '')
    if (!value.startsWith(INITIAL_APPEARANCE_ARG_PREFIX)) continue
    const appearance = value.slice(INITIAL_APPEARANCE_ARG_PREFIX.length).trim().toLowerCase()
    if (appearance === 'light' || appearance === 'dark') return appearance
  }
  return 'dark'
}

function asTrimmedString(value) {
  return String(value ?? '').trim()
}

function asString(value) {
  return String(value ?? '')
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function notifyRendererOption(options = {}) {
  return asPlainObject(options).notifyRenderer === false ? { notifyRenderer: false } : {}
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function asBoolean(value) {
  return value === true
}

function asOptionalRoundedNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n)
}

function asOptionalNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return n
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean)
}

function normalizeMemoryListPayload(projectOrPayload, opts = {}) {
  const source = isPlainObject(projectOrPayload)
    ? asPlainObject(projectOrPayload)
    : { ...asPlainObject(opts), project: projectOrPayload }
  const nextPayload = {
    project: asTrimmedString(source.project),
    includeCompressed: asBoolean(source.includeCompressed),
    includeDeletedThreads: asBoolean(source.includeDeletedThreads),
    includeGlobal: asBoolean(source.includeGlobal),
    globalOnly: asBoolean(source.globalOnly),
    scope: asTrimmedString(source.scope || source.scopeFilter).toLowerCase(),
    threadId: asTrimmedString(source.threadId),
  }
  if (hasOwn(source, 'includeProject')) nextPayload.includeProject = asBoolean(source.includeProject)
  return nextPayload
}

function normalizeMemorySearchPayload(projectOrPayload, queryOrPayload, opts = {}) {
  const source = isPlainObject(projectOrPayload)
    ? asPlainObject(projectOrPayload)
    : { ...asPlainObject(opts), project: projectOrPayload, query: queryOrPayload }
  const nextPayload = {
    project: asTrimmedString(source.project),
    query: asString(source.query),
    topK: asOptionalRoundedNumber(source.topK),
    threshold: asOptionalNumber(source.threshold),
    includeCompressed: asBoolean(source.includeCompressed),
    includeDeletedThreads: asBoolean(source.includeDeletedThreads),
    includeGlobal: asBoolean(source.includeGlobal),
    scope: asTrimmedString(source.scope || source.scopeFilter).toLowerCase(),
    threadId: asTrimmedString(source.threadId),
  }
  if (hasOwn(source, 'includeProject')) nextPayload.includeProject = asBoolean(source.includeProject)
  return nextPayload
}

function normalizeMemoryScopeMutationPayload(idOrPayload, options = {}) {
  const source = isPlainObject(idOrPayload)
    ? asPlainObject(idOrPayload)
    : { ...asPlainObject(options), id: idOrPayload }
  const nextPayload = {
    id: asTrimmedString(source.id),
  }
  if (hasOwn(source, 'targetScope')) nextPayload.targetScope = asTrimmedString(source.targetScope).toLowerCase()
  if (hasOwn(source, 'project')) nextPayload.project = asTrimmedString(source.project)
  if (hasOwn(source, 'threadId')) nextPayload.threadId = asTrimmedString(source.threadId)
  if (hasOwn(source, 'originThreadId')) nextPayload.originThreadId = asTrimmedString(source.originThreadId)
  if (hasOwn(source, 'supersededBy')) nextPayload.supersededBy = asTrimmedString(source.supersededBy)
  return nextPayload
}

function sanitizeOpenAIAssetPayload(value) {
  const source = asPlainObject(value)
  const sanitized = { ...source }
  delete sanitized.apiKey
  return sanitized
}

function normalizeChatTurnOptions(value) {
  const source = asPlainObject(value)
  const openai = asPlainObject(source.openai)
  const anthropic = asPlainObject(source.anthropic)
  const command = asPlainObject(source.command)
  const nextOpenAI = {}
  const nextAnthropic = {}
  const nextCommand = {}
  const requiredAgentDelegation = normalizeRequiredAgentDelegation(source.requiredAgentDelegation)
  const processingMode = asTrimmedString(source.processingMode).toLowerCase()
  const planAction = normalizePlanAction(source.planAction)

  if (openai.forceManualCompaction === true) nextOpenAI.forceManualCompaction = true
  if (openai.forceServerSideCompaction === true) nextOpenAI.forceServerSideCompaction = true
  if (openai.commandOnly === true) nextOpenAI.commandOnly = true

  const thresholdTokens = asOptionalRoundedNumber(openai.serverSideCompactionThresholdTokens)
  if (Number.isFinite(thresholdTokens) && thresholdTokens > 0) {
    nextOpenAI.serverSideCompactionThresholdTokens = thresholdTokens
  }

  if (anthropic.forceContextManagementCompaction === true) nextAnthropic.forceContextManagementCompaction = true

  const anthropicThresholdTokens = asOptionalRoundedNumber(anthropic.contextManagementCompactionThresholdTokens)
  if (Number.isFinite(anthropicThresholdTokens) && anthropicThresholdTokens > 0) {
    nextAnthropic.contextManagementCompactionThresholdTokens = anthropicThresholdTokens
  }

  const anthropicInstructions = asTrimmedString(anthropic.contextManagementCompactionInstructions)
  if (anthropicInstructions) {
    nextAnthropic.contextManagementCompactionInstructions = anthropicInstructions.slice(0, 4000)
  }

  if (command.disableTools === true) nextCommand.disableTools = true

  const nextTurnOptions = {}
  if (processingMode === 'standard' || processingMode === 'fast') {
    nextTurnOptions.processingMode = processingMode
  }
  if (Object.keys(nextOpenAI).length > 0) nextTurnOptions.openai = nextOpenAI
  if (Object.keys(nextAnthropic).length > 0) nextTurnOptions.anthropic = nextAnthropic
  if (Object.keys(nextCommand).length > 0) nextTurnOptions.command = nextCommand
  if (requiredAgentDelegation) nextTurnOptions.requiredAgentDelegation = requiredAgentDelegation
  if (planAction) nextTurnOptions.planAction = planAction
  return nextTurnOptions
}

function normalizePlanAction(value) {
  const source = asPlainObject(value)
  const kind = asTrimmedString(source.kind).toLowerCase()
  if (kind !== 'synthesize_direction' && kind !== 'draft_plan' && kind !== 'revise_plan') return null
  const planId = asTrimmedString(source.planId).slice(0, 128)
  const requestId = asTrimmedString(source.requestId).slice(0, 160)
  const expectedRevision = Number(source.expectedRevision)
  const expectedDirectionRevision = Number(source.expectedDirectionRevision)
  const expectedAnswerRevision = Number(source.expectedAnswerRevision)
  if (!planId || !Number.isInteger(expectedRevision) || !Number.isInteger(expectedDirectionRevision)) return null
  if (kind === 'synthesize_direction' && (!requestId || !Number.isInteger(expectedAnswerRevision))) return null
  if (kind === 'revise_plan' && !requestId) return null
  return {
    kind,
    planId,
    ...(requestId ? { requestId } : {}),
    expectedRevision,
    expectedDirectionRevision,
    ...(Number.isInteger(expectedAnswerRevision) ? { expectedAnswerRevision } : {}),
  }
}

function normalizeRequiredAgentDelegation(value) {
  const source = asPlainObject(value)
  const route = asTrimmedString(source.route).toLowerCase()
  const normalizedRoute = route === 'orchestrated_single' || route === 'orchestrated_fanout'
    ? route
    : ''
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.slice(0, 100).map((task, index) => {
      const row = asPlainObject(task)
      const instruction = asTrimmedString(row.instruction).slice(0, 12_000)
      const agentRoleId = asTrimmedString(row.agentRoleId).slice(0, 160)
      const agentRole = asTrimmedString(row.agentRole).slice(0, 240)
      if (!instruction || (!agentRoleId && !agentRole)) return null
      return {
        task_id: (asTrimmedString(row.task_id) || `task_${index + 1}`).slice(0, 160),
        agentRoleId,
        agentRole,
        instruction,
        injected_context: (
          asTrimmedString(row.injected_context)
          || 'User-selected agent task. Inspect the current project with the available read/search tools.'
        ).slice(0, 4_000),
        expected_output_format: (
          asTrimmedString(row.expected_output_format)
          || 'Return a concise, actionable result in natural Markdown with file references when relevant.'
        ).slice(0, 1_000),
      }
    }).filter(Boolean)
    : []
  if (tasks.length === 0) return null
  return {
    route: normalizedRoute || (tasks.length === 1 ? 'orchestrated_single' : 'orchestrated_fanout'),
    tasks,
  }
}

function requireNonEmptyString(value, label = 'value') {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`)
  }
  const normalized = value.trim()
  if (!normalized) {
    throw new TypeError(`${label} is required`)
  }
  return normalized
}

function normalizeHttpUrl(value) {
  const raw = requireNonEmptyString(value, 'url')
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new TypeError('url must be a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('url must use http or https')
  }
  return parsed.toString()
}

module.exports = {
  readVersionFromProcessArgs,
  resolveAppVersion,
  resolveInitialAppearance,
  asTrimmedString,
  asString,
  asPlainObject,
  notifyRendererOption,
  hasOwn,
  isPlainObject,
  asBoolean,
  asOptionalRoundedNumber,
  asOptionalNumber,
  asStringArray,
  normalizeMemoryListPayload,
  normalizeMemorySearchPayload,
  normalizeMemoryScopeMutationPayload,
  sanitizeOpenAIAssetPayload,
  normalizeChatTurnOptions,
  requireNonEmptyString,
  normalizeHttpUrl,
}
