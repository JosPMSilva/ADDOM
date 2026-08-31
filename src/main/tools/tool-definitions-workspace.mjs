/** Extracted tool schemas. */

export const WORKSPACE_TOOLS = [
{
    name: 'read_file',
    description: 'Read the complete text content of a file in the project folder. Use this before editing to see the current content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project root, e.g. "src/auth.js"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write complete content to a file in the project folder (creates or overwrites). Read the file first when replacing existing content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project root.',
        },
        content: {
          type: 'string',
          description: 'The complete new file content.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories with optional depth and pagination. Respects common ignores and project .gitignore rules when possible. Use this to explore the project structure.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to the project root. Defaults to the root "." if omitted.',
          default: '.',
        },
        depth: {
          type: 'integer',
          description: 'Traversal depth starting at 1 (default: 1). Higher values include nested entries.',
          minimum: 1,
          maximum: 6,
          default: 1,
        },
        offset: {
          type: 'integer',
          description: 'Pagination offset for entries (default: 0). Use the continuation hint from prior output.',
          minimum: 0,
          default: 0,
        },
        limit: {
          type: 'integer',
          description: 'Maximum entries to return (default: 200, max: 500).',
          minimum: 1,
          maximum: 500,
          default: 200,
        },
      },
      required: [],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a string or regex pattern across source files in the project. Returns matching lines with file path and line number. Supports pagination/continuation and respects common ignores plus project .gitignore rules when possible.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search string or regex pattern.',
        },
        path: {
          type: 'string',
          description: 'Narrow the search to this subdirectory. Defaults to the entire project.',
          default: '.',
        },
        file_extensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of file extensions to restrict the search to, e.g. [".js", ".ts"]. When omitted, all recognized source file types are searched.',
        },
        offset: {
          type: 'integer',
          description: 'Pagination offset for matches (default: 0). Use the continuation hint from prior output.',
          minimum: 0,
          default: 0,
        },
        limit: {
          type: 'integer',
          description: 'Maximum matches to return (default: 50, max: 200).',
          minimum: 1,
          maximum: 200,
          default: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'edit_file',
    description: 'Apply a targeted edit to an existing file by exact text replacement. Use this for focused changes instead of rewriting the whole file. old_text must match exactly, including whitespace.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project root.',
        },
        old_text: {
          type: 'string',
          description: 'The exact existing text to find and replace. Must match the file content exactly. Include enough surrounding lines to ensure a unique match.',
        },
        new_text: {
          type: 'string',
          description: 'The replacement text to substitute in place of old_text.',
        },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'apply_patch',
    description: 'Apply a targeted patch to workspace files. Prefer write_file for whole-file replacement and edit_file for exact-text replacement. Input must be a single patch string using Codex-style markers such as "*** Begin Patch", "*** Update File: path", "@@", and "*** End Patch".',
    parameters: {
      type: 'object',
      properties: {
        patch: {
          type: 'string',
          description: 'Canonical patch text using Codex-style patch grammar. Supports add, update, move, and delete blocks inside one "*** Begin Patch" ... "*** End Patch" payload.',
        },
      },
      required: ['patch'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_file',
    description: 'Delete an existing file in the project folder.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file within the project folder.',
    parameters: {
      type: 'object',
      properties: {
        old_path: {
          type: 'string',
          description: 'Current file path relative to the project root.',
        },
        new_path: {
          type: 'string',
          description: 'Destination file path relative to the project root.',
        },
      },
      required: ['old_path', 'new_path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory (and any necessary parent directories) inside the project folder. Succeeds silently if the directory already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to the project root, e.g. "src/components/auth".',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'view_file_range',
    description: 'Read a specific range of lines from a file. Use this instead of read_file when you only need to inspect a portion of a large file. Line numbers are 1-indexed and inclusive.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project root.',
        },
        start_line: {
          type: 'integer',
          description: 'First line to return (1-indexed, inclusive).',
          minimum: 1,
        },
        end_line: {
          type: 'integer',
          description: 'Last line to return (1-indexed, inclusive). Capped at start_line + 500.',
          minimum: 1,
        },
      },
      required: ['path', 'start_line', 'end_line'],
    },
  },
  {
    name: 'grep_file',
    description: 'Search for a pattern within a single file. Returns all matching lines with their line numbers. More focused than search_code when you already know which file to inspect.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project root.',
        },
        pattern: {
          type: 'string',
          description: 'The search string or regex pattern to find within the file.',
        },
        context_lines: {
          type: 'integer',
          description: 'Number of surrounding context lines to include above and below each match (default: 0, max: 5).',
          minimum: 0,
          maximum: 5,
          default: 0,
        },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'rollback_file',
    description: 'List or restore artifact revisions for a file. Call without revision_id to inspect available revisions, or pass revision_id to restore that version.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the project root.',
        },
        revision_id: {
          type: 'string',
          description: 'Optional. The specific artifact revision ID to rollback to. If omitted, returns the list of available revisions for the file.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'find_files',
    description: 'Find files matching a glob pattern or name fragment. Use this to discover files when you do not know the exact path. Respects .gitignore and common ignores.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern or filename fragment to match, e.g. "*.test.js", "auth", "**/*.py".',
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search within. Defaults to the project root.',
          default: '.',
        },
        type: {
          type: 'string',
          description: 'Filter by entry type: "file", "directory", or "any" (default: "file").',
          enum: ['file', 'directory', 'any'],
          default: 'file',
        },
        limit: {
          type: 'integer',
          description: 'Maximum results to return (default: 50, max: 200).',
          minimum: 1,
          maximum: 200,
          default: 50,
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'plan_read',
    description: 'Read the current runtime-managed plan state for this thread. Use this to recover the ordered task list and statuses before continuing a longer implementation.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'plan_update',
    description: 'Update a single task inside the current mutable runtime-managed plan. Approved and superseded plans are immutable; start a replacement direction instead.',
    parameters: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Stable task identifier to create or update.',
        },
        content: {
          type: 'string',
          description: 'Required when creating a new task. Optional when updating an existing task.',
        },
        status: {
          type: 'string',
          description: 'Task status transition.',
          enum: ['pending', 'in_progress', 'completed'],
        },
        notes: {
          type: 'string',
          description: 'Optional short notes for the task state.',
        },
        expected_revision: {
          type: 'integer',
          description: 'Current plan revision returned by plan_read. Required to prevent overwriting a newer plan revision.',
          minimum: 0,
        },
      },
      required: ['task_id', 'expected_revision'],
    },
  },
  {
    name: 'plan_document_write',
    description: 'Write the active ADDOM-managed Markdown plan document. This cannot write to the project worktree and requires the current plan revision.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Complete canonical Markdown plan for companion review.',
        },
        expected_revision: {
          type: 'integer',
          description: 'Current plan revision returned by plan_read.',
          minimum: 0,
        },
      },
      required: ['content', 'expected_revision'],
    },
  },
  {
    name: 'plan_direction_update',
    description: 'Persist the provisional Plan Direction Card after research. Ask no more than five focused questions; on an approved active plan this starts a linked replacement and preserves the approved history.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Short proposed direction shown after all clarification questions are answered.',
        },
        questions: {
          type: 'array',
          description: 'Zero to five focused clarification questions for the durable direction card.',
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stable question ID.' },
              header: { type: 'string', description: 'Optional compact question label.' },
              question: { type: 'string', description: 'Question text.' },
              options: {
                type: 'array',
                description: 'Two or three concise choices. Custom input remains available in the ADDOM card.',
                minItems: 2,
                maxItems: 3,
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Stable option ID.' },
                    label: { type: 'string', description: 'Short button label.' },
                    description: { type: 'string', description: 'Optional one-sentence tradeoff.' },
                    recommended: { type: 'boolean', description: 'True for at most one recommended choice.' },
                  },
                  required: ['id', 'label'],
                },
              },
            },
            required: ['id', 'question'],
          },
        },
        recommended_plan_profile: {
          type: 'string',
          enum: ['implementation', 'technical_design', 'investigation', 'deep_implementation'],
          description: 'Optional advisory plan-profile recommendation.',
        },
        recommendation_rationale: {
          type: 'string',
          description: 'Short reason for the optional advisory recommendation.',
        },
        expected_revision: {
          type: 'integer',
          minimum: 0,
          description: 'Current managed-plan revision from plan_read.',
        },
      },
      required: ['summary', 'expected_revision'],
    },
  },
  {
    name: 'plan_direction_finalize',
    description: 'Finalize the pending Plan Direction synthesis after incorporating every durable user answer and requested change. Exact revisions and request ID are required.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Revised direction summary for user review.' },
        incorporated_answer_ids: {
          type: 'array',
          description: 'Every answered direction question ID incorporated into the summary.',
          items: { type: 'string' },
        },
        recommended_plan_profile: {
          type: 'string',
          enum: ['implementation', 'technical_design', 'investigation', 'deep_implementation'],
          description: 'Optional updated profile recommendation.',
        },
        recommendation_rationale: { type: 'string', description: 'Required rationale when recommending a profile.' },
        next_question: {
          type: 'object',
          description: 'Optional one genuinely new unresolved question when synthesis cannot safely reach review yet.',
          properties: {
            id: { type: 'string', description: 'Stable question ID not used by an earlier direction question.' },
            header: { type: 'string', description: 'Short UI label.' },
            question: { type: 'string', description: 'One concrete decision needed from the user.' },
            options: {
              type: 'array', minItems: 2, maxItems: 3,
              description: 'Optional mutually exclusive quick choices; the UI always provides a custom answer path.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' },
                  recommended: { type: 'boolean' },
                },
                required: ['id', 'label'],
              },
            },
          },
          required: ['id', 'question'],
        },
        expected_revision: { type: 'integer', minimum: 0, description: 'Current managed-plan revision.' },
        expected_direction_revision: { type: 'integer', minimum: 1, description: 'Current direction revision.' },
        expected_answer_revision: { type: 'integer', minimum: 0, description: 'Current answer revision.' },
        request_id: { type: 'string', description: 'Pending synthesis request ID.' },
      },
      required: [
        'summary',
        'incorporated_answer_ids',
        'expected_revision',
        'expected_direction_revision',
        'expected_answer_revision',
        'request_id',
      ],
    },
  },
  {
    name: 'planning_skill_read',
    description: 'Read one bundled, immutable ADDOM planning profile by ID. Use this only when producing a plan; unknown profile IDs are rejected.',
    parameters: {
      type: 'object',
      properties: {
        profile_id: {
          type: 'string',
          description: 'Allowlisted profile ID: implementation, technical_design, investigation, or deep_implementation.',
          enum: ['implementation', 'technical_design', 'investigation', 'deep_implementation'],
        },
      },
      required: ['profile_id'],
    },
  },
  {
    name: 'question_user',
    description: 'Request structured clarification from the user during execution. Use this only when you need a concrete answer before proceeding. After calling it, stop implementation and wait for the user response.',
    parameters: {
      type: 'object',
      properties: {
        header: {
          type: 'string',
          description: 'Short UI label for the question.',
        },
        question: {
          type: 'string',
          description: 'The exact question for the user.',
        },
        options: {
          type: 'array',
          description: 'Optional short answer choices to guide the user.',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'User-facing option label.',
              },
              description: {
                type: 'string',
                description: 'Short explanation of the option.',
              },
            },
            required: ['label'],
          },
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'terminal_memory_suggest',
    description: 'Create one structured, user-gated post-close memory suggestion for a closed terminal session archive. Use only after terminal_session_close has completed in this turn. This never saves memory automatically.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Closed terminal session id returned by terminal_session_open / terminal_session_close.',
        },
        summary: {
          type: 'string',
          description: 'Short durable insight worth saving from the closed session. Never include transcript output, secrets, or raw command logs.',
        },
        reason: {
          type: 'string',
          description: 'Why this summary may matter later in the workspace.',
        },
      },
      required: ['sessionId', 'summary', 'reason'],
    },
  },
  {
    name: 'list_curated_skills',
    description: 'List locally supported OpenAI curated skills from the managed skill catalog. Use this for curated skill discovery instead of browsing the repo or web when the user asks to install an OpenAI skill. Do not use this to obtain browser automation, screenshots, or Playwright; ADDOM already provides browser_action for that.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional case-insensitive name filter, e.g. "frontend".',
        },
        channel: {
          type: 'string',
          description: 'Skill catalog channel. Defaults to "curated".',
          enum: ['curated', 'experimental'],
          default: 'curated',
        },
      },
      required: [],
    },
  },
  {
    name: 'install_curated_skill',
    description: 'Install one locally supported OpenAI curated skill into ADDOM\'s local skill home. Prefer calling list_curated_skills first, then install by exact skill_name instead of manually searching GitHub. Do not install browser, screenshot, or Playwright skills to obtain browser automation; ADDOM already provides browser_action for that.',
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'Exact skill directory name from list_curated_skills, e.g. "frontend-skill".',
        },
        github_tree_url: {
          type: 'string',
          description: 'Optional GitHub tree URL for an OpenAI skill when the user already provided the exact source URL.',
        },
        install_as: {
          type: 'string',
          description: 'Optional local directory name override. Defaults to the source skill directory name.',
        },
        channel: {
          type: 'string',
          description: 'Skill catalog channel when using skill_name. Defaults to "curated".',
          enum: ['curated', 'experimental'],
          default: 'curated',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_status',
    description: 'Show repository status for the current project using structured Git output (short status by default).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional subpath inside the repository to scope status output.',
          default: '.',
        },
        short: {
          type: 'boolean',
          description: 'Use concise porcelain status output (default: true).',
          default: true,
        },
        show_untracked: {
          type: 'boolean',
          description: 'Include untracked files (default: true).',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'git_diff',
    description: 'Show Git diff for working tree or staged changes using safe, structured arguments.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional subpath inside the repository to scope diff output.',
          default: '.',
        },
        staged: {
          type: 'boolean',
          description: 'When true, diff staged changes (`--staged`) instead of working tree.',
          default: false,
        },
        context_lines: {
          type: 'integer',
          description: 'Unified diff context lines (default: 3, min: 0, max: 10).',
          minimum: 0,
          maximum: 10,
          default: 3,
        },
      },
      required: [],
    },
  },
  {
    name: 'git_log',
    description: 'Show recent commit history with a concise one-line format.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional subpath inside the repository to scope log output.',
          default: '.',
        },
        max_count: {
          type: 'integer',
          description: 'Maximum commits to show (default: 20, min: 1, max: 50).',
          minimum: 1,
          maximum: 50,
          default: 20,
        },
      },
      required: [],
    },
  },
  {
    name: 'git_commit',
    description: 'Create a Git commit using a structured commit message and optional staging inputs. This changes repository history.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Commit message (single line recommended).',
        },
        add_all: {
          type: 'boolean',
          description: 'Stage all tracked/untracked changes before commit.',
          default: false,
        },
        paths: {
          type: 'array',
          description: 'Optional list of repository-relative paths to stage before commit when add_all is false.',
          items: { type: 'string' },
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'git_checkout_file',
    description: 'Restore a file from a Git ref (defaults to HEAD). This changes working tree content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository-relative file path to restore.',
        },
        ref: {
          type: 'string',
          description: 'Source ref/commit/tag/branch to restore from (default: HEAD).',
          default: 'HEAD',
        },
      },
      required: ['path'],
    },
  }
]
