import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let LiveExecutionStreamBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/LiveExecutionStreamBlock.jsx')
  LiveExecutionStreamBlock = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('LiveExecutionStreamBlock renders native tool metadata and previews for reads, searches, and listings', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-native-detail',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['list', 'read', 'range', 'grep', 'find'],
        eventsById: {
          list: {
            id: 'list',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'list',
              type: 'result',
              toolName: 'list_directory',
              toolInput: { path: '.', depth: 2, limit: 200 },
              result: 'Showing 3 entries from offset 0 (depth=2, limit=200).\n[file] index.html\n[file] styles.css\n[file] script.js',
            },
          },
          read: {
            id: 'read',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'read',
              type: 'result',
              toolName: 'read_file',
              toolInput: { path: 'script.js' },
              result: 'const root = document.getElementById("app")\nroot.textContent = "hello"\nconsole.log("ready")',
            },
          },
          range: {
            id: 'range',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'range',
              type: 'result',
              toolName: 'view_file_range',
              toolInput: { path: 'index.html', start_line: 1, end_line: 4 },
              result: 'index.html (lines 1-4 of 12)\n1: <!doctype html>\n2: <html>\n3: <body>\n4: <div id="app"></div>',
            },
          },
          grep: {
            id: 'grep',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'grep',
              type: 'result',
              toolName: 'grep_file',
              toolInput: { path: 'styles.css', pattern: 'color', context_lines: 1 },
              result: '2 match(es) for "color" in styles.css:\n  10: body {\n> 11:   color: white;\n  12: }\n---\n  20: h1 {\n> 21:   color: blue;\n  22: }',
            },
          },
          find: {
            id: 'find',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'find',
              type: 'result',
              toolName: 'find_files',
              toolInput: { pattern: '*.js', path: 'src', type: 'file' },
              result: 'Found 2 result(s) matching "*.js":\n[file] src/app.js\n[file] src/lib/utils.js',
            },
          },
        },
      },
    }),
  )

  assert.match(html, /path: project root \| depth: 2 \| limit: 200/)
  assert.match(html, /\[file\]\s*<a[^>]*data-chat-file-reference="true"[^>]*>index\.html<\/a>/)
  assert.match(html, /\[file\]\s*<a[^>]*data-chat-file-reference="true"[^>]*>styles\.css<\/a>/)
  assert.match(html, /font-medium text-text-secondary[^>]*>Read<\/span><span class="font-normal text-text-tertiary[^"]*">\s*<a[^>]*data-chat-file-reference="true"[^>]*>script\.js<\/a>/)
  assert.match(html, /chat-typo-exec-row-label text-text-tertiary/)
  assert.match(html, /text-accent-soft underline decoration-accent-muted/)
  assert.doesNotMatch(html, /chat-typo-exec-row-label text-\[15px\] leading-6 font-medium/)
  assert.doesNotMatch(html, /Show diagnostics/)
  assert.match(html, /aria-label="Expand Read script\.js details"/)
  assert.match(html, /transition-all duration-300 ease-in-out grid-rows-\[0fr\] opacity-0/)
  assert.match(html, /path:\s*<a[^>]*data-chat-file-reference="true"[^>]*>script\.js<\/a>/)
  assert.match(html, /const root = document\.getElementById/)
  assert.match(html, /font-medium text-text-secondary[^>]*>Read<\/span><span class="font-normal text-text-tertiary[^"]*">\s*<a[^>]*data-chat-file-reference="true"[^>]*>index\.html<\/a>/)
  assert.match(html, /1: &lt;!doctype html&gt;/)
  assert.match(html, /Found(?:\s|<[^>]+>)*matches for &quot;color&quot; in <a[^>]*data-chat-file-reference="true"[^>]*>styles\.css<\/a>/)
  assert.match(html, /&gt; 11:\s+color: white;/)
  assert.match(html, /pattern: &quot;\*\.js&quot; \| path: src \| type: file/)
  assert.match(html, /\[file\]\s*<a[^>]*data-chat-file-reference="true"[^>]*>src\/app\.js<\/a>/)
})

test('LiveExecutionStreamBlock renders git and shell metadata with compact result previews', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-git-shell',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['status-start', 'status-done', 'diff-start', 'diff-done', 'log-done', 'commit-done', 'checkout-done', 'shell-start', 'shell-done'],
        eventsById: {
          'status-start': {
            id: 'status-start',
            kind: 'tool_start',
            sessionId: 'session:turn-git-shell:git-status',
            activity: {
              id: 'status-start',
              type: 'executing',
              toolName: 'git_status',
              toolInput: { path: '.', short: true, show_untracked: true },
            },
          },
          'status-done': {
            id: 'status-done',
            kind: 'tool_result',
            status: 'done',
            sessionId: 'session:turn-git-shell:git-status',
            activity: {
              id: 'status-done',
              type: 'result',
              toolName: 'git_status',
              toolInput: { path: '.', short: true, show_untracked: true },
              result: '## main\n M src/app.js\n?? src/new.css',
            },
          },
          'diff-start': {
            id: 'diff-start',
            kind: 'tool_start',
            sessionId: 'session:turn-git-shell:git-diff',
            activity: {
              id: 'diff-start',
              type: 'executing',
              toolName: 'git_diff',
              toolInput: { path: 'src/app.js', staged: true, context_lines: 5 },
            },
          },
          'diff-done': {
            id: 'diff-done',
            kind: 'tool_result',
            status: 'done',
            sessionId: 'session:turn-git-shell:git-diff',
            activity: {
              id: 'diff-done',
              type: 'result',
              toolName: 'git_diff',
              toolInput: { path: 'src/app.js', staged: true, context_lines: 5 },
              result: 'diff --git a/src/app.js b/src/app.js\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1,3 +1,4 @@',
            },
          },
          'log-done': {
            id: 'log-done',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'log-done',
              type: 'result',
              toolName: 'git_log',
              toolInput: { path: '.', max_count: 2 },
              result: 'abc123 2026-03-11 Add execution stream polish (Ada)\ndef456 2026-03-10 Fix preload bridge (Ada)',
            },
          },
          'commit-done': {
            id: 'commit-done',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'commit-done',
              type: 'result',
              toolName: 'git_commit',
              toolInput: { message_preview: 'Polish execution stream', add_all: true, paths: [] },
              result: 'Commit created.\nabc123 2026-03-11 Polish execution stream (Ada)',
            },
          },
          'checkout-done': {
            id: 'checkout-done',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'checkout-done',
              type: 'result',
              toolName: 'git_checkout_file',
              toolInput: { path: 'src/app.js', ref: 'HEAD~1' },
              result: 'Restored "src/app.js" from HEAD~1.\n M src/app.js',
            },
          },
          'shell-start': {
            id: 'shell-start',
            kind: 'tool_start',
            sessionId: 'session:turn-git-shell:shell',
            activity: {
              id: 'shell-start',
              type: 'executing',
              toolName: 'run_command',
              toolInput: { command: 'powershell -NoProfile -Command git status --short', cwd: '.', shell: 'powershell' },
            },
          },
          'shell-done': {
            id: 'shell-done',
            kind: 'tool_result',
            status: 'done',
            sessionId: 'session:turn-git-shell:shell',
            activity: {
              id: 'shell-done',
              type: 'result',
              toolName: 'run_command',
              toolInput: { command: 'powershell -NoProfile -Command git status --short', cwd: '.', shell: 'powershell' },
              stdoutPreview: 'M src/app.js\n?? src/new.css',
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Git status/)
  assert.match(html, /git status --short --branch/)
  assert.match(html, /M <a[^>]*data-chat-file-reference="true"[^>]*>src\/app\.js<\/a>/)
  assert.match(html, /\?\? <a[^>]*data-chat-file-reference="true"[^>]*>src\/new\.css<\/a>/)
  assert.match(html, /Git diff/)
  assert.match(html, /diff --git <a[^>]*data-chat-file-reference="true"[^>]*>a\/src\/app\.js<\/a> <a[^>]*data-chat-file-reference="true"[^>]*>b\/src\/app\.js<\/a>/)
  assert.match(html, /Git history loaded/)
  assert.match(html, /git log --max-count=2 --date=short --pretty=format:%h %ad %s \(%an\)/)
  assert.match(html, /abc123 2026-03-11 Add execution stream polish/)
  assert.match(html, /Commit created/)
  assert.match(html, /git add --all &amp;&amp; git commit -m &quot;Polish execution stream&quot;/)
  assert.match(html, /Restored(?:\s|<[^>]+>)*<a[^>]*data-chat-file-reference="true"[^>]*>src\/app\.js<\/a> from HEAD~1/)
  assert.match(html, /git restore --source=HEAD~1 -- <a[^>]*data-chat-file-reference="true"[^>]*>src\/app\.js<\/a>/)
  assert.match(html, /powershell -NoProfile -Command git status --short/)
  assert.match(html, /cwd: project root \| shell: powershell/)
  assert.match(html, /Command finished in project root/)
})

test('LiveExecutionStreamBlock keeps failed shell result output out of the inline error row', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const stdoutWall = [
    'Tool error: Command failed with exit code 1 (powershell).',
    '',
    'stdout:',
    'INLINE WALL SHOULD NOT RENDER',
    ...Array.from({ length: 40 }, (_value, index) => `noisy output line ${index + 1}`),
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-shell-failed',
        status: 'error',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['shell-failed'],
        eventsById: {
          'shell-failed': {
            id: 'shell-failed',
            kind: 'error',
            status: 'error',
            sessionId: 'session:turn-shell-failed:shell',
            detail: stdoutWall,
            activity: {
              id: 'shell-failed',
              type: 'result',
              isError: true,
              toolName: 'run_command',
              toolInput: {
                command: 'rg -n "QuestionUserCard" build dist out .',
                cwd: '.',
                shell: 'powershell',
              },
              result: stdoutWall,
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Command failed/)
  assert.match(html, /rg -n &quot;QuestionUserCard&quot; build dist out \./)
  assert.match(html, /cwd: project root \| shell: powershell/)
  assert.doesNotMatch(html, /INLINE WALL SHOULD NOT RENDER/)
  assert.doesNotMatch(html, /noisy output line 40/)
})
