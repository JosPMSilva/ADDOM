import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let AssistantRichContent = null

before(async () => {
  const assistantRichContentMod = await ssrLoadRendererModule('/components/chat/AssistantRichContent.jsx')
  AssistantRichContent = assistantRichContentMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

const PLAIN_REASONING = [
  'Finalized three additions: 10^x button will be',
  '',
  'labeled 10ˣ. Also adding sinh root to avoid requiring Python 3.11.',
].join('\n')

test('exec-reasoning plain prose paragraphs use muted secondary, not text-chat-text', () => {
  assert.equal(typeof AssistantRichContent, 'function')
  const html = renderToStaticMarkup(
    React.createElement(AssistantRichContent, {
      mode: 'execution-stream',
      typographyRole: 'exec-reasoning',
      keyPrefix: 'exec-plain',
      text: PLAIN_REASONING,
    }),
  )

  assert.match(html, /Finalized three additions/)
  assert.match(html, /class="[^"]*text-text-secondary[^"]*"/)
  assert.doesNotMatch(html, /<p class="[^"]*text-chat-text[^"]*"/)
})

test('default assistant plain prose paragraphs keep text-chat-text', () => {
  assert.equal(typeof AssistantRichContent, 'function')
  const html = renderToStaticMarkup(
    React.createElement(AssistantRichContent, {
      mode: 'assistant-message',
      keyPrefix: 'assistant-plain',
      text: 'Plain final-answer paragraph without markdown markers.',
    }),
  )

  assert.match(html, /<p class="[^"]*text-chat-text[^"]*"/)
  assert.doesNotMatch(html, /typographyRole/)
})

test('AssistantRichContent wires muted plain prose class for exec-reasoning', () => {
  const source = fs.readFileSync('src/renderer/components/chat/AssistantRichContent.jsx', 'utf8')
  assert.match(source, /text-text-secondary/)
  assert.match(source, /renderPlainProseText\([\s\S]*className:/)
})

test('exec-reasoning bold-only paragraphs keep the execution body tone and weight', () => {
  const prose = fs.readFileSync('src/renderer/styles/chat-prose.css', 'utf8')
  const paragraphRule = prose.match(
    /\.prose-chat\.chat-typo-exec-reasoning-prose > p\.chat-section-label,[\s\S]*?\{([^}]+)\}/,
  )?.[1] || ''
  const strongRule = prose.match(
    /\.prose-chat\.chat-typo-exec-reasoning-prose > p\.chat-section-label > strong:first-child:last-child,[\s\S]*?\{([^}]+)\}/,
  )?.[1] || ''

  assert.match(paragraphRule, /color:\s*var\(--color-text-secondary\)/)
  assert.match(paragraphRule, /font-weight:\s*400/)
  assert.match(strongRule, /color:\s*inherit/)
  assert.match(strongRule, /font-weight:\s*inherit/)
})
