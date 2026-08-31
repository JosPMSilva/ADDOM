import fs from 'node:fs'
import path from 'node:path'

function clean(value) {
  return String(value ?? '').trim()
}

export function validateMoaProjectFolder(value) {
  const projectFolder = clean(value)
  if (!projectFolder) {
    return { ok: false, error: 'missing_project', message: 'Project folder is required.' }
  }
  if (projectFolder.includes('..') || !path.isAbsolute(projectFolder)) {
    return {
      ok: false,
      error: 'invalid_project',
      message: 'Project folder must be an absolute path without ".." segments.',
    }
  }
  try {
    if (!fs.statSync(projectFolder).isDirectory()) {
      return { ok: false, error: 'invalid_project', message: 'Project folder is not a directory.' }
    }
  } catch {
    return { ok: false, error: 'invalid_project', message: 'Project folder does not exist.' }
  }
  return { ok: true, projectFolder }
}
