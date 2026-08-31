export function attachTerminalDataListener(terminal, handler) {
  if (typeof terminal?.onData === 'function') {
    const disposable = terminal.onData(handler)
    return () => {
      disposable?.dispose?.()
    }
  }
  terminal?.on?.('data', handler)
  return () => {
    terminal?.removeListener?.('data', handler)
  }
}

export function attachTerminalExitListener(terminal, handler) {
  if (typeof terminal?.onExit === 'function') {
    const disposable = terminal.onExit(handler)
    return () => {
      disposable?.dispose?.()
    }
  }
  const legacyHandler = (exitCode, signal) => handler({ exitCode, signal })
  terminal?.on?.('exit', legacyHandler)
  return () => {
    terminal?.removeListener?.('exit', legacyHandler)
  }
}

export function attachTerminalErrorListener(terminal, handler) {
  terminal?.on?.('error', handler)
  return () => {
    terminal?.removeListener?.('error', handler)
  }
}
