import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('TitleBar keeps drag region on layout wrappers and limits no-drag to interactive controls', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/TitleBar.jsx'),
    'utf8',
  )

  assert.match(source, /className="titlebar-drag [^"]*"/)
  assert.match(source, /<TitleBarButton onClick=\{minimize\} label="Minimize">/)
  assert.match(source, /<TitleBarButton onClick=\{maximize\} label="Maximize">/)
  assert.match(source, /<TitleBarButton onClick=\{close\} label="Close" danger>/)
  assert.match(source, /'titlebar-no-drag flex items-center justify-center w-7 h-7 rounded'/)

  assert.doesNotMatch(source, /className="titlebar-no-drag flex items-center gap-2 min-w-0"/)
  assert.doesNotMatch(source, /className="titlebar-no-drag col-span-2 sm:col-span-1 sm:col-start-2 flex items-center min-w-0"/)
  assert.doesNotMatch(source, /className="titlebar-no-drag row-start-1 col-start-2 sm:col-start-3 flex items-center gap-1 justify-self-end"/)
})

test('TitleBar maximize glyph matches the two-pixel window control weight', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/TitleBar.jsx'),
    'utf8',
  )

  assert.match(source, /w-2\.5 h-2\.5 border-2 border-current rounded-sm/)
})
