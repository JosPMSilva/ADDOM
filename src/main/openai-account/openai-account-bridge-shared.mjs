import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  sanitizeStructuredForSecrets,
  sanitizeTextForSecrets,
} from './openai-account-sanitization.mjs'

export function normalizeId(value = '') {
  return String(value || '').trim()
}

export function ensureParentDirectory(targetPath = '') {
  const safeTargetPath = normalizeId(targetPath)
  if (!safeTargetPath) return
  fs.mkdirSync(path.dirname(safeTargetPath), { recursive: true })
}

export function appendLogLine(logFilePath = '', line = '') {
  const safeLogFilePath = normalizeId(logFilePath)
  const safeLine = sanitizeTextForSecrets(String(line || ''))
  if (!safeLogFilePath || !safeLine) return
  try {
    ensureParentDirectory(safeLogFilePath)
    fs.appendFileSync(safeLogFilePath, `${new Date().toISOString()} ${safeLine}${os.EOL}`, 'utf8')
  } catch {
    // Best effort bridge logging only.
  }
}

export function sanitizeProtocolPayloadForLog(payload = null) {
  return sanitizeStructuredForSecrets(payload)
}

export function looksLikeExplicitExecutablePath(command = '') {
  const safeCommand = normalizeId(command)
  if (!safeCommand) return false
  return path.isAbsolute(safeCommand) || safeCommand.includes('/') || safeCommand.includes('\\')
}
