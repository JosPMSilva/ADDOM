# Editor Guide

## Who This Is For
- Users editing code directly inside ADDOM.
- Users validating AI changes with diagnostics and selection workflows.

## Prerequisites
- Project opened.
- At least one file opened in Editor.

## What This Feature Does
Editor provides file tree navigation, multi-tab editing, per-file problems, supported format/fix actions, inline completion, selection-to-chat actions, and Markdown preview.

## Capability Labels
- `Monaco-native`: provided by Monaco workers inside the editor. This is separate from the unified editor-service platform.
- `Project-native`: uses a project-local or system-installed tool when one is available.
- `Format-only`: the file type is intentionally limited to request-driven formatting. Diagnostics, hover, go-to-definition, references, symbols, and code actions stay unavailable.
- `Syntax-only`: editing/highlighting is available, but ADDOM does not currently promise semantic editor features for that file type.

Language-service availability is detected per workspace and shown directly in the editor.

## Step-by-Step Tasks

### 1. Open and Edit Files
1. Use file tree to open files.
2. Edit content in tabs.
3. Save with `Ctrl/Cmd+S`.
4. Each explicit save creates a `manual_edit` artifact revision, so the save is visible and rollbackable from `Artifacts`.

### 2. Use Diagnostics
1. Open problems panel for lint/diagnostic findings.
2. Use the problems panel as a per-file surface:
   - JavaScript/TypeScript: project-configured ESLint owns semantic diagnostics and fix actions. `tsserver` handles hover, go-to-definition, references, and symbols when a project-local or system-installed TypeScript runtime is available.
   - Python: `pyright` owns diagnostics, hover, go-to-definition, references, and symbols when a project-local or system-installed Pyright runtime is available.
   - C, C++, and C#: this phase stays syntax-only for semantic editor features. ADDOM does not provide diagnostics, hover, go-to-definition, references, or symbols for these files yet.
   - Format-only files: JSON, JSONC, YAML, TOML, Markdown, HTML, CSS, SCSS, and LESS stay non-semantic in the editor-service model. These files do not expose diagnostics, hover, definitions, references, symbols, or code actions through ADDOM.
   - Other file types: ADDOM keeps editing stable in syntax-only mode.
3. Toggle outline panel for symbol navigation.
   - Current project-native outline support is available for JavaScript/TypeScript through `tsserver` and Python through `pyright`.
3. Use command palette actions for quick panel toggles.

### 3. Format and Autofix
1. Use tab bar actions or command palette:
   - `Format document`: available only when the current file has an active formatter route.
     - JavaScript/TypeScript: Biome with a project Biome config.
     - C and C++: provider-gated `clang-format` route. In this phase the files stay syntax-only for semantic features, and formatting only lights up when the real provider prerequisites land.
     - C#: provider-gated `CSharpier` route. In this phase the file stays syntax-only for semantic features, and formatting only lights up when the real provider prerequisites land.
     - Format-only Biome family: JSON, JSONC, and CSS use the same request-driven Biome route and stay capability-gated until a real Biome config is present.
     - Python: Ruff-only policy. Python formatting is gated on a real Ruff config plus a real Ruff runtime.
     - SCSS, LESS, Markdown, HTML, and YAML: request-driven Prettier route when Prettier is present.
     - TOML: request-driven `smol-toml` route when the bundled formatter is present and the file stays inside the current safe boundary.
     - INI and `.env`: intentionally unsupported. ADDOM does not imply generic support for every config-file format.
   - `Fix auto-fixable issues`: available only when the current file has an active code-action provider.
     - JavaScript/TypeScript: project-configured ESLint.
     - Python: provider-gated Ruff route.
     - C and C++: provider-gated `clang-tidy` route.
     - C#: provider-gated `dotnet format` route.
     - These Python/C/C++/C# fix routes stay cleanly disabled until their real runtime and project prerequisites are present. They do not imply semantic/LSP support.
2. Optional: enable format-on-save behavior when the current file type has an active formatter route.

### C/C++/C# Provider Policy
- C, C++, and C# remain syntax-only for semantic editor features in this phase.
- Provider split for the current rollout plan:
  - C/C++ formatting: `clang-format`
  - C/C++ fixes: `clang-tidy`
  - C# formatting: `CSharpier`
  - C# fixes: `dotnet format`
- Missing runtime, config, compile context, or project context keeps `Format` or `Fix` disabled cleanly.
- Missing optional tooling for these routes does not surface the editor provider-warning banner by itself:
  - missing `clang-format`
  - missing `clang-tidy`
  - missing `CSharpier`
  - missing `dotnet format`
- Real execution failures after a route is available still surface as degraded provider warnings.
- Unsaved-buffer behavior remains a requirement for later implementation phases. Sprint 1 only establishes routing and capability policy.

### Format-Only Language Policy
- Format-only files are request-driven only. ADDOM does not start a long-lived server or persistent provider session for them.
- Missing optional formatter config or runtime stays a capability state. It should disable `Format` cleanly instead of surfacing a degraded service warning.
- Current format-only scope:
  - Biome-backed today when configured: JSON, JSONC, CSS.
  - Prettier-backed today when available: SCSS, LESS, Markdown, HTML, YAML.
  - TOML uses a request-driven `smol-toml` formatter route with an explicit safe boundary: files with TOML comments stay unsupported for formatting in this phase so ADDOM does not strip comments.
- Explicit non-goals in the current config-file family:
  - INI stays unsupported.
  - `.env` stays unsupported.

### Python Formatter Policy
- ADDOM uses a Ruff-only provider policy for Python formatting.
- A Python file is treated as project-configured only when Ruff config is real for that workspace path.
- Accepted Ruff config roots follow Ruff-native config files:
  - `.ruff.toml`
  - `ruff.toml`
  - `pyproject.toml` only when it contains a Ruff section such as `[tool.ruff]` or `[tool.ruff.format]`
- Missing Ruff config keeps Python formatting disabled as capability gating. It is not treated as a degraded provider warning.
- Python semantic support remains separate:
  - `pyright` still owns diagnostics, hover, go-to-definition, references, and symbols.
- Python fix-all uses Ruff when a real Ruff lint config and runtime are available.

### 4. Use AI on Selection
1. Select code.
2. Trigger action:
   - Explain
   - Fix
   - Refactor
   - Generate tests
3. ADDOM injects contextual prelude and opens chat composer.

### 5. Inline Completion
1. Keep inline completion enabled in settings.
2. Type normally to receive ghost-text suggestions.
3. Accept/dismiss suggestions as needed.
4. Review telemetry counters in settings.

### 6. Preview Markdown Files
1. Open a `.md` file in Editor.
2. Toggle preview with `Ctrl/Cmd+Shift+V` or the `Preview` button in the tab action row.
3. Use split-pane resize handle to adjust editor/preview width.
4. Click markdown links:
   - Workspace-relative links open the target file in Editor.
   - `http/https` links open in your default browser.
   - `#anchor` links scroll inside the preview.
5. Image behavior in this release:
   - `http/https/data/blob` images render in preview.
   - local workspace relative images show a placeholder message (follow-up release).

## External File Change Handling
- Editor listens for external file change events.
- If file changed outside editor, you get a warning with reload option.
- Unsaved edits are preserved until you choose action.

## Inline Git Diff
- The editor can show inline git diff markers for the current file and a repo-wide Source Control panel for changed files.
- Source Control groups changed files into separate `Unstaged` and `Staged` lists and opens the editor in the matching scope.
- Current-file overlays now support explicit `Unstaged` and `Staged` scope switching. These scopes stay separate in the UI and are never merged into one ambiguous overlay.
- Hovering a changed region shows a short hunk preview.
- Inline hunk actions support `Stage hunk` and `Discard hunk` in unstaged scope.
- Staged scope uses `Unstage hunk` and `Unstage lines`. These actions operate on the index only and never reuse `Discard` semantics.
- Line-level actions are available only when ADDOM can synthesize an exact patch for the selected changed lines and `git apply --check` succeeds for that patch. If the selection is ambiguous or validation fails, line actions stay disabled and hunk actions remain the fallback.
- When a file has both staged and unstaged changes, staged scope swaps the visible editor model to a read-only index-backed preview. ADDOM does not imply that the live editable buffer matches the staged content.
- Unsaved editor tabs suppress inline git overlays and actions so the editor does not imply that dirty buffer content matches on-disk git state.
- Source Control now exposes explicit detail states for:
  - deleted files with read-only preview payloads plus `Restore file` for unstaged deletes or `Unstage deletion` for staged deletes when git metadata supports the action
  - renamed or copied files with old/new path metadata; staged renames can expose `Unstage rename` only when both paths are known
  - binary files with summary metadata only
  - submodules with commit-pointer metadata
  - merge conflicts with unmerged stage metadata
- The Source Control panel includes a minimal staged-only commit box and branch/status header.
- Current non-goals: branch create/switch management, dedicated conflict-resolution UI, and any renderer-side git execution.

## Watcher Cap Notes
- If directory watcher cap is reached, Editor warns that some folders are not actively watched.
- Manual refresh and explicit file open still work.

## Common Pitfalls
### What Can Go Wrong
- Editing wrong file version after external changes.
  - Fix: use reload-from-disk prompt.
- Expecting fix/autofix support in unsupported file types.
  - Fix: `Fix` only appears when the current file has an active code-action provider.
- Expecting format support in unsupported file types.
  - Fix: `Format` and format-on-save only work when the current file has an active formatter route.
- Expecting C/C++/C# actions to light up without the host toolchain.
  - Fix: install the corresponding real tool and keep the required project config/context in place; the editor stays quiet and leaves the action disabled when those prerequisites are absent.
- Expecting semantic editor features in format-only files.
  - Fix: JSON, JSONC, YAML, TOML, Markdown, HTML, CSS, SCSS, and LESS are format-only paths. They can gain request-driven formatting, but diagnostics, hover, definitions, references, symbols, and code actions stay unavailable.
- Expecting TOML formatting in comment-bearing files.
  - Fix: the current TOML formatter route stays disabled for files with TOML comments so formatting cannot drop them.
- Expecting INI or `.env` formatting because YAML/TOML are supported.
  - Fix: INI and `.env` remain explicit unsupported config-file types in this phase.
- Expecting Python formatting without Ruff project config.
  - Fix: add a real Ruff config in `.ruff.toml`, `ruff.toml`, or `pyproject.toml` with a Ruff section.
- Expecting Python auto-fix support.
  - Fix: Python fix-all is Ruff-gated. Add a real Ruff lint config such as `[tool.ruff.lint]` before expecting `Fix auto-fixable issues` to appear.
- Expecting outline/symbol navigation outside JavaScript/TypeScript and Python.
  - Fix: current project-native outline support is limited to JS/TS through `tsserver` and Python through `pyright`.
- No selection context for AI-on-selection commands.
  - Fix: select code before running action.
- Local markdown image path does not render.
  - Fix: expected for current MVP; use external/data image source or open image file directly.

## Related Settings
- `inlineCompletionEnabled`
- `editorLanguageServicePlatform`
- Editor assist telemetry controls.
- Command palette and editor action shortcuts.

## Related References
- [Command Palette and Shortcuts](./command-palette-and-shortcuts.md)
- [Settings Reference](./settings-reference.md)
- [window.addom API](./reference/window-addom-api.md)
