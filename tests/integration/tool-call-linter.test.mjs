import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLintBlockedResult,
  lintToolCall,
  TOOL_CALL_FAILURE_CLASSES,
  TOOL_CALL_LINT_CODES,
  TOOL_CALL_LINT_DECISIONS,
} from '../../src/main/chat/tool-call-linter.mjs'

test('lintToolCall rejects malformed canonical apply_patch text', () => {
  const result = lintToolCall({
    toolName: 'apply_patch',
    toolInput: {
      patch: [
        '*** Begin Patch',
        '*** Update File: src/app.js',
        'replace everything with this new file body',
        '*** End Patch',
      ].join('\n'),
    },
  })

  assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(result.lintCode, TOOL_CALL_LINT_CODES.APPLY_PATCH_MISSING_HUNK)
  assert.equal(result.failureClass, TOOL_CALL_FAILURE_CLASSES.MALFORMED_PATCH_SYNTAX)
  assert.equal(result.rerouteToolName, 'write_file')
})

test('lintToolCall allows canonical apply_patch text and rejects legacy operation input without a patch string', () => {
  const patchResult = lintToolCall({
    toolName: 'apply_patch',
    toolInput: {
      patch: [
        '*** Begin Patch',
        '*** Add File: src/app.js',
        '+export const ok = true',
        '*** End Patch',
      ].join('\n'),
    },
  })
  const legacyResult = lintToolCall({
    toolName: 'apply_patch',
    toolInput: {
      operation: {
        type: 'create_file',
        path: 'src/app.js',
        diff: '@@ -0,0 +1,1 @@\n+export const ok = true\n',
      },
    },
  })

  assert.equal(patchResult.decision, TOOL_CALL_LINT_DECISIONS.PASS)
  assert.equal(legacyResult.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(legacyResult.lintCode, TOOL_CALL_LINT_CODES.APPLY_PATCH_EMPTY_DIFF)
})

test('lintToolCall rejects edit_file no-op replacements', () => {
  const result = lintToolCall({
    toolName: 'edit_file',
    toolInput: {
      path: 'src/app.js',
      old_text: 'same text',
      new_text: 'same text',
    },
  })

  assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(result.lintCode, TOOL_CALL_LINT_CODES.EDIT_FILE_NO_OP)
})

test('lintToolCall warns when browser_action navigate likely should use fetch_page', () => {
  const result = lintToolCall({
    toolName: 'browser_action',
    toolInput: {
      action: 'navigate',
      url: 'https://example.com/docs',
    },
  })

  assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.WARN)
  assert.equal(result.lintCode, TOOL_CALL_LINT_CODES.BROWSER_ACTION_FETCH_PAGE_PREFERRED)
  assert.equal(result.rerouteToolName, 'fetch_page')
})

test('lintToolCall still rejects direct shell-based file write workarounds', () => {
  const result = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'echo "hello" > src/generated.txt',
    },
  })

  assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(result.lintCode, TOOL_CALL_LINT_CODES.RUN_COMMAND_FILE_WRITE_WORKAROUND)
})

test('lintToolCall rejects generic Playwright test runner for browser automation', () => {
  const plain = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npx playwright test',
    },
  })
  const ui = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npx playwright test --ui',
    },
  })
  const npmExec = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npm exec playwright test -- --ui',
    },
  })
  const specific = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npx playwright test tests/e2e/login.spec.ts',
    },
  })

  assert.equal(plain.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(plain.lintCode, TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_TEST_RUNNER_MISUSE)
  assert.equal(plain.rerouteToolName, 'browser_action')
  assert.match(plain.message, /browser_action/i)
  assert.match(plain.message, /inspect or find_elements/i)
  assert.match(plain.message, /console_messages\/network_errors/i)
  assert.equal(ui.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(npmExec.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(specific.decision, TOOL_CALL_LINT_DECISIONS.PASS)
})

test('lintToolCall rejects direct Playwright browser install for browser automation', () => {
  const chromium = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npx playwright install chromium',
    },
  })
  const deps = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'playwright install --with-deps chromium',
    },
  })
  const appScript = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npm run browser:prepare-runtime',
    },
  })

  assert.equal(chromium.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(chromium.lintCode, TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_BROWSER_INSTALL_MISUSE)
  assert.equal(chromium.rerouteToolName, 'browser_action')
  assert.match(chromium.message, /browser_action/i)
  assert.match(chromium.message, /npm run browser:prepare-runtime/i)
  assert.equal(deps.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(appScript.decision, TOOL_CALL_LINT_DECISIONS.PASS)
})

test('lintToolCall rejects Playwright CLI browser automation bypasses', () => {
  for (const command of [
    'npx playwright open http://localhost:5173',
    'npm exec playwright open http://localhost:5173',
    'pnpm exec playwright screenshot http://localhost:5173 output.png',
    'yarn playwright codegen http://localhost:5173',
    'npx playwright codegen http://localhost:5173',
    'npx playwright screenshot http://localhost:5173 output.png',
    'npx playwright pdf http://localhost:5173 output.pdf',
    'npx playwright cr http://localhost:5173',
    'playwright install-deps chromium',
  ]) {
    const result = lintToolCall({
      toolName: 'run_command',
      toolInput: { command },
    })
    assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.REJECT, command)
    assert.equal(result.lintCode, TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_CLI_BROWSER_MISUSE, command)
    assert.equal(result.rerouteToolName, 'browser_action', command)
    assert.match(result.message, /inspect\/find_elements/i, command)
    assert.match(result.message, /list_options/i, command)
  }

  const debugScript = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npm run debug:addom:dom',
    },
  })
  assert.equal(debugScript.decision, TOOL_CALL_LINT_DECISIONS.PASS)
})

test('lintToolCall warns on browser automation package installs without blocking dependency work', () => {
  for (const command of [
    'npm install playwright',
    'npm i @playwright/test@latest',
    'pnpm add puppeteer',
    'yarn add selenium-webdriver',
  ]) {
    const result = lintToolCall({
      toolName: 'run_command',
      toolInput: { command },
    })
    assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.WARN, command)
    assert.equal(result.lintCode, TOOL_CALL_LINT_CODES.RUN_COMMAND_PLAYWRIGHT_PACKAGE_INSTALL_AMBIGUOUS, command)
    assert.equal(result.rerouteToolName, 'browser_action', command)
  }

  const appDependency = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npm install react',
    },
  })
  assert.equal(appDependency.decision, TOOL_CALL_LINT_DECISIONS.PASS)
})

test('lintToolCall rejects run_command attempts to execute apply_patch as a shell command', () => {
  const result = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: "@'\n*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch\n'@ | apply_patch",
    },
  })

  assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(result.lintCode, TOOL_CALL_LINT_CODES.RUN_COMMAND_APPLY_PATCH_TOOL_MISUSE)
  assert.equal(result.failureClass, TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED)
  assert.equal(result.rerouteToolName, 'apply_patch')
})

test('lintToolCall rejects likely long-running run_command calls unless they are explicitly backgrounded', () => {
  const foreground = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npm run dev',
      background: false,
    },
  })
  const background = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'npm run dev',
      background: true,
    },
  })

  assert.equal(foreground.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(foreground.lintCode, TOOL_CALL_LINT_CODES.RUN_COMMAND_LONG_RUNNING_FOREGROUND)
  assert.equal(foreground.failureClass, TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED)
  assert.match(foreground.message, /terminal_session_/i)
  assert.equal(background.decision, TOOL_CALL_LINT_DECISIONS.PASS)
})

test('lintToolCall allows generator-style commands that incidentally redirect output', () => {
  const result = lintToolCall({
    toolName: 'run_command',
    toolInput: {
      command: 'node scripts/generate-schema.js > src/generated/schema.sql',
    },
  })

  assert.equal(result.decision, TOOL_CALL_LINT_DECISIONS.PASS)
})

test('buildLintBlockedResult preserves Tool error envelope', () => {
  const text = buildLintBlockedResult({
    toolName: 'apply_patch',
    lintResult: {
      lintCode: TOOL_CALL_LINT_CODES.APPLY_PATCH_MISSING_HUNK,
      message: 'apply_patch requires one canonical patch string.',
      rerouteToolName: 'write_file',
    },
  })

  assert.match(text, /^Tool error: pre-execution lint/)
  assert.match(text, /apply_patch/)
  assert.match(text, /Suggested tool: write_file/)
})
