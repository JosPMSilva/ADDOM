import fs from 'node:fs'
import path from 'node:path'

import {
  LOCALES_ROOT,
  collectLocaleCodes,
  collectLocaleFiles,
  isDirectExecution,
  toPosixPath,
} from './lib/i18n-locale-utils.mjs'

function hasUtf8Bom(buffer) {
  return buffer.length >= 3
    && buffer[0] === 0xef
    && buffer[1] === 0xbb
    && buffer[2] === 0xbf
}

function formatIssue(issue) {
  return `[${issue.type}] ${issue.file}${issue.message ? ` :: ${issue.message}` : ''}`
}

export function validateI18nEncoding({ localesRoot = LOCALES_ROOT } = {}) {
  const issues = []
  let checkedFiles = 0

  for (const localeCode of collectLocaleCodes(localesRoot)) {
    const localeDir = path.join(localesRoot, localeCode)
    for (const [, absolutePath] of collectLocaleFiles(localeDir)) {
      checkedFiles += 1
      const buffer = fs.readFileSync(absolutePath)
      const displayPath = toPosixPath(path.relative(process.cwd(), absolutePath))

      if (hasUtf8Bom(buffer)) {
        issues.push({
          type: 'utf8_bom',
          file: displayPath,
          message: 'UTF-8 BOM is not allowed.',
        })
      }

      const decoded = buffer.toString('utf8')
      if (!Buffer.from(decoded, 'utf8').equals(buffer)) {
        issues.push({
          type: 'invalid_utf8',
          file: displayPath,
          message: 'File does not round-trip through UTF-8 decoding.',
        })
        continue
      }

      try {
        JSON.parse(decoded)
      } catch (error) {
        issues.push({
          type: 'invalid_json',
          file: displayPath,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return { checkedFiles, issues }
}

function runCli() {
  const result = validateI18nEncoding()
  console.log(`Checked locale files: ${result.checkedFiles}`)

  if (result.issues.length > 0) {
    console.error(`i18n encoding validation failed with ${result.issues.length} issue(s):`)
    for (const issue of result.issues) {
      console.error(`- ${formatIssue(issue)}`)
    }
    process.exit(1)
  }

  console.log('i18n encoding validation passed.')
}

if (isDirectExecution(import.meta.url)) {
  runCli()
}
