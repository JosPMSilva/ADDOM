const BROKEN_PIPE_ERROR_CODES = new Set([
  'EPIPE',
  'ERR_STREAM_DESTROYED',
])
const GUARDED_STREAMS = new WeakSet()

export function isBrokenConsolePipeError(error) {
  if (!error || typeof error !== 'object') return false
  const code = String(error.code || '').trim()
  if (BROKEN_PIPE_ERROR_CODES.has(code)) return true

  const message = String(error.message || '').toLowerCase()
  return (
    message.includes('broken pipe')
    || message.includes('write after end')
    || message.includes('socket is closed')
  )
}

function writeConsole(method, args) {
  try {
    const target = typeof console?.[method] === 'function'
      ? console[method]
      : console.log
    target.apply(console, args)
  } catch (error) {
    if (!isBrokenConsolePipeError(error)) throw error
  }
}

export function safeDebug(...args) {
  writeConsole('debug', args)
}

export function installBrokenConsolePipeGuards(streams = [process.stdout, process.stderr]) {
  for (const stream of streams) {
    if (!stream || typeof stream.on !== 'function' || GUARDED_STREAMS.has(stream)) continue
    GUARDED_STREAMS.add(stream)
    stream.on('error', (error) => {
      if (!isBrokenConsolePipeError(error)) throw error
    })
  }
}
