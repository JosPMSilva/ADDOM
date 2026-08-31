export const INSTRUCTIONS_CATALOG = {
  version: '2026.04.18.1',
  lastUpdated: '2026-04-18',
  title: 'Using ADDOM',
  description: 'A current guide to the real ADDOM workflow: workspace setup, chat execution, editor tooling, memory, provider setup, and data controls.',
  sections: [
    {
      id: 'workspace-basics',
      title: 'Workspace Basics',
      items: [
        'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
        'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
        'Use the Threads button in Chat to open the thread drawer. Threads can be searched, created, renamed, deleted, and show activity states such as active, pending approval, or blocked.',
        'Cmd/Ctrl+Shift+P opens the command palette. It can navigate panels, manage threads, open the terminal, and trigger editor actions.',
      ],
    },
    {
      id: 'chat-composer',
      title: 'Chat And Composer',
      items: [
        'Pick a provider and model in the composer rail before sending. If a previously selected model disappears, refresh provider data and choose a new one.',
        'Execute is the normal tool-using mode. Plan is tool-free planning. Thinking is brainstorming only and does not execute tools.',
        'The composer supports text, images, and file attachments when the selected model allows them. Some attachments can also be added to the OpenAI project knowledge base.',
        'The chat header keeps the current thread, permission mode, terminal activity, and git summary visible while you work.',
      ],
    },
    {
      id: 'execution-and-terminal',
      title: 'Execution, Approvals, And Terminal',
      items: [
        'Permission mode controls how tool calls are approved: Ask, Autonomy, or Full Access. Hard safety policy can still block unsafe actions.',
        'Live execution and turn runbooks surface streaming progress, approvals, tool activity, file changes, and conflicts directly in the timeline.',
        'Long-running local commands and detached OpenAI background responses appear in Background Jobs, where they can be refreshed or stopped.',
        'The terminal dock lives under the composer. It can browse live sessions, pending approvals, and archived terminal history, and it supports taking over shell control from the model when needed.',
      ],
    },
    {
      id: 'editor-and-reviews',
      title: 'Editor, Changes, And Artifacts',
      items: [
        'The editor includes a file tree, multi-tab editing, dirty tracking, save shortcuts, markdown preview, problems and outline panels, inline completion, and optional format or fix actions when available for the active file.',
        'AI on Selection sends the current selection into chat as explain, fix, refactor, or test-generation context.',
        'Changes shows branch state, staged and unstaged files, filters, searchable lists, SCM detail, restore and unstage actions, and commits from staged files only.',
        'Artifacts stores AI write history and staged suggestions. You can diff revisions, apply suggestions to disk, roll back to an older revision, open the file in the editor, or delete artifact history without deleting the file itself.',
      ],
    },
    {
      id: 'memory-and-continuity',
      title: 'Memory And Continuity',
      items: [
        'Memory nodes can live in the current thread, project, or global scope. You can search, pin, edit, delete, promote, move to global, or keep nodes in the current thread.',
        'The Memory panel also has a thread-history view and can export context JSON that includes memory and artifact data.',
        'Automatic memory compression can archive older material. Archived entries remain reviewable when Show archived is enabled.',
        'Context and continuity indicators in chat help explain how much prior state is being carried forward between turns.',
      ],
    },
    {
      id: 'providers-and-moa',
      title: 'Providers, Knowledge Base, And MoA',
      items: [
        'Provider settings support saved API keys and, for OpenAI, either API key access or account-based access depending how the provider is configured.',
        'OpenRouter catalog visibility can hide noisy namespaces while still allowing explicit route selection.',
        'OpenAI Knowledge Base is project-scoped. Files uploaded there are separate from normal chat attachments and are used for hosted file_search retrieval.',
        'OpenAI account mode does not currently support hosted project knowledge-base assets. Use OpenAI API key mode for that panel.',
        'MoA is optional. When enabled, it adds agent configuration in Settings, a side panel in Chat, and direct-agent quick actions in Execute mode.',
      ],
    },
    {
      id: 'settings-and-data',
      title: 'Settings And Data Controls',
      items: [
        'Settings covers language, project folder, assistant prompt appendix, UI scaling, updates, provider setup, tools and safety, memory and continuity, MoA, and data privacy controls.',
        'Data And Privacy can export the current thread, import thread JSON, clear thread or project history, delete saved API keys, clean provider-budget or spillover data, or fully reset local ADDOM data.',
        'Some settings apply immediately, while a few shell-level changes may still require restarting the app.',
      ],
    },
  ],
}
