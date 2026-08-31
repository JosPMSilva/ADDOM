import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let packageVersion = ''
try {
  packageVersion = String(require('../../../package.json')?.version || '').trim()
} catch {
  packageVersion = ''
}

const MAIN_PROCESS_STARTED_AT = new Date(
  Date.now() - Math.max(0, Number(process.uptime() || 0)) * 1000,
).toISOString()

export function getAddomBuildIdentity() {
  return {
    version: packageVersion,
    mode: process.defaultApp === true || process.env.ADDOM_DEV === '1'
      ? 'development'
      : 'packaged',
    processId: Math.max(0, Number(process.pid || 0) || 0),
    processStartedAt: MAIN_PROCESS_STARTED_AT,
  }
}
