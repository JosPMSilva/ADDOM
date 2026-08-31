# Tool Catalog

## Who This Is For
- Users reviewing what tools the assistant can invoke.
- Users defining safe approval and permission policies.

## Prerequisites
- Familiarity with Execute mode and approval overlay.

## What This Feature Does
Lists user-facing tools, intent, risk level, and operational notes.

## Step-by-Step Tasks
1. Match your task to the lowest-risk tool that solves it.
2. Verify `Permission mode` and command safety settings before execution.
3. Approve only expected input/path/command values.

## Tools

| Tool | Purpose | Risk | Notes |
|---|---|---|---|
| `read_file` | Read full file content | Low | Use before edits. |
| `write_file` | Create/overwrite file | High | Rewrites entire target content. |
| `list_directory` | List directory tree with depth/pagination | Low | Good first-step project discovery. |
| `search_code` | Search codebase by query/pattern | Low | Supports extensions/path/limit. |
| `edit_file` | Targeted find/replace edit | High | Requires exact unique match. |
| `delete_file` | Delete file | High | Destructive operation. |
| `rename_file` | Move/rename file | High | Changes path references. |
| `create_directory` | Create directory path | Low | Safe scaffold operation. |
| `view_file_range` | Read specific line range | Low | Useful for large files. |
| `grep_file` | Search pattern inside one file | Low | Focused alternative to `search_code`. |
| `rollback_file` | Restore file from previous revision | High | Requires careful revision choice. |
| `find_files` | Find files by pattern/glob | Low | Discovery helper. |
| `git_status` | Show repo status | Low | Read-only git helper. |
| `git_diff` | Show diff | Low | Read-only change inspection. |
| `git_log` | Show commit history | Low | Read-only history inspection. |
| `git_commit` | Create commit | High | Modifies repository history. |
| `git_checkout_file` | Restore file from ref | High | Overwrites working tree file. |
| `delegate_to_workers` | Fan out to MoA agent roles | Low | Parallel orchestration entrypoint. |
| `apply_artifact_revision` | Apply staged artifact revision | High | Writes staged revision to disk. |
| `fetch_page` | Fetch public web page content | Medium | Network-bound tool; URL must be public. |
| `browser_action` | Drive a real browser session for navigation, clicking, typing, screenshots, and page inspection | High | Approval-gated; can use bundled Chromium when prepared. |
| `run_command` | Execute shell command | Critical | Strongest side effects; policy-gated. |

## Enablement Gates
- Tools appear only on executable turns (`chatMode = execute`).
- The resolved provider/model adapter and tool surface determine whether ADDOM-native or provider-native tools are exposed.
- `permissionMode` affects when approval prompts appear, not whether file tools exist in the catalog.
- MoA tools appear only when MoA is enabled in relevant mode.
- Browser automation can use a bundled Playwright Chromium runtime when present, or fall back to a supported system browser.

## Common Pitfalls
### What Can Go Wrong
- Using `write_file` for small edits.
  - Fix: prefer `edit_file` when possible.
- Running `run_command` for long service in foreground.
  - Fix: use background mode.
- Approving a `browser_action` without checking the target/origin.
  - Fix: inspect the browser-action approval panel before approving elevated or cross-origin interactions.
- Applying staged artifacts without diff inspection.
  - Fix: review in Artifacts first.

## Related Settings
- `permissionMode`
- `riskyActionPolicy`
- `commandSafety.*`
- `agentSettings`

## Related References
- [window.addom API](./window-addom-api.md)
- [Settings Catalog](./settings-catalog.md)
- [Tools and Approvals](../tools-and-approvals.md)
