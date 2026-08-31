# Artifacts Guide

## Who This Is For
- Users reviewing AI-generated file history.
- Users performing rollback/apply workflows safely.

## Prerequisites
- Project opened.
- At least one tracked file with revisions.

## What This Feature Does
Artifacts store versioned file revisions and provide diff, rollback, apply, and cleanup controls.
Explicit editor saves are also tracked as artifact revisions with source `manual_edit`.

## Step-by-Step Tasks

### 1. Open Tracked File History
1. Open `Artifacts` panel.
2. Select file from tracked file list.
3. Review revision count and source labels.

### 2. Compare Revisions
1. Choose base and head revisions.
2. Inspect side-by-side diff viewer.
3. Validate change intent before action.

### 3. Apply Suggested Revisions
1. Select head revision with source `ai_suggestion`.
2. Click `Apply to disk`.
3. Confirm new revision is recorded after apply.

### 4. Roll Back a File
1. Select base revision to restore.
2. Click rollback action.
3. Verify new rollback revision appears.

### 5. Roll Back A Manual Editor Save
1. Save a file in Editor.
2. Open `Artifacts` and select that file.
3. Find the revision with source `manual_edit`.
4. Roll back to the earlier revision if you want to restore the prior disk content.

### 6. Cleanup History
1. Delete individual revision when needed.
2. Delete full history for selected file (does not delete disk file).

## Common Pitfalls
### What Can Go Wrong
- Confusing suggestion revisions with applied disk state.
  - Fix: check revision source and apply explicitly.
- Rolling back to wrong base revision.
  - Fix: inspect base/head selector carefully before rollback.
- Deleting history expecting file deletion.
  - Fix: artifact deletion removes revision history only.

## Related Settings
- Data reset controls in Settings.
- Delegated-agent write integration (if enabled).

## Related References
- [Events and Runbook](./reference/events-and-runbook.md)
- [Agents Guide](./agents-guide.md)
- [window.addom API](./reference/window-addom-api.md)
