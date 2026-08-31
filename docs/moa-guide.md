# Agents and Subagents Guide

## What Agents Do

ADDOM can delegate bounded parts of a root task to specialized child agents. Child work
always returns to the root assistant, which continues the user's turn and owns the final
answer.

This keeps the normal chat contract intact:

- the user speaks to one root assistant
- child agents provide attributable context and changes
- detailed child conversations remain inspectable
- the root summarizes large fan-out instead of pasting every report

## Configure Agents

Open `Settings > Agents`.

The focused Agent roles view keeps the everyday controls compact:

- **Agent delegation:** whether the root may delegate to child agents
- **Capacity:** Conservative, Balanced, High, or Ultra
- **Advanced limits:** a collapsed editor for live agents, recursion depth, descendants,
  tokens, cost, duration, and optional provider-specific overrides
- **Agent roles:** the reusable roles available to the root assistant

Hard ceilings are enforced by the main process regardless of the saved values.
The delegation switch and capacity profile save immediately. Advanced changes remain a
draft until explicitly saved, and provider-specific controls appear only after an
override is added. Write isolation is always required.

Open the roles count from `Settings > Agents` to create or edit reusable roles. A role
defines its name, provider, model, and optional instruction. Select an existing role to
edit it or remove it. A role cannot widen the root turn's permission.

## Delegate Work

The root may decide that a task benefits from delegation, or the user can mention
configured roles directly. Direct mentions still run inside the root turn; they are not
standalone assistant answers.

During a run:

1. Compact child references appear in the root execution stream.
2. The right-side **Agents** panel groups active and completed children.
3. Select a child to inspect its full Markdown conversation in the main viewport.
4. Return to the root without losing the child's selection or scroll context.

Rows with descendants and large completed groups are collapsible so wide runs remain
usable.

## Results and Next Actions

Each child returns a concise conclusion and evidence to its parent. The root then decides
how to continue under the user's original request:

- If the user asked for review only, the root presents findings and asks before making
  changes.
- If the user already asked to review and fix, the root may apply fixes during the same
  turn.
- If a decision would expand scope or authority, the root asks first.

For large fan-out, the final answer contains a synthesized outcome, not one report per
agent. Full child detail remains available in the Agents panel.

## Cost, Capacity, and Partial Results

ADDOM asks before the root orchestrator launches more agents than the configured
fan-out confirmation threshold. The user can launch the requested count, limit the
run to the threshold, or stop the turn. Cost and token estimates remain internal;
capacity and provider caps queue or reject excess work rather than creating
unbounded processes.

A run can complete with partial results. Completed children still return useful evidence;
failed children remain visible with their own error and retry capability where supported.

Status meanings:

- **Stale:** the provider stopped producing progress for too long.
- **Timeout:** the total execution-duration boundary was reached.
- **Opaque:** the provider cannot expose reliable child-level detail or controls.

ADDOM does not silently route failed work to a different provider or fabricate child
lineage.

## File Changes and Approvals

Parallel writers never share an unrestricted mutable workspace. File-writing children use
staged overlays or managed worktrees, with provenance preserved for review and merge.

Approvals are bound to the child attempt, permission, and workspace snapshot. Children
inherit and may narrow the root permission; they cannot widen it.

## Persistence

Agent graphs, transcript segments, usage, approvals, and artifacts are durable. Restarting
ADDOM reconstructs the Agents panel and child conversation from the canonical Agent Run
store rather than a renderer-only cache.

## Related References

- [Agent Orchestration Architecture](./architecture/agent-orchestration.md)
- [Settings Reference](./settings-reference.md)
- [Artifacts Guide](./artifacts-guide.md)
- [Events and Runbook](./reference/events-and-runbook.md)
