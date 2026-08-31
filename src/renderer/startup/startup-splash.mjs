let startupReadySent = false

export function signalStartupReady() {
  if (startupReadySent) return
  startupReadySent = true
  try {
    window.addom?.app?.startupReady?.()
  } catch {
    // Best-effort startup handoff only.
  }
}
