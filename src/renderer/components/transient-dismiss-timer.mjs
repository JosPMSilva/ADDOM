export function createTransientDismissTimer({
  durationMs,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let activeTimer = null

  const cancel = () => {
    if (activeTimer === null) return
    clearTimer(activeTimer)
    activeTimer = null
  }

  return {
    cancel,
    dispose: cancel,
    restart(onDismiss) {
      cancel()
      activeTimer = setTimer(() => {
        activeTimer = null
        onDismiss?.()
      }, durationMs)
    },
  }
}
