# Tools and Approvals

## Who This Is For
- Users who run implementation tasks in Execute mode.
- Users who need safe control over file edits and shell commands.

## Prerequisites
- Chat mode set to `Execute`.
- Provider/model selected.
- Permission mode selected (`Ask`, `Autonomy`, or `Full Access`).

## What This Feature Does
ADDOM tools let the assistant read or write files, run commands, use git helpers,
fetch web pages, and delegate work to configured agents. Tool execution remains
policy-controlled and pauses for approval when the selected mode and risk require it.

## Step-by-Step Tasks

### 1. Understand Tool Categories
- File tools: read, write, edit, delete, rename, search/list/find.
- Git tools: status, diff, log, commit, checkout file.
- Command tool: `run_command`.
- Terminal tools: `terminal_session_open|attach|write|resize|signal|close`.
- Web tool: `fetch_page`.
- Browser tool: `browser_action`.
- Agent tools: inspect the generated role catalog, delegate tasks, and apply staged revisions.

### 2. Review Approval Prompts
1. Inspect tool name, input, target path, and risk.
2. Approve or deny.
   - Keyboard shortcuts: `Enter` to approve, `Esc` to deny.
3. While an approval is unresolved, the turn stays visibly pending instead of appearing completed.
4. If you deny a step, ADDOM records that as an intentional restriction, not a crash.
5. For denied steps, assistant may continue with alternatives or request clarification.

### 3. Use Command Safety Controls
1. Open `Settings > Safety`.
2. Confirm the saved execution mode matches how you want Execute turns to behave.
3. Review `Guardrails` to understand which actions still require approval or remain blocked.

### 4. Run Background Commands Properly
1. Use background mode for servers/watchers.
2. Open jobs modal to inspect and stop background commands.
3. Avoid long-running foreground commands.

### 5. Use Browser Automation Safely
1. Review the browser action target, origin, and approval scope.
2. Approve only the expected page interaction.
3. If ADDOM reports no Chromium runtime, let it install Chromium into local app data on first use or install a supported system browser. `npm run browser:prepare-runtime` remains available for local development.

## Thread-Scoped Approvals
When concurrent background sessions are enabled, tool approvals are thread-scoped:
- Each approval request carries the originating `threadId` and `turnId`.
- The approval overlay only appears when its thread is the visible thread.
- Hidden threads with pending approvals surface an urgency badge in the thread drawer.
- Cancelling a thread only dismisses approvals belonging to that thread.
- Approval timeouts and countdowns are per-thread.

## Write Conflict Gating
When multiple threads execute concurrently:
- Concurrent reads, reasoning, and non-overlapping tool work are allowed.
- Write-capable tools capture a base revision before execution and check it after writing.
- If another thread wrote to the same file between the read and the write, a conflict is detected.
- Conflicting writes are still recorded in the artifact store but flagged with `conflict: true`.
- A `chat:write-conflict` event is emitted to the originating thread.
- No hidden automatic merge modifies disk state when cross-thread divergence is detected.

## Command Safety Notes
- `permissionMode` is the user-facing execution control:
  - `Ask`: prompt before risky actions.
  - `Autonomy`: auto-allow audited safe reads inside the workspace and prompt on first risky network or install action.
  - `Full Access`: allow the broadest supported scope without bypassing hard-deny policy.
- In `Autonomy`, audited read-only probes such as `git_status`, `git_diff`, `git_log`, and workspace read/search tools can proceed without extra approval.
- User-denied approvals do not automatically mark the whole turn as failed.
- First risky web fetches and project dependency installs are remembered per project for the current app session only.
- Install sandbox behavior can enforce safer install pathways.
- Browser actions have their own approval-policy view and can require explicit elevated approval depending on target class/origin.
- Provider-hosted tools are a separate egress boundary from local ADDOM state:
  - Local workspace state, memory, and settings stay on-device by default.
  - Hosted tool paths can still send prompts, selected attachments, and tool activity to provider infrastructure.
  - OpenAI MCP can additionally forward that data to configured third-party MCP servers.
- ADDOM stops runaway identical tool-call loops inside a turn instead of letting the same tool batch repeat indefinitely.

## Terminal Sessions
- Terminal sessions are a separate subsystem from `run_command` and `local_shell`.
- Opening a terminal session uses the explicit `terminal_session_open` approval path.
- Reuse actions such as `terminal_session_write` and `terminal_session_signal` stay explicit and do not collapse into undocumented shell passthrough.
- Terminal panel visibility and model-facing `terminal_session_*` tool exposure both follow terminal runtime health.
- The live Terminal panel is a real emulator-backed surface:
  - `@xterm/xterm` owns terminal semantics in the renderer
  - PTY bytes stay raw in the live path
  - ADDOM does not fall back to transcript rendering for interactive terminal behavior
- Terminal runtime health is gated by:
  - PTY dependency load/probe state
  - explicit hard-disable env: `ADDOM_DISABLE_TERMINAL_SESSIONS=1`
  - explicit rollout env: `ADDOM_TERMINAL_SESSIONS_ROLLOUT=off|windows_only|all`
- Current rollout is Windows-first:
  - Windows has direct PTY validation for `cmd`, `powershell.exe`, redraw-heavy output, and a fullscreen TUI-style flow
  - additional shells remain dependent on what is installed on the host
  - macOS and Linux remain explicitly rollout-gated pending live packaged/runtime verification

### Terminal Capability Matrix

| Category | Current capability |
| --- | --- |
| Approval family | `terminal_session_*` tools use the terminal-session approval identity, separate from `run_command`. |
| Model tools | Open, read snapshot, attach, write, resize, signal, and close. |
| Runtime gating | Terminal tool exposure is removed when PTY runtime health is failed or disabled. |
| Renderer surface | Live output is raw PTY bytes rendered by xterm; archived output is read-only. |
| User-to-AI context | Closed-session archives can produce memory candidates; live output requires manual copy. |

## Stop Behavior
- Stop is a soft-stop request, not a hard rollback barrier.
- After stop is requested, ADDOM should avoid starting new mutating actions.
- Already-started actions may still finish, so use Artifacts rollback for local file recovery when needed.

## Common Pitfalls
### What Can Go Wrong
- Running destructive command without review.
  - Fix: verify command input before approval.
- Long-running process started in foreground.
  - Fix: re-run in background mode.
- Over-permissive profile in sensitive environment.
  - Fix: switch back to `Ask` and keep the command inside the workspace guardrails.

## Related Settings
- `permissionMode`
- `riskyActionPolicy`
- `commandSafety.showDeveloperOptions`

## Related References
- [Tool Catalog](./reference/tool-catalog.md)
- [Settings Catalog](./reference/settings-catalog.md)
- [Command Palette and Shortcuts](./command-palette-and-shortcuts.md)
