import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let CommandSafetyBlock = null
let ExecutionModeBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsBlocks.jsx')
  CommandSafetyBlock = mod?.CommandSafetyBlock || null
  ExecutionModeBlock = mod?.ExecutionModeBlock || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderCommandSafety(props = {}) {
  assert.equal(typeof CommandSafetyBlock, 'function')
  return renderToStaticMarkup(React.createElement(CommandSafetyBlock, {
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    commandSafety: {
      showDeveloperOptions: true,
      installSandboxEnabled: true,
      preferredBackend: 'docker',
      sandboxNetworkEnforcementMode: 'strict',
    },
    ...props,
  }))
}

test('CommandSafetyBlock SSR renders production guardrails without sandbox controls', () => {
  const html = renderCommandSafety()
  assert.match(html, /Guardrails/)
  assert.match(html, /Risky-action approvals/i)
  assert.match(html, /Mode effect/i)
  assert.doesNotMatch(html, /Advanced diagnostics/i)
  assert.doesNotMatch(html, /Developer diagnostics/i)
  assert.doesNotMatch(html, /Allow private network targets/i)
  assert.doesNotMatch(html, /Install sandbox backend/i)
  assert.doesNotMatch(html, /Prompt suppressions/i)
  assert.doesNotMatch(html, /text-warning|bg-warning|rounded-xl|shadow-sm/)
})

test('ExecutionModeBlock SSR renders the synchronized secondary permission control', () => {
  assert.equal(typeof ExecutionModeBlock, 'function')

  const html = renderToStaticMarkup(React.createElement(ExecutionModeBlock, {
    permissionMode: 'autonomy',
    permissionModeChangePending: true,
    onPermissionModeChange: () => {},
  }))

  assert.match(html, /Execution Mode/)
  assert.match(html, /Current default:\s*<span[^>]*>Autonomy<\/span>/)
  assert.match(html, /Permission/)
  assert.match(html, />Autonomy</)
  assert.match(html, /aria-haspopup="listbox"/)
  assert.match(html, /data-ui="settings-execution-mode"[^>]*class="[^"]*py-3/)
  assert.doesNotMatch(html, /aria-pressed=/)
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, /Saving permission mode.../)
})

test('CommandSafetyBlock SSR keeps advanced internals hidden', () => {
  const html = renderCommandSafety({
    commandSafety: {
      showDeveloperOptions: false,
      installSandboxEnabled: false,
      preferredBackend: 'auto',
      sandboxNetworkEnforcementMode: 'strict',
    },
  })

  assert.match(html, /Risky-action approvals/i)
  assert.doesNotMatch(html, /Advanced diagnostics/i)
  assert.doesNotMatch(html, /Allow private network targets/i)
  assert.doesNotMatch(html, /Install sandbox backend/i)
})
