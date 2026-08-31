# ADDOM Documentation

This documentation is organized for fast setup and reliable day-to-day operation.

## Project Docs
- [Repository README](../README.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Changelog](../CHANGELOG.md)
- [Security Policy](../SECURITY.md)
- [Design System Workflow](./design-system.md)

## Start Here
1. [Quickstart](./quickstart.md)
2. [Core Concepts](./core-concepts.md)
3. [Chat Guide](./chat-guide.md)
4. [Tools and Approvals](./tools-and-approvals.md)
5. [Editor Guide](./editor-guide.md)

## Daily Workflow Guides
- [Workspace and Threads](./workspace-threads-guide.md)
- [Command Palette and Shortcuts](./command-palette-and-shortcuts.md)
- [Settings Reference](./settings-reference.md)
- [Attachments Guide](./attachments-guide.md)
- [OpenRouter BYOK and Smoke](./openrouter-byok-and-smoke.md)
- [Updates, Backup, and Reset](./updates-backup-reset.md)

## Advanced Guides
- [Memory Guide](./memory-guide.md)
- [Artifacts Guide](./artifacts-guide.md)
- [MoA Guide](./moa-guide.md)

## Architecture
- [Agent Orchestration Architecture](./architecture/agent-orchestration.md)
- [Chat Command Surface Architecture](./architecture/chat-command-surface.md)
- [Event Bridge and Execution Stream](./architecture/event-bridge-and-execution-stream.md)
- [Continuity System Architecture](./architecture/continuity-system.md)
- [Reasoning Render Pipeline](./architecture/reasoning-render-pipeline.md)

## Troubleshooting
- [Troubleshooting](./troubleshooting.md)

## Reference
- [Design Contract](../DESIGN.md)
- [window.addom API](./reference/window-addom-api.md)
- [Tool Catalog](./reference/tool-catalog.md)
- [Settings Catalog](./reference/settings-catalog.md)
- [Events and Runbook](./reference/events-and-runbook.md)
- [OpenRouter Compatibility Matrix](./reference/openrouter-compatibility-matrix.md)

## Documentation Controls

- Source file size guard: run `npm run check:max-lines`; strict legacy cleanup preview is documented in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Security Notes
- [Security CSP Threat Model](./security-csp-threat-model.md)

## Documentation Governance
- Every user-facing feature must be represented in:
  1. `docs/coverage-matrix.md`
  2. At least one task guide and/or reference page
  3. Relevant troubleshooting entries if failure modes exist
- If behavior changes, docs must be updated in the same feature cycle.
