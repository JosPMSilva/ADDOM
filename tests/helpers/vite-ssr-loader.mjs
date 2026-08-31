import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const VITE_CONFIG_FILE = path.join(REPO_ROOT, 'vite.config.js')
const VITE_SSR_CACHE_DIR = path.join(REPO_ROOT, '.vite-test-cache', String(process.pid))
const VITE_SSR_HMR_PORT = 30000 + (process.pid % 20000)

let viteServerPromise = null

async function getServer() {
  if (!viteServerPromise) {
    viteServerPromise = createServer({
      configFile: VITE_CONFIG_FILE,
      mode: 'development',
      appType: 'custom',
      cacheDir: VITE_SSR_CACHE_DIR,
      server: {
        middlewareMode: true,
        hmr: {
          port: VITE_SSR_HMR_PORT,
          clientPort: VITE_SSR_HMR_PORT,
        },
        port: 0,
        strictPort: false,
      },
      optimizeDeps: {
        disabled: true,
        noDiscovery: true,
      },
      logLevel: 'error',
    })
  }
  return viteServerPromise
}

export async function ssrLoadRendererModule(modulePath) {
  const server = await getServer()
  const ref = String(modulePath || '').startsWith('/')
    ? String(modulePath)
    : `/${String(modulePath || '').replace(/^\/+/, '')}`
  return server.ssrLoadModule(ref)
}

export async function closeViteSsrLoader() {
  if (!viteServerPromise) return
  try {
    const server = await viteServerPromise
    await server.close()
  } finally {
    viteServerPromise = null
  }
}
