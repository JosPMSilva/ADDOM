import { hasVisibleDelegationTool } from './delegation-tool-surface.mjs'
import {
  buildRecentTerminalSessionInsights,
  buildRecentExecutionBriefContextFromFacts,
  summarizeToolContextFacts,
} from './tool-context-facts.mjs'

const START_MARKER = '[ADDOM EXECUTION BRIEF]'
const END_MARKER = '[ADDOM EXECUTION BRIEF END]'

const EXECUTE_TOOL_ORDER = [
  'read_file',
  'view_file_range',
  'grep_file',
  'search_code',
  'find_files',
  'list_directory',
  'write_file',
  'edit_file',
  'delete_file',
  'rename_file',
  'create_directory',
  'rollback_file',
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  'git_checkout_file',
  'fetch_page',
  'browser_action',
  'run_command',
  'terminal_session_list',
  'terminal_session_open',
  'terminal_session_read_snapshot',
  'terminal_session_wait_for_output',
  'terminal_session_attach',
  'terminal_session_write',
  'terminal_session_resize',
  'terminal_session_signal',
  'terminal_session_close',
  'list_curated_skills',
  'install_curated_skill',
  'terminal_memory_suggest',
  'agent_catalog',
  'delegate_tasks',
  'apply_artifact_revision',
]

const FILE_CONTEXT_TOOL_NAMES = new Set([
  'read_file',
  'view_file_range',
  'write_file',
  'edit_file',
  'apply_patch',
  'rename_file',
  'delete_file',
])

const FILE_WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'apply_patch',
  'rename_file',
  'delete_file',
  'create_directory',
  'rollback_file',
  'apply_artifact_revision',
])

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeMode(mode) {
  if (mode === 'plan') return 'plan'
  if (mode === 'thinking') return 'thinking'
  return 'execute'
}

function formatToolCallingStatus(modelSupportsTools = true, modelCapabilities = null) {
  const source = String(modelCapabilities?.source || '').trim()
  const mode = String(modelCapabilities?.toolSupportMode || '').trim().toLowerCase()
  const supportsAnyToolSurface = modelCapabilities?.supportsAnyToolSurface === true
  if (modelSupportsTools !== false) {
    if (mode && mode !== 'local_tool_calls' && mode !== 'unknown') {
      return source ? `available (${mode}; ${source})` : `available (${mode})`
    }
    return 'available'
  }
  if (mode === 'provider_owned_runtime_only') {
    return source
      ? `provider-owned runtime only (${source})`
      : 'provider-owned runtime only'
  }
  if (supportsAnyToolSurface) {
    return source
      ? `non-local tool surface only (${source})`
      : 'non-local tool surface only'
  }
  return source ? `unavailable (${source})` : 'unavailable'
}

function orderedEnabledToolNames(activeTools = {}) {
  const source = activeTools && typeof activeTools === 'object' ? activeTools : {}
  const names = Object.keys(source).filter(Boolean)
  if (names.length === 0) return []
  const priority = new Map(EXECUTE_TOOL_ORDER.map((name, index) => [name, index]))
  return names.sort((left, right) => {
    const leftRank = priority.has(left) ? priority.get(left) : Number.MAX_SAFE_INTEGER
    const rightRank = priority.has(right) ? priority.get(right) : Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.localeCompare(right)
  })
}

function normalizeContentParts(message = {}) {
  if (Array.isArray(message?.content)) return message.content
  if (typeof message?.content === 'string' && message.content) {
    return [{ type: 'text', text: message.content }]
  }
  return []
}

function extractPathFromToolCall(part = {}) {
  const input = part?.input && typeof part.input === 'object' ? part.input : {}
  const candidate = String(
    input.path
    || input.old_path
    || input.new_path
    || input.target_path
    || input.file_path
    || '',
  ).trim()
  return candidate
}

function summarizeRecentContext(recentContext = null) {
  if (!recentContext || typeof recentContext !== 'object') return 'none'
  const segments = []
  const lastFilePath = String(recentContext.lastFilePath || '').trim()
  if (lastFilePath) segments.push(`last file=${lastFilePath}`)
  const lastFailedToolName = String(recentContext.lastFailedToolName || '').trim()
  if (lastFailedToolName) {
    const lastFailureClass = String(recentContext.lastFailureClass || '').trim()
    segments.push(lastFailureClass
      ? `recent failure=${lastFailedToolName} (${lastFailureClass})`
      : `recent failure=${lastFailedToolName}`)
  }
  const lastToolFamily = String(recentContext.lastToolFamily || '').trim()
  if (lastToolFamily && !segments.some((row) => row.startsWith('recent failure='))) {
    segments.push(`recent tool family=${lastToolFamily}`)
  }
  const lastTerminalSessionId = String(recentContext.lastTerminalSessionId || '').trim()
  if (lastTerminalSessionId) {
    const lastTerminalAction = String(recentContext.lastTerminalAction || '').trim()
    const lastTerminalCommand = String(recentContext.lastTerminalCommand || '').trim()
    const terminalSummary = [
      `recent terminal=${lastTerminalSessionId}`,
      lastTerminalAction ? `action=${lastTerminalAction}` : '',
      lastTerminalCommand ? `command=${lastTerminalCommand}` : '',
    ].filter(Boolean).join(' ')
    segments.push(terminalSummary)
  }
  return segments.length > 0 ? segments.join('; ') : 'none'
}

function summarizeRecentFactContext(toolContextFacts = []) {
  const summaries = summarizeToolContextFacts(toolContextFacts, { maxItems: 4 })
  return summaries.length > 0 ? summaries.join('; ') : 'none'
}

function summarizeVisibleTerminalSessions(visibleTerminalSessions = []) {
  const rows = Array.isArray(visibleTerminalSessions) ? visibleTerminalSessions : []
  if (rows.length <= 0) return 'none'
  return rows
    .slice(0, 6)
    .map((session) => {
      const sessionId = String(session?.sessionId || '').trim()
      if (!sessionId) return ''
      const cwd = String(session?.cwd || '').trim()
      const shell = String(session?.shell || session?.shellKind || '').trim()
      const owner = String(session?.owner || session?.controlOwner || '').trim()
      const focusedSurface = String(session?.focusedSurface || '').trim()
      const access = String(session?.access || '').trim()
      const suggestedUse = String(session?.suggestedUse || '').trim()
      const outputSequence = Number(session?.outputSequence || 0) || 0
      const details = [
        cwd ? `cwd=${cwd}` : '',
        shell ? `shell=${shell}` : '',
        owner ? `owner=${owner}` : '',
        focusedSurface ? `surface=${focusedSurface}` : '',
        access ? `access=${access}` : '',
        outputSequence > 0 ? `next=${outputSequence}` : '',
        suggestedUse ? `use=${suggestedUse}` : '',
      ].filter(Boolean).join(', ')
      return details ? `${sessionId} (${details})` : sessionId
    })
    .filter(Boolean)
    .join('; ')
}

function summarizeRecentTerminalInsights(terminalInsights = {}) {
  const recentSessionId = String(terminalInsights?.recentSessionId || '').trim()
  if (!recentSessionId) return 'none'
  const parts = [recentSessionId]
  const recentAction = String(terminalInsights?.recentAction || '').trim()
  const recentCommandPreview = String(terminalInsights?.recentCommandPreview || '').trim()
  const recentOutputSequence = Number(terminalInsights?.recentOutputSequence || 0) || 0
  const reusableSessionId = String(terminalInsights?.reusableSessionId || '').trim()
  const loopRisk = String(terminalInsights?.loopRisk || '').trim()
  if (recentAction) parts.push(`action=${recentAction}`)
  if (recentCommandPreview) parts.push(`command=${recentCommandPreview}`)
  if (recentOutputSequence > 0) parts.push(`next=${recentOutputSequence}`)
  if (reusableSessionId) parts.push(`reusable=${reusableSessionId}`)
  if (loopRisk) parts.push(`loop_risk=${loopRisk}`)
  return parts.join(', ')
}

function inferWriteStrategy(activeTools = {}, recentContext = null) {
  const names = new Set(orderedEnabledToolNames(activeTools))
  const hasWriteFile = names.has('write_file')
  const hasEditFile = names.has('edit_file')
  const hasApplyPatch = names.has('apply_patch')
  const lastFailedToolName = normalizeLower(recentContext?.lastFailedToolName)
  const lastFailureClass = normalizeLower(recentContext?.lastFailureClass)
  if (![...names].some((name) => FILE_WRITE_TOOL_NAMES.has(name))) return 'read_only'
  if (lastFailedToolName === 'apply_patch' || lastFailureClass === 'malformed_patch_syntax') {
    return hasEditFile ? 'prefer_edit_file_or_write_file' : 'prefer_write_file'
  }
  if (hasEditFile && hasApplyPatch) return 'edit_file_or_apply_patch_preferred'
  if (hasApplyPatch) return 'apply_patch_preferred'
  if (hasEditFile) return 'edit_file_preferred'
  if (hasWriteFile) return 'full_rewrite_preferred'
  return 'mixed_file_mutation'
}

function inferShellTarget(toolSurfaceKind = '', activeTools = {}) {
  if (!Object.prototype.hasOwnProperty.call(activeTools || {}, 'run_command')) return 'not_available'
  const normalizedToolSurfaceKind = normalizeLower(toolSurfaceKind)
  if (!normalizedToolSurfaceKind || normalizedToolSurfaceKind === 'none') return 'workspace_shell'
  if (normalizedToolSurfaceKind === 'addom_native') return 'addom_native'
  return normalizedToolSurfaceKind
}

function buildApprovalOutlook(permissionMode = 'ask', activeTools = {}) {
  const normalizedPermissionMode = normalizeLower(permissionMode) || 'ask'
  const hasRunCommand = Object.prototype.hasOwnProperty.call(activeTools || {}, 'run_command')
  if (normalizedPermissionMode === 'full_access') {
    return hasRunCommand
      ? 'file tools direct; shell commands run directly when policy allows'
      : 'file and browser tools run directly when selected'
  }
  if (normalizedPermissionMode === 'autonomy') {
    return hasRunCommand
      ? 'file tools direct; shell commands may still elevate or be blocked by policy'
      : 'safe tool calls can proceed without interactive approval'
  }
  return hasRunCommand
    ? 'safe tool calls can proceed; shell and install-like commands may require approval'
    : 'safe tool calls can proceed; sensitive operations may require approval'
}

function buildVisibleToolFamilyMode(activeTools = {}) {
  const names = new Set(orderedEnabledToolNames(activeTools))
  const families = []
  const hasFileRead = ['read_file', 'view_file_range', 'grep_file', 'search_code', 'find_files', 'list_directory']
    .some((name) => names.has(name))
  const hasFileWrite = [...FILE_WRITE_TOOL_NAMES].some((name) => names.has(name))
  if (hasFileRead || hasFileWrite) {
    families.push(hasFileWrite ? 'files(read/write)' : 'files(read-only)')
  }
  if (names.has('run_command')) families.push('shell')
  if (names.has('fetch_page') || names.has('browser_action')) {
    families.push(
      names.has('fetch_page') && names.has('browser_action')
        ? 'web(fetch+browser)'
        : (names.has('browser_action') ? 'web(browser)' : 'web(fetch)')
    )
  }
  if (names.has('list_curated_skills') || names.has('install_curated_skill')) families.push('skills')
  if (hasVisibleDelegationTool(activeTools)) families.push('delegation')
  if (families.length === 0) return 'none'
  return families.join(', ')
}

function formatEnabledToolsLine(activeTools = {}) {
  const enabled = orderedEnabledToolNames(activeTools)
  return enabled.length > 0 ? enabled.join(', ') : 'none'
}

function formatCapabilityCatalogLine(activeTools = {}) {
  const tools = activeTools && typeof activeTools === 'object' ? activeTools : {}
  const canReadCatalog = Object.prototype.hasOwnProperty.call(tools, 'read_file')
  const canSearchCatalog = Object.prototype.hasOwnProperty.call(tools, 'search_code')
  if (!canReadCatalog && !canSearchCatalog) return 'unavailable'
  const actions = [
    canReadCatalog ? 'read addom://capabilities/index.md' : '',
    canSearchCatalog ? 'search addom://capabilities' : '',
  ].filter(Boolean).join(' or ')
  return `${actions} before assuming a hidden capability is unavailable`
}

function buildZeroToolResponseOnlyBrief() {
  return [
    START_MARKER,
    'This block is authoritative for this turn.',
    'Mode: execute',
    'Execution state: response_only',
    'Turn rules:',
    '- Respond as a normal assistant for this turn.',
    '- Provide code, edits, or other concrete output inline when helpful.',
    '- If the turn requests a strict structured contract such as "output only JSON", a role card payload, a dispatch payload, or another in-app card payload, follow that contract exactly instead of switching to prose.',
    '- Never propose saving ad hoc files, registering JSON manually, or taking external setup steps when the turn is asking for an in-app structured payload.',
    '- Do not claim that you ran tools, changed files, executed commands, or verified results you did not actually verify.',
    '- Mention tool unavailability only when it is necessary to answer accurately.',
    '- Keep commentary brief and focus on the user\'s requested outcome.',
    END_MARKER,
  ].join('\n')
}

export function buildExecutionBriefPrompt({
  mode = 'execute',
  permissionMode = 'ask',
  toolSurfaceKind = '',
  activeTools = {},
  modelSupportsTools = true,
  modelCapabilities = null,
  delegationAvailable = false,
  recentContext = null,
  toolContextFacts = [],
  visibleTerminalSessions = [],
} = {}) {
  const normalizedMode = normalizeMode(mode)
  const normalizedPermissionMode = String(permissionMode || 'ask').trim().toLowerCase() || 'ask'
  const normalizedToolSurfaceKind = String(toolSurfaceKind || '').trim().toLowerCase() || 'none'
  const enabledToolsLine = formatEnabledToolsLine(activeTools)
  const isZeroToolExecuteTurn = normalizedMode === 'execute' && enabledToolsLine === 'none'
  if (isZeroToolExecuteTurn) {
    return buildZeroToolResponseOnlyBrief()
  }
  const executionState = normalizedMode !== 'execute'
    ? 'advisory_only'
    : enabledToolsLine === 'none'
      ? 'advisory_only'
      : 'tool_execution_available'
  const hasDelegateTool = hasVisibleDelegationTool(activeTools)
  const hasFetchPageTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'fetch_page')
  const hasBrowserActionTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'browser_action')
  const hasTerminalSessionOpenTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'terminal_session_open')
  const hasTerminalSessionListTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'terminal_session_list')
  const hasTerminalSessionReadTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'terminal_session_read_snapshot')
  const hasTerminalSessionWaitTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'terminal_session_wait_for_output')
  const hasTerminalSessionWriteTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'terminal_session_write')
  const hasTerminalSessionAttachTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'terminal_session_attach')
  const hasLocalSkillTools = (
    Object.prototype.hasOwnProperty.call(activeTools || {}, 'list_curated_skills')
    || Object.prototype.hasOwnProperty.call(activeTools || {}, 'install_curated_skill')
  )
  const hasTerminalMemorySuggestTool = Object.prototype.hasOwnProperty.call(activeTools || {}, 'terminal_memory_suggest')
  const writeStrategyHint = inferWriteStrategy(activeTools, recentContext)
  const shellTarget = inferShellTarget(normalizedToolSurfaceKind, activeTools)
  const approvalOutlook = buildApprovalOutlook(normalizedPermissionMode, activeTools)
  const visibleToolFamilyMode = buildVisibleToolFamilyMode(activeTools)
  const capabilityCatalogLine = formatCapabilityCatalogLine(activeTools)
  const factDerivedRecentContext = buildRecentExecutionBriefContextFromFacts(toolContextFacts)
  const effectiveRecentContext = (
    (
      factDerivedRecentContext.lastFilePath
      || factDerivedRecentContext.lastFailedToolName
      || factDerivedRecentContext.lastToolFamily
      || factDerivedRecentContext.lastTerminalSessionId
    )
      ? factDerivedRecentContext
      : recentContext
  )
  const recentContextLine = summarizeRecentContext(effectiveRecentContext)
  const recentFactContextLine = summarizeRecentFactContext(toolContextFacts)
  const recentTerminalInsights = buildRecentTerminalSessionInsights(toolContextFacts, { visibleTerminalSessions })
  const recentTerminalInsightsLine = summarizeRecentTerminalInsights(recentTerminalInsights)
  const visibleTerminalSessionsLine = summarizeVisibleTerminalSessions(visibleTerminalSessions)
  const turnRules = [
    'If the user asked you to act and a listed tool fits, call it now.',
    'Read an existing file before modifying it.',
    'Use write_file for whole-file creation or replacement.',
    'Use edit_file for exact-text replacements and apply_patch for targeted diffs, multi-file edits, or file moves/deletes.',
    'When you use apply_patch, send one canonical patch string with "*** Begin Patch" ... "*** End Patch".',
    'Never invoke apply_patch inside run_command, bash, or PowerShell. apply_patch is a tool call, not a shell binary.',
    'Keep going until the task is complete or runtime policy blocks you.',
    'Do not stop after scope acknowledgment or a plan recap when the user asked for implementation; either act, report a concrete blocker, or finish the requested work.',
    'When the user gives an ordered execute request with cues like first, then, after that, or and then, complete the requested steps in that order within the same turn whenever the listed tools allow it.',
    'Do not stop after the first successful tool call if later requested steps are still immediately actionable in this turn.',
    'If the user explicitly delegates choice with phrases like choose yourself, you decide, or use your judgment, do not ask a clarifying question just to pick a valid option.',
    'If the user or controller provides an exact target path, preserve that exact path unless a concrete runtime error blocks it.',
    'Preserve exact required output filenames instead of inventing alternates or substitutes.',
    'If a missing directory is immediately recoverable by creating it, recover and continue instead of failing the turn early.',
    'If a required capability is missing, say so instead of claiming execution.',
    'If runtime policy blocks or reroutes a tool call, follow that result instead of trying a bypass.',
    'Keep commentary brief and reserve it for major transitions or blockers.',
    'For straightforward execute tasks, make the first useful tool call quickly and avoid narrating tool syntax, channels, or patch grammar.',
    'Do not add read-back verification or extra exploration after a simple write unless the user asked for verification or the prior step was ambiguous.',
    'If the turn asks for a strict structured contract such as output-only JSON or an in-app card payload, follow that contract exactly instead of converting it into prose, questions, or external setup instructions.',
    'If no tools are enabled, stay advisory-only and avoid execution claims.',
    ...(hasLocalSkillTools
      ? [
          'For curated OpenAI skill requests, use the local curated-skill tools instead of repo or web exploration.',
          'Call list_curated_skills first when the exact skill name is unclear, then install_curated_skill with the returned skill_name.',
        ]
      : []),
    ...(delegationAvailable && hasDelegateTool
      ? [
          'Treat an explicit user request to use agents as authoritative when you can form a bounded valid task.',
          "Otherwise decide from the task's semantics and complexity: delegate when independent specialist or parallel work materially improves the result.",
          'Keep trivial, tightly serial, or underspecified work local.',
          'Before delegating, include the relevant context and workspace paths needed for each task to succeed.',
          'Use semantic routing unless the user explicitly requests a configured role.',
        ]
      : []),
    ...(hasFetchPageTool
      ? [
          'For web research, probe unknown hosts in one pass: direct URL + robots.txt + r.jina.ai mirror.',
          'Attempt direct fetch at most once per host per turn.',
          'If direct fetch returns 401/403/429/503 or a challenge page, mark direct access blocked and avoid direct retries for that host this turn.',
          'For 404 responses, treat the path as invalid and move to the nearest valid parent or canonical page.',
          'Return a source table with URL, method, status, and why each source was used.',
        ]
      : []),
    ...(hasBrowserActionTool
      ? [
          'For browser UI work, use browser_action directly: inspect/find_elements/list_options before interaction, console_messages/network_errors for UI debugging, fetch_page for static public docs, and never Playwright CLI/package workflows for browser automation.',
        ]
      : []),
    ...((hasTerminalSessionListTool || hasTerminalSessionOpenTool || hasTerminalSessionReadTool || hasTerminalSessionWaitTool || hasTerminalSessionWriteTool || hasTerminalSessionAttachTool)
      ? [
          ...(hasTerminalSessionListTool ? ['Use terminal_session_list first when you need to discover reusable visible sessions in the current thread/workspace.'] : []),
          'Use terminal_session_open to create a new interactive terminal session.',
          'Prefer terminal_session_* for interactive shells, long-running dev servers, prompt-driven workflows, and TUIs. Use run_command for bounded one-shot commands.',
          ...(hasTerminalSessionWriteTool ? ['Use terminal_session_write with submit=true for shell commands, and leave submit=false for literal prompt input or interactive control bytes.'] : []),
          ...(hasTerminalSessionReadTool ? ['Use terminal_session_read_snapshot to inspect bounded current terminal output.'] : []),
          ...(hasTerminalSessionWaitTool ? ['Use terminal_session_wait_for_output after terminal_session_write instead of repeatedly polling snapshots when you expect a prompt, server startup line, or other terminal output.'] : []),
          ...(hasTerminalSessionAttachTool ? ['Use terminal_session_attach only when you need reconnect or live session reuse semantics, not as the normal way to read terminal text.'] : []),
          ...(visibleTerminalSessionsLine !== 'none'
            ? [
                'The execution brief may list visible terminal sessions for the active thread.',
                'If a listed terminal says access=locked_by_user, acknowledge that the session exists but do not claim you can read or interact with it until the user hands it back to AI.',
                'If a listed terminal says access=ai_reusable, you may reuse that sessionId directly instead of opening a new terminal.',
              ]
            : []),
          ...(recentTerminalInsights.reusableSessionId
            ? [
                `Prefer reusing ${recentTerminalInsights.reusableSessionId} when continuing the same interactive workflow instead of opening another terminal.`,
              ]
            : []),
          ...(recentTerminalInsights.reusableSessionId && recentTerminalInsights.recentOutputSequence > 0
            ? [
                `When you continue ${recentTerminalInsights.reusableSessionId}, prefer sinceSequence=${recentTerminalInsights.recentOutputSequence} on the next snapshot or wait call so you only inspect new output.`,
              ]
            : []),
          ...(recentTerminalInsights.loopRisk === 'wait_timeout_streak'
            ? [
                'Recent terminal waits timed out repeatedly without output progress. Do not loop on the same wait pattern again; either inspect a fresh snapshot, change the command, or surface the blocker.',
              ]
            : []),
          ...(recentTerminalInsights.loopRisk === 'repeated_write_no_output_progress'
            ? [
                'Recent terminal writes repeated without new output. Do not resend the same command blindly; inspect the session state first or choose a different recovery action.',
              ]
            : []),
        ]
      : []),
    ...(hasTerminalMemorySuggestTool
      ? [
          'Use terminal_memory_suggest only after terminal_session_close has succeeded for that same session in this turn.',
          'Never use terminal_memory_suggest before terminal close completion, during open/attach/write, or as a substitute for a normal assistant reply.',
          'Never auto-save or ask a conversational follow-up for terminal memory suggestions; the tool only prepares a local Save/Dismiss card.',
          'Do not suggest raw transcript storage, secrets, credentials, or generic completion notes as durable memory.',
        ]
      : []),
  ]

  return [
    START_MARKER,
    'This block is authoritative for this turn.',
    `Mode: ${normalizedMode}`,
    `Permission mode: ${normalizedPermissionMode}`,
    `Tool surface: ${normalizedToolSurfaceKind}`,
    `Tool calling: ${formatToolCallingStatus(modelSupportsTools, modelCapabilities)}`,
    `Execution state: ${executionState}`,
    `Enabled tools: ${enabledToolsLine}`,
    `Capability catalog: ${capabilityCatalogLine}`,
    `Write strategy: ${writeStrategyHint}`,
    `Shell target: ${shellTarget}`,
    `Approval outlook: ${approvalOutlook}`,
    `Visible tool families: ${visibleToolFamilyMode}`,
    `Recent context: ${recentContextLine}`,
    `Recent fact context: ${recentFactContextLine}`,
    `Recent terminal context: ${recentTerminalInsightsLine}`,
    `Visible terminal sessions: ${visibleTerminalSessionsLine}`,
    'Turn rules:',
    ...turnRules.map((rule) => `- ${rule}`),
    END_MARKER,
  ].join('\n')
}

export function buildRecentExecutionBriefContext(history = []) {
  const messages = Array.isArray(history) ? history : []
  let lastFilePath = ''
  let lastFailedToolName = ''
  let lastFailureClass = ''
  let lastToolFamily = ''

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const parts = normalizeContentParts(messages[index])
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex]
      const partType = normalizeLower(part?.type)
      if (!lastFilePath && partType === 'tool-call' && FILE_CONTEXT_TOOL_NAMES.has(normalizeLower(part?.toolName))) {
        const path = extractPathFromToolCall(part)
        if (path) lastFilePath = path
      }
      if (partType === 'tool-result') {
        const toolName = String(part?.toolName || '').trim()
        if (!lastToolFamily && toolName) lastToolFamily = toolName
        const typedFailureClass = String(part?.failureClass || '').trim()
        const typedIsError = part?.isError === true
        if (!lastFailedToolName && (typedFailureClass || typedIsError)) {
          lastFailedToolName = toolName
          if (typedFailureClass) lastFailureClass = typedFailureClass
        }
      }
      if (lastFilePath && lastFailedToolName && lastToolFamily) {
        return { lastFilePath, lastFailedToolName, lastFailureClass, lastToolFamily }
      }
    }
  }

  return { lastFilePath, lastFailedToolName, lastFailureClass, lastToolFamily }
}

export function upsertExecutionBriefPrompt(systemPrompt = '', executionBriefPrompt = '') {
  const content = String(systemPrompt ?? '')
  const block = String(executionBriefPrompt ?? '').trim()
  const escapedStart = START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'g')
  const stripped = content.replace(pattern, '\n\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!block) return stripped
  return stripped ? `${stripped}\n\n${block}` : block
}
