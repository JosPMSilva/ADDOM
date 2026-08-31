import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

import {
  createPlanAnnotationBlockId,
  hasPlanAnnotationTextSelection,
  resolvePlanAnnotationHeadingContext,
  resolvePlanAnnotationHeadingAnchor,
} from '../../src/renderer/components/chat/document-companion-plan-annotation.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let createMarkdownComponents = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/final-document/final-answer-markdown-components.jsx')
  createMarkdownComponents = mod.createFinalAnswerMarkdownComponents
})

after(async () => {
  await closeViteSsrLoader()
})

function heading(textContent, { id = '', contains = false, before = true } = {}) {
  return {
    id,
    textContent,
    contains: () => contains,
    compareDocumentPosition: () => (before ? 4 : 2),
  }
}

function headingWithAnnotationAction(label) {
  return {
    id: '',
    textContent: `${label}Annotate change`,
    contains: () => false,
    compareDocumentPosition: () => 4,
    cloneNode: () => {
      const clone = {
        textContent: `${label}Annotate change`,
        querySelectorAll: () => [
          {
            remove: () => {
              clone.textContent = label
            },
          },
        ],
      }
      return clone
    },
  }
}

test('plan annotation block identity is stable for one Markdown source position', () => {
  const node = { position: { start: { offset: 42, line: 5, column: 3 } } }

  assert.equal(createPlanAnnotationBlockId(node, 'paragraph', 'First text'), 'paragraph-42')
  assert.equal(createPlanAnnotationBlockId(node, 'paragraph', 'Changed rendering text'), 'paragraph-42')
  assert.notEqual(createPlanAnnotationBlockId(null, 'paragraph', 'First text'), createPlanAnnotationBlockId(null, 'paragraph', 'Second text'))
})

test('plan annotation context resolves the nearest preceding Markdown heading', () => {
  const selectedNode = {}
  const headings = [heading('Overview', { id: 'overview' }), heading('Recovery & rollback'), heading('Later section', { before: false })]
  const root = { querySelectorAll: () => headings }

  assert.equal(resolvePlanAnnotationHeadingAnchor(root, selectedNode), 'recovery-rollback')
})

test('plan annotation context prefers the containing heading identifier', () => {
  const selectedNode = {}
  const root = {
    querySelectorAll: () => [heading('Plan title', { id: 'plan-title' }), heading('Exact section', { id: 'exact-section', contains: true })],
  }

  assert.equal(resolvePlanAnnotationHeadingAnchor(root, selectedNode), 'exact-section')
  assert.deepEqual(resolvePlanAnnotationHeadingContext(root, selectedNode), {
    anchor: 'exact-section',
    label: 'Exact section',
  })
})

test('plan annotation context separates the visible heading label from the durable anchor', () => {
  const selectedNode = {}
  const root = {
    querySelectorAll: () => [headingWithAnnotationAction('Repository Baseline')],
  }

  assert.deepEqual(resolvePlanAnnotationHeadingContext(root, selectedNode), {
    anchor: 'repository-baseline',
    label: 'Repository Baseline',
  })
  assert.equal(resolvePlanAnnotationHeadingAnchor(root, selectedNode), 'repository-baseline')
})

test('plan annotation selection state applies only to a non-empty selection in the reading column', () => {
  const root = {}
  const selectionInside = {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ intersectsNode: (node) => node === root }),
  }
  const selectionOutside = {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ intersectsNode: () => false }),
  }

  assert.equal(hasPlanAnnotationTextSelection(root, selectionInside), true)
  assert.equal(hasPlanAnnotationTextSelection(root, selectionOutside), false)
  assert.equal(hasPlanAnnotationTextSelection(root, { isCollapsed: true, rangeCount: 1 }), false)
})

test('managed plan Markdown exposes semantic annotation actions without changing text selection', () => {
  const components = createMarkdownComponents({
    planAnnotations: {
      activeBlockId: '',
      stagedBlockIds: ['paragraph-42'],
      actionLabel: 'Annotate change',
      onAnnotate: () => {},
    },
  })
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      components.p({
        node: { position: { start: { offset: 42 } } },
        children: 'Preserve this paragraph.',
      }),
    ),
  )

  assert.match(html, /data-plan-annotation-block="true"/)
  assert.match(html, /data-plan-block-id="paragraph-42"/)
  assert.match(html, /data-plan-block-kind="paragraph"/)
  assert.match(html, /data-plan-annotation-staged="true"/)
  assert.match(html, /data-plan-annotation-action="true"/)
  assert.match(html, />Annotate change<\/button>/)
  assert.match(html, />Preserve this paragraph\./)
})

test('managed plan Markdown keeps annotation actions mounted while interaction is frozen', () => {
  const components = createMarkdownComponents({
    planAnnotations: {
      activeBlockId: 'paragraph-42',
      stagedBlockIds: [],
      enabled: false,
      actionLabel: 'Annotate change',
      onAnnotate: () => {},
    },
  })
  const html = renderToStaticMarkup(
    React.createElement(components.p, {
      node: { position: { start: { offset: 42 } } },
      children: 'Preserve this paragraph.',
    }),
  )

  assert.match(html, /data-plan-annotation-block="true"/)
  assert.match(html, /data-plan-annotation-active="true"/)
  assert.match(html, /data-plan-annotation-action="true"/)
})

test('managed plan inline-code file paths remain code-styled and clickable', () => {
  const components = createMarkdownComponents()
  const html = renderToStaticMarkup(
    React.createElement(components.code, {
      children: 'hardware_info.py',
    }),
  )

  assert.match(html, /data-chat-file-reference="true"/)
  assert.match(html, /final-answer-inline-code/)
  assert.match(html, />hardware_info\.py<\/a>/)
})
