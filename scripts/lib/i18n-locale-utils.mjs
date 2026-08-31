import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..')
export const LOCALES_ROOT = path.join(REPO_ROOT, 'src', 'renderer', 'i18n', 'locales')
export const BASELINE_UI_LOCALE = 'en'

export function isDirectExecution(importMetaUrl) {
  if (!process.argv[1]) return false
  return path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl)
}

export function toPosixPath(value = '') {
  return String(value || '').split(path.sep).join('/')
}

export function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function collectLocaleCodes(localesRoot = LOCALES_ROOT) {
  if (!fs.existsSync(localesRoot)) return []
  return fs.readdirSync(localesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

export function collectLocaleFiles(localeDir) {
  const files = new Map()
  if (!fs.existsSync(localeDir)) return files

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
      const relativePath = toPosixPath(path.relative(localeDir, absolutePath))
      files.set(relativePath, absolutePath)
    }
  }

  visit(localeDir)
  return files
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}
