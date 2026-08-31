import { parentPort } from 'worker_threads'
import { listDirectory, searchCode } from './file-tools.mjs'

const HANDLERS = {
  list_directory: listDirectory,
  search_code: searchCode,
}

if (parentPort) {
  parentPort.on('message', async (message = {}) => {
    const id = Number(message?.id || 0)
    if (!id) return
    const toolName = String(message?.toolName || '').trim()
    const handler = HANDLERS[toolName]
    if (!handler) {
      parentPort.postMessage({ id, ok: false, error: `Unsupported worker tool: ${toolName}` })
      return
    }

    try {
      const result = await handler(
        String(message?.projectRoot || ''),
        message?.toolInput && typeof message.toolInput === 'object' ? message.toolInput : {},
      )
      parentPort.postMessage({ id, ok: true, result })
    } catch (error) {
      parentPort.postMessage({ id, ok: false, error: String(error?.message || error || 'worker_error') })
    }
  })
}
