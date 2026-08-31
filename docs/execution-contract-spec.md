# ADDOM Execution Contract Spec

Updated: 2026-08-31

## Purpose

Define the internal execution contract that chat turns, provider adapters, delegated workers, and diagnostics must resolve through.

## User-facing settings

- `permissionMode`
  - values: `ask | autonomy | full_access`
  - the only user-facing execution-mode source of truth
- `riskyActionPolicy`
  - current value: `prompt_first_risky_use`
  - persisted as part of the execution contract
- `chatMode`
  - values: `execute | plan | thinking`
  - per-turn execution gate, separate from `permissionMode`
- `commandSafety`
  - advanced-only guardrail tuning and diagnostics
  - not a second execution-mode vocabulary

## Interaction rules

- `plan` and `thinking` disable tool execution for that turn.
- `execute` enables tool resolution for the turn using the saved `permissionMode` plus runtime guardrails.
- The header permission control must reflect the persisted `permissionMode`.
- Settings mirrors the current mode as a secondary surface and explanation layer.
- Provider, model, and workspace changes may re-resolve capabilities, but they do not create a second execution-mode state.

## ResolvedExecutionProfile

Each executable turn should be reasoned about as one resolved profile, even if its fields are currently assembled across multiple modules.

### Fields

- `permissionMode`
  - normalized by `src/common/chat/permission-mode.mjs`
- `permissionModeSource`
  - `payload_override` when the renderer explicitly supplies a mode for the turn
  - `persisted_settings` otherwise
- `chatMode`
  - normalized by `src/main/chat/turn-mode.mjs`
- `adapterProfile`
  - resolved by `src/main/api-clients/provider-model-adapters.mjs`
- `toolSurfaceKind`
  - resolved by `src/main/chat/tool-surface-selection.mjs`
- `capabilities`
  - workspace read
  - workspace write
  - patch/edit
  - file create
  - directory create
  - shell execute
  - git read
  - git write
  - web fetch
  - package install
  - provider-hosted runtime tools
  - provider-native coding tools
  - delegated worker tool execution
  - background job execution
  - staged worker file writes
  - worker shell execution when role and runtime allow it
  - worker web research when role and runtime allow it
- `riskPolicy`
  - maps tool intent and command classification to risk class
- `approvalPolicy`
  - decides `approve | prompt | deny` after runtime classification
- `guardrailPolicy`
  - enforces workspace boundaries, install routing, elevation, and destructive-action handling
- `WorkspaceTrustSnapshot`
  - current resolved workspace root and trust source
  - current trust source is `workspace_guardrails` or `no_workspace`
- `adapterDiagnostics`
  - provider/model route, wire API, generic-vs-curated reason, surface diagnostics
- `CapabilityDowngradeNotice[]`
  - runtime notices emitted when a provider/model/workspace change removes or narrows capabilities

## GenericExecutionProfilePath

- Unknown or non-curated models resolve through one explicit generic adapter path selected before streaming begins.
- Generic routing is not a hidden recovery fallback.
- Generic OpenAI models do not inherit curated hosted tools, local runtime tools, background mode, or `phase` handling.

## Risk classes

- `safe_routine_workspace_action`
- `moderate_workspace_action`
- `first_risky_use_approval_required`
- `always_escalate`
- `always_block`

## Approval rules

- Safe workspace file actions proceed in `ask` and `autonomy`.
- Safe host run-command classes proceed in `ask` and `autonomy`.
- In `autonomy`, audited safe reads such as `git_status`, `git_diff`, `git_log`, and workspace read/search tools are auto-approved explicitly.
- First risky web fetches and project dependency installs prompt once per project per app session.
- Elevated host actions, global installs, destructive host-wide actions, and shell/environment mutations do not inherit that session memory.
- `local_shell` follows the same runtime risk classification and Ask/Autonomy approval rules as `run_command`.
- terminal session creation is a separate approval surface from `run_command` and `local_shell`, even when it ultimately launches a local shell.
- later `terminal_session_*` reuse actions such as write, resize, signal, and close must stay explicit and must not degrade into undocumented shell passthrough.
- terminal session availability is also gated by the terminal runtime-health contract, which now includes an explicit rollout decision in addition to PTY probe status.
- the live terminal surface is emulator-backed:
  - renderer terminal semantics belong to `@xterm/xterm`
  - PTY output stays raw through the live path
  - there is no transcript-view fallback for interactive terminal behavior
- current default rollout is Windows-first:
  - `win32` may expose terminal sessions when PTY runtime health is `supported`
  - `darwin` and `linux` stay `disabled` with an explicit rollout reason until packaged verification is recorded for those targets
- Approval prompts happen after the model expresses tool intent, not as prompt-driven choreography before tool use.
- While an approval is unresolved, the turn remains in a pending approval state.
- User denial is a non-fatal restriction result when the denied tool was optional or recoverable; policy-denied or renderer-failed approvals remain error states.

## Stop / Cancel rules

- Stop is a soft-stop request.
- Once stop is registered, no new mutating action should start.
- Already-started side effects may still complete.
- Local file recovery after stop depends on artifact history, not on implied command rollback.

## Risky action memory

- `riskyActionSessionState` is project-scoped and session-scoped.
- Current remembered categories:
  - `network_fetch`
  - `dependency_install_project`
- Storage is in-memory only via `src/main/chat/risky-action-session-state.mjs`.
- Persisted blanket approvals are intentionally not part of the contract.

## Tool-surface contract

- Each turn resolves to exactly one coherent tool surface:
  - `addom_native`
  - `openai_hosted`
  - `openai_local_runtime`
  - `moonshot_formula`
  - `none`
- Overlapping ADDOM edit/command tools are pruned when OpenAI local runtime tools own that surface.
- Unsupported or invalid surface combinations must fail explicitly and emit diagnostics rather than silently rerouting.
- terminal sessions remain an ADDOM-owned subsystem. When model exposure lands, it must use explicit `terminal_session_*` tools instead of overloading `run_command`.
- terminal-session tools are only exposed when terminal runtime health reports `supported`; rollout-gated or failed PTY states remove the entire `terminal_session_*` family without affecting `run_command`.

## Terminal Runtime-Health Contract

`src/main/tools/terminal-session-runtime-health.mjs` is the main-process source of truth for terminal availability.

It returns:

- `status`
  - `supported`
  - `disabled`
  - `failed`
- `reason`
  - explicit PTY/load/rollout reason for the current runtime
- `rollout`
  - explicit rollout policy metadata
  - current env-controlled rollout flag: `ADDOM_TERMINAL_SESSIONS_ROLLOUT`
  - current default policy: `windows_only`
- `dependency`
  - resolved `node-pty` package version and artifact presence when the probe reached dependency load
- `probe`
  - shell/cwd/timing metadata when the PTY spawn probe succeeded

Current verification state:

- Windows:
  - verified for real PTY-backed `cmd`
  - verified for real PTY-backed `powershell.exe`
  - verified for redraw-heavy output and fullscreen TUI-style flows in direct PTY smoke
  - additional shells remain host-dependent
- macOS:
  - renderer path is prepared for native Option/dead-key composition by keeping `macOptionIsMeta` disabled
  - still rollout-gated pending live packaged/runtime validation with `zsh`/`bash` and physical keyboard checks
- Linux:
  - still rollout-gated pending live packaged/runtime validation with `bash`, fullscreen/TUI smoke, and watch-task evidence

Current operator controls:

- `ADDOM_DISABLE_TERMINAL_SESSIONS=1`
  - hard-disable terminal sessions regardless of platform/runtime health
- `ADDOM_TERMINAL_SESSIONS_ROLLOUT=off|windows_only|all`
  - rollout decision layer above PTY runtime health

## Worker and delegation contract

- `DelegationExecutionProfile`
  - the orchestrator delegates tasks against configured Agent roles, not hidden fallback routes
  - provider/model choice for a role is explicit in Settings
- `WorkerExecutionProfile`
  - resolves its own adapter profile and tool surface on the configured provider/model route
  - inherits the same guardrail model categories as the main agent
  - may be more restrictive than the parent turn, but not less restrictive
- `DelegationGuardrailPolicy`
  - enforces task count, budget, runtime duration, configured-key checks, and staged-write limits
- `WorkerWriteStrategy`
  - current value: `staged`
  - staged writes remain the only supported worker mutation path

## Diagnostics contract

Each execute turn should capture:

- provider
- model
- wire API
- adapter selection and reason
- tool-surface kind and components
- workspace root and trust source
- permission mode and persisted sync state
- capability notices and downgrade reasons
- requested vs active tool counts
- tool-call follow-through
- approval prompt counts
- approval auto-approval sources
- risky approval prompt count
- surface-resolution failure reason
- provider/model/workspace re-resolution reasons

## Source modules

- Main settings and normalization
  - `src/main/settings.mjs`
  - `src/main/settings-command-safety.mjs`
- Main turn execution
  - `src/main/ipc-handlers/chat-stream-handler.mjs`
  - `src/main/chat/turn-mode.mjs`
  - `src/main/chat/tool-approval-rules.mjs`
  - `src/main/chat/risky-action-session-state.mjs`
  - `src/main/chat/chat-runtime-diagnostics.mjs`
- Provider and model routing
  - `src/main/api-clients/provider-model-adapters.mjs`
  - `src/main/chat/tool-surface-selection.mjs`
- Agent execution and delegation
  - `src/main/moa/moa-policy.mjs`
  - `src/main/moa/agent-runtime-tooling.mjs`
  - `src/main/moa/agent-runtime.mjs`
  - `src/main/moa/staged-write-pipeline.mjs`
