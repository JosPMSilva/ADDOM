import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LIGHT_THEME_COLORS } from '../../src/common/ui/theme-color-contract.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function relativeLuminance(hex) {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ))
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

test('light theme secondary and muted text remain legible on primary surfaces', () => {
  for (const textColor of [LIGHT_THEME_COLORS.textSecondary, LIGHT_THEME_COLORS.textMuted]) {
    assert.ok(contrastRatio(textColor, LIGHT_THEME_COLORS.surface) >= 4.5)
    assert.ok(contrastRatio(textColor, LIGHT_THEME_COLORS.surfaceRaised) >= 4.5)
  }
})

test('light theme applies explicit hierarchy to high-attention workspace surfaces', () => {
  const css = readFileSync(join(REPO_ROOT, 'src/renderer/styles/globals-runtime.css'), 'utf8')

  assert.match(css, /\[data-app-theme=['"]light['"]\]\s+\[data-ui=['"]chat-composer-stack-shell['"]\]/)
  assert.match(css, /\[data-app-theme=['"]light['"]\]\s+\[data-ui=['"]live-execution-header-shell['"]\]/)
  assert.match(css, /\[data-app-theme=['"]light['"]\]\s+\[data-ui=['"]project-entry-thread-row['"]\]\[data-active=['"]true['"]\]/)
  assert.match(css, /\[data-app-theme=['"]light['"]\]\s+\[data-ui=['"]agent-navigator-panel['"]\]/)
})

test('light agent navigator header stays aligned with the shared surface', () => {
  const css = readFileSync(join(REPO_ROOT, 'src/renderer/styles/globals-runtime.css'), 'utf8')

  assert.doesNotMatch(
    css,
    /\[data-app-theme=['"]light['"]\]\s+\[data-ui=['"]agent-navigator-header['"]\]\s*\{[^}]*background:/s,
  )
})

test('source-log tables use available desktop width before overflowing on narrow viewports', () => {
  const css = readFileSync(join(REPO_ROOT, 'src/renderer/styles/chat-prose.css'), 'utf8')

  assert.match(css, /chat-markdown-table--source-log\s*\{[^}]*width:\s*100%[^}]*table-layout:\s*fixed/s)
  assert.match(css, /chat-markdown-table--source-log[^}]*chat-markdown-td[^}]*\{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*chat-markdown-table--source-log\s*\{[^}]*width:\s*max-content/s)
})
