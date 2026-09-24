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
The available update controls depend on how ADDOM was installed:

- Windows builds downloaded from GitHub use ADDOM's official published GitHub
  releases. ADDOM checks shortly after launch and every 30 minutes in the
  background, but does not download an update until you choose to do so. Draft
  releases are not offered.
- Microsoft Store builds are signed, delivered, and updated by Microsoft Store.
  **Settings > General > Updates** identifies the managed channel and does not
  offer the GitHub download or install actions.
- macOS and Linux updates are currently manual.

For a GitHub-distributed Windows build:

1. Open **Settings > General > Updates**.
2. Check manually, or use the update control that appears above Settings when a candidate is found.
3. Download the update when available. The icon shows circular progress without opening a separate progress panel.
4. Install after the download completes. ADDOM requires confirmation and waits until tasks, approvals, terminals, and unsaved editor tabs are clear before restarting.

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
