# Changelog

This changelog is maintained going forward from the current repository baseline.

## Unreleased

## 0.1.2-alpha

- Corrected public documentation to distinguish the `0.1.1-alpha` published baseline from the future `0.1.2-alpha` development target and documented the remaining localization gaps.
- Added a calm sidebar update control with available, download-progress, ready, blocked, installing, and failure states.
- Added launch and 30-minute background update checks with explicit user-controlled download and installation.
- Prevented update installation while tasks, approvals, terminals, or unsaved editor tabs are active, with a final idle-state recheck before restart.
- Switched Windows update handoff to silent installation and direct executable relaunch.
- Refined intermittent history, terminal, recovery, diagnostics, question, and memory surfaces to match ADDOM's compact visual language.
- Removed semantic-colored vertical edge accents from prompts, notices, dialogs, banners, recovery cards, and panels.

## 0.1.1-alpha

- Added managed-plan reveal and save-copy actions with revision-safe document handling.
- Improved plan direction controls, companion layout, and project/thread entry behavior.
- Ordered provider settings by the primary product routes: OpenAI, Cursor, OpenRouter, Anthropic, Gemini, DeepSeek, and xAI Grok.
- Added focused coverage for plan workflows, initial thread creation, provider ordering, and preload contracts.
- Updated transitive build dependencies to resolve the current published security advisories.

## 0.1.0-alpha

- Reworked public setup, contribution, privacy, provider, and platform guidance against the current application.
- Updated the in-app Usage Guide and every locale override to the current Settings, Project Knowledge, and Agents surfaces.
- Added documentation drift checks for local links and documented npm scripts.
- Added opt-in Windows updates from official published GitHub releases.
- Sanitized updater failures before IPC and replaced raw provider responses with localized status messages.
- Prepared the initial public alpha release.
