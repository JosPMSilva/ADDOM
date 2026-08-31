# Chat Guide

## Who This Is For
- Users working primarily from the Chat panel.
- Power users managing context flow, attachments, and mode behavior.

## Prerequisites
- Open project folder.
- Active thread selected or created.
- Provider and model selected.

## What This Feature Does
Chat is the execution hub for requests, tool activity, runbook transparency, and file-change review.

## Step-by-Step Tasks

### 1. Select Mode Intentionally
1. In chat header, pick one mode:
   - `Execute`: tools can run with approval.
   - `Plan`: planning interaction, no tool execution.
   - `Thinking`: ideation/tradeoffs, no tool execution.
2. Use `Execute` for actual implementation.
3. In the same header, choose `Permission mode`:
   - `Ask`: prompt before risky actions.
   - `Autonomy`: act inside workspace guardrails and prompt on first risky network or install action.

### 2. Manage Threads
1. Create a new thread from header controls or command palette.
2. Rename or delete thread as needed.
3. Use clear conversation to reset messages for current thread only.

### 3. Compose Prompts
1. Enter prompt text in composer.
2. Optional: type `/` at the start of the draft to open the local slash-command menu.
3. Pick a command with arrow keys and `Enter`/`Tab`, or keep typing to filter:
   - `/compact`
   - `/compact-threshold`
   - `/agent`
   - `/agents`
   - `/createrole`
   - `/dispatch`
   - `/pipeline`
   - `/council`
   - `/review`
4. Optional: include code segments/blocks in composer.
5. Optional: include attachments (subject to provider/model gates).
6. Send message.

### 4. Follow Runbook and Timeline
1. Observe streamed response and tool events.
2. Expand the `Execution Stream` block to inspect live reasoning, tool progress, provider diagnostics, and file activity as the turn runs.
3. Review pre-turn cost estimate when shown (estimated token usage and cost before the turn executes).
4. Expand runbook blocks to inspect decisions.
5. Use `Files changed` cards for per-file review:
   - Open individual file diffs.
   - Undo a single file change or undo all changes in the turn.
   - Batch review all modified files at once.

### 5. Handle Notices and Context Injection
1. Read warning/info notices near timeline top.
2. Use notice actions where available (for example open setup/settings target).
3. For provider/model switch context hints, inject memory/artifacts when offered.

## Attachment Behavior

### Capability Gates
- Image attachments are controlled independently from file attachments.
- File attachments can remain enabled even if image support is disabled.
- Attach button remains visible if either files or images are allowed.

### Native vs Fallback
- Native capability depends on provider/model support.
- File fallback can be enabled with local text extraction runtime.
- Runtime readiness is checked through attachments API status.

### Send-Time Guard
- Pending attachments are revalidated at send-time.
- If provider/model changed and items are now unsupported, send is blocked with a clear notice.

## Common Pitfalls
### What Can Go Wrong
- `Plan` mode selected when expecting execution.
  - Fix: switch to `Execute`.
- No active thread.
  - Fix: create/select thread before sending.
- Attachments blocked after model switch.
  - Fix: remove blocked items or switch to compatible model.
- Runtime missing for fallback extraction.
  - Fix: install/check MarkItDown runtime from settings.

## Related Settings
- `chatMode`
- `permissionMode`
- `riskyActionPolicy`
- `commandSafety`
- `attachmentTextExtraction`
- `agentSettings`

## Related References
- [Command Palette and Shortcuts](./command-palette-and-shortcuts.md)
- [Tools and Approvals](./tools-and-approvals.md)
- [Attachments Guide](./attachments-guide.md)
- [Events and Runbook](./reference/events-and-runbook.md)
- [window.addom API](./reference/window-addom-api.md)
