import path from 'node:path'

import {
  BASELINE_UI_LOCALE,
  LOCALES_ROOT,
  collectLocaleCodes,
  collectLocaleFiles,
  isDirectExecution,
  isPlainObject,
  readJsonFile,
  toPosixPath,
} from './lib/i18n-locale-utils.mjs'

function captureBraceBlock(source, startIndex) {
  let depth = 0

  for (let index = startIndex; index < source.length; index += 1) {
    const current = source[index]
    if (current === '{') depth += 1
    if (current === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(startIndex, index + 1)
      }
    }
  }

  return ''
}

export function extractI18nPlaceholders(message) {
  const placeholders = new Set()
  const source = String(message ?? '')

  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith('{{', index)) {
      const endIndex = source.indexOf('}}', index + 2)
      if (endIndex === -1) break
      const rawKey = source.slice(index + 2, endIndex).trim()
      if (rawKey) placeholders.add(rawKey)
      index = endIndex + 1
      continue
    }

    if (source[index] !== '{') continue
    const block = captureBraceBlock(source, index)
    if (!block) continue

    const token = block.slice(1, -1).trim()
    const variableName = token.split(',', 1)[0]?.trim() || ''
    if (/^[A-Za-z0-9_.-]+$/.test(variableName)) {
      placeholders.add(variableName)
    }

    const nestedSource = token.includes(',') ? token.slice(token.indexOf(',') + 1) : ''
    for (const nested of extractI18nPlaceholders(nestedSource)) {
      placeholders.add(nested)
    }

    index += block.length - 1
  }

  return placeholders
}

function comparePlaceholderParity(baseline, candidate, context, issues) {
  if (isPlainObject(baseline) && isPlainObject(candidate)) {
    for (const key of Object.keys(baseline)) {
      if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue
      const nextPath = context.keyPath ? `${context.keyPath}.${key}` : key
      comparePlaceholderParity(baseline[key], candidate[key], {
        ...context,
        keyPath: nextPath,
      }, issues)
    }
    return
  }

  if (typeof baseline !== 'string' || typeof candidate !== 'string') return

  const baselinePlaceholders = [...extractI18nPlaceholders(baseline)].sort()
  const candidatePlaceholders = [...extractI18nPlaceholders(candidate)].sort()
  if (baselinePlaceholders.join('|') === candidatePlaceholders.join('|')) return

  issues.push({
    type: 'placeholder_mismatch',
    locale: context.locale,
    file: context.file,
    keyPath: context.keyPath || '(root)',
    message: `expected [${baselinePlaceholders.join(', ')}], received [${candidatePlaceholders.join(', ')}]`,
  })
}

function formatIssue(issue) {
  return `[${issue.type}] ${issue.locale} ${issue.file} -> ${issue.keyPath} :: ${issue.message}`
}

export function validateI18nPlaceholders({
  localesRoot = LOCALES_ROOT,
  sourceLocale = BASELINE_UI_LOCALE,
} = {}) {
  const issues = []
  const sourceLocaleDir = path.join(localesRoot, sourceLocale)
  const sourceFiles = collectLocaleFiles(sourceLocaleDir)

  let checkedLocales = 0
  for (const localeCode of collectLocaleCodes(localesRoot)) {
    if (localeCode === sourceLocale) continue
    checkedLocales += 1

    const localeDir = path.join(localesRoot, localeCode)
    const localeFiles = collectLocaleFiles(localeDir)
    for (const [relativePath, absolutePath] of sourceFiles) {
      if (!localeFiles.has(relativePath)) continue
      comparePlaceholderParity(
        readJsonFile(absolutePath),
        readJsonFile(localeFiles.get(relativePath)),
        {
          locale: localeCode,
          file: toPosixPath(path.relative(process.cwd(), localeFiles.get(relativePath))),
          keyPath: '',
        },
        issues,
      )
    }
  }

  return { checkedLocales, issues }
}

function runCli() {
  const result = validateI18nPlaceholders()
  console.log(`Checked locale variants: ${result.checkedLocales}`)

  if (result.issues.length > 0) {
    console.error(`i18n placeholder validation failed with ${result.issues.length} issue(s):`)
    for (const issue of result.issues) {
      console.error(`- ${formatIssue(issue)}`)
    }
    process.exit(1)
  }

  console.log('i18n placeholder validation passed.')
}

if (isDirectExecution(import.meta.url)) {
  runCli()
}
