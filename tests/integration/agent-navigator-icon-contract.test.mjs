import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('agent navigator settings uses the shared regular gear icon at the existing size', () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'src/renderer/components/agents/AgentNavigatorPanel.jsx'),
    'utf8',
  )

  assert.match(source, /import Icon from ['"]\.\.\/ui\/Icon\.jsx['"]/)
  assert.match(source, /<Icon name="gear" size=\{14\} \/>/)
  assert.doesNotMatch(source, /function GearIcon\(/)
})
