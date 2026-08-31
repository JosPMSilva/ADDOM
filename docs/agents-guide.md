# Agents Guide

## What Agents Do

ADDOM can delegate bounded parts of a root task to specialized child agents. Child work
returns to the root assistant, which continues the user's turn and owns the final answer.

This keeps the normal chat contract intact:

- the user speaks to one root assistant
- ADDOM, not the model provider, owns the configured-role catalog and execution plan
- child agents provide attributable evidence and changes
- detailed child conversations remain inspectable in the Agents panel
- the root synthesizes large fan-out instead of pasting every report

## Configure Agents

Open **Settings > Agents**. The focused role manager provides:

- **Agent delegation:** whether the root may delegate to child agents
- **Capacity:** Conservative, Balanced, High, or Ultra
- **Advanced limits:** live agents, recursion depth, descendants, tokens, cost,
  duration, and optional provider-specific overrides
- **Agent roles:** reusable role definitions available to the root assistant

Hard ceilings are enforced by the main process regardless of saved values. Delegation
and capacity save immediately; advanced changes require an explicit save. Write
isolation is always required.

A role defines its name, provider, model, and optional instruction. Providers can differ
between roles, including supported OpenRouter routes. A role cannot widen the root
turn's permission.

## How Role Selection Works

When delegation is available, ADDOM exposes two provider-neutral tools to the root model:

- `agent_catalog` returns sanitized JSON describing the configured roles and runtime limits.
- `delegate_tasks` accepts task briefs while ADDOM owns exact role resolution, expansion,
  admission, and execution.

The model never needs to reproduce internal role keys. If the user asks for every
configured role, ADDOM expands that intent from the current catalog and assigns each
role once. Named roles are resolved against the catalog before any child starts. Invalid
or unavailable assignments fail in preflight instead of silently changing providers or
duplicating another role.

## Run And Inspect Delegation

The root may infer that a complex task benefits from delegation, or the user can request
specific roles directly. Direct role requests still execute inside the root turn.

During a run:

1. Compact child references appear in the root execution stream.
2. The **Agents** panel groups active and completed children.
3. Selecting a child opens its Markdown conversation in the main viewport.
4. Child findings return to the root for synthesis under the original user intent.

Rows with descendants and large completed groups are collapsible so wide runs remain usable.

## Results, Cost, And Partial Runs

ADDOM asks before launching more children than the configured fan-out confirmation
threshold. Capacity and provider caps queue or reject excess work rather than creating
unbounded processes.

A run can complete with partial results. Completed children still return evidence;
failed children remain visible with their own error and retry capability where supported.

- **Stale:** the provider stopped producing progress for too long.
- **Timeout:** the total execution-duration boundary was reached.
- **Opaque:** the provider cannot expose reliable child-level detail or controls.

ADDOM does not silently reroute failed work to a different provider or fabricate child lineage.

## File Changes And Approvals

Parallel writers never share an unrestricted mutable workspace. File-writing children
use staged overlays or managed worktrees, with provenance preserved for review and merge.

Approvals are bound to the child attempt, permission, and workspace snapshot. Children
inherit and may narrow the root permission; they cannot widen it.

## Persistence

Agent graphs, transcript segments, usage, approvals, and artifacts are durable. After a
restart, ADDOM reconstructs the Agents panel and child conversations from the canonical
Agent Run store rather than a renderer-only cache.

## Related References

- [Agent Delegation Workflow](./architecture/agent-delegation-workflow.md)
- [Agent Orchestration Architecture](./architecture/agent-orchestration.md)
- [Settings Reference](./settings-reference.md)
- [Artifacts Guide](./artifacts-guide.md)
- [Events and Runbook](./reference/events-and-runbook.md)
