import test from 'node:test'
import assert from 'node:assert/strict'

import { autoFenceMarkdownCodeArtifacts } from '../../src/renderer/components/chat/markdown-auto-fence.mjs'

test('autoFenceMarkdownCodeArtifacts leaves normal markdown bullet lists unchanged', () => {
  const input = [
    'What I did',
    '- Reviewed accessibility issues',
    '- Checked performance basics',
    '- Confirmed no blocking errors',
  ].join('\n')

  const output = autoFenceMarkdownCodeArtifacts(input)
  assert.equal(output, input)
})

test('autoFenceMarkdownCodeArtifacts wraps obvious diff-like code runs', () => {
  const input = [
    'Proposed minimal diffs',
    'index.html --- a/index.html +++ b/index.html @@ <meta ... />',
    '- <title>Old</title>',
    '+ <title>New</title>',
    '- .nav { color: red; }',
    '+ .nav { color: var(--fg); }',
    '+ .nav-list { display: flex; }',
    '',
    'Let me know if you want me to apply them.',
  ].join('\n')

  const output = autoFenceMarkdownCodeArtifacts(input)
  assert.match(output, /```diff/)
  assert.match(output, /\n```(?:\n|$)/)
  assert.match(output, /index\.html --- a\/index\.html \+\+\+ b\/index\.html/)
  assert.match(output, /\+ <title>New<\/title>/)
})

test('autoFenceMarkdownCodeArtifacts preserves already fenced text', () => {
  const input = [
    'Here is the code:',
    '```html',
    '<div>Hello</div>',
    '```',
  ].join('\n')
  assert.equal(autoFenceMarkdownCodeArtifacts(input), input)
})

test('autoFenceMarkdownCodeArtifacts can fence standalone html/js-like block without diff markers', () => {
  const input = [
    'Suggested script update:',
    'function initTheme() {',
    '  const themeToggle = document.getElementById("themeToggle");',
    '  if (!themeToggle) return;',
    '  themeToggle.addEventListener("click", () => {',
    '    document.body.classList.toggle("dark");',
    '  });',
    '}',
  ].join('\n')

  const output = autoFenceMarkdownCodeArtifacts(input)
  assert.match(output, /```(?:js|text)/)
  assert.match(output, /function initTheme\(\) \{/)
})

test('autoFenceMarkdownCodeArtifacts keeps css selector context inside diff fence', () => {
  const input = [
    'Proposed minimal diffs',
    'styles.css',
    '--- a/styles.css',
    '+++ b/styles.css',
    '@@',
    '',
    ':root {',
    '+ color-scheme: dark light;',
    '  --bg: #0b1020;',
    '  --bg-elev: #0f172a;',
    '@@',
    '',
    ':root.light {',
    '+ color-scheme: light dark;',
    '  --bg: #f8fafc;',
    '  --bg-elev: #ffffff;',
    '}',
  ].join('\n')

  const output = autoFenceMarkdownCodeArtifacts(input)
  assert.match(output, /```diff/)
  assert.match(output, /```diff[\s\S]*:root \{[\s\S]*:root\.light \{[\s\S]*```/)
})
