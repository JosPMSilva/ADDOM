/** Extracted tool schemas. */

export const WEB_AND_COMMAND_TOOLS = [
{
    name: 'fetch_page',
    description: 'Fetch a public HTTP/HTTPS page and return readable text. Use this for documentation or fresh web context. For blocked direct fetches (401/403/429/503 or challenge pages), do not loop direct retries in the same turn; use robots.txt and text-mirror routes for fallback evidence. Private IPs and localhost are blocked.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to fetch, e.g. "https://example.com/docs".',
        },
        reason: {
          type: 'string',
          description: 'Brief explanation of why you need this URL and what fallback role it serves (direct probe, robots, mirror, or corroboration).',
        },
      },
      required: ['url', 'reason'],
    },
  },
  {
    name: 'browser_action',
    description: 'ADDOM-native browser automation. Control a real browser for pages that require JavaScript rendering, interaction, screenshots, accessibility trees, local dev-session inspection, or UI diagnostics. Prefer inspect/find_elements/list_options before guessing selectors or using execute_js. Use console_messages/network_errors for recent page errors and failed requests. Use this directly for browser UI work; do not install screenshot/browser packages or run external browser CLI workflows to get browser automation. Prefer fetch_page for static public docs. Launch/close are lightweight. Navigation and interaction approvals are handled by ADDOM runtime policy.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'The browser action to perform.',
          enum: [
            'launch', 'inspect', 'find_elements', 'list_options', 'console_messages', 'network_errors',
            'navigate', 'screenshot', 'execute_js',
            'click', 'type', 'read_text', 'close',
            'scroll', 'wait_for', 'get_page_info', 'select_option', 'hover',
            'start_recording', 'stop_recording', 'accessibility_tree',
          ],
        },
        url: {
          type: 'string',
          description: 'URL to navigate to when action is "navigate".',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for element interaction actions, inspect scoping, find_elements selector mode, or list_options select targets.',
        },
        query: {
          type: 'string',
          description: 'Search text for "find_elements". Matches visible element text, role, label/name, placeholder, title, value, or selector depending on mode.',
        },
        mode: {
          type: 'string',
          description: 'Search mode for "find_elements". Use "auto" unless you know the fact type.',
          enum: ['auto', 'text', 'role', 'label', 'name', 'placeholder', 'title', 'selector'],
          default: 'auto',
        },
        limit: {
          type: 'integer',
          description: 'Maximum rows returned for inspect, find_elements, list_options, console_messages, or network_errors. inspect/list_options/diagnostics cap at 100; find_elements caps at 50.',
          default: 50,
          minimum: 1,
          maximum: 100,
        },
        level: {
          type: 'string',
          description: 'Optional console level filter for "console_messages". Use "error" to include page errors.',
          enum: ['debug', 'info', 'log', 'warning', 'error', 'pageerror'],
        },
        status: {
          type: 'integer',
          description: 'Optional exact HTTP status filter for "network_errors", such as 404 or 500.',
          minimum: 100,
          maximum: 599,
        },
        type: {
          type: 'string',
          description: 'Optional resource type filter for "network_errors", such as document, fetch, xhr, script, or image.',
        },
        include_hidden: {
          type: 'boolean',
          description: 'Include hidden elements for inspect or find_elements.',
          default: false,
        },
        element_index: {
          type: 'integer',
          description: 'Element index returned by inspect/find_elements when using list_options without a selector.',
        },
        text: {
          type: 'string',
          description: 'Text to type when action is "type".',
        },
        code: {
          type: 'string',
          description: 'JavaScript code to execute in the active page when action is "execute_js".',
        },
        headless: {
          type: 'boolean',
          description: 'Launch browser in headless mode. Only used with "launch".',
          default: false,
        },
        direction: {
          type: 'string',
          description: 'Scroll direction for "scroll".',
          enum: ['up', 'down'],
          default: 'down',
        },
        amount: {
          type: 'integer',
          description: 'Scroll amount in pixels for "scroll".',
          default: 500,
        },
        value: {
          type: 'string',
          description: 'Option value for "select_option".',
        },
        label: {
          type: 'string',
          description: 'Option label for "select_option".',
        },
        timeout_ms: {
          type: 'integer',
          description: 'Timeout in milliseconds for "wait_for" (default 5000, max 30000).',
          default: 5000,
          minimum: 1000,
          maximum: 30000,
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the project root or an optional subdirectory. Use it for builds, tests, scripts, and project-local installs. Adapt syntax to the runtime context instead of asking for the OS. Set background=true for long-running servers or watchers. For missing dependencies, run install commands according to active permission mode and runtime policy rather than writing textual approval requests. Prefer project-local installs over global or system-wide changes. If runtime policy blocks or reroutes the command, follow that result instead of trying a bypass.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute, e.g. "npm install", "npm test", or "python -m pytest".',
        },
        timeout_ms: {
          type: 'number',
          description: 'Optional timeout in milliseconds. Defaults to 300000 (5 minutes).',
          default: 300000,
        },
        shell: {
          type: 'string',
          description: 'Optional shell preference: auto, powershell, cmd, bash, wsl, or sh.',
          enum: ['auto', 'powershell', 'cmd', 'bash', 'wsl', 'sh'],
          default: 'auto',
        },
        cwd: {
          type: 'string',
          description: 'Optional working directory relative to project root (e.g. "frontend" or "packages/api").',
          default: '.',
        },
        workdir: {
          type: 'string',
          description: 'Compatibility alias for `cwd`. Optional working directory relative to project root.',
          default: '.',
        },
        background: {
          type: 'boolean',
          description: 'If true, starts the command detached and returns immediately. Use for long-running servers/watchers.',
          default: false,
        },
      },
      required: ['command'],
    },
  }
]
