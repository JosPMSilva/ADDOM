import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let McpElicitationCard = null
let toMcpDateTimeLocalValue = null
let serializeMcpTextValue = null

before(async () => {
  const module = await ssrLoadRendererModule('/components/chat/McpElicitationCard.jsx')
  McpElicitationCard = module?.default || null
  toMcpDateTimeLocalValue = module?.toMcpDateTimeLocalValue || null
  serializeMcpTextValue = module?.serializeMcpTextValue || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('MCP elicitation card renders accessible typed controls without provider markup', () => {
  assert.equal(typeof McpElicitationCard, 'function')
  const html = renderToStaticMarkup(React.createElement(McpElicitationCard, {
    request: {
      threadId: 'app_thread_1',
      serverName: 'Example MCP',
      message: 'Choose <b>carefully</b>.',
      fields: [
        {
          name: 'target',
          kind: 'single_select',
          title: 'Target',
          description: '',
          required: true,
          options: [
            { value: 'staging', title: 'Staging' },
            { value: 'production', title: 'Production' },
          ],
        },
        {
          name: 'replicas',
          kind: 'integer',
          title: 'Replicas',
          description: 'One to five.',
          required: true,
          minimum: 1,
          maximum: 5,
          defaultValue: 2,
        },
        {
          name: 'features',
          kind: 'multi_select',
          title: 'Features',
          description: '',
          required: false,
          minItems: 0,
          maxItems: 2,
          options: [
            { value: 'logs', title: 'Logs' },
            { value: 'metrics', title: 'Metrics' },
          ],
          defaultValue: [],
        },
      ],
    },
  }))

  assert.match(html, /data-ui="chat-mcp-elicitation-card"/)
  assert.match(html, /<form/)
  assert.match(html, /<select[^>]+required/)
  assert.match(html, /type="number"/)
  assert.match(html, /role="group"/)
  assert.match(html, /type="checkbox"/)
  assert.match(html, /Choose &lt;b&gt;carefully&lt;\/b&gt;\./)
  assert.doesNotMatch(html, /<b>carefully<\/b>/)
})

test('MCP elicitation converts date-time values between provider and local input contracts', () => {
  assert.equal(typeof toMcpDateTimeLocalValue, 'function')
  assert.equal(typeof serializeMcpTextValue, 'function')

  const providerValue = '2026-08-01T12:30:00.000Z'
  const localValue = toMcpDateTimeLocalValue(providerValue)
  assert.match(localValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  assert.equal(new Date(serializeMcpTextValue({ format: 'date-time' }, localValue)).getTime(), new Date(providerValue).getTime())
  const preciseProviderValue = '2026-08-01T12:30:00.123Z'
  const preciseLocalValue = toMcpDateTimeLocalValue(preciseProviderValue)
  assert.equal(new Date(serializeMcpTextValue({ format: 'date-time' }, preciseLocalValue)).getTime(), new Date(preciseProviderValue).getTime())
  assert.equal(serializeMcpTextValue({ format: 'date-time' }, 'not-a-date'), null)
  assert.equal(serializeMcpTextValue({ format: 'date' }, '2026-08-01'), '2026-08-01')
})

test('MCP elicitation failure fallback is available in every core locale', () => {
  const localeRoot = path.resolve('src/renderer/i18n/locales')
  const localeFiles = fs.readdirSync(localeRoot)
    .map((locale) => path.join(localeRoot, locale, 'core.json'))
    .filter((filePath) => fs.existsSync(filePath))

  for (const filePath of localeFiles) {
    const locale = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    assert.equal(typeof locale?.chat?.mcpElicitation?.sendFailed, 'string', filePath)
    assert.notEqual(locale.chat.mcpElicitation.sendFailed.trim(), '', filePath)
  }
})
