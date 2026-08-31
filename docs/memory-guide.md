# Memory Guide

## Who This Is For
- Users who want stronger thread-local recall without polluting other work.
- Users who curate reusable project knowledge.

## Prerequisites
- Project opened.
- Memory panel available.

## What This Feature Does
Memory now uses three lanes:

- `Current Thread`: automatic task-local memory and temporary findings for the active thread.
- `Project`: reusable repo knowledge shared across threads in the same project.
- `Global`: explicit cross-project preferences or habits.

Automatic memory writes default to the current thread when a thread id is available. Project and global memory are meant to be more deliberate.

## Step-by-Step Tasks

### 1. Inspect Memory by Scope
1. Open the `Memory` panel.
2. Use the scope filter to switch between `Current Thread`, `Project`, `Global`, or `All`.
3. Review scope badges, source badges, provenance, and last-used details on each node.

### 2. Search Memory Semantically
1. Enter a focused query in the memory search box.
2. Search respects the active scope filter.
3. Invalidated or superseded nodes are excluded from retrieval and prompt injection.

### 3. Add and Curate Nodes
1. Click `Add`.
2. Provide topic, content, and tags.
3. Pin important nodes.
4. Edit or delete stale nodes.
5. Use explicit actions to:
   - promote thread memory to project memory
   - move eligible memory back to the current thread
   - make memory global
   - invalidate memory that should stop being reused

### 4. Save Terminal Summaries Intentionally
1. Open the retained terminal summary suggestion.
2. Choose `Save to thread memory` for task-local recall.
3. Choose `Save to project memory` only when the summary is reusable beyond the current thread.

### 5. Review Archived Memory Safely
1. Toggle `Show archived` to inspect compressed source logs.
2. Archived nodes are hidden by default, not deleted.
3. Thread compaction and project compaction stay within their own lanes.

### 6. Export Project Context JSON
1. Click `Export JSON`.
2. Choose the save path.
3. Record exported node and revision counts for auditability.

## Compression Behavior
- Compression summarizes older eligible auto-logged memory.
- Thread compaction only touches thread-scoped nodes for the targeted thread.
- Project compaction only touches project-scoped nodes.
- Invalidated or superseded nodes are skipped during retrieval and compaction.
- Compression events remain visible in diagnostics and timeline history.

## Common Pitfalls
### What Can Go Wrong
- Saving temporary findings to project memory too early.
  Fix: keep one-off debugging conclusions in `Current Thread` unless they are clearly reusable.
- Assuming archived means deleted.
  Fix: use `Show archived` to inspect compressed nodes.
- Expecting invalidated memory to appear in prompt context.
  Fix: invalidation is meant to stop reuse; inspect the node in the panel instead.

## Related Settings
- `memoryCompressionEnabled`
- `memoryCompressionThreshold`
- `memoryCompressionCooldownMs`
- `memoryCompressionMaxPerHour`
- `memoryCompressionMinNewLogs`
- `includeGlobalMemoryInContext`

## Related References
- [Settings Catalog](./reference/settings-catalog.md)
- [Events and Runbook](./reference/events-and-runbook.md)
- [window.addom API](./reference/window-addom-api.md)
