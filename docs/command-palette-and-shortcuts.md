# Command Palette and Shortcuts

## Who This Is For
- Users who prefer keyboard-driven navigation and actions.
- Power users optimizing frequent workflows.

## Prerequisites
- ADDOM open.
- Project opened for project-scoped commands.

## What This Feature Does
Command Palette centralizes navigation and common actions across chat, editor, and memory with availability checks and disabled reasons.

## Step-by-Step Tasks

### 1. Open Command Palette
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS).
2. Type command title or alias.
3. Use arrow keys to select and `Enter` to run.
4. Press `Esc` to close.

### 2. Use Common Navigation Commands
- Open Projects
- Go to Chat
- Go to Editor
- Go to Artifacts
- Go to Memory
- Go to Settings
- Open Project Folder
- Toggle Sidebar

### 3. Use Chat Commands
- New thread
- Rename/delete/clear current thread
- Focus composer
- Jump to latest message
- Open thread selector
- Open background jobs
- Open direct agents menu
- Toggle agent delegation
- Inject memory/artifacts context when provider-switch hint is active
- Open Terminal

### 4. Use Terminal Commands
- The current command-palette action opens the Terminal surface.
- Session creation, switching, takeover, signaling, and closure are available from the Terminal UI when the runtime is supported.

### 5. Use Editor Commands
- Format document when the active file has an active formatter route
- Fix auto-fixable issues when the active file has an active code-action route
- Toggle problems/outline panels
- Markdown: toggle preview
- Markdown: open preview to side
- AI on selection: explain/fix/refactor/tests

### 6. Use Memory Commands
- Export project context JSON
- Open memory panel

### 7. Filter by Category
1. Open the palette.
2. Use the filter chips under the search field:
   - `All`
   - `Recent` (when available)
   - category chips such as `Chat`, `Editor`, `Memory`, and `Navigation`
3. Combine a category filter with search text to narrow results quickly.

## Keyboard Shortcuts Outside Palette
- Global:
  - `Ctrl/Cmd+Shift+P`: open command palette
- Terminal:
  - Windows/Linux `Ctrl+Shift+C`: copy selection
  - Windows/Linux `Ctrl+Shift+V`: paste clipboard
  - Windows/Linux `Ctrl+C`: keep native terminal interrupt behavior
  - macOS `Cmd+C`: copy selection
  - macOS `Cmd+V`: paste clipboard
  - `Ctrl/Cmd+Shift+F`: terminal find
  - `Ctrl/Cmd+Shift+K`: clear terminal buffer
  - `Ctrl/Cmd+Shift+Backtick`: new terminal
  - `Ctrl/Cmd+Shift+W`: close terminal
  - `Ctrl/Cmd+Shift+[` / `Ctrl/Cmd+Shift+]`: switch terminal session
  - `Ctrl/Cmd+=`, `Ctrl/Cmd+-`, `Ctrl/Cmd+0`: zoom terminal text
- Editor:
  - `Ctrl/Cmd+S`: save active tab
  - `Ctrl/Cmd+Shift+V`: toggle markdown preview for active markdown tab
- Tool approval overlay:
  - `Enter`: approve (when allowed)
  - `Esc`: deny

## Common Pitfalls
### What Can Go Wrong
- Command disabled unexpectedly.
  - Fix: read disabled reason (for example no active thread or no open editor tab).
- Running project-scoped command before opening project.
  - Fix: open/select project first.
- Expecting format/fix commands for unsupported editor file types.
  - Fix: read the disabled reason. `Format` and `Fix` now follow the live capability state for the active file.
- Expecting hidden command names.
  - Fix: search by aliases shown in command definitions (for example "autofix", "outline", "switch project").

## Related Settings
- Agent delegation enablement (affects agent-related commands).
- Editor capabilities and open tab state.

## Related References
- [window.addom API](./reference/window-addom-api.md)
- [Chat Guide](./chat-guide.md)
- [Editor Guide](./editor-guide.md)
