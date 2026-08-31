# Settings Reference

ADDOM Settings is organized into seven focused categories: General, Appearance, Terminal, Agents, Providers, Safety, and Data. Each page uses compact grouped rows without section accordions.

Project selection is not a setting. Open or switch projects and threads from the project/thread drawer, then return to Settings for project-scoped options.

## Categories and sections

### General

- **Usage Guide:** Open the in-app instructions catalog.
- **Language:** Follow the operating system language or choose a shipped locale. This changes renderer UI copy, not assistant language or backend behavior.
- **Updates:** Check, download, and install ADDOM updates.
- **About:** Review version, product, license, source-notice, and third-party information.

### Appearance

- **UI Scaling:** Use automatic or manual shell density, adjust shell and chat text scale, or reset scaling.

### Terminal

- Configure font size, font family, default shell, start folder, copy-on-selection, scrollback, and large-paste confirmation.

### Agents

- **Custom Instructions:** Save persistent instructions appended to assistant prompts.
- **Agent roles:** Open the focused manager from the roles count. Delegation and capacity
  are compact preference rows, while low-level limits remain behind **Advanced limits**.
- **Advanced limits:** Edit bounded live-agent, recursion-depth, descendant, token, cost,
  and duration values. Provider-specific limits appear only after an override is added.
  Advanced changes require an explicit save; delegation and capacity save immediately.
- **Roles:** Select a role row to edit or remove it. Use **Add agent role** or
  **Skill Catalog** to create one.

Roles remain configurable while delegation is disabled. Write isolation is always
required and is not presented as a user-editable policy.

The main process clamps every value to a hard ceiling. A child inherits and may narrow
the root turn's permission; it cannot widen it.

### Providers

Provider connections appear in this order: OpenAI, remote providers, then local providers.

- Add, replace, or remove remote-provider API keys.
- Choose OpenAI account or API-key authentication. Account mode supports browser login, reconnect, disconnect, pending-login actions, and Codex runtime maintenance.
- Review local-provider availability and discovered model count.
- For OpenRouter, select **Manage visibility** to open its focused catalog manager.

#### OpenRouter catalog manager

The manager keeps the large catalog out of the provider credential row.

- Search namespace names, model names, and route IDs. Search results show matching models directly.
- Browse namespaces, then open a namespace to manage individual routes.
- Use **Rules** for Reviewed only, Tools, Reasoning, and Vision visibility rules.
- Use the quick-actions menu to show all, hide all, or reset visibility.
- Namespace and model switches preserve the existing default, namespace-override, and model-override settings model.

#### Project Knowledge

Project Knowledge appears only when OpenAI hosted tools and `file_search` are enabled.

- Requirements and the active project scope are shown inline.
- Refresh state, upload files, prepare or refresh retrieval storage, and attach pending files.
- Review uploaded and attached counts, remove individual files, or reset Project Knowledge.
- Account authentication is not currently supported for this feature; use an OpenAI API key.
- Files added here are hosted for project retrieval. Normal chat attachments remain local unless explicitly added to Project Knowledge.

### Safety

- **Execution Mode:** Choose Ask, Autonomy, or Full Access. The selection stays synchronized with the chat permission control.
- **Guardrails:** Review which risky actions require approval, the active project session scope, and how the selected execution mode changes interruptions. Hard-deny policy outcomes remain blocked in every mode.

Recommended baseline: keep **Ask** unless routine work inside the active project should proceed autonomously.

### Data

Data actions are ordered by scope and consequence.

- **Export Current Thread:** Create a portable JSON backup. Citation and attribution metadata can be preserved. Strict compliance mode requires explicit confirmation.
- **Restore from JSON:** Import a previously exported thread into the active project.
- **Delete current chat:** Remove only the active conversation; project files remain.
- **Delete project history:** Remove all saved threads for the active project; project files remain.
- **Delete saved API keys:** Remove stored provider credentials while retaining conversations, artifacts, memory, and settings.
- **Reset local profile & restart:** Remove local history, cached models, attachments, credentials, and saved settings, then restart ADDOM.

Destructive actions require confirmation. Read the confirmation scope before continuing.

## Keyboard and narrow layouts

- The active category is exposed to assistive technology and can be reached by keyboard.
- Focused role-management and OpenRouter views return focus to the control that opened them.
- Menus close on selection, Escape, or outside input.
- At narrow widths, the seven categories become a horizontally scrollable row and preference controls stack when necessary.

## Related references

- [Tool Catalog](./reference/tool-catalog.md)
- [Attachments Guide](./attachments-guide.md)
- [Agents Guide](./agents-guide.md)
