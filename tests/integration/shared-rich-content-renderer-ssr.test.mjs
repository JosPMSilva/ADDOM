import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let AssistantRichContent = null
let renderChatRichContentSegments = null
let rendererUseAppStore = null
let MarkdownRuntimeServer = null

before(async () => {
  const assistantRichContentMod = await ssrLoadRendererModule('/components/chat/AssistantRichContent.jsx')
  AssistantRichContent = assistantRichContentMod?.default || null

  const richRendererMod = await ssrLoadRendererModule('/components/chat/chat-rich-content-renderer.jsx')
  renderChatRichContentSegments = richRendererMod?.renderChatRichContentSegments || null

  const markdownRuntimeServerMod = await ssrLoadRendererModule('/components/markdown/MarkdownRuntimeServer.jsx')
  MarkdownRuntimeServer = markdownRuntimeServerMod?.default || null

  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')
  rendererUseAppStore = appStoreMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderSegmentsHtml(segments = [], options = {}) {
  return renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      renderChatRichContentSegments(segments, options),
    ),
  )
}

test('AssistantRichContent suppresses compact delegation XML in assistant-message mode', () => {
  assert.equal(typeof AssistantRichContent, 'function')
  const html = renderToStaticMarkup(
    React.createElement(AssistantRichContent, {
      mode: 'assistant-message',
      keyPrefix: 'assistant-compact-delegation',
      text: [
        'Summary for the user.',
        '',
        '<delegation state="completed">',
        '<summary>completed: 1 completed, 0 failed, 1 agent(s).</summary>',
        '<results>- reviewer (completed): ok</results>',
        '</delegation>',
      ].join('\n'),
    }),
  )

  assert.match(html, /Summary for the user\./)
  assert.doesNotMatch(html, /<delegation\b/i)
  assert.doesNotMatch(html, /<summary>/i)
})

test('AssistantRichContent suppresses legacy delegation markers in assistant-message mode', () => {
  assert.equal(typeof AssistantRichContent, 'function')
  const html = renderToStaticMarkup(
    React.createElement(AssistantRichContent, {
      mode: 'assistant-message',
      keyPrefix: 'assistant-delegation',
      text: [
        '=== AGENT DELEGATION RESULTS ===',
        'Delegation status: completed',
        'Pattern: parallel',
        'Tasks: 1',
        'Completed: 1',
        'Duration: 1200ms',
        '[AGENT: reviewer] [TASK: task-1] Status: completed',
        'Output: [truncated]',
        '=== END AGENT RESULTS ===',
      ].join('\n'),
    }),
  )

  assert.doesNotMatch(html, /Agent Delegation Results/)
  assert.doesNotMatch(html, /=== AGENT DELEGATION RESULTS ===/)
  assert.doesNotMatch(html, /reviewer/)
})

test('AssistantRichContent does not render delegation cards in execution-stream mode', () => {
  assert.equal(typeof AssistantRichContent, 'function')
  const html = renderToStaticMarkup(
    React.createElement(AssistantRichContent, {
      mode: 'execution-stream',
      keyPrefix: 'stream-delegation',
      text: [
        'Before delegation summary.',
        '',
        '=== AGENT DELEGATION RESULTS ===',
        'Delegation status: completed',
        'Pattern: parallel',
        'Tasks: 1',
        'Completed: 1',
        'Duration: 1200ms',
        '[AGENT: reviewer] [TASK: task-1] Status: completed',
        'Output: [truncated]',
        '=== END AGENT RESULTS ===',
        '',
        'After delegation summary.',
      ].join('\n'),
    }),
  )

  assert.doesNotMatch(html, /Agent Delegation Results/)
  assert.match(html, /Before delegation summary\./)
  assert.doesNotMatch(html, /=== AGENT DELEGATION RESULTS ===/)
  assert.doesNotMatch(html, /Delegation status: completed/)
  assert.match(html, /After delegation summary\./)
})

test('shared rich-content renderer flattens patch groups in assistant-message and execution-stream modes', () => {
  assert.equal(typeof renderChatRichContentSegments, 'function')
  const segments = [{
    id: 'patch-group:1',
    type: 'patch_file_group',
    filePath: 'src/renderer/App.jsx',
    diffSegments: [{
      id: 'diff:1',
      type: 'diff_block',
      language: 'diff',
      text: '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")',
    }],
  }]

  const assistantHtml = renderSegmentsHtml(segments, {
    keyPrefix: 'assistant-patch',
    mode: 'assistant-message',
  })
  const executionHtml = renderSegmentsHtml(segments, {
    keyPrefix: 'execution-patch',
    mode: 'execution-stream',
  })

  assert.doesNotMatch(assistantHtml, /data-chat-render="patch-group"/)
  assert.match(assistantHtml, /data-chat-render="diff-block"/)
  assert.match(assistantHtml, /src\/renderer\/App\.jsx/)

  assert.doesNotMatch(executionHtml, /data-chat-render="patch-group"/)
  assert.match(executionHtml, /data-chat-render="diff-block"/)
  assert.match(executionHtml, /<a[^>]*data-chat-file-reference="true"[^>]*>src\/renderer\/App\.jsx<\/a>/)
})

test('shared rich-content renderer upgrades structured file labels into file-reference links when safe', () => {
  assert.equal(typeof renderChatRichContentSegments, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder
  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderSegmentsHtml([{
      id: 'file-label:1',
      type: 'file_label',
      filePath: 'src/main/index.mjs',
      rawLabel: 'src/main/index.mjs',
    }], {
      keyPrefix: 'assistant-file-label',
      mode: 'assistant-message',
    })

    assert.match(html, /data-chat-file-reference="true"/)
    assert.match(html, /href="#"/)
    assert.match(html, /src\/main\/index\.mjs/)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('shared rich-content renderer recovers line-suffixed file labels through the shared file-reference primitive', () => {
  assert.equal(typeof renderChatRichContentSegments, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder
  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderSegmentsHtml([{
      id: 'file-label:line-1',
      type: 'file_label',
      filePath: 'src/main/index.mjs:810',
      rawLabel: 'src/main/index.mjs:810',
    }], {
      keyPrefix: 'assistant-file-label-line',
      mode: 'assistant-message',
    })

    assert.match(html, /data-chat-file-reference="true"/)
    assert.match(html, /href="#"/)
    assert.match(html, /src\/main\/index\.mjs:810/)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('shared rich-content renderer upgrades absolute out-of-project labels into evidence-file links', () => {
  assert.equal(typeof renderChatRichContentSegments, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder
  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderSegmentsHtml([{
      id: 'file-label:outside-1',
      type: 'file_label',
      filePath: '/C:/Users/example/Documents/Elsewhere/outside.md',
      rawLabel: '/C:/Users/example/Documents/Elsewhere/outside.md',
    }], {
      keyPrefix: 'assistant-file-label-outside',
      mode: 'assistant-message',
    })

    assert.match(html, /<a\b/i)
    assert.match(html, /data-evidence-file-reference="true"/)
    assert.doesNotMatch(html, /data-chat-file-reference="true"/)
    assert.match(html, /C:\/Users\/example\/Documents\/Elsewhere\/outside\.md/)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('MarkdownRuntimeServer preserves absolute local markdown hrefs for custom link components', () => {
  assert.ok(MarkdownRuntimeServer)
  const seenHrefs = []
  const html = renderToStaticMarkup(
    React.createElement(MarkdownRuntimeServer, {
      text: [
        '- [styles.css](C:/Users/example/Documents/ADDOM/field-notes-tracker/styles.css)',
        '- [README.md](/Users/example/Documents/ADDOM/field-notes-tracker/README.md)',
      ].join('\n'),
      components: {
        a({ href, children }) {
          seenHrefs.push(href)
          return React.createElement('a', { href }, children)
        },
      },
    }),
  )

  assert.deepEqual(seenHrefs, [
    'C:/Users/example/Documents/ADDOM/field-notes-tracker/styles.css',
    '/Users/example/Documents/ADDOM/field-notes-tracker/README.md',
  ])
  assert.match(html, /C:\/Users\/example\/Documents\/ADDOM\/field-notes-tracker\/styles\.css/)
  assert.match(html, /\/Users\/example\/Documents\/ADDOM\/field-notes-tracker\/README\.md/)
})
