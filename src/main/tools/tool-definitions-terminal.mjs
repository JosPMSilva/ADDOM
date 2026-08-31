/** Terminal session tool schemas. */

import {
  DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
  MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
  MAX_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
} from './terminal-session-manager.mjs'

export const TERMINAL_SESSION_TOOLS = [
  {
    name: 'terminal_session_list',
    description: 'List visible terminal sessions for the current thread/workspace so the model can reuse the right interactive session instead of opening a duplicate terminal.',
    parameters: {
      type: 'object',
      properties: {
        maxSessions: {
          type: 'integer',
          description: 'Maximum number of terminal sessions to return from the current thread/workspace view.',
          minimum: 1,
          maximum: 12,
          default: 8,
        },
      },
      required: [],
    },
  },
  {
    name: 'terminal_session_open',
    description: 'Open a visible interactive terminal session in the chat terminal with an explicit shell and size. Prefer this for interactive shells, long-running dev servers, TUIs, and prompt-driven workflows. Use run_command for bounded one-shot commands.',
    parameters: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory for the interactive terminal session. Relative paths resolve from the project root.',
          default: '.',
        },
        workdir: {
          type: 'string',
          description: 'Compatibility alias for `cwd`.',
          default: '.',
        },
        shell: {
          type: 'string',
          description: 'Requested interactive shell.',
          enum: ['default', 'auto', 'cmd', 'powershell', 'pwsh', 'bash', 'sh'],
          default: 'default',
        },
        cols: {
          type: 'integer',
          description: 'Initial terminal width in columns.',
          minimum: 20,
          maximum: 400,
          default: 80,
        },
        rows: {
          type: 'integer',
          description: 'Initial terminal height in rows.',
          minimum: 5,
          maximum: 200,
          default: 24,
        },
      },
      required: [],
    },
  },
  {
    name: 'terminal_session_read_snapshot',
    description: 'Read a bounded snapshot from an existing visible terminal session by session id. Use this to inspect current terminal output. Prefer this over terminal_session_attach when you only need terminal text, not reconnect or live subscription semantics.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Existing AI-reusable terminal session id returned by terminal_session_open or listed in the execution brief for this thread.',
        },
        sinceSequence: {
          type: 'integer',
          description: 'Optional output sequence cursor. Only output newer than this value is included in the bounded snapshot.',
          minimum: 0,
          default: 0,
        },
        maxChars: {
          type: 'integer',
          description: 'Maximum snapshot text length to return. Values are clamped to the runtime-safe terminal snapshot cap.',
          minimum: 1,
          maximum: MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
          default: MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
        },
        mode: {
          type: 'string',
          description: 'Snapshot capture mode. buffer_tail returns raw terminal tail text, visible_text returns the currently visible viewport text from the active terminal surface, and plain_text_tail strips ANSI control sequences for AI-readable output.',
          enum: ['buffer_tail', 'visible_text', 'plain_text_tail'],
          default: 'buffer_tail',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'terminal_session_wait_for_output',
    description: 'Wait for expected output from an existing visible terminal session instead of repeatedly polling snapshots. Use this after terminal_session_write, especially after submit=true command execution, for long-running interactive commands, prompts, and dev servers.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Existing AI-reusable terminal session id returned by terminal_session_open or terminal_session_list.',
        },
        pattern: {
          type: 'string',
          description: 'Regular expression source to match against the bounded terminal tail.',
        },
        text: {
          type: 'string',
          description: 'Literal text to wait for in the bounded terminal tail.',
        },
        sinceSequence: {
          type: 'integer',
          description: 'Optional output sequence cursor. Only output newer than this value is considered while waiting.',
          minimum: 0,
          default: 0,
        },
        timeoutMs: {
          type: 'integer',
          description: 'How long to wait before returning a timeout result. Values are clamped to the terminal wait cap.',
          minimum: 1,
          maximum: MAX_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
          default: DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
        },
        maxChars: {
          type: 'integer',
          description: 'Maximum bounded tail length to return alongside the wait result.',
          minimum: 1,
          maximum: MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
          default: MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
        },
        mode: {
          type: 'string',
          description: 'Tail capture mode for the returned output. visible_text waits against the active terminal viewport text, while plain_text_tail strips ANSI control sequences for AI readability.',
          enum: ['buffer_tail', 'visible_text', 'plain_text_tail'],
          default: 'plain_text_tail',
        },
      },
      required: ['sessionId'],
      anyOf: [
        { required: ['pattern'] },
        { required: ['text'] },
      ],
    },
  },
  {
    name: 'terminal_session_attach',
    description: 'Reconnect to or reuse an existing visible terminal session by session id for live chat-terminal continuity. Prefer terminal_session_read_snapshot when you only need bounded current terminal text.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Existing AI-reusable terminal session id returned by terminal_session_open or listed in the execution brief for this thread.',
        },
        sinceSequence: {
          type: 'integer',
          description: 'Optional output sequence cursor. Only chunks newer than this value are returned.',
          minimum: 0,
          default: 0,
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'terminal_session_write',
    description: 'Write input to an existing visible terminal session. Keep submit=false for literal interactive bytes, prompt responses, passwords, REPLs, and TUIs. Set submit=true for shell commands so the runtime appends exactly one Enter press if the text does not already end with a newline.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Existing AI-reusable terminal session id returned by terminal_session_open or listed in the execution brief for this thread.',
        },
        data: {
          type: 'string',
          description: 'Exact text to write into the terminal session.',
        },
        submit: {
          type: 'boolean',
          description: 'When true, treat data as a shell command submission and append one Enter press if needed. Leave false for literal byte input.',
          default: false,
        },
      },
      required: ['sessionId', 'data'],
    },
  },
  {
    name: 'terminal_session_resize',
    description: 'Resize the visible viewport for an existing terminal session.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Existing AI-reusable terminal session id returned by terminal_session_open or listed in the execution brief for this thread.',
        },
        cols: {
          type: 'integer',
          description: 'Terminal width in columns.',
          minimum: 20,
          maximum: 400,
        },
        rows: {
          type: 'integer',
          description: 'Terminal height in rows.',
          minimum: 5,
          maximum: 200,
        },
      },
      required: ['sessionId', 'cols', 'rows'],
    },
  },
  {
    name: 'terminal_session_signal',
    description: 'Send an explicit terminal signal to an existing visible session.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Existing AI-reusable terminal session id returned by terminal_session_open or listed in the execution brief for this thread.',
        },
        signal: {
          type: 'string',
          description: 'Signal name such as SIGINT, SIGTERM, or SIGHUP.',
          default: 'SIGTERM',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'terminal_session_close',
    description: 'Close an existing visible terminal session. This is explicit terminal-session lifecycle control, not run_command cleanup.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Existing AI-reusable terminal session id returned by terminal_session_open or listed in the execution brief for this thread.',
        },
        signal: {
          type: 'string',
          description: 'Optional close signal for platforms that support it.',
        },
      },
      required: ['sessionId'],
    },
  },
]
