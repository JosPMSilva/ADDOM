const ALLOWED_TOP_LEVEL_SECTIONS = new Set([
  'agents',
  'attachment_text_extraction',
  'command_safety',
  'continuity',
  'memory',
  'model_catalog',
  'providers',
  'runtime',
  'terminal',
])

const REJECTED_PATHS = new Set([
  'command_safety.allow_global_system_installs',
  'command_safety.allow_outside_workspace_mutation',
  'command_safety.allow_private_network_targets',
  'command_safety.allow_privileged_host_ops',
  'provider_auth_settings.openai.auth_method',
  'provider_terms_acknowledgements',
  'providers.openai.auth.auth_method',
  'providers.openai.runtime.auth_secret_ref',
  'providers.openai.runtime.remote_data_warning_acknowledged_at',
  'providers.openai.runtime.hosted_tool_config',
  'providers.openai.runtime.mcp_servers',
  'providers.moonshot.runtime.remote_tool_warning_acknowledged_at',
  'settings_security_audit',
])

const REJECTED_PREFIXES = [
  'credentials.',
  'destructive_actions.',
  'provider_terms_acknowledgements.',
  'secrets.',
  'settings_security_audit.',
  'vault.',
]

const OPENAI_HOSTED_TOOL_IDS = new Set([
  'apply_patch',
  'code_interpreter',
  'file_search',
  'image_generation',
  'mcp',
  'shell',
  'web_search',
])

const MOONSHOT_FORMULA_URI_PATTERN = /^moonshot\/[a-z0-9_.-]+(?::[a-z0-9_.-]+)?$/i

function spec(tomlPath, targetPath, type, options = {}) {
  return Object.freeze({ tomlPath, targetPath, type, ...options })
}

const ADVANCED_CONFIG_SPECS = Object.freeze([
  spec('runtime.live_execution_stream_enabled', 'liveExecutionStreamEnabled', 'boolean'),
  spec('runtime.per_thread_background_sessions', 'perThreadBackgroundSessions', 'boolean'),

  spec('memory.compression_enabled', 'memoryCompressionEnabled', 'boolean'),
  spec('memory.compression_threshold', 'memoryCompressionThreshold', 'integer', { min: 5, max: 500 }),
  spec('memory.compression_cooldown_ms', 'memoryCompressionCooldownMs', 'integer', { min: 10_000, max: 86_400_000 }),
  spec('memory.compression_max_per_hour', 'memoryCompressionMaxPerHour', 'integer', { min: 1, max: 50 }),
  spec('memory.compression_min_new_logs', 'memoryCompressionMinNewLogs', 'integer', { min: 1, max: 500 }),
  spec('memory.include_global_memory_in_context', 'includeGlobalMemoryInContext', 'boolean'),

  spec('terminal.scrollback', 'terminal.scrollback', 'integer', { min: 1_000, max: 50_000 }),
  spec('terminal.paste_confirmation_line_threshold', 'terminal.pasteConfirmationLineThreshold', 'integer', { min: 0, max: 500 }),

  spec('continuity.enabled', 'continuityPolicy.enabled', 'boolean'),
  spec('continuity.architecture', 'continuityPolicy.architecture', 'string', { enum: ['hybrid_tiered'] }),
  spec('continuity.default_scope', 'continuityPolicy.defaultScope', 'string', { enum: ['thread_project', 'thread_only', 'workspace'] }),
  spec('continuity.active_profile', 'continuityPolicy.activeProfile', 'string', { enum: ['economy', 'balanced', 'deep', 'custom'] }),
  spec('continuity.latency_p95_target_ms', 'continuityPolicy.latencyP95TargetMs', 'integer', { min: 50, max: 3_000 }),
  spec('continuity.max_continuity_packet_tokens', 'continuityPolicy.maxContinuityPacketTokens', 'integer', { min: 500, max: 64_000 }),
  spec('continuity.max_injected_facts', 'continuityPolicy.maxInjectedFacts', 'integer', { min: 2, max: 120 }),
  spec('continuity.drift_guard_enabled', 'continuityPolicy.driftGuardEnabled', 'boolean'),
  spec('continuity.invariant_checks_enabled', 'continuityPolicy.invariantChecksEnabled', 'boolean'),
  spec('continuity.contradiction_checks_enabled', 'continuityPolicy.contradictionChecksEnabled', 'boolean'),
  spec('continuity.provider_chain_compaction_enabled', 'continuityPolicy.providerChainCompactionEnabled', 'boolean'),
  spec('continuity.provider_truncation_enabled', 'continuityPolicy.providerTruncationEnabled', 'boolean'),
  spec('continuity.provider_compaction_allowlist', 'continuityPolicy.providerCompactionAllowlist', 'string_array', {
    values: ['anthropic', 'openai'],
    maxItems: 12,
  }),

  ...['economy', 'balanced', 'deep', 'custom'].flatMap((profile) => [
    spec(`continuity.profiles.${profile}.packet_tokens_ratio`, `continuityPolicy.profiles.${profile}.packetTokensRatio`, 'number', { min: 0.01, max: 0.8 }),
    spec(`continuity.profiles.${profile}.output_reserve_ratio`, `continuityPolicy.profiles.${profile}.outputReserveRatio`, 'number', { min: 0.01, max: 0.8 }),
    spec(`continuity.profiles.${profile}.tool_reserve_ratio`, `continuityPolicy.profiles.${profile}.toolReserveRatio`, 'number', { min: 0.01, max: 0.8 }),
    spec(`continuity.profiles.${profile}.max_injected_facts`, `continuityPolicy.profiles.${profile}.maxInjectedFacts`, 'integer', { min: 2, max: 80 }),
    spec(`continuity.profiles.${profile}.max_source_refs`, `continuityPolicy.profiles.${profile}.maxSourceRefs`, 'integer', { min: 2, max: 120 }),
    spec(`continuity.profiles.${profile}.inject_every_round`, `continuityPolicy.profiles.${profile}.injectEveryRound`, 'boolean'),
  ]),

  spec('command_safety.install_sandbox.enabled', 'commandSafety.installSandboxEnabled', 'boolean'),
  spec('command_safety.install_sandbox.ignore_scripts_first_pass', 'commandSafety.installSandboxIgnoreScriptsFirstPass', 'boolean'),
  spec('command_safety.install_sandbox.preferred_backend', 'commandSafety.preferredBackend', 'string', { enum: ['auto', 'docker', 'none', 'wsl'] }),
  spec('command_safety.install_sandbox.network_enforcement_mode', 'commandSafety.sandboxNetworkEnforcementMode', 'string', { enum: ['best_effort', 'strict'] }),
  spec('command_safety.install_sandbox.registry_allowlist', 'commandSafety.registryAllowlist', 'string_array', { maxItems: 50 }),
  spec('command_safety.install_sandbox.cache_dirs', 'commandSafety.cacheDirs', 'string_array', { maxItems: 20, preserveCase: true }),

  spec('providers.openai.runtime.transport_mode', 'providerRuntimeSettings.openai.transportMode', 'string', { enum: ['responses_auto', 'responses_stream', 'responses_websocket_experimental'] }),
  spec('providers.openai.runtime.delegation_backend_preference', 'providerRuntimeSettings.openai.delegationBackendPreference', 'string', { enum: ['addom_moa', 'auto', 'openai_native'] }),
  spec('providers.openai.runtime.native_collaboration_mode_id', 'providerRuntimeSettings.openai.nativeCollaborationModeId', 'string', { maxLength: 128 }),
  spec('providers.openai.runtime.websocket_fallback_to_stream', 'providerRuntimeSettings.openai.websocketFallbackToStream', 'boolean'),
  spec('providers.openai.runtime.websocket_warmup_enabled', 'providerRuntimeSettings.openai.websocketWarmupEnabled', 'boolean'),
  spec('providers.openai.runtime.reasoning_summary', 'providerRuntimeSettings.openai.reasoningSummary', 'string', { enum: ['auto', 'none'] }),
  spec('providers.openai.runtime.reasoning_effort', 'providerRuntimeSettings.openai.reasoningEffort', 'string', { enum: ['high', 'low', 'max', 'medium', 'minimal', 'none', 'provider_default', 'xhigh'] }),
  spec('providers.openai.runtime.text_verbosity', 'providerRuntimeSettings.openai.textVerbosity', 'string', { enum: ['high', 'low', 'medium', 'provider_default'] }),
  spec('providers.openai.runtime.service_tier', 'providerRuntimeSettings.openai.serviceTier', 'string', { enum: ['auto', 'default', 'flex', 'priority'] }),
  spec('providers.openai.runtime.prompt_caching_enabled', 'providerRuntimeSettings.openai.promptCachingEnabled', 'boolean'),
  spec('providers.openai.runtime.prompt_cache_retention', 'providerRuntimeSettings.openai.promptCacheRetention', 'string', { enum: ['24h', 'in_memory'] }),
  spec('providers.openai.runtime.use_previous_response_id', 'providerRuntimeSettings.openai.usePreviousResponseId', 'boolean'),
  spec('providers.openai.runtime.use_conversation_state', 'providerRuntimeSettings.openai.useConversationState', 'boolean'),
  spec('providers.openai.runtime.use_response_compaction', 'providerRuntimeSettings.openai.useResponseCompaction', 'boolean'),
  spec('providers.openai.runtime.use_server_side_compaction', 'providerRuntimeSettings.openai.useServerSideCompaction', 'boolean'),
  spec('providers.openai.runtime.server_side_compaction_threshold_tokens', 'providerRuntimeSettings.openai.serverSideCompactionThresholdTokens', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.openai.runtime.provider_truncation_soft_trigger_percent', 'providerRuntimeSettings.openai.providerTruncationSoftTriggerPercent', 'integer', { min: 10, max: 95 }),
  spec('providers.openai.runtime.default_max_output_tokens_override', 'providerRuntimeSettings.openai.defaultMaxOutputTokensOverride', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.openai.runtime.tool_result_budget_chars_override', 'providerRuntimeSettings.openai.toolResultBudgetCharsOverride', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.openai.runtime.old_tool_result_pruning_enabled', 'providerRuntimeSettings.openai.oldToolResultPruningEnabled', 'boolean'),
  spec('providers.openai.runtime.prompt_preflight_hard_guard_enabled', 'providerRuntimeSettings.openai.promptPreflightHardGuardEnabled', 'boolean'),
  spec('providers.openai.runtime.codex_auto_thread_compaction_enabled', 'providerRuntimeSettings.openai.codexAutoThreadCompactionEnabled', 'boolean'),
  spec('providers.openai.runtime.codex_auto_thread_compaction_token_limit', 'providerRuntimeSettings.openai.codexAutoThreadCompactionTokenLimit', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.openai.runtime.codex_auto_thread_compaction_instructions', 'providerRuntimeSettings.openai.codexAutoThreadCompactionInstructions', 'string', { maxLength: 4_000 }),
  spec('providers.openai.runtime.server_side_compaction_background_parity', 'providerRuntimeSettings.openai.serverSideCompactionBackgroundParity', 'boolean'),
  spec('providers.openai.runtime.allow_prompt_compaction_commands', 'providerRuntimeSettings.openai.allowPromptCompactionCommands', 'boolean'),
  spec('providers.openai.runtime.allow_prompt_compaction_threshold_override', 'providerRuntimeSettings.openai.allowPromptCompactionThresholdOverride', 'boolean'),
  spec('providers.openai.runtime.enable_background_mode', 'providerRuntimeSettings.openai.enableBackgroundMode', 'boolean'),
  spec('providers.openai.runtime.web_search_context_size', 'providerRuntimeSettings.openai.webSearchContextSize', 'string', { enum: ['high', 'low', 'medium'] }),
  spec('providers.openai.runtime.web_search_approximate_location_enabled', 'providerRuntimeSettings.openai.webSearchApproximateLocationEnabled', 'boolean'),
  spec('providers.openai.runtime.auto_create_project_vector_store', 'providerRuntimeSettings.openai.autoCreateProjectVectorStore', 'boolean'),
  spec('providers.openai.runtime.auto_attach_project_vector_store', 'providerRuntimeSettings.openai.autoAttachProjectVectorStore', 'boolean'),
  spec('providers.openai.runtime.file_search_max_num_results', 'providerRuntimeSettings.openai.fileSearchMaxNumResults', 'integer', { min: 1, max: 50 }),
  spec('providers.openai.runtime.image_generation_output_format', 'providerRuntimeSettings.openai.imageGenerationOutputFormat', 'string', { enum: ['jpeg', 'png', 'webp'] }),
  spec('providers.openai.runtime.image_generation_quality', 'providerRuntimeSettings.openai.imageGenerationQuality', 'string', { enum: ['auto', 'high', 'low', 'medium'] }),
  spec('providers.openai.hosted_tools.enabled', 'providerRuntimeSettings.openai.hostedToolsEnabled', 'boolean'),
  spec('providers.openai.hosted_tools.enabled_tools', 'providerRuntimeSettings.openai.enabledHostedTools', 'string_array', { values: OPENAI_HOSTED_TOOL_IDS, maxItems: 16 }),

  spec('providers.anthropic.runtime.thinking_type', 'providerRuntimeSettings.anthropic.thinkingType', 'string', { enum: ['disabled', 'enabled', 'provider_default'] }),
  spec('providers.anthropic.runtime.reasoning_effort', 'providerRuntimeSettings.anthropic.reasoningEffort', 'string', { enum: ['high', 'low', 'max', 'medium', 'provider_default'] }),
  spec('providers.anthropic.runtime.use_context_management_compaction', 'providerRuntimeSettings.anthropic.useContextManagementCompaction', 'boolean'),
  spec('providers.anthropic.runtime.context_management_compaction_threshold_tokens', 'providerRuntimeSettings.anthropic.contextManagementCompactionThresholdTokens', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.anthropic.runtime.provider_truncation_soft_trigger_percent', 'providerRuntimeSettings.anthropic.providerTruncationSoftTriggerPercent', 'integer', { min: 10, max: 95 }),
  spec('providers.anthropic.runtime.default_max_output_tokens_override', 'providerRuntimeSettings.anthropic.defaultMaxOutputTokensOverride', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.anthropic.runtime.tool_result_budget_chars_override', 'providerRuntimeSettings.anthropic.toolResultBudgetCharsOverride', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.anthropic.runtime.old_tool_result_pruning_enabled', 'providerRuntimeSettings.anthropic.oldToolResultPruningEnabled', 'boolean'),
  spec('providers.anthropic.runtime.prompt_preflight_hard_guard_enabled', 'providerRuntimeSettings.anthropic.promptPreflightHardGuardEnabled', 'boolean'),
  spec('providers.anthropic.runtime.context_management_compaction_instructions', 'providerRuntimeSettings.anthropic.contextManagementCompactionInstructions', 'string', { maxLength: 4_000 }),

  spec('providers.moonshot.runtime.remote_tools_enabled', 'providerRuntimeSettings.moonshot.remoteToolsEnabled', 'boolean'),
  spec('providers.moonshot.runtime.enabled_formula_uris', 'providerRuntimeSettings.moonshot.enabledFormulaUris', 'string_array', { pattern: MOONSHOT_FORMULA_URI_PATTERN, maxItems: 32 }),
  spec('providers.moonshot.runtime.default_max_output_tokens_override', 'providerRuntimeSettings.moonshot.defaultMaxOutputTokensOverride', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.moonshot.runtime.tool_result_budget_chars_override', 'providerRuntimeSettings.moonshot.toolResultBudgetCharsOverride', 'integer', { min: 0, max: 2_000_000 }),
  spec('providers.moonshot.runtime.old_tool_result_pruning_enabled', 'providerRuntimeSettings.moonshot.oldToolResultPruningEnabled', 'boolean'),
  spec('providers.moonshot.runtime.prompt_preflight_hard_guard_enabled', 'providerRuntimeSettings.moonshot.promptPreflightHardGuardEnabled', 'boolean'),

  spec('attachment_text_extraction.enabled', 'attachmentTextExtraction.enabled', 'boolean'),
  spec('attachment_text_extraction.max_chars_per_attachment', 'attachmentTextExtraction.maxCharsPerAttachment', 'integer', { min: 500, max: 200_000 }),
  spec('attachment_text_extraction.max_chars_per_turn', 'attachmentTextExtraction.maxCharsPerTurn', 'integer', { min: 2_000, max: 500_000 }),
  spec('attachment_text_extraction.max_attachments_per_turn', 'attachmentTextExtraction.maxAttachmentsPerTurn', 'integer', { min: 1, max: 16 }),
  spec('attachment_text_extraction.timeout_ms', 'attachmentTextExtraction.timeoutMs', 'integer', { min: 2_000, max: 120_000 }),

  spec('model_catalog.openrouter.default_visible', 'modelCatalogVisibility.openrouter.defaultVisible', 'boolean'),
  spec('model_catalog.openrouter.filters.reviewed_only', 'modelCatalogVisibility.openrouter.filters.reviewedOnly', 'boolean'),
  spec('model_catalog.openrouter.filters.tools_only', 'modelCatalogVisibility.openrouter.filters.toolsOnly', 'boolean'),
  spec('model_catalog.openrouter.filters.reasoning_only', 'modelCatalogVisibility.openrouter.filters.reasoningOnly', 'boolean'),
  spec('model_catalog.openrouter.filters.vision_only', 'modelCatalogVisibility.openrouter.filters.visionOnly', 'boolean'),

  spec('agents.enabled', 'agentSettings.enabled', 'boolean'),
  spec('agents.default_profile', 'agentSettings.defaultProfile', 'string', {
    enum: ['conservative', 'balanced', 'high', 'ultra'],
  }),
  spec('agents.fanout_confirmation_threshold', 'agentSettings.fanoutConfirmationThreshold', 'integer', { min: 1, max: 512 }),
  spec('agents.max_live_agents', 'agentSettings.limits.maxLiveAgents', 'integer', { min: 1, max: 64 }),
  spec('agents.max_depth', 'agentSettings.limits.maxDepth', 'integer', { min: 1, max: 8 }),
  spec('agents.max_descendants', 'agentSettings.limits.maxDescendants', 'integer', { min: 1, max: 512 }),
  spec('agents.max_total_tokens', 'agentSettings.limits.maxTotalTokens', 'integer', { min: 1, max: 2_000_000 }),
  spec('agents.max_cost_usd', 'agentSettings.limits.maxCostUsd', 'number', { min: 0, max: 1_000 }),
  spec('agents.max_duration_ms', 'agentSettings.limits.maxDurationMs', 'integer', { min: 1, max: 14_400_000 }),
  spec('agents.custom_pipelines_enabled', 'customPipelinesEnabled', 'boolean'),
])

const SPEC_BY_TOML_PATH = new Map(ADVANCED_CONFIG_SPECS.map((entry) => [entry.tomlPath, entry]))
const ALLOWED_SECTION_PATHS = new Set()
for (const entry of ADVANCED_CONFIG_SPECS) {
  const segments = entry.tomlPath.split('.')
  for (let index = 1; index < segments.length; index += 1) {
    ALLOWED_SECTION_PATHS.add(segments.slice(0, index).join('.'))
  }
}
for (const path of REJECTED_PATHS) {
  const segments = path.split('.')
  for (let index = 1; index < segments.length; index += 1) {
    ALLOWED_SECTION_PATHS.add(segments.slice(0, index).join('.'))
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function setDottedValue(target, dottedPath, value) {
  const segments = String(dottedPath || '').split('.').filter(Boolean)
  let current = target
  for (let index = 0; index < segments.length; index += 1) {
    const key = segments[index]
    if (index === segments.length - 1) {
      current[key] = value
    } else {
      if (!isPlainObject(current[key])) current[key] = {}
      current = current[key]
    }
  }
}

function pushError(errors, path, code, message) {
  errors.push({ path, code, message })
}

function isRejectedPath(path) {
  return REJECTED_PATHS.has(path) || REJECTED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))
}

function validateScalarValue(value, entry, errors) {
  if (entry.type === 'boolean') {
    if (typeof value !== 'boolean') {
      pushError(errors, entry.tomlPath, 'invalid_type', 'Expected a boolean.')
      return undefined
    }
    return value
  }
  if (entry.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      pushError(errors, entry.tomlPath, 'invalid_type', 'Expected an integer.')
      return undefined
    }
    if (value < entry.min || value > entry.max) {
      pushError(errors, entry.tomlPath, 'out_of_range', `Expected an integer from ${entry.min} to ${entry.max}.`)
      return undefined
    }
    return value
  }
  if (entry.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      pushError(errors, entry.tomlPath, 'invalid_type', 'Expected a number.')
      return undefined
    }
    if (value < entry.min || value > entry.max) {
      pushError(errors, entry.tomlPath, 'out_of_range', `Expected a number from ${entry.min} to ${entry.max}.`)
      return undefined
    }
    return value
  }
  if (entry.type === 'string') {
    if (typeof value !== 'string') {
      pushError(errors, entry.tomlPath, 'invalid_type', 'Expected a string.')
      return undefined
    }
    const normalized = value.trim()
    if (entry.enum && !entry.enum.includes(normalized)) {
      pushError(errors, entry.tomlPath, 'invalid_enum', `Expected one of: ${entry.enum.join(', ')}.`)
      return undefined
    }
    if (entry.maxLength && normalized.length > entry.maxLength) {
      pushError(errors, entry.tomlPath, 'out_of_range', `Expected a string with at most ${entry.maxLength} characters.`)
      return undefined
    }
    return normalized
  }
  if (entry.type === 'string_array') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      pushError(errors, entry.tomlPath, 'invalid_type', 'Expected an array of strings.')
      return undefined
    }
    if (value.length > entry.maxItems) {
      pushError(errors, entry.tomlPath, 'out_of_range', `Expected at most ${entry.maxItems} items.`)
      return undefined
    }
    const out = []
    const seen = new Set()
    for (const item of value) {
      const normalized = item.trim()
      const comparable = normalized.toLowerCase()
      if (!normalized || seen.has(comparable)) continue
      if (entry.values && !entry.values.has?.(comparable) && !entry.values.includes?.(comparable)) {
        pushError(errors, entry.tomlPath, 'invalid_enum', 'Unexpected array item.')
        return undefined
      }
      if (entry.pattern && !entry.pattern.test(normalized)) {
        pushError(errors, entry.tomlPath, 'invalid_format', 'Unexpected array item format.')
        return undefined
      }
      seen.add(comparable)
      out.push(entry.preserveCase ? normalized : comparable)
    }
    return out
  }
  pushError(errors, entry.tomlPath, 'invalid_schema', 'Unsupported schema type.')
  return undefined
}

function walkTomlLeaves(source, visitor, prefix = []) {
  if (!isPlainObject(source)) return
  for (const [key, value] of Object.entries(source)) {
    const path = [...prefix, key]
    if (isPlainObject(value)) {
      walkTomlLeaves(value, visitor, path)
    } else {
      visitor(path.join('.'), value)
    }
  }
}

function validateSections(source, errors, prefix = []) {
  if (!isPlainObject(source)) return
  for (const [key, value] of Object.entries(source)) {
    const path = [...prefix, key].join('.')
    if (prefix.length === 0 && !ALLOWED_TOP_LEVEL_SECTIONS.has(key)) {
      pushError(errors, path, 'unknown_section', `Unknown advanced config section "${key}".`)
      continue
    }
    if (isPlainObject(value)) {
      if (!ALLOWED_SECTION_PATHS.has(path) && !SPEC_BY_TOML_PATH.has(path) && !isRejectedPath(path)) {
        pushError(errors, path, 'unknown_section', `Unknown advanced config section "${path}".`)
        continue
      }
      validateSections(value, errors, [...prefix, key])
    }
  }
}

export function validateAdvancedConfigTomlObject(parsed) {
  const source = isPlainObject(parsed) ? parsed : {}
  const errors = []
  const overlay = {}
  const seenTargets = new Set()

  validateSections(source, errors)

  walkTomlLeaves(source, (tomlPath, value) => {
    if (isRejectedPath(tomlPath)) {
      pushError(errors, tomlPath, 'rejected_key', 'This key is intentionally not allowed in advanced.toml.')
      return
    }
    const entry = SPEC_BY_TOML_PATH.get(tomlPath)
    if (!entry) {
      pushError(errors, tomlPath, 'unknown_key', `Unknown advanced config key "${tomlPath}".`)
      return
    }
    if (seenTargets.has(entry.targetPath)) {
      pushError(errors, tomlPath, 'duplicate_mapping', `Duplicate mapping for "${entry.targetPath}".`)
      return
    }
    const normalized = validateScalarValue(value, entry, errors)
    if (normalized === undefined) return
    seenTargets.add(entry.targetPath)
    setDottedValue(overlay, entry.targetPath, normalized)
  })

  return {
    ok: errors.length === 0,
    overlay: errors.length === 0 ? overlay : {},
    errors,
  }
}

export function listAdvancedConfigTomlPaths() {
  return ADVANCED_CONFIG_SPECS.map((entry) => entry.tomlPath)
}
