const READY_MARKER = 'ADDOM_TUI_READY'
const EXIT_MARKER = 'ADDOM_TUI_EXIT'
const TOKENS = Object.freeze({
  left: 'ADDOM_TUI_ARROW_LEFT',
  right: 'ADDOM_TUI_ARROW_RIGHT',
  up: 'ADDOM_TUI_ARROW_UP',
  down: 'ADDOM_TUI_ARROW_DOWN',
  backspace: 'ADDOM_TUI_BACKSPACE',
  delete: 'ADDOM_TUI_DELETE',
  paste: 'ADDOM_TUI_PASTE',
  utf8: 'ADDOM_TUI_UTF8',
})

const UTF8_TOKEN = `UTF8_\u20ac\u00e1`
const seen = new Set()
let textBuffer = ''
let closing = false

function write(value = '') {
  process.stdout.write(String(value || ''))
}

function emitMarker(marker = '') {
  if (!marker || seen.has(marker)) return
  seen.add(marker)
  write(`\r\n${marker}\r\n`)
}

function restoreAndExit(code = 0) {
  if (closing) return
  closing = true
  write(`\r\n${EXIT_MARKER}\r\n`)
  write('\x1b[?25h')
  write('\x1b[?1049l')
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false) } catch { /* best-effort tty cleanup */ }
  }
  process.stdin.pause()
  setTimeout(() => process.exit(code), 40)
}

function handleChunk(data) {
  const chunk = Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '')
  if (!chunk) return
  const trimmedChunk = chunk.replace(/\r/g, '').trim()

  if (chunk.includes('\u0003') || trimmedChunk === 'q') {
    restoreAndExit(0)
    return
  }

  if (chunk.includes('\u001b[D')) emitMarker(TOKENS.left)
  if (chunk.includes('\u001b[C')) emitMarker(TOKENS.right)
  if (chunk.includes('\u001b[A')) emitMarker(TOKENS.up)
  if (chunk.includes('\u001b[B')) emitMarker(TOKENS.down)
  if (chunk.includes('\u0008') || chunk.includes('\u007f')) emitMarker(TOKENS.backspace)
  if (chunk.includes('\u001b[3~')) emitMarker(TOKENS.delete)

  textBuffer += chunk
  if (textBuffer.includes('PASTE_OK')) emitMarker(TOKENS.paste)
  if (textBuffer.includes(UTF8_TOKEN)) emitMarker(TOKENS.utf8)
  if (textBuffer.length > 256) {
    textBuffer = textBuffer.slice(-256)
  }
}

write('\x1b[?1049h')
write('\x1b[2J')
write('\x1b[H')
write('\x1b[?25l')
write(`${READY_MARKER}\r\n`)
write('ADDOM fullscreen PTY/TUI smoke. Send arrows, backspace/delete, paste token, UTF-8 token, then q.\r\n')

if (!process.stdin.isTTY) {
  write('ADDOM_TUI_NOT_TTY\r\n')
  restoreAndExit(1)
} else {
  process.stdin.setEncoding('utf8')
  try { process.stdin.setRawMode(true) } catch { /* best-effort raw mode */ }
  process.stdin.resume()
  process.stdin.on('data', handleChunk)
}
