export function createAbortError(message = 'Operation cancelled.') {
  const err = new Error(String(message || 'Operation cancelled.'))
  err.name = 'AbortError'
  err.code = 'ABORT_ERR'
  return err
}

export function isAbortError(err) {
  const name = String(err?.name ?? '').toLowerCase()
  const code = String(err?.code ?? '').toUpperCase()
  return name === 'aborterror' || code === 'ABORT_ERR'
}
