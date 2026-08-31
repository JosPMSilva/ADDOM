import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  renderAssistantMessageBubblePathHtmlForTest,
  renderNormalizedAssistantMessageHtmlForTest,
} from '../helpers/render-assistant-message-html.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/chat-rendering')
const FIXTURE_RAW = readFileSync(path.join(FIXTURE_DIR, 'moa-review-multifile-diff.raw.txt'), 'utf8')
let MessageBubble = null
let rendererUseAppStore = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/MessageBubble.jsx')
  MessageBubble = mod?.MessageBubble || null
  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')
  rendererUseAppStore = appStoreMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('normalized assistant render helper avoids empty list items and nested pre in list items', () => {
  const html = renderNormalizedAssistantMessageHtmlForTest(FIXTURE_RAW)
  const liNodes = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || []
  assert.equal(liNodes.length > 0, true)
  assert.equal(liNodes.some((li) => /<li\b[^>]*>\s*<\/li>/i.test(li)), false)
  assert.equal(liNodes.some((li) => /<pre\b/i.test(li)), false)
})

test('assistant final renders only explicitly embedded generated images through the secure cache URL', () => {
  assert.equal(typeof MessageBubble, 'function')
  const generatedArtifacts = [{
    artifactId: 'artifact-1',
    attachmentId: 'att-1',
    toolCallId: 'image-call-1',
    toolName: 'vendor_image',
    sourcePath: 'C:/workspace/generated/hero.png',
    kind: 'image',
    mediaType: 'image/png',
    fileName: 'hero.png',
    previewUrl: 'addom-attachment://attachment/att-1',
  }]
  const visibleHtml = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'assistant-image-visible',
        role: 'assistant',
        status: 'done',
        content: 'Here it is:\n\n![Generated hero](<C:/workspace/generated/hero.png>)',
        generatedArtifacts,
      },
    }),
  )
  const projectOnlyHtml = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'assistant-image-project-only',
        role: 'assistant',
        status: 'done',
        content: 'Created the website asset.',
        generatedArtifacts,
      },
    }),
  )

  assert.match(visibleHtml, /data-chat-render="assistant-generated-image"/)
  assert.match(visibleHtml, /data-generated-image-thumbnail="true"/)
  assert.match(visibleHtml, /aria-haspopup="dialog"/)
  assert.match(visibleHtml, /max-h-48/)
  assert.match(visibleHtml, /src="addom-attachment:\/\/attachment\/att-1"/)
  assert.doesNotMatch(projectOnlyHtml, /data-chat-render="assistant-generated-image"/)
})

test('assistant final resolves provider-authored Windows image paths without requiring Markdown angle brackets', () => {
  assert.equal(typeof MessageBubble, 'function')
  const sourcePath = 'C:\\Users\\example\\AppData\\Roaming\\addom-dev\\generated_images\\result.png'
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'assistant-image-windows-path',
        role: 'assistant',
        status: 'done',
        content: `Done.\n\n![Generated image](${sourcePath})`,
        generatedArtifacts: [{
          artifactId: 'artifact-windows',
          attachmentId: 'att-windows',
          sourcePath,
          kind: 'image',
          mediaType: 'image/png',
          fileName: 'result.png',
          previewUrl: 'addom-attachment://attachment/att-windows',
        }],
      },
    }),
  )

  assert.match(html, /data-chat-render="assistant-generated-image"/)
  assert.match(html, /src="addom-attachment:\/\/attachment\/att-windows"/)
})

test('sent attachment buttons add context-menu access without changing their left-click actions', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../../src/renderer/components/chat/MessageBubbleUserAttachments.jsx'),
    'utf8',
  )
  assert.match(source, /onClick=\{\(\) => setPreviewImage\(/)
  assert.match(source, /onClick=\{\(\) => handleOpenAttachmentFile\(part\)\}/)
  assert.match(source, /onContextMenu=\{\(event\) =>/)
  assert.match(source, /event\.key !== 'ContextMenu'/)
  assert.match(source, /event\.shiftKey && event\.key === 'F10'/)
})

test('attachment modal overlays escape the timeline clip and cover the composer layer', () => {
  const attachmentSource = readFileSync(
    path.resolve(__dirname, '../../src/renderer/components/chat/MessageBubbleUserAttachments.jsx'),
    'utf8',
  )
  const chatPanelViewSource = readFileSync(
    path.resolve(__dirname, '../../src/renderer/components/chat/ChatPanelView.jsx'),
    'utf8',
  )

  assert.match(attachmentSource, /createPortal/)
  assert.match(attachmentSource, /\[data-ui="chat-panel-content-layer"\]/)
  assert.match(attachmentSource, /absolute inset-0/)
  assert.match(chatPanelViewSource, /data-ui="chat-panel-content-layer"/)
})

test('normalized assistant render helper outputs grouped patch sections with file headers', () => {
  const html = renderNormalizedAssistantMessageHtmlForTest(FIXTURE_RAW)
  const patchGroupMatches = html.match(/data-chat-render="patch-group"/g) || []
  assert.equal(patchGroupMatches.length, 3)
  assert.match(html, /data-file-path="index\.html"/)
  assert.match(html, /data-file-path="styles\.css"/)
  assert.match(html, /data-file-path="script\.js"/)
  assert.equal(/<p[^>]*>\s*script\.js\s*<\/p>/i.test(html), false)
})

test('normalized assistant render helper preserves prose bullet lists around patch blocks', () => {
  const html = renderNormalizedAssistantMessageHtmlForTest(FIXTURE_RAW)
  assert.match(html, /What I did<\/p>\s*<ul\b/i)
  assert.match(html, /Manual quick review \(since MoA wasn[^<]*available\)<\/p>\s*<ul\b/i)
  assert.match(html, /Want me to apply these patches now and reload the page\?<\/p>\s*<ul\b/i)
})

test('normalized assistant render helper keeps patch content in diff blocks and out of prose lists', () => {
  const html = renderNormalizedAssistantMessageHtmlForTest(FIXTURE_RAW)
  assert.match(html, /data-chat-render="diff-block"[\s\S]*function updateMenuA11y\(\)/i)
  assert.equal(/<li\b[^>]*>\s*Accessibility: Good landmarks/i.test(html), true)
  assert.equal(/data-chat-render="diff-block"[\s\S]*- Accessibility: Good landmarks/i.test(html), false)
})

test('assistant render helper keeps addom_plan blocks literal and does not expose a plan card path', () => {
  const input = [
    'Here is a plan summary before the structured block.',
    '',
    '```addom_plan',
    JSON.stringify({
      summary: 'Decide between two approaches',
      options: [
        { id: 'opt_a', title: 'Approach A', recommended: true },
        { id: 'opt_b', title: 'Approach B' },
      ],
    }, null, 2),
    '```',
  ].join('\n')

  const result = renderAssistantMessageBubblePathHtmlForTest(input)
  assert.equal(result.hasPlan, false)
  assert.equal(result.hasPlanNarrative, false)
  assert.match(result.html, /Here is a plan summary before the structured block\./)
  assert.doesNotMatch(result.html, /data-chat-render="plan-card"/)
  assert.match(result.html, /data-chat-render="code-block"/)
  assert.match(result.html, /Approach A/)
})

test('assistant message keeps addom_plan blocks literal even when planState includes dismissed entries', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    'Perfect - plan updated with your bundled decisions.',
    '',
    '```addom_plan',
    JSON.stringify({
      summary: 'Decide between two approaches',
      options: [
        { id: 'opt_a', title: 'Approach A', recommended: true },
        { id: 'opt_b', title: 'Approach B' },
      ],
    }, null, 2),
    '```',
  ].join('\n')

  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'plan_1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: {
        dismissedPlanMessageIds: ['plan_1'],
      },
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /Perfect - plan updated with your bundled decisions\./)
  assert.doesNotMatch(html, /data-chat-render="plan-card"/)
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /Approach A/)
})

test('assistant message with reasoning and reply does not render inline reasoning divider', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a1',
        role: 'assistant',
        content: 'Final answer text.',
        reasoning: 'Internal reasoning text.',
        reasoningDone: true,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.equal(/data-chat-render="reasoning-reply-divider"/.test(html), false)
  assert.doesNotMatch(html, /Internal reasoning text\./)
  assert.match(html, /Final answer text\./)
  assert.doesNotMatch(html, /border-l-2|border-l-accent-muted|pl-4/)
})

test('assistant message with reasoning but no reply keeps inline reasoning divider absent', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a2',
        role: 'assistant',
        content: '',
        reasoning: 'Internal reasoning text.',
        reasoningDone: true,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.equal(/data-chat-render="reasoning-reply-divider"/.test(html), false)
  assert.doesNotMatch(html, /Internal reasoning text\./)
})

test('assistant plain prose preserves authored sentence joins', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a2c',
        role: 'assistant',
        content: 'I inspected the codebase.Now let me create the role.PerfectNow I will summarize it.',
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /I inspected the codebase\.Now let me create the role\./)
  assert.match(html, /PerfectNow I will summarize it\./)
})

test('assistant markdown prose preserves authored sentence joins', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a2d',
        role: 'assistant',
        content: "I'll analyze the codebase for security flaws and create a new agent role to assist with this task. Let me start by exploring the project structure.Great! I can see existing work.Now let me create an enhanced **Security Auditor Agent Role**:Perfect! Ready.",
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /project structure\.Great! I can see existing work\./)
  assert.match(html, /work\.Now let me create an enhanced/)
  assert.match(html, /Role<\/strong>:Perfect! Ready\./)
})

test('assistant message renders the empty-final account fallback without leaking execution commentary into the bubble', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a2b',
        role: 'assistant',
        content: 'Completed, but no final answer text was returned.',
        reasoning: 'Inspecting the workspace first.',
        reasoningDone: true,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /Completed, but no final answer text was returned\./)
  assert.doesNotMatch(html, /Inspecting the workspace first\./)
})

test('assistant message bubble uses full timeline width while user bubble stays constrained', () => {
  assert.equal(typeof MessageBubble, 'function')

  const assistantHtml = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'assistant-width-1',
        role: 'assistant',
        content: 'Assistant content',
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(assistantHtml, /w-full max-w-none/)
  assert.doesNotMatch(assistantHtml, /max-w-\[76%\]/)

  const userHtml = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'user-width-1',
        role: 'user',
        content: 'User content',
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(userHtml, /max-w-\[58%\]/)
})

test('streaming assistant open fenced code renders as a code block before the fence closes', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a3',
        role: 'assistant',
        content: '```js\nconst x = 1\nconst y = 2',
        status: 'streaming',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, />js<\/span>/i)
  assert.match(html, /hljs-keyword/)
  assert.match(html, /hljs-number">1/)
  assert.match(html, /hljs-number">2/)
  assert.doesNotMatch(html, /```js/)
  assert.equal(/Unformatted segment/.test(html), false)
  assert.equal(/border-\[#3a2f1d\]/.test(html), false)
})

test('user fenced code renders framed code block with language header', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: { id: 'u1', role: 'user', content: '```python\nprint(1)\n```', status: 'done' },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, />python<\/span>/i)
})

test('assistant code block renders a focusable scroll viewport for long lines', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    '```csv',
    'Sprint,Owner,Tasks,Definition of Done',
    'Sprint 1,Product + Tech Lead + Security,"Long single-line payload that should stay horizontally reachable without exposing a scrollbar"',
    '```',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-code-scroll-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /data-chat-code-viewport="true"/)
  assert.match(html, /tabindex="0"/i)
  assert.match(html, /aria-label="csv code snippet"/i)
})

test('single-line code snippets use compact width layout', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-code-compact-1',
        role: 'assistant',
        content: '```powershell\npython calculator.py\n```',
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  const compactBlocks = html.match(/data-chat-code-layout="compact"/g) || []
  assert.equal(compactBlocks.length, 1)
  assert.match(html, /data-chat-code-layout="compact"[\s\S]*python calculator\.py/)
  assert.doesNotMatch(html, /data-chat-code-layout="panel"/)
})

test('two-line code snippets keep full-width panel layout', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-code-panel-1',
        role: 'assistant',
        content: '```js\nconst x = 1\nconst y = 2\n```',
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /data-chat-code-layout="panel"/)
  assert.doesNotMatch(html, /data-chat-code-layout="compact"/)
})

test('long single-line code snippets stay compact but cap width for scrolling', () => {
  assert.equal(typeof MessageBubble, 'function')
  const longLine = `python ${'x'.repeat(180)}.py`
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-code-compact-long-1',
        role: 'assistant',
        content: `\`\`\`powershell\n${longLine}\n\`\`\``,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /data-chat-code-layout="compact"/)
  assert.match(html, /max-w-full/)
  assert.match(html, /data-chat-code-viewport="true"/)
})

test('assistant bold-only paragraphs remain authored emphasis before code blocks', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    'It includes:',
    '',
    '- Safe evaluator',
    '',
    '**Run the calculator:**',
    '',
    '```powershell',
    'python calculator.py',
    '```',
    '',
    '**Run tests:**',
    '',
    '```powershell',
    'python -m unittest -v',
    '```',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-section-labels-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.doesNotMatch(html, /chat-section-label/)
  assert.match(html, /<strong[^>]*>Run the calculator:<\/strong>/)
  assert.match(html, /<strong[^>]*>Run tests:<\/strong>/)
})

test('terminal transcript code blocks render as neutral terminal output, not highlighted code', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    'Use this terminal output as context.',
    '',
    '```terminal',
    'C:\\Users\\example\\Documents\\ADDOM>operable program or batch file.',
    "'operable' is not recognized as an internal or external command.",
    '```',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'u-terminal-output-1',
        role: 'user',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /data-chat-code-kind="terminal"/)
  assert.match(html, /aria-label="terminal terminal output"/i)
  assert.match(html, /data-highlight="off"/)
  assert.doesNotMatch(html, /hljs/)
  assert.doesNotMatch(html, /rgba\(17,24,39,0\.8\)/)
  assert.doesNotMatch(html, /rgba\(11,18,32,0\.72\)/)
})

test('assistant fenced json role payload stays a literal code block without typed runtime-role state', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    '```json',
    JSON.stringify({
      name: 'Architecture Reviewer',
      systemPrompt: 'Review architecture and report findings.',
      lifecycle: 'draft_role',
      ticketId: 'ticket_runtime_123',
      suggestedProviderId: '',
      suggestedModel: '',
    }, null, 2),
    '```',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: { id: 'a-role-json-1', role: 'assistant', content, status: 'done' },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.doesNotMatch(html, /data-chat-render="role-confirmation"/)
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /Architecture Reviewer/)
})

test('assistant fenced json role payload remains visible literal content after non-runtime role dismissal state', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    '```json',
    JSON.stringify({
      name: 'Application Security Reviewer',
      systemPrompt: 'Review application security issues and report findings.',
      suggestedProviderId: 'openai',
      suggestedModel: 'gpt-5.3-codex',
    }, null, 2),
    '```',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: { id: 'a-role-json-3', role: 'assistant', content, status: 'done' },
      actionsDisabled: false,
      planState: {
        hiddenRoleCardIds: ['message:a-role-json-3'],
      },
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )

  assert.doesNotMatch(html, /data-chat-render="role-confirmation"/)
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /Application Security Reviewer/)
})

test('user message with multiple fenced code blocks renders multiple framed code blocks in order', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    'Before block',
    '',
    '```py',
    'print(1)',
    '```',
    '',
    'Middle',
    '',
    '```js',
    'console.log(2)',
    '```',
    '',
    'After block',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: { id: 'u2', role: 'user', content, status: 'done' },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  const codeBlocks = html.match(/data-chat-render="code-block"/g) || []
  assert.equal(codeBlocks.length, 2)
  assert.match(html, /Before block/)
  assert.match(html, /Middle/)
  assert.match(html, /After block/)
})

test('user prose with inline code keeps inline code and does not create code block card', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: { id: 'u3', role: 'user', content: 'Run `npm test` and then continue.', status: 'done' },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.equal(/data-chat-render="code-block"/.test(html), false)
  assert.match(html, /<code\b/i)
  assert.match(html, /npm test/)
})

test('assistant inline code does not serialize react-markdown node onto the DOM', () => {
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-code-node-1',
        role: 'assistant',
        content: 'Extended `pdfa_checker.py` with `PdfaHints`.',
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /<a\b[^>]*data-chat-file-reference="true"[^>]*>pdfa_checker\.py<\/a>/i)
  assert.doesNotMatch(html, /\bnode="/)
  assert.doesNotMatch(html, /\[object Object\]/)
})

test('assistant markdown table renders as structured table markup', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    'Source table',
    '',
    '| URL | Method | Status | Why used |',
    '| --- | --- | --- | --- |',
    '| https://xmg.gg | Direct fetch | 403 | Primary probe |',
    '| https://xmg.gg/robots.txt | Direct fetch | 200 | Verify host reachability |',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-table-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-final-answer-table-scroll="true"/)
  assert.doesNotMatch(html, /chat-markdown-table--source-log/)
  assert.doesNotMatch(html, /<colgroup\b/i)
  assert.doesNotMatch(html, /style="width:/)
  assert.match(html, /<table\b/i)
  assert.match(html, /<thead\b/i)
  assert.match(html, /<tbody\b/i)
})

test('assistant reference-looking markdown table remains an ordinary authored table', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    '| Button | Function | Example |',
    '| --- | --- | --- |',
    '| ∛ | Cube root (`cbrt`) | `cbrt(27)` → 3, `cbrt(-8)` → -2 |',
    '| sinh | Hyperbolic sine | `sinh(0)` → 0 |',
    '| log₂ | Log base 2 | `log2(8)` → 3 |',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-table-reference-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-final-answer-table-scroll="true"/)
  assert.doesNotMatch(html, /chat-markdown-table-wrap--reference/)
  assert.doesNotMatch(html, /chat-markdown-table--reference/)
  assert.doesNotMatch(html, /chat-markdown-table--key-col-1/)
  assert.doesNotMatch(html, /<colgroup\b/i)
  assert.doesNotMatch(html, /style="width:30%"/)
  assert.doesNotMatch(html, /style="width:58%"/)
  assert.doesNotMatch(html, /style="width:6\.75rem"/)
  assert.doesNotMatch(html, /chat-markdown-example-list/)
  assert.doesNotMatch(html, /chat-markdown-key-insert/)
  assert.doesNotMatch(html, /aria-label="Insert .* into composer"/)
  assert.match(html, /cbrt\(27\)/)
  assert.match(html, /cbrt\(-8\)/)
  assert.doesNotMatch(html, /aria-label="Copy example"/)
  assert.doesNotMatch(html, /chat-markdown-example-chip/)
  assert.doesNotMatch(html, /chat-markdown-table--source-log/)
  assert.doesNotMatch(html, /chat-markdown-record-list/)
  assert.match(html, /<table\b/i)
})

test('assistant markdown file links render project and absolute evidence targets while unsafe URL lookalikes stay non-interactive', () => {
  assert.equal(typeof MessageBubble, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder
  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const content = [
      '[Chat renderer](src/renderer/components/chat/chat-rich-content-renderer.jsx#L164)',
      '',
      '[Outside project](/C:/Users/example/Documents/Elsewhere/outside.md#L2)',
      '',
      '[Protocol relative](//example.com/docs)',
      '',
      '[Docs](https://example.com/docs)',
    ].join('\n')
    const html = renderToStaticMarkup(
      React.createElement(MessageBubble, {
        message: {
          id: 'a-file-link-1',
          role: 'assistant',
          content,
          status: 'done',
        },
        actionsDisabled: false,
        planState: null,
        onPlanBundleSubmit: () => {},
        onPlanImplement: () => {},
        onPlanContinue: () => {},
        onPlanRevisit: () => {},
        onPlanRequest: () => {},
      }),
    )

    const localLinkMatches = html.match(/data-chat-file-reference="true"/g) || []
    assert.equal(localLinkMatches.length, 1)
    assert.match(html, /<a[^>]*data-chat-file-reference="true"[^>]*>Chat renderer<\/a>/)
    assert.match(html, /<a[^>]*data-evidence-file-reference="true"[^>]*>Outside project<\/a>/)
    assert.match(html, /<span[^>]*>Protocol relative<\/span>/)
    assert.match(html, /href="https:\/\/example\.com\/docs"/)
    assert.match(html, /target="_blank"/)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('settled final answers promote bare project filenames to minimal file links', () => {
  assert.equal(typeof MessageBubble, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousState = rendererUseAppStore.getState()

  try {
    rendererUseAppStore.setState({
      projectFolder: 'C:/Users/example/Documents/ADDOM',
      activeProjectId: 'project-addom',
    })
    const html = renderToStaticMarkup(
      React.createElement(MessageBubble, {
        message: {
          id: 'a-bare-final-file-links',
          role: 'assistant',
          status: 'done',
          content: 'Created HARDWARE_TOOL_IMPROVEMENT_PLAN.md and updated src/main/index.mjs.',
        },
      }),
    )

    const fileLinks = html.match(/data-chat-file-reference="true"/g) || []
    assert.equal(fileLinks.length, 2)
    assert.match(html, /class="[^"]*final-answer-file-reference[^"]*"[^>]*>HARDWARE_TOOL_IMPROVEMENT_PLAN\.md<\/a>/)
    assert.match(html, /class="[^"]*final-answer-file-reference[^"]*"[^>]*>src\/main\/index\.mjs<\/a>\./)
    assert.doesNotMatch(html, /<button[^>]*final-answer-file-reference/)
    assert.doesNotMatch(html, /<svg[^>]*final-answer-file-reference/)
  } finally {
    rendererUseAppStore.setState({
      projectFolder: previousState.projectFolder,
      activeProjectId: previousState.activeProjectId,
    })
  }
})

test('assistant fenced markdown table remains authored code instead of becoming a table', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    '```markdown',
    '| Category | Item | Details | Evidence Signal | Confidence | Notes |',
    '|---|---|---|---|---|---|',
    '| Access Check | Homepage | 403 | Direct probe failed | High | blocked |',
    '| Access Check | Robots | 200 | Direct probe succeeded | High | reachable |',
    '```',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-table-fenced-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.doesNotMatch(html, /<table\b/i)
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /language-markdown/)
})

test('assistant Name/Description table stays compact table and does not promote to record cards', () => {
  const longDescription = 'Builds a reusable PDF buffer after validating the header signature, normalizing truncated trails, and rejecting empty payloads before later metadata extraction runs.'
  assert.ok(longDescription.length >= 72)
  const content = [
    '| Name | Description |',
    '| --- | --- |',
    `| \`load_pdf_bytes\` | ${longDescription} |`,
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-name-desc-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-final-answer-table-scroll="true"/)
  assert.doesNotMatch(html, /chat-markdown-table--definition/)
  assert.doesNotMatch(html, /chat-markdown-record-list/)
})

test('assistant Function/Purpose table stays compact table when purposes are short', () => {
  const content = [
    '### New functions',
    '',
    '| Function | Purpose |',
    '| --- | --- |',
    '| `load_pdf_bytes()` | Load and validate a PDF file |',
    '| `get_pdf_version()` | Read the PDF version header |',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-fn-purpose-short-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-final-answer-table-scroll="true"/)
  assert.doesNotMatch(html, /chat-markdown-table-wrap--definition/)
  assert.doesNotMatch(html, /chat-markdown-table--definition/)
  assert.match(html, /<table\b/i)
  assert.doesNotMatch(html, /chat-markdown-record-list/)
  assert.doesNotMatch(html, /chat-markdown-record-card/)
})

test('assistant Function/Purpose table stays compact table even when purpose cells exceed 72 chars', () => {
  const longPurpose = 'Load bytes from disk, validate the PDF header signature, normalize truncated trails, and return a reusable buffer for later metadata and structure checks.'
  assert.ok(longPurpose.length >= 72)
  const content = [
    '### New functions',
    '',
    '| Function | Purpose |',
    '| --- | --- |',
    `| \`load_pdf_bytes()\` | ${longPurpose} |`,
    '| `extract_xmp_packets()` | Extract XMP metadata packets from raw bytes for downstream inspection. |',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-fn-purpose-long-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-final-answer-table-scroll="true"/)
  assert.doesNotMatch(html, /chat-markdown-table--definition/)
  assert.match(html, /<table\b/i)
  assert.doesNotMatch(html, /chat-markdown-record-list/)
  assert.doesNotMatch(html, /chat-markdown-record-card/)
  assert.match(html, /load_pdf_bytes/)
})

test('assistant verbose markdown table remains a native table with rich inline content intact', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    '| Area | Evidence | Constraint | Recommendation | Notes |',
    '| --- | --- | --- | --- | --- |',
    '| Checkout shell | [Vendor docs](https://example.com/docs) confirmed the current flow is only a visual prototype and does not create a live payment intent. | The current shell mixes product prose, commerce copy, and debug traces in one surface, which makes the output feel unfinished to a real customer. | Split the payment explanation from the implementation note and keep the primary action tied to a single `Start checkout` affordance. | Keep the legal copy short and move technical caveats below the main call to action. |',
    '| Media loading | The asset log still includes direct CDN probes and fallback notes, plus a leftover `npm run build` instruction in the same explanatory cell. | Wide prose cells with links and code make the table harder to scan than a stacked record layout in a chat bubble. | Convert rows into stacked records so each field reads as a labeled fact instead of forcing a spreadsheet presentation. | Preserve links and inline code styling in the record body. |',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-table-record-list-1',
        role: 'assistant',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-final-answer-table-scroll="true"/)
  assert.match(html, /<table\b/i)
  assert.doesNotMatch(html, /chat-markdown-record-list/)
  assert.doesNotMatch(html, /chat-markdown-record-card/)
  assert.doesNotMatch(html, /chat-markdown-record-field-label/)
  assert.match(html, /href="https:\/\/example\.com\/docs"/)
  assert.match(html, /<code\b/i)
})

test('settled assistant renders canonical final-document text without inferring product UI', () => {
  const finalText = [
    '# Canonical result',
    '',
    '```json',
    '{"name":"Architecture Reviewer","systemPrompt":"Review the architecture."}',
    '```',
    '',
    '| Area | Finding |',
    '| --- | --- |',
    '| Renderer | Preserve authored Markdown |',
    '',
    '=== AGENT DELEGATION RESULTS ===',
    'Delegation status: completed',
    '=== END AGENT RESULTS ===',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-canonical-final-document-1',
        role: 'assistant',
        content: 'STALE PROVIDER DISPLAY TEXT',
        finalDocument: {
          schemaVersion: 1,
          text: finalText,
          parts: [],
        },
        status: 'done',
      },
    }),
  )

  assert.match(html, /data-final-answer-document="true"/)
  assert.match(html, /Canonical result/)
  assert.doesNotMatch(html, /AGENT DELEGATION RESULTS/)
  assert.match(html, /data-final-answer-table-scroll="true"/)
  assert.match(html, /data-chat-render="code-block"/)
  assert.doesNotMatch(html, /STALE PROVIDER DISPLAY TEXT/)
  assert.doesNotMatch(html, /data-chat-render="role"/)
  assert.doesNotMatch(html, /data-chat-render="delegation"/)
  assert.doesNotMatch(html, /data-chat-render="patch-group"/)
})

test('settled assistant suppresses echoed compact delegation XML from final document', () => {
  const finalText = [
    'All three agents reported ALIVE.',
    '',
    '<delegation state="completed">',
    '<summary>completed: 3 completed, 0 failed, 3 agent(s).</summary>',
    '<results>- Security Reviewer (completed): ALIVE</results>',
    '<directive>Do not echo this block.</directive>',
    '</delegation>',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-suppress-delegation-xml-1',
        role: 'assistant',
        content: 'STALE',
        finalDocument: {
          schemaVersion: 1,
          text: finalText,
          parts: [],
        },
        status: 'done',
      },
    }),
  )

  assert.match(html, /All three agents reported ALIVE\./)
  assert.doesNotMatch(html, /<delegation\b/i)
  assert.doesNotMatch(html, /Do not echo this block/)
  assert.doesNotMatch(html, /STALE/)
})

test('settled assistant replaces echo-only delegation XML with calm fallback copy', () => {
  const finalText = [
    '<delegation state="completed">',
    '<summary>completed: 3 completed, 0 failed, 3 agent(s).</summary>',
    '<results>- Security Reviewer (completed): ALIVE</results>',
    '<directive>Do not echo this block.</directive>',
    '</delegation>',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'a-suppress-delegation-xml-fallback-1',
        role: 'assistant',
        content: '',
        finalDocument: {
          schemaVersion: 1,
          text: finalText,
          parts: [],
        },
        status: 'done',
      },
    }),
  )

  assert.match(html, /data-final-answer-delegation-echo-suppressed="true"/)
  assert.match(html, /Delegation finished\. Open Agents for the details\./)
  assert.doesNotMatch(html, /<delegation\b/i)
})

test('user markdown table path renders table and sanitizes unsafe links', () => {
  assert.equal(typeof MessageBubble, 'function')
  const content = [
    'Use `source table` format:',
    '',
    '| URL | Note |',
    '| --- | --- |',
    '| [Safe](https://example.com) | ok |',
    '| [Unsafe](javascript:alert(1)) | blocked |',
  ].join('\n')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'u-table-1',
        role: 'user',
        content,
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /<table\b/i)
  assert.match(html, /href="https:\/\/example\.com"/i)
  assert.match(html, /href="#"/i)
  assert.doesNotMatch(html, /javascript:alert\(1\)/i)
})

test('user message renders file attachment card for file parts', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'u4',
        role: 'user',
        content: [
          { type: 'text', text: 'See attached.' },
          {
            type: 'file',
            mediaType: 'application/pdf',
            filename: 'notes.pdf',
            data: 'JVBERi0xLjQK',
          },
        ],
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-chat-render="user-file-attachment"/)
  assert.match(html, /notes\.pdf/)
  assert.match(html, />PDF</)
})

test('user file attachment card shows filename extension badge instead of MIME type', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'u4b',
        role: 'user',
        content: [
          { type: 'text', text: 'See attached.' },
          {
            type: 'file',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            filename: 'test.docx',
            data: 'UEsDBAoAAAAAA',
          },
        ],
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-chat-render="user-file-attachment"/)
  assert.match(html, /test\.docx/)
  assert.match(html, />DOCX</)
  assert.doesNotMatch(html, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i)
})

test('user message renders image attachment as clickable preview trigger', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'u5',
        role: 'user',
        content: [
          { type: 'text', text: 'Screenshot attached.' },
          {
            type: 'image',
            mediaType: 'image/png',
            image: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
          },
        ],
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-chat-render="user-image-attachment"/)
  assert.match(html, /Attached image/)
})

test('user message renders cached image attachment previewUrl when attachmentId is present', () => {
  assert.equal(typeof MessageBubble, 'function')
  const html = renderToStaticMarkup(
    React.createElement(MessageBubble, {
      message: {
        id: 'u6',
        role: 'user',
        content: [
          {
            type: 'image',
            attachmentId: 'att_image_1',
            mediaType: 'image/png',
            filename: 'cache.png',
            previewUrl: 'file:///tmp/cache.png',
          },
        ],
        status: 'done',
      },
      actionsDisabled: false,
      planState: null,
      onPlanBundleSubmit: () => {},
      onPlanImplement: () => {},
      onPlanContinue: () => {},
      onPlanRevisit: () => {},
      onPlanRequest: () => {},
    }),
  )
  assert.match(html, /data-chat-render="user-image-attachment"/)
  assert.match(html, /addom-attachment:\/\/attachment\/att_image_1/)
})
