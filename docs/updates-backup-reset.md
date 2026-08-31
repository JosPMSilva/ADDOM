# Updates, Backup, and Reset

## Who This Is For
- Users managing app lifecycle operations.
- Users handling thread transfer, cleanup, and recovery.

## Prerequisites
- Settings access.
- Active project/thread for scoped actions.

## What This Feature Does
Provides update controls, thread export/import, and scoped data reset actions.

## Step-by-Step Tasks

### 1. Check and Install Updates
1. Open `Settings > General > Updates`.
2. Check for updates.
3. Download update when available.
4. Install update when download completes.

### 2. Export Thread Backup
1. Open `Settings > Data`.
2. Export current thread backup.
3. Save file in a secure location.

Agent Runs associated with the thread remain local runtime records. The thread export
format does not promise a portable provider-native child session.

### 3. Import Thread Backup
1. Open the restore action in the Data category.
2. Select valid exported payload.
3. Confirm import target project/thread behavior.

### 4. Use Reset Actions Carefully
- Clear current thread:
  - removes current thread transcript/history and its scoped Agent Run history.
- Clear current project:
  - removes project-scoped ADDOM history, including scoped Agent Runs.
- Clear memory and transcript workspace-wide:
  - broadest reset scope; use only intentionally.

Older profiles may retain a legacy migration backup. The active Agent Run runtime does
not read that backup; ADDOM preserves it only as local rollback evidence.

## Common Pitfalls
### What Can Go Wrong
- Running broad reset unintentionally.
  - Fix: verify scope label before confirming.
- Assuming export/import is provider-agnostic with no policy context.
  - Fix: review compliance/provenance notes during export/import flows.
- Installing updates mid-critical workflow.
  - Fix: finish or checkpoint active task before install.

## Related Settings
- Updates section controls.
- Data reset section controls.
- Compliance mode for warning/confirmation behavior.

## Related References
- [Workspace and Threads Guide](./workspace-threads-guide.md)
- [Settings Catalog](./reference/settings-catalog.md)
- [window.addom API](./reference/window-addom-api.md)
