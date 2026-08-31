import test from 'node:test'
import assert from 'node:assert/strict'

import { createBrowserActionHandlers } from '../../src/main/tools/browser-tool-actions.mjs'
import { createBrowserDiagnostics } from '../../src/main/tools/browser-tool-diagnostics.mjs'

function buildHandlers(page, extra = {}) {
  return createBrowserActionHandlers({
    clipText: (text) => String(text || '').trim(),
    constants: {
      VIEWPORT_WIDTH: 1920,
      VIEWPORT_HEIGHT: 1080,
      NAVIGATION_TIMEOUT_MS: 100,
      JS_EXECUTION_TIMEOUT_MS: 1,
      ELEMENT_TIMEOUT_MS: 50,
      MAX_TEXT_CHARS: 12_000,
      SCREENSHOT_JPEG_QUALITY: 80,
    },
    closeBrowserTool: async () => '',
    closeSession: async () => {},
    getExistingSession: async () => null,
    getRecordingDir: () => '',
    getScreenshotDir: () => '',
    getSessionKey: () => 'test',
    ensureDirectory: async (dir) => dir,
    ensureSession: async () => ({ page }),
    ensureSessionPage: async () => ({ page }),
    refreshSessionTarget: async () => {},
    assertBrowserRuntimeAllowed: async () => ({}),
    buildBrowserNavigationPolicy: () => ({}),
    evaluateBrowserNavigationRequestPolicy: async () => ({ allowed: true }),
    withSessionNavigationPolicy: async (_session, _policy, run) => run(),
    ...extra,
  })
}

test('browser execute_js supports leading return without changing expression semantics', async () => {
  const page = {
    evaluate: async (fn, arg) => fn(arg),
  }
  const handlers = buildHandlers(page)

  assert.equal(await handlers.execute_js('', { code: 'return 2 + 3' }, {}), '5')
  assert.equal(await handlers.execute_js('', { code: 'function x() { return 1 } x()' }, {}), '1')
})

test('browser click points native option elements to select_option', async () => {
  let clicked = false
  const page = {
    $eval: async (_selector, fn) => fn({ tagName: 'OPTION' }),
    click: async () => {
      clicked = true
    },
  }
  const handlers = buildHandlers(page)

  await assert.rejects(
    () => handlers.click('', { selector: 'select option[value="x"]' }, {}),
    /select_option/,
  )
  assert.equal(clicked, false)
})

test('browser action handlers preserve unclassified interaction errors', async () => {
  const page = {
    fill: async () => {
      throw new Error('browser process disconnected')
    },
  }
  const handlers = buildHandlers(page)

  await assert.rejects(
    () => handlers.type('', { selector: '#name', text: 'ADDOM' }, {}),
    /^Error: browser process disconnected$/,
  )
})

test('browser select_option failure includes available option values', async () => {
  const page = {
    selectOption: async () => {
      throw new Error('did not find some options')
    },
    evaluate: async () => [
      { value: 'chat-compaction-events', label: 'Chat - Compaction Events' },
      { value: 'chat-plan-interaction', label: 'Chat - Plan Interaction' },
    ],
  }
  const handlers = buildHandlers(page)

  await assert.rejects(
    () => handlers.select_option('', { selector: 'select', value: 'chat-plan' }, {}),
    /Available options: "chat-compaction-events".*"chat-plan-interaction"/,
  )
})

test('browser inspect returns bounded element summaries with selector candidates', async () => {
  const page = {
    evaluate: async () => ({
      url: 'http://localhost:5173/form',
      title: 'Project Form',
      elements: [
        {
          index: 0,
          tag: 'button',
          role: 'button',
          name: 'Save',
          text: 'Save',
          attributes: { id: 'save' },
          nthOfTypeSelector: 'button:nth-of-type(1)',
        },
        {
          index: 1,
          tag: 'select',
          role: 'combobox',
          name: 'Mode',
          attributes: { 'data-testid': 'mode-select' },
        },
      ],
    }),
  }
  const handlers = buildHandlers(page)

  const result = await handlers.inspect('', { limit: 1 }, {})

  assert.match(result, /Browser inspection/)
  assert.match(result, /URL: http:\/\/localhost:5173\/form/)
  assert.match(result, /Elements returned: 1 of 2/)
  assert.match(result, /<button> role=button name="Save" selector=#save actions=click/)
})

test('browser find_elements filters model-friendly element facts', async () => {
  const page = {
    evaluate: async () => ({
      url: 'http://localhost:5173/form',
      title: 'Project Form',
      elements: [
        {
          index: 0,
          tag: 'button',
          role: 'button',
          name: 'Save',
          text: 'Save changes',
          attributes: { id: 'save' },
        },
        {
          index: 1,
          tag: 'input',
          role: 'textbox',
          name: 'Project name',
          placeholder: 'Name',
          attributes: { 'data-testid': 'project-name' },
        },
      ],
    }),
  }
  const handlers = buildHandlers(page)

  const result = await handlers.find_elements('', { query: 'project', mode: 'label' }, {})

  assert.match(result, /Browser element matches for "project"/)
  assert.doesNotMatch(result, /Save changes/)
  assert.match(result, /<input> role=textbox name="Project name" placeholder="Name" selector=\[data-testid="project-name"\] actions=type/)
})

test('browser list_options returns exact select values and labels', async () => {
  const page = {
    evaluate: async (_fn, arg) => {
      assert.equal(arg.sel, 'select[name="mode"]')
      assert.equal(arg.max, 2)
      return {
        found: true,
        tag: 'select',
        total: 3,
        multiple: false,
        options: [
          { index: 0, value: 'fast', label: 'Fast mode', disabled: false, selected: true },
          { index: 1, value: 'safe', label: 'Safe mode', disabled: true, selected: false },
        ],
      }
    },
  }
  const handlers = buildHandlers(page)

  const result = await handlers.list_options('', { selector: 'select[name="mode"]', limit: 2 }, {})

  assert.match(result, /Options for select\[name="mode"\]/)
  assert.match(result, /Options returned: 2 of 3/)
  assert.match(result, /value="fast" label="Fast mode" selected/)
  assert.match(result, /value="safe" label="Safe mode" disabled/)
})

test('browser console_messages returns recent filtered session diagnostics', async () => {
  const session = {
    page: {},
    diagnostics: createBrowserDiagnostics(),
  }
  session.diagnostics.consoleMessages.push(
    { level: 'warning', text: 'minor warning', url: 'https://example.test/app', line: 3, column: 1 },
    { level: 'pageerror', text: 'app crashed', url: '', line: 0, column: 0 },
  )
  const handlers = buildHandlers(session.page, {
    getExistingSession: async () => session,
  })

  const result = await handlers.console_messages('', { level: 'error' }, {})

  assert.match(result, /Recent console messages \(error\)/)
  assert.match(result, /Rows returned: 1 of 1/)
  assert.match(result, /app crashed/)
  assert.doesNotMatch(result, /minor warning/)
})

test('browser network_errors returns recent failed and error-status requests', async () => {
  const session = {
    page: {},
    diagnostics: createBrowserDiagnostics(),
  }
  session.diagnostics.networkErrors.push(
    { kind: 'failed', method: 'GET', url: 'https://example.test/image.png', type: 'image', status: 0, error: 'net::ERR_FAILED' },
    { kind: 'http_error', method: 'POST', url: 'https://example.test/api', type: 'fetch', status: 500, statusText: 'Server Error', error: '' },
  )
  const handlers = buildHandlers(session.page, {
    getExistingSession: async () => session,
  })

  const result = await handlers.network_errors('', { type: 'fetch' }, {})

  assert.match(result, /Recent network errors/)
  assert.match(result, /Rows returned: 1 of 1/)
  assert.match(result, /POST https:\/\/example.test\/api status=500 Server Error type=fetch/)
  assert.doesNotMatch(result, /image\.png/)
})

test('browser accessibility_tree falls back when Playwright snapshot is unavailable', async () => {
  const page = {
    evaluate: async () => ({
      role: 'document',
      name: 'Project screen',
      children: [
        { role: 'button', name: 'Execute' },
        { role: 'combobox', name: 'Model', value: 'gpt-5-mini' },
      ],
    }),
  }
  const handlers = buildHandlers(page)

  const result = await handlers.accessibility_tree('', {}, {})
  assert.match(result, /\[document\] Project screen/)
  assert.match(result, /\[button\] Execute/)
  assert.match(result, /\[combobox\] Model = gpt-5-mini/)
})

test('browser accessibility_tree surfaces Playwright snapshot failures', async () => {
  const page = {
    accessibility: {
      snapshot: async () => {
        throw new Error('snapshot failed')
      },
    },
    evaluate: async () => {
      throw new Error('fallback should not run')
    },
  }
  const handlers = buildHandlers(page)

  await assert.rejects(
    () => handlers.accessibility_tree('', {}, {}),
    /snapshot failed/,
  )
})
