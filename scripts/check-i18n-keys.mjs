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

function compareLocaleTrees(baseline, candidate, context, issues) {
  if (isPlainObject(baseline) && isPlainObject(candidate)) {
    const baselineKeys = new Set(Object.keys(baseline))
    const candidateKeys = new Set(Object.keys(candidate))

    for (const key of [...baselineKeys].sort((left, right) => left.localeCompare(right))) {
      const nextPath = context.keyPath ? `${context.keyPath}.${key}` : key
      if (!candidateKeys.has(key)) {
        issues.push({
          type: 'missing_key',
          locale: context.locale,
          file: context.file,
          keyPath: nextPath,
        })
        continue
      }
      compareLocaleTrees(baseline[key], candidate[key], {
        ...context,
        keyPath: nextPath,
      }, issues)
    }

    for (const key of [...candidateKeys].sort((left, right) => left.localeCompare(right))) {
      if (baselineKeys.has(key)) continue
      const nextPath = context.keyPath ? `${context.keyPath}.${key}` : key
      issues.push({
        type: 'extra_key',
        locale: context.locale,
        file: context.file,
        keyPath: nextPath,
      })
    }
    return
  }

  const baselineType = Array.isArray(baseline) ? 'array' : typeof baseline
  const candidateType = Array.isArray(candidate) ? 'array' : typeof candidate
  if (baselineType !== candidateType) {
    issues.push({
      type: 'type_mismatch',
      locale: context.locale,
      file: context.file,
      keyPath: context.keyPath || '(root)',
      message: `expected ${baselineType}, received ${candidateType}`,
    })
  }
}

function formatIssue(issue) {
  const suffix = issue.message ? ` :: ${issue.message}` : ''
  return `[${issue.type}] ${issue.locale} ${issue.file} -> ${issue.keyPath}${suffix}`
}

export function validateI18nKeys({
  localesRoot = LOCALES_ROOT,
  sourceLocale = BASELINE_UI_LOCALE,
} = {}) {
  const issues = []
  const sourceLocaleDir = path.join(localesRoot, sourceLocale)
  const sourceFiles = collectLocaleFiles(sourceLocaleDir)

  if (sourceFiles.size === 0) {
    issues.push({
      type: 'missing_source_locale',
      locale: sourceLocale,
      file: toPosixPath(path.relative(process.cwd(), sourceLocaleDir)),
      keyPath: '(root)',
      message: 'Baseline locale files were not found.',
    })
    return { checkedLocales: 0, issues }
  }

  let checkedLocales = 0
  for (const localeCode of collectLocaleCodes(localesRoot)) {
    if (localeCode === sourceLocale) continue
    checkedLocales += 1

    const localeDir = path.join(localesRoot, localeCode)
    const localeFiles = collectLocaleFiles(localeDir)

    for (const [relativePath, absolutePath] of sourceFiles) {
      if (!localeFiles.has(relativePath)) {
        issues.push({
          type: 'missing_file',
          locale: localeCode,
          file: toPosixPath(path.relative(process.cwd(), path.join(localeDir, relativePath))),
          keyPath: '(file)',
        })
        continue
      }

      compareLocaleTrees(
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

    for (const [relativePath, absolutePath] of localeFiles) {
      if (sourceFiles.has(relativePath)) continue
      issues.push({
        type: 'extra_file',
        locale: localeCode,
        file: toPosixPath(path.relative(process.cwd(), absolutePath)),
        keyPath: '(file)',
      })
    }
  }

  return { checkedLocales, issues }
}

function runCli() {
  const result = validateI18nKeys()
  console.log(`Checked locale variants: ${result.checkedLocales}`)

  if (result.issues.length > 0) {
    console.error(`i18n key parity validation failed with ${result.issues.length} issue(s):`)
    for (const issue of result.issues) {
      console.error(`- ${formatIssue(issue)}`)
    }
    process.exit(1)
  }

  console.log('i18n key parity validation passed.')
}

if (isDirectExecution(import.meta.url)) {
  runCli()
}
