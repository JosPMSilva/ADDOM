# Core Concepts

## Who This Is For
- New and existing ADDOM users who want a solid mental model before using advanced features.

## Prerequisites
- ADDOM installed and opened at least once.
- Basic familiarity with "project folder", "thread", and "model".

## What This Feature Does
Explains the core objects and flows used across the app so behavior in Chat, Editor, Memory, and Agents is predictable.

## Core Model

### Workspace and Project
- A workspace is your local ADDOM data store.
- A project is a folder you open and manage in Active Projects.
- Project-level data is persisted (threads, timeline, memory nodes, artifact revisions).

### Thread and Turn
- A thread is a conversation context inside a project.
- A turn is one user request and all system/tool activity produced to respond to it.
- Turn activity is persisted and visible in runbook/timeline entries.

### Timeline and Runbook
- Timeline stores messages and system/tool events.
- Runbook groups execution events for transparency.
- File changes produced during a turn are shown in a dedicated "Files changed" card.

### Modes
- `Execute`: assistant can use tools (approval-gated).
- `Plan`: structured planning without tool execution.
- `Thinking`: ideation and tradeoff exploration without tool execution.

### Tools and Approval
- Tool calls are never silent.
- High-impact tools require explicit user approval before execution.
- Permission mode and runtime guardrails determine when execution pauses for approval versus continuing automatically.

### Artifacts and Revisions
- AI file writes and isolated agent changes become artifact revisions.
- You can compare, apply, rollback, and delete revision history.

### Memory and Continuity
- Memory stores project knowledge over time (auto logs, summaries, user notes).
- Continuity packages relevant context into later turns.
- Compression archives older auto logs while preserving auditability.

### Agents
- The root assistant can delegate scoped work to configured agent roles.
- ADDOM generates the available-role catalog and resolves requested roles before execution.
- Child permissions cannot exceed the root turn's permission ceiling.
- Agent writes use isolated workspaces and return through a reviewed integration path.
- Capacity, cost, token, and duration limits protect against unbounded usage.

## Step-by-Step Tasks
1. Open a project from Projects in the main shell.
2. Create or open a thread in Chat.
3. Send a request in Execute mode.
4. Approve a tool action when prompted.
5. Inspect runbook events and file changes.
6. Review resulting revisions in Artifacts.

## Common Pitfalls
### What Can Go Wrong
- Confusing project-level state with thread-level state.
- Expecting Plan/Thinking mode to execute tools.
- Assuming staged agent output is already applied to disk.
- Ignoring runbook and missing why a change happened.

## Related Settings
- Chat mode.
- Permission mode and guardrails.
- Memory compression and continuity policy.
- Agent delegation, roles, capacity, and advanced limits.

## Related References
- [Settings Catalog](./reference/settings-catalog.md)
- [Events and Runbook](./reference/events-and-runbook.md)
- [Tool Catalog](./reference/tool-catalog.md)
