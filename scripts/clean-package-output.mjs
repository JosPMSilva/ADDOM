import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHANNEL_TARGETS = Object.freeze({
  github: 'dist-electron',
  'microsoft-store': path.join('dist-electron', 'store'),
})

export function cleanPackageOutput(channel, { repoRoot } = {}) {
  const normalizedChannel = String(channel || '').trim().toLowerCase()
  const relativeTarget = CHANNEL_TARGETS[normalizedChannel]
  if (!relativeTarget) {
    throw new Error(`Unsupported package output channel: ${normalizedChannel || '(empty)'}`)
  }

  const resolvedRepoRoot = path.resolve(repoRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const target = path.resolve(resolvedRepoRoot, relativeTarget)
  const expectedPrefix = `${path.resolve(resolvedRepoRoot, 'dist-electron')}${path.sep}`
  if (target !== path.resolve(resolvedRepoRoot, 'dist-electron') && !target.startsWith(expectedPrefix)) {
    throw new Error('Refusing to clean a package output outside dist-electron.')
  }

  fs.rmSync(target, { force: true, recursive: true })
  console.log(`Cleaned ${normalizedChannel} package output: ${target}`)
  return target
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cleanPackageOutput(process.argv[2])
}
