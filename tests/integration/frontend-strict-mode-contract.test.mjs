import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('renderer root mounts App inside React.StrictMode', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/main.jsx'), 'utf8')

  assert.match(source, /<React\.StrictMode>/)
  assert.match(source, /<AppErrorBoundary>/)
  assert.match(source, /<App \/>/)
  assert.match(source, /<\/React\.StrictMode>/)
  assert.match(source, /const reactGrabEnabled = \(\s*import\.meta\.env\.DEV\s*&& import\.meta\.env\.VITE_DISABLE_REACT_GRAB !== '1'\s*\)/)
  assert.match(source, /if \(reactGrabEnabled\) \{/)
})
