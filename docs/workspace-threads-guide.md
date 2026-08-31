# Workspace and Threads Guide

## Who This Is For
- Users managing multiple projects and thread histories.
- Users handling export/import, cleanup, and project transitions.

## Prerequisites
- ADDOM opened.
- At least one project path available.

## What This Feature Does
Workspace features persist projects, threads, and timeline state so you can resume work safely across sessions.

## Step-by-Step Tasks

### 1. Manage Active Projects
1. Use `Projects` in the main shell to open a folder.
2. Use the project entry list to reopen existing projects.
3. Use project actions:
   - Open folder
   - Clear history
   - Remove project entry

### 2. Manage Threads
1. Create thread for each task stream.
2. Rename threads to keep intent clear.
3. Delete obsolete threads.
4. Clear conversation when you want a clean transcript under same thread.

### 3. Export and Import Threads
1. Export thread backup from settings/data controls.
2. Import into current project when needed.
3. Confirm provenance/compliance reminders where shown.

### 4. Leave Workspace Safely
1. If unsaved editor tabs exist, ADDOM prompts:
   - Save all and switch
   - Discard and switch
   - Cancel
2. Choose intentionally to avoid accidental loss.

## Concurrent Background Sessions

When the `perThreadBackgroundSessions` developer flag is enabled, multiple threads can run simultaneously while only one remains visible.

### How It Works
1. Start a run in thread A.
2. Switch to thread B and start another run.
3. Both threads continue executing in the background.
4. Switching back to thread A shows its live progress.

### Thread Drawer Status Indicators
The thread drawer shows real-time status for each thread:
- **Blue pulse** — actively running.
- **Amber pulse** — stale (no heartbeat for 20+ seconds).
- **`!` badge** — pending approval; the thread is blocked until you switch to it and respond.
- **`x` badge** — blocked write conflict or policy denial.
- **No indicator** — idle.

Precedence: `pending_approval` > `blocked` > `stale` > `running` > `idle`.

### Thread-Confined Approvals
- Approval prompts appear only when their originating thread is visible.
- Hidden threads with pending approvals show an urgency badge in the drawer.
- Opening the flagged thread immediately reveals the pending approval.
- No thread can hijack another thread's approval dialog.

### Write Conflict Detection
When two threads modify the same file concurrently:
- The second write is still recorded in the artifact store.
- A `write_conflict` event is emitted to the originating thread.
- The thread drawer shows a `blocked` indicator.
- The conflicting write must be reviewed manually before it is considered resolved.
- Non-overlapping file writes proceed normally with no conflict.

### Cancellation
- The stop button cancels only the currently visible thread.
- Background threads continue until explicitly cancelled.
- Thread switching preserves cancel/stop state.

### Provider/Model Per Thread
Each thread remembers its own provider and model selection. Switching threads restores the correct provider/model pair. New threads inherit the project-level defaults.

## Persistence Notes
- Timeline and runbook events are saved per thread.
- Provider/model context and activity metadata persist with thread history.
- Clearing project/thread does not delete your source files unless explicitly done elsewhere.

## Common Pitfalls
### What Can Go Wrong
- Removing project entry expecting files to be deleted.
  - Fix: understand this removes ADDOM project history entry, not disk files.
- Clearing wrong scope (thread vs project vs workspace).
  - Fix: verify action label and target before confirming.
- Forgetting unsaved tabs before leaving project.
  - Fix: use save-and-leave path in modal.

## Related Settings
- Data reset and transfer controls.
- Compliance export prompts.

## Related References
- [Updates, Backup, and Reset](./updates-backup-reset.md)
- [Settings Reference](./settings-reference.md)
- [window.addom API](./reference/window-addom-api.md)
