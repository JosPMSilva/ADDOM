import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExecutionBriefPrompt,
  buildRecentExecutionBriefContext,
  upsertExecutionBriefPrompt,
} from '../../src/main/chat/execution-brief-prompt.mjs'

test('buildExecutionBriefPrompt degrades zero-tool execute turns to a compact response-only brief', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: {},
    modelSupportsTools: true,
  })

  assert.match(prompt, /\[ADDOM EXECUTION BRIEF\]/)
  assert.match(prompt, /Mode: execute/)
  assert.match(prompt, /Execution state: response_only/)
  assert.match(prompt, /Respond as a normal assistant for this turn/i)
  assert.match(prompt, /Provide code, edits, or other concrete output inline when helpful/i)
  assert.match(prompt, /strict structured contract such as "output only JSON"/i)
  assert.match(prompt, /Never propose saving ad hoc files, registering JSON manually/i)
  assert.match(prompt, /Do not claim that you ran tools, changed files, executed commands, or verified results/i)
  assert.doesNotMatch(prompt, /Permission mode:/)
  assert.doesNotMatch(prompt, /Tool surface:/)
  assert.doesNotMatch(prompt, /Tool calling:/)
  assert.doesNotMatch(prompt, /Enabled tools:/)
  assert.doesNotMatch(prompt, /call it now/i)
  assert.doesNotMatch(prompt, /advisory-only/i)
})

test('buildExecutionBriefPrompt keeps the zero-tool fallback even when model tool support is unavailable', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'autonomy',
    toolSurfaceKind: 'openai_local_runtime',
    activeTools: {},
    modelSupportsTools: false,
    modelCapabilities: { source: 'provider_probe' },
  })

  assert.match(prompt, /Execution state: response_only/)
  assert.match(prompt, /Mention tool unavailability only when it is necessary to answer accurately/i)
  assert.doesNotMatch(prompt, /Tool calling: unavailable/i)
  assert.doesNotMatch(prompt, /Enabled tools: none/i)
  assert.doesNotMatch(prompt, /Keep going until the task is complete or runtime policy blocks you/i)
})

test('buildExecutionBriefPrompt distinguishes provider-owned runtime-only tool semantics from generic unavailability', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'perplexity_search',
    activeTools: { read_file: {}, run_command: {} },
    modelSupportsTools: false,
    modelCapabilities: {
      source: 'merged_catalog',
      toolSupportMode: 'provider_owned_runtime_only',
    },
  })

  assert.match(prompt, /Tool surface: perplexity_search/)
  assert.match(prompt, /Tool calling: provider-owned runtime only \(merged_catalog\)/i)
  assert.match(prompt, /Execution state: tool_execution_available/)
})

test('buildExecutionBriefPrompt falls back to normalized any-tool-surface truth when toolSupportMode is absent', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'provider_owned_runtime',
    activeTools: { read_file: {} },
    modelSupportsTools: false,
    modelCapabilities: {
      source: 'merged_catalog',
      supportsAnyToolSurface: true,
    },
  })

  assert.match(prompt, /Tool calling: non-local tool surface only \(merged_catalog\)/i)
  assert.match(prompt, /Execution state: tool_execution_available/)
})

test('buildExecutionBriefPrompt carries full_access permission mode through the turn contract', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'full_access',
    toolSurfaceKind: 'addom_native',
    activeTools: { run_command: {} },
    modelSupportsTools: true,
  })

  assert.match(prompt, /Permission mode: full_access/)
  assert.match(prompt, /Execution state: tool_execution_available/)
  assert.match(prompt, /Enabled tools: run_command/)
  assert.match(prompt, /Capability catalog: unavailable/)
  assert.match(prompt, /Write strategy: read_only/)
  assert.match(prompt, /Shell target: addom_native/)
  assert.match(prompt, /Approval outlook: file tools direct; shell commands run directly when policy allows/i)
  assert.match(prompt, /Visible tool families: shell/i)
  assert.match(prompt, /Recent context: none/i)
})

test('buildExecutionBriefPrompt biases trivial file work toward write_file and brief execution', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'full_access',
    toolSurfaceKind: 'openai_local_runtime',
    activeTools: { write_file: {}, apply_patch: {}, run_command: {} },
    modelSupportsTools: true,
  })

  assert.match(prompt, /Use write_file for whole-file creation or replacement/i)
  assert.match(prompt, /Use edit_file for exact-text replacements and apply_patch for targeted diffs, multi-file edits, or file moves\/deletes/i)
  assert.match(prompt, /Never invoke apply_patch inside run_command, bash, or PowerShell/i)
  assert.match(prompt, /send one canonical patch string/i)
  assert.match(prompt, /make the first useful tool call quickly/i)
  assert.match(prompt, /avoid narrating tool syntax, channels, or patch grammar/i)
  assert.match(prompt, /Do not add read-back verification or extra exploration after a simple write/i)
  assert.match(prompt, /strict structured contract such as output-only JSON or an in-app card payload/i)
  assert.match(prompt, /Write strategy: apply_patch_preferred/i)
  assert.match(prompt, /Visible tool families: files\(read\/write\), shell/i)
})

test('buildRecentExecutionBriefContext extracts recent file and failed tool context from canonical history', () => {
  const recentContext = buildRecentExecutionBriefContext([
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolName: 'read_file',
          input: { path: 'src/auth.js' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolName: 'apply_patch',
          output: { type: 'text', value: 'Tool error: pre-execution lint [apply_patch_missing_hunk] Apply patch requires unified diff hunks.' },
          failureClass: 'MALFORMED_PATCH_SYNTAX',
          isError: true,
        },
      ],
    },
  ])

  assert.deepEqual(recentContext, {
    lastFilePath: 'src/auth.js',
    lastFailedToolName: 'apply_patch',
    lastFailureClass: 'MALFORMED_PATCH_SYNTAX',
    lastToolFamily: 'apply_patch',
  })
})

test('buildExecutionBriefPrompt keeps recent context bounded and stable', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: { read_file: {}, edit_file: {}, write_file: {} },
    modelSupportsTools: true,
    recentContext: {
      lastFilePath: 'src/auth.js',
      lastFailedToolName: 'apply_patch',
      lastToolFamily: 'apply_patch',
    },
  })

  assert.match(prompt, /Write strategy: prefer_edit_file_or_write_file/i)
  assert.match(prompt, /Shell target: not_available/i)
  assert.match(prompt, /Approval outlook: safe tool calls can proceed; sensitive operations may require approval/i)
  assert.match(prompt, /Visible tool families: files\(read\/write\)/i)
  assert.match(prompt, /Recent context: last file=src\/auth\.js; recent failure=apply_patch/i)
  assert.match(prompt, /Recent fact context: none/i)
  assert.match(prompt, /Capability catalog: read addom:\/\/capabilities\/index\.md before assuming a hidden capability is unavailable/i)
  assert.doesNotMatch(prompt, /Description:/i)
})

test('buildExecutionBriefPrompt prefers deterministic fact context over raw history context when available', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: { read_file: {}, edit_file: {}, write_file: {} },
    modelSupportsTools: true,
    recentContext: {
      lastFilePath: 'stale/raw.js',
      lastFailedToolName: '',
      lastToolFamily: '',
    },
    toolContextFacts: [
      {
        kind: 'file_read',
        toolName: 'read_file',
        filePath: 'src/facts.js',
        contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
      {
        kind: 'failure_class',
        toolName: 'apply_patch',
        failureClass: 'MALFORMED_PATCH_SYNTAX',
      },
    ],
  })

  assert.match(prompt, /Recent context: last file=src\/facts\.js; recent failure=apply_patch \(MALFORMED_PATCH_SYNTAX\)/i)
  assert.match(prompt, /Recent fact context: failure apply_patch \(MALFORMED_PATCH_SYNTAX\); read src\/facts\.js @ 0123456789ab/i)
  assert.doesNotMatch(prompt, /stale\/raw\.js/i)
})

test('buildExecutionBriefPrompt includes web research playbook when fetch_page is enabled', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'full_access',
    toolSurfaceKind: 'addom_native',
    activeTools: { fetch_page: {}, run_command: {} },
    modelSupportsTools: true,
  })

  assert.match(prompt, /probe unknown hosts in one pass: direct URL \+ robots\.txt \+ r\.jina\.ai mirror/i)
  assert.match(prompt, /Attempt direct fetch at most once per host per turn/i)
  assert.match(prompt, /If direct fetch returns 401\/403\/429\/503 or a challenge page/i)
  assert.match(prompt, /Return a source table with URL, method, status, and why each source was used/i)
})

test('buildExecutionBriefPrompt adds browser_action guidance without replacing fetch_page guidance', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: { fetch_page: {}, browser_action: {}, run_command: {} },
    modelSupportsTools: true,
  })

  const browserGuidance = prompt
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .filter((line) => /browser_action|playwright cli|list_options|console_messages|network_errors/i.test(line))
  assert.equal(browserGuidance.length, 1)
  assert.match(browserGuidance[0], /inspect\/find_elements\/list_options before interaction/i)
  assert.match(browserGuidance[0], /console_messages\/network_errors for UI debugging/i)
  assert.match(browserGuidance[0], /fetch_page for static public docs/i)
  assert.match(browserGuidance[0], /never Playwright CLI\/package workflows/i)
  assert.match(prompt, /probe unknown hosts in one pass/i)
})

test('buildExecutionBriefPrompt routes curated skill requests to the local skill tools when available', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'openai_hosted',
    activeTools: { list_curated_skills: {}, install_curated_skill: {}, run_command: {} },
    modelSupportsTools: true,
  })

  assert.match(prompt, /Enabled tools: run_command, list_curated_skills, install_curated_skill/i)
  assert.match(prompt, /Visible tool families: shell, skills/i)
  assert.match(prompt, /For curated OpenAI skill requests, use the local curated-skill tools instead of repo or web exploration/i)
  assert.match(prompt, /Call list_curated_skills first when the exact skill name is unclear, then install_curated_skill/i)
})

test('buildExecutionBriefPrompt adds post-close terminal memory suggestion guardrails when the tool is enabled', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: {
      terminal_session_close: {},
      terminal_memory_suggest: {},
    },
    modelSupportsTools: true,
  })

  assert.match(prompt, /Use terminal_memory_suggest only after terminal_session_close has succeeded/i)
  assert.match(prompt, /Never use terminal_memory_suggest before terminal close completion/i)
  assert.match(prompt, /Never auto-save or ask a conversational follow-up/i)
  assert.match(prompt, /Do not suggest raw transcript storage, secrets, credentials, or generic completion notes/i)
})

test('buildExecutionBriefPrompt lists visible thread terminal sessions with access state', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: {
      terminal_session_list: {},
      terminal_session_open: {},
      terminal_session_read_snapshot: {},
      terminal_session_wait_for_output: {},
      terminal_session_attach: {},
      terminal_session_write: {},
    },
    modelSupportsTools: true,
    visibleTerminalSessions: [
      {
        sessionId: 'term_user_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        owner: 'user',
        focusedSurface: 'chat_dock',
        access: 'locked_by_user',
        outputSequence: 17,
        suggestedUse: 'visible only until the user hands it back to AI',
      },
      {
        sessionId: 'term_ai_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        owner: 'model',
        focusedSurface: 'chat_dock',
        access: 'ai_reusable',
        outputSequence: 42,
        suggestedUse: 'reuse this session for the ongoing interactive workflow',
      },
    ],
  })

  assert.match(prompt, /Visible terminal sessions: term_user_1 \(cwd=C:\\Users\\example\\Documents\\ADDOM, shell=powershell, owner=user, surface=chat_dock, access=locked_by_user, next=17, use=visible only until the user hands it back to AI\); term_ai_1 \(cwd=C:\\Users\\example\\Documents\\ADDOM, shell=powershell, owner=model, surface=chat_dock, access=ai_reusable, next=42, use=reuse this session for the ongoing interactive workflow\)/i)
  assert.match(prompt, /Recent terminal context: none/i)
  assert.match(prompt, /If a listed terminal says access=locked_by_user, acknowledge that the session exists but do not claim you can read or interact with it until the user hands it back to AI/i)
  assert.match(prompt, /If a listed terminal says access=ai_reusable, you may reuse that sessionId directly instead of opening a new terminal/i)
  assert.match(prompt, /Use terminal_session_list first when you need to discover reusable visible sessions/i)
  assert.match(prompt, /Use terminal_session_wait_for_output after terminal_session_write instead of repeatedly polling snapshots/i)
  assert.match(prompt, /Prefer terminal_session_\* for interactive shells, long-running dev servers, prompt-driven workflows, and TUIs\. Use run_command for bounded one-shot commands/i)
})

test('buildExecutionBriefPrompt adds terminal reuse and anti-loop guidance from recent terminal facts', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: {
      terminal_session_list: {},
      terminal_session_open: {},
      terminal_session_read_snapshot: {},
      terminal_session_wait_for_output: {},
      terminal_session_write: {},
    },
    modelSupportsTools: true,
    toolContextFacts: [
      {
        kind: 'terminal_session',
        toolName: 'terminal_session_write',
        action: 'write',
        sessionId: 'term_ai_1',
        commandPreview: 'npm run dev',
        commandHash: 'a'.repeat(64),
        outputSequence: 42,
      },
      {
        kind: 'terminal_session',
        toolName: 'terminal_session_wait_for_output',
        action: 'wait_for_output',
        sessionId: 'term_ai_1',
        outputSequence: 42,
        sinceSequence: 42,
        outputProgress: false,
        matched: false,
        timedOut: true,
      },
      {
        kind: 'terminal_session',
        toolName: 'terminal_session_wait_for_output',
        action: 'wait_for_output',
        sessionId: 'term_ai_1',
        outputSequence: 42,
        sinceSequence: 42,
        outputProgress: false,
        matched: false,
        timedOut: true,
      },
    ],
    visibleTerminalSessions: [
      {
        sessionId: 'term_ai_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        owner: 'model',
        focusedSurface: 'chat_dock',
        access: 'ai_reusable',
        outputSequence: 42,
        suggestedUse: 'reuse this session for the ongoing interactive workflow',
      },
    ],
  })

  assert.match(prompt, /Recent context: recent tool family=terminal_session_wait_for_output; recent terminal=term_ai_1 action=wait_for_output command=npm run dev/i)
  assert.match(prompt, /Recent terminal context: term_ai_1, action=wait_for_output, command=npm run dev, next=42, reusable=term_ai_1, loop_risk=wait_timeout_streak/i)
  assert.match(prompt, /Prefer reusing term_ai_1 when continuing the same interactive workflow instead of opening another terminal/i)
  assert.match(prompt, /prefer sinceSequence=42 on the next snapshot or wait call/i)
  assert.match(prompt, /Recent terminal waits timed out repeatedly without output progress\. Do not loop on the same wait pattern again/i)
})

test('buildExecutionBriefPrompt lets the model infer delegation from explicit intent and task complexity', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: { read_file: {}, delegate_tasks: {}, edit_file: {} },
    modelSupportsTools: true,
    delegationAvailable: true,
  })

  assert.match(prompt, /Treat an explicit user request to use agents as authoritative/i)
  assert.match(prompt, /Otherwise decide from the task's semantics and complexity/i)
  assert.match(prompt, /independent specialist or parallel work materially improves/i)
  assert.match(prompt, /Keep trivial, tightly serial, or underspecified work local/i)
  assert.match(prompt, /include the relevant context and workspace paths/i)
  assert.match(prompt, /Use semantic routing unless the user explicitly requests a configured role/i)
  assert.doesNotMatch(prompt, /Lead Engineer and Orchestrator of a multi-agent team/i)
})

test('buildExecutionBriefPrompt omits MoA hint when delegation is not available this turn', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    toolSurfaceKind: 'addom_native',
    activeTools: { read_file: {}, edit_file: {} },
    modelSupportsTools: true,
    delegationAvailable: true,
  })

  assert.doesNotMatch(prompt, /Treat an explicit user request to use agents as authoritative/i)
  assert.doesNotMatch(prompt, /Use semantic routing unless the user explicitly requests a configured role/i)
})

test('buildExecutionBriefPrompt forbids acknowledgment-only completions for implementation asks', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'full_access',
    toolSurfaceKind: 'addom_native',
    activeTools: { read_file: {}, write_file: {}, run_command: {} },
    modelSupportsTools: true,
  })

  assert.match(prompt, /Do not stop after scope acknowledgment or a plan recap when the user asked for implementation/i)
  assert.match(prompt, /either act, report a concrete blocker, or finish the requested work/i)
  assert.match(prompt, /When the user gives an ordered execute request with cues like first, then, after that, or and then, complete the requested steps in that order within the same turn/i)
  assert.match(prompt, /Do not stop after the first successful tool call if later requested steps are still immediately actionable in this turn/i)
})

test('buildExecutionBriefPrompt biases execute mode toward acting on explicit autonomy cues', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'autonomy',
    toolSurfaceKind: 'addom_native',
    activeTools: { read_file: {}, write_file: {} },
    modelSupportsTools: true,
  })

  assert.match(prompt, /If the user explicitly delegates choice with phrases like choose yourself, you decide, or use your judgment, do not ask a clarifying question just to pick a valid option/i)
})

test('buildExecutionBriefPrompt preserves exact requested paths and output filenames', () => {
  const prompt = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'full_access',
    toolSurfaceKind: 'addom_native',
    activeTools: { read_file: {}, write_file: {}, create_directory: {} },
    modelSupportsTools: true,
  })

  assert.match(prompt, /If the user or controller provides an exact target path, preserve that exact path unless a concrete runtime error blocks it/i)
  assert.match(prompt, /Preserve exact required output filenames instead of inventing alternates or substitutes/i)
  assert.match(prompt, /If a missing directory is immediately recoverable by creating it, recover and continue instead of failing the turn early/i)
})

test('upsertExecutionBriefPrompt replaces prior execution brief block instead of duplicating it', () => {
  const first = buildExecutionBriefPrompt({
    mode: 'execute',
    permissionMode: 'ask',
    activeTools: { read_file: {}, write_file: {} },
    modelSupportsTools: true,
  })
  const second = buildExecutionBriefPrompt({
    mode: 'thinking',
    permissionMode: 'ask',
    activeTools: {},
    modelSupportsTools: true,
  })

  const seeded = `You are ADDOM.\n\n${first}\n\n[ADDOM Runtime Context]\nOS: Windows`
  const updated = upsertExecutionBriefPrompt(seeded, second)

  assert.equal((updated.match(/\[ADDOM EXECUTION BRIEF\]/g) || []).length, 1)
  assert.match(updated, /\[ADDOM Runtime Context\]/)
  assert.match(updated, /Mode: thinking/)
})
