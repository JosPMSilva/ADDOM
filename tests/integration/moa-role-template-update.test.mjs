import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createRoleFormFromTemplate,
  getRoleTemplateInstallState,
} from '../../src/renderer/components/settings/moa-role-editor.mjs'

const template = {
  id: 'systematic-debugger',
  version: 3,
  label: 'Systematic Debugger',
  defaultName: 'Debugger',
  defaultSystemPrompt: 'Latest instructions',
}

test('role template install state distinguishes available, current, and updateable roles', () => {
  assert.deepEqual(getRoleTemplateInstallState(template, []), {
    state: 'available',
    role: null,
  })

  const currentRole = { id: 'role_1', templateId: template.id, templateVersion: 3 }
  assert.deepEqual(getRoleTemplateInstallState(template, [currentRole]), {
    state: 'added',
    role: currentRole,
  })

  const oldRole = { id: 'role_1', templateId: template.id, templateVersion: 2 }
  assert.deepEqual(getRoleTemplateInstallState(template, [oldRole]), {
    state: 'update_available',
    role: oldRole,
  })
})

test('updating from a template preserves role identity and model route while refreshing instructions', () => {
  const existingRole = {
    id: 'role_1',
    name: 'My Debugger',
    providerId: 'openai',
    model: 'gpt-5.6-sol',
    canWriteFiles: false,
    systemPrompt: 'Customized old instructions',
    templateId: template.id,
    templateVersion: 2,
    templateLabel: 'Systematic Debugger',
  }

  assert.deepEqual(createRoleFormFromTemplate(template, { existingRole }), {
    name: 'My Debugger',
    providerId: 'openai',
    model: 'gpt-5.6-sol',
    systemPrompt: 'Latest instructions',
    canWriteFiles: false,
    templateId: template.id,
    templateVersion: 3,
    templateLabel: template.label,
  })
})
