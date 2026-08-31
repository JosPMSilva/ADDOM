import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let PlanDirectionCard = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/PlanDirectionCard.jsx')
  PlanDirectionCard = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('Plan Direction Card renders the one-question surface with localized minimal navigation', () => {
  const html = renderToStaticMarkup(React.createElement(PlanDirectionCard, {
    plan: {
      revision: 1,
      lifecycle: 'awaiting_decision',
      direction: {
        stage: 'collecting_answers',
        summary: 'Choose a production direction.',
        questions: [
          {
            id: 'scope', header: 'Scope', question: 'Which boundary should change?', answer: null,
            options: [
              { id: 'focused', label: 'Focused slice', description: 'Ship one bounded outcome.', recommended: true },
              { id: 'broad', label: 'Broad plan', description: 'Cover the whole system.', recommended: false },
            ],
          },
          { id: 'depth', header: 'Depth', question: 'How detailed should it be?', answer: null, options: [] },
        ],
      },
    },
  }))

  assert.match(html, /data-ui="chat-plan-direction-card"/)
  assert.match(html, />Scope</)
  assert.match(html, /Plan direction questions/)
  assert.match(html, /Focused slice/)
  assert.match(html, /Ship one bounded outcome/)
  assert.match(html, /Recommended/)
  assert.match(html, /Or describe another direction/)
  assert.doesNotMatch(html, /Depth<\/h2>/)
  assert.doesNotMatch(html, /â|Ã/)
})

test('Plan Direction Card renders the profile decision state without legacy plan actions', () => {
  const html = renderToStaticMarkup(React.createElement(PlanDirectionCard, {
    plan: {
      revision: 2,
      lifecycle: 'awaiting_decision',
      direction: {
        stage: 'review',
        summary: 'Use the managed plan lifecycle.',
        questions: [],
        recommendation: {
          profile: 'implementation',
          rationale: 'The work is repository-grounded.',
        },
      },
    },
  }))

  assert.match(html, /data-tone="decision"/)
  assert.doesNotMatch(html, /data-tone="warning"/)
  assert.match(html, /data-ui="plan-direction-recommendation-label"[^>]*>Recommended:<\/span>/)
  assert.match(html, /data-ui="plan-direction-recommendation-detail"[^>]*>Implementation plan - The work is repository-grounded\.<\/span>/)
  assert.match(html, /Change direction/)
  assert.match(html, /Create plan/)
  assert.doesNotMatch(html, /Continue Planning|Implement Plan/)
})

test('Plan Direction Card renders synthesis progress and an explicit retry after failure', () => {
  const html = renderToStaticMarkup(React.createElement(PlanDirectionCard, {
    plan: {
      revision: 4,
      lifecycle: 'awaiting_decision',
      direction: {
        stage: 'synthesizing',
        summary: 'Provisional direction.',
        questions: [],
        synthesis: { status: 'failed', error: 'Provider stopped.' },
      },
    },
  }))

  assert.match(html, /Provider stopped\./)
  assert.match(html, /Retry/)
  assert.doesNotMatch(html, /Create plan/)
})

test('Plan Direction Card keeps a reload-recovery retry available for pending synthesis', () => {
  const html = renderToStaticMarkup(React.createElement(PlanDirectionCard, {
    plan: {
      revision: 4,
      lifecycle: 'awaiting_decision',
      direction: {
        stage: 'synthesizing',
        summary: 'Provisional direction.',
        questions: [],
        synthesis: { status: 'pending', error: '' },
      },
    },
  }))

  assert.match(html, /Updating the direction from your choices/)
  assert.match(html, /Retry/)
  assert.doesNotMatch(html, /Create plan/)
})
