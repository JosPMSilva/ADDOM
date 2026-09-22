export async function runConfirmedSettingsUpdateInstall({
  title,
  message,
  confirm,
  install,
} = {}) {
  if (typeof confirm !== 'function') throw new TypeError('confirm is required')
  if (typeof install !== 'function') throw new TypeError('install is required')
  const confirmed = await confirm({
    title: String(title || ''),
    message: String(message || ''),
    confirmLabel: String(title || ''),
    tone: 'warning',
  })
  if (!confirmed) return { ok: false, code: 'cancelled' }
  return install()
}

