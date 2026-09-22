let activeLease = null

function createQuiescingError(reason = '') {
  const error = new Error('ADDOM is preparing to install an update. New work is temporarily paused.')
  error.code = 'application_quiescing'
  error.reason = String(reason || '')
  return error
}

export function assertApplicationWorkStartAllowed() {
  if (activeLease) throw createQuiescingError(activeLease.reason)
  return true
}

export function beginApplicationWorkQuiescence(reason = 'application_update') {
  if (activeLease) throw createQuiescingError(activeLease.reason)
  const lease = {
    reason: String(reason || 'application_update'),
    released: false,
  }
  activeLease = lease
  return Object.freeze({
    release() {
      if (lease.released || activeLease !== lease) return false
      lease.released = true
      activeLease = null
      return true
    },
  })
}

export function getApplicationWorkQuiescence() {
  return activeLease
    ? { active: true, reason: activeLease.reason }
    : { active: false, reason: '' }
}

export function resetApplicationWorkQuiescenceForTests() {
  activeLease = null
}

