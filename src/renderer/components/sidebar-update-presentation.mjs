export const VISIBLE_UPDATE_PHASES = new Set([
  'available',
  'downloading',
  'ready',
  'installing',
  'error',
])

export function getUpdateVersion(snapshot) {
  return snapshot?.version || snapshot?.simulation?.candidateVersion || ''
}

export function getUpdateStatus(t, snapshot) {
  const version = getUpdateVersion(snapshot)
  switch (snapshot?.phase) {
    case 'available':
      return t('settings:blocks.updates.status.available', {
        defaultValue: 'Update available - v{{version}}',
        version,
      })
    case 'downloading':
      return t('settings:blocks.updates.status.downloading', {
        defaultValue: 'Downloading... {{percent}}%',
        percent: snapshot.progressPercent || 0,
      })
    case 'ready':
      return t('settings:blocks.updates.status.readyToInstall', {
        defaultValue: 'v{{version}} ready to install',
        version,
      })
    case 'installing':
      return t('settings:blocks.updates.status.installing', {
        defaultValue: 'Installing update...',
      })
    case 'error':
      if (snapshot.errorCode === 'network') {
        return t('settings:blocks.updates.status.errorNetwork', {
          defaultValue: "Couldn't reach the update service. Check your connection and try again.",
        })
      }
      if (snapshot.errorCode === 'unavailable') {
        return t('settings:blocks.updates.status.errorUnavailable', {
          defaultValue: 'The update service is not available yet. Try again later.',
        })
      }
      return t('settings:blocks.updates.status.error', {
        defaultValue: "Couldn't check for updates. Try again later.",
      })
    default:
      return ''
  }
}

export function getUpdateStateIcon(snapshot) {
  if (snapshot.phase === 'ready' && snapshot.installBlockers?.length > 0) return 'clock-countdown'
  if (snapshot.phase === 'ready') return 'arrow-clockwise'
  if (snapshot.phase === 'installing') return 'spinner'
  if (snapshot.phase === 'error') return 'warning-circle'
  return 'download-simple'
}

export function getSidebarUpdateOffset(collapsed, gap = 8) {
  const width = collapsed
    ? 'var(--app-sidebar-collapsed-width)'
    : 'var(--app-sidebar-expanded-width)'
  return {
    left: `calc(${width} + ${gap}px)`,
    maxWidth: `calc(100vw - ${width} - ${gap * 2}px)`,
  }
}
