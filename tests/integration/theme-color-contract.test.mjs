import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_CSS_CHANNEL_VARIABLES,
  DEFAULT_THEME_CSS_VARIABLES,
  DEFAULT_SPECIALIZED_THEME_CSS_VARIABLES,
} from '../../src/common/ui/theme-color-contract.mjs'
import {
  ADDOM_TERMINAL_THEME,
  buildMonacoDiffThemeData,
  buildMonacoThemeData,
} from '../../src/renderer/theme/specialized-theme-adapters.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SOURCE_ROOTS = ['src/common', 'src/main', 'src/renderer']
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.css'])
const CORE_HEX_VALUES = new Set(Object.values(DEFAULT_THEME_COLORS).filter((value) => /^#[0-9a-f]{6}$/i.test(value)))
const PALETTE_OWNER_PATHS = new Set([
  'src/common/ui/theme-color-contract.mjs',
  'src/common/ui/background-tone-settings.mjs',
  'src/renderer/styles/globals-foundation.css',
  'src/renderer/theme/specialized-theme-adapters.mjs',
])

function listSourceFiles(relativeRoot) {
  const absoluteRoot = join(REPO_ROOT, relativeRoot)
  return readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.includes(`${join('src', 'renderer', 'node_modules')}\\`))
}

test('default theme contract preserves the approved graphite palette', () => {
  assert.deepEqual(DEFAULT_THEME_COLORS, {
    surface: '#0b0c0c',
    surfaceRaised: '#101211',
    surfacePanelAlt: '#151715',
    surfacePanel: '#1a1c1a',
    surfacePanelHover: '#20231f',
    surfacePanelStrong: '#272a25',
    surfaceBorder: '#2e312d',
    borderStrong: '#44483f',
    borderHover: '#5e6258',
    accent: '#b8b3a4',
    accentStrong: '#d5d0c1',
    accentMuted: '#5f625a',
    textPrimary: '#f1f0e8',
    textSecondary: '#a7aaa0',
    textMuted: '#73786e',
    textSubtle: '#8d9187',
    success: '#a5c9a3',
    successBackground: '#162717',
    successBackgroundHover: '#1c321d',
    successSoft: '#c7dfc3',
    warning: '#d6b56d',
    warningBackground: '#302714',
    warningBackgroundHover: '#3a3018',
    warningSoft: '#ead29a',
    danger: '#e08a7d',
    dangerBackground: '#341816',
    dangerBackgroundHover: '#431e1b',
    dangerStrong: '#6f2a24',
    dangerStrongHover: '#813129',
    dangerSoft: '#f0b3aa',
    dangerSofter: '#f3cac4',
  })
})

test('CSS theme defaults stay in lockstep with the semantic palette contract', () => {
  const css = readFileSync(join(REPO_ROOT, 'src/renderer/styles/globals-foundation.css'), 'utf8')
  for (const [variable, value] of Object.entries(DEFAULT_THEME_CSS_VARIABLES)) {
    assert.match(css, new RegExp(`${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value}`, 'i'))
  }
  for (const [variable, value] of Object.entries(DEFAULT_THEME_CSS_CHANNEL_VARIABLES)) {
    assert.match(css, new RegExp(`${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value}`, 'i'))
  }
  for (const [variable, value] of Object.entries(DEFAULT_SPECIALIZED_THEME_CSS_VARIABLES)) {
    assert.match(css, new RegExp(`${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value}`, 'i'))
  }
})

test('specialized renderer adapters preserve current editor and terminal colors', () => {
  const editor = buildMonacoThemeData()
  const diff = buildMonacoDiffThemeData()

  assert.equal(editor.colors['editor.background'], '#101211')
  assert.equal(editor.colors['editor.selectionBackground'], '#5f625a88')
  assert.equal(diff.colors['diffEditor.insertedLineBackground'], '#16271752')
  assert.equal(diff.colors['diffEditor.removedLineBackground'], '#34181652')
  assert.deepEqual(ADDOM_TERMINAL_THEME, {
    background: '#0b0c0c',
    foreground: '#f1f0e8',
    cursor: '#d5d0c1',
    cursorAccent: '#0b0c0c',
    selectionBackground: 'rgba(184, 179, 164, 0.28)',
    selectionInactiveBackground: 'rgba(95, 98, 90, 0.22)',
    black: '#0b0c0c',
    red: '#e08a7d',
    green: '#a5c9a3',
    yellow: '#d6b56d',
    blue: '#b8b3a4',
    magenta: '#b8a98d',
    cyan: '#a7aaa0',
    white: '#f1f0e8',
    brightBlack: '#5f625a',
    brightRed: '#f0b3aa',
    brightGreen: '#c7dfc3',
    brightYellow: '#ead29a',
    brightBlue: '#d5d0c1',
    brightMagenta: '#d8c7aa',
    brightCyan: '#d5d0c1',
    brightWhite: '#f1f0e8',
  })
})

test('approved palette values are owned by theme contracts rather than scattered components', () => {
  const violations = []
  for (const root of SOURCE_ROOTS) {
    for (const file of listSourceFiles(root)) {
      const relativePath = relative(REPO_ROOT, file).replaceAll('\\', '/')
      if (PALETTE_OWNER_PATHS.has(relativePath)) continue
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].toLowerCase()
        for (const value of CORE_HEX_VALUES) {
          if (line.includes(value)) violations.push(`${relativePath}:${index + 1} ${value}`)
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('component shadows use semantic theme channels instead of literal colors', () => {
  const violations = []
  for (const file of listSourceFiles('src/renderer/components')) {
    const relativePath = relative(REPO_ROOT, file).replaceAll('\\', '/')
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      if (/shadow-\[[^\]]*(?:rgba?\(\s*\d|#[0-9a-f])/i.test(lines[index])) {
        violations.push(`${relativePath}:${index + 1}`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('runtime styles consume semantic color variables instead of literal colors', () => {
  const violations = []
  for (const file of listSourceFiles('src/renderer/styles')) {
    const relativePath = relative(REPO_ROOT, file).replaceAll('\\', '/')
    if (relativePath === 'src/renderer/styles/globals-foundation.css') continue
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      if (/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(lines[index])) {
        violations.push(`${relativePath}:${index + 1}`)
      }
    }
  }
  assert.deepEqual(violations, [])
})
