# Quickstart

## Who This Is For
- First-time ADDOM users.
- Returning users who want the fastest safe setup path.

## Prerequisites
- A local project folder.
- At least one provider API key (unless using a local/no-key provider).
- Internet access for remote providers.

## What This Feature Does
Guides you from fresh launch to first successful assisted edit with approvals and verification.

## Step-by-Step Tasks

### 1. Launch and Choose a Project
1. Open ADDOM.
2. In the main shell, click `Projects`, choose `Open folder`, and select a folder.
3. Continue in the normal workspace flow; ADDOM no longer includes a guided setup wizard.

### 2. Configure Provider Access
1. Open `Settings`.
2. Go to `Providers & Models`.
3. Add API key under `API Keys`.
4. Select provider/model in Chat header.

### 3. Confirm Safety Defaults
1. In the chat header, leave `Permission mode` on `Ask` unless you want workspace autonomy.
2. In `Settings > Tools & Safety`, verify `Guardrails & Diagnostics` is on its default compact state.
3. Leave defaults if unsure.

### 4. Send Your First Prompt
1. Open `Chat`.
2. Ensure mode is `Execute`.
3. Ask a concrete coding task (for example, "Read X file and explain issue Y").

### 5. Handle Tool Approval
1. When approval overlay appears, review:
   - tool name
   - target file/path
   - proposed command/input
2. Approve or deny.
3. Keyboard shortcuts: `Enter` to approve, `Esc` to deny.

### 6. Review Results
1. Inspect turn runbook in timeline.
2. Open `Files changed` card for modified files.
3. Open `Artifacts` to compare revisions if needed.

### 7. Optional: Use Editor and Memory
1. Open `Editor` and verify changes.
2. Use `Ctrl/Cmd+S` to save.
3. Open `Memory` to inspect saved context and nodes.

## Common Pitfalls
### What Can Go Wrong
- No provider key configured:
  - Symptom: stream error or missing model execution.
  - Fix: add key in `Settings > Providers & Models`.
- Wrong mode selected:
  - Symptom: assistant plans but does not execute tools.
  - Fix: switch to `Execute`.
- Denied approval and no action:
  - Symptom: task stalls.
  - Fix: rerun with approval or request alternative approach.
- No active thread:
  - Symptom: composer or thread commands disabled.
  - Fix: create/select a thread first.

## Related Settings
- `chatMode`
- `permissionMode`
- `riskyActionPolicy`
- `commandSafety`

## Related References
- [Chat Guide](./chat-guide.md)
- [Tools and Approvals](./tools-and-approvals.md)
- [Workspace and Threads](./workspace-threads-guide.md)
- [window.addom API](./reference/window-addom-api.md)
