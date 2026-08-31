import test from 'node:test'
import assert from 'node:assert/strict'

import { WEB_AND_COMMAND_TOOLS } from '../../src/main/tools/tool-definitions-web.mjs'

function browserToolDefinition() {
  return WEB_AND_COMMAND_TOOLS.find((definition) => definition.name === 'browser_action')
}

test('browser_action schema exposes inspect, find_elements, list_options, and diagnostics actions', () => {
  const definition = browserToolDefinition()
  assert.ok(definition)

  const actionEnum = definition.parameters.properties.action.enum
  assert.equal(actionEnum.includes('inspect'), true)
  assert.equal(actionEnum.includes('find_elements'), true)
  assert.equal(actionEnum.includes('list_options'), true)
  assert.equal(actionEnum.includes('console_messages'), true)
  assert.equal(actionEnum.includes('network_errors'), true)
  assert.deepEqual(definition.parameters.required, ['action'])
})

test('browser_action schema describes discovery inputs without adding new required fields', () => {
  const definition = browserToolDefinition()
  const properties = definition.parameters.properties

  assert.match(definition.description, /inspect\/find_elements\/list_options/)
  assert.match(definition.description, /console_messages\/network_errors/)
  assert.match(properties.selector.description, /list_options/)
  assert.match(properties.query.description, /find_elements/)
  assert.deepEqual(properties.mode.enum, ['auto', 'text', 'role', 'label', 'name', 'placeholder', 'title', 'selector'])
  assert.equal(properties.include_hidden.type, 'boolean')
  assert.equal(properties.element_index.type, 'integer')
  assert.deepEqual(properties.level.enum, ['debug', 'info', 'log', 'warning', 'error', 'pageerror'])
  assert.equal(properties.status.type, 'integer')
  assert.equal(properties.type.type, 'string')
})
