export function createApplicationUpdateInstallCoordinator({
  collectBlockers,
  beginQuiescence,
  prepareForExit,
} = {}) {
  if (typeof collectBlockers !== 'function') throw new TypeError('collectBlockers is required')
  if (typeof beginQuiescence !== 'function') throw new TypeError('beginQuiescence is required')
  if (typeof prepareForExit !== 'function') throw new TypeError('prepareForExit is required')

  async function run({ rendererPreflight, onQuiesced = null, install } = {}) {
    if (typeof install !== 'function') throw new TypeError('install is required')

    const initialBlockers = await collectBlockers({ rendererPreflight })
    if (initialBlockers.length > 0) {
      return { ok: false, code: 'not_idle', blockers: initialBlockers }
    }

    const lease = beginQuiescence('application_update')
    let keepQuiescing = false
    try {
      const finalBlockers = await collectBlockers({ rendererPreflight })
      if (finalBlockers.length > 0) {
        return { ok: false, code: 'not_idle', blockers: finalBlockers }
      }

      await onQuiesced?.()
      await prepareForExit()
      const result = await install()
      keepQuiescing = true
      return result
    } finally {
      if (!keepQuiescing) lease?.release?.()
    }
  }

  return Object.freeze({ run })
}

