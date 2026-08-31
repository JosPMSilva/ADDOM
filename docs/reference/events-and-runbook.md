# Events and Runbook Reference

## Who This Is For
- Users and maintainers validating execution transparency in timeline/runbook.

## Prerequisites
- Familiarity with chat timeline and runbook UI.

## What This Feature Does
Documents the major event types shown during chat turns and how they map to runbook/file-change views.

## Step-by-Step Tasks
1. Start an Execute-mode turn.
2. Observe timeline as events stream.
3. Expand runbook and file-change cards for details.
4. Correlate event kinds using this reference.

## Turn Lifecycle (High Level)
1. Turn starts (`chat:turn-state` started).
2. Model output streams (`chat:chunk`).
3. Optional reasoning streams (`chat:reasoning-chunk`, `chat:reasoning-done`).
4. Optional tool orchestration:
   - pending
   - executing
   - result
5. Optional file-change/memory/continuity events.
6. Turn done or error/cancel.

## Live Execution Stream
- `Execution Stream` is the compact live view that groups reasoning, tool progress, diagnostics, and file activity for the current turn.
- Narrative reasoning can render as structured prose blocks.
- Short milestone-style reasoning can render as compact step rows instead of full prose cards.
- Provider/runtime warnings can appear inline when a turn completes with degraded capability or missing tool support.

## Key Chat Event Families

## Streaming and Completion
- `chat:chunk`
- `chat:done`
- `chat:error`
- `chat:cancelled`

## Tooling and Approval
- `chat:tools-pending`
- `chat:tool-executing`
- `chat:tool-result`
- `chat:approval-countdown`
- `chat:approval-timeout`
- `tool:approval-request` (overlay trigger)

## Reasoning and Usage
- `chat:reasoning-chunk`
- `chat:reasoning-done`
- `chat:usage`
- `chat:cost-estimate`

## Context, Memory, Continuity
- `memory:context-injected`
- `chat:memory-compressed`
- `chat:context-compacted`
- `chat:continuity-status`
- `chat:continuity-packet`
- `chat:openai-compaction-event`
- `chat:anthropic-compaction-event`
- `chat:compression-state`

## File and Artifacts
- `chat:file-change`
- `artifacts:updated`

## Compliance and Notices
- `chat:compliance-event`
- `chat:notice`

## Agent Event Family

The persisted `moa:*` names below are legacy internal event identifiers. They belong to
the current Agents runtime and remain stable for stored event compatibility.
- `agents:fanout-confirm-request`
- `moa:delegation-planned`
- `moa:delegation-cost-warning`
- `moa:delegation-fanout-confirmed`
- `moa:delegation-start`
- `moa:worker-start`
- `moa:worker-done`
- `moa:worker-error`
- `moa:agent-recovery`
- `moa:worker-file-staged`
- `moa:delegation-done`

## Agent Status Semantics
- `timeout`: delegation or agent work exceeded the hard configured time budget.
- `stale`: the delegated agent stream stopped producing progress before the hard delegation deadline was reached.
- `completed_with_errors`: delegation finished, but at least one agent did not complete cleanly.

## Agent Recovery Semantics
- `moa:agent-recovery`: loop guard tripped, ADDOM narrowed the tool surface for one explicit retry, and the event is shown in the runbook before the worker either recovers or fails.

## Runbook UI Notes
- Runbook groups tool/system activities by turn.
- File-change card appears below runbook when a turn contains file changes.
- File-change rows support:
  - open/review
  - approve
  - undo one
  - undo all
- Live rows can show:
  - `Live updates`
  - `Diff ready`
  - `Diff unavailable`
  - `Updated Xs/m/h ago`

## Compaction Event Semantics
- Provider compaction event rows are concise by default and focus on:
  - compaction mode
  - boundary phase (`imminent`, `applied`, `resumed_after`)
  - carry-forward source (`continuity packet`, `compaction handoff`, or both)
  - canonical handoff usage
- Runtime diagnostics keep full raw key/value detail for debugging, but those details are developer-oriented and not the default user-facing stream.
- Automatic provider compaction events are shown as compaction milestones in the execution stream.

## Common Pitfalls
### What Can Go Wrong
- Reading assistant text only and missing event diagnostics.
  - Fix: inspect runbook + event kind details.
- Confusing event arrival timing with strict transactional order.
  - Fix: use turn/sequence metadata and final state markers.

## Related Settings
- Command safety detail mode.
- Memory/continuity policy.
- Agent capacity, policy, and budget settings.

## Related References
- [window.addom API](./window-addom-api.md)
- [Chat Guide](../chat-guide.md)
- [Agents Guide](../agents-guide.md)
