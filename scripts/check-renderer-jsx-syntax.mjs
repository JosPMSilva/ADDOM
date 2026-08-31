import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const rendererRoot = path.join(repoRoot, 'src', 'renderer')
const viteConfigFile = path.join(repoRoot, 'vite.config.js')
const cacheDir = path.join(repoRoot, '.vite-check-renderer-syntax', String(process.pid))
const cliTargets = process.argv.slice(2)
const rendererSourceFiles = []
const rendererSourceExtensions = new Set(['.js', '.jsx', '.mjs'])

async function collectRendererSourceFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await collectRendererSourceFiles(fullPath)
      continue
    }
    if (entry.isFile() && rendererSourceExtensions.has(path.extname(entry.name).toLowerCase())) {
      rendererSourceFiles.push(fullPath)
    }
  }
}

function normalizeCliFilePath(inputPath = '') {
  const resolved = path.resolve(repoRoot, String(inputPath || ''))
  const ext = path.extname(resolved).toLowerCase()
  if (!rendererSourceExtensions.has(ext)) return ''
  if (!resolved.startsWith(rendererRoot + path.sep) && resolved !== rendererRoot) return ''
  return resolved
}

async function main() {
  if (cliTargets.length > 0) {
    rendererSourceFiles.push(...cliTargets.map(normalizeCliFilePath).filter(Boolean))
  } else {
    await collectRendererSourceFiles(rendererRoot)
  }
  rendererSourceFiles.sort((left, right) => left.localeCompare(right))

  const server = await createServer({
    configFile: viteConfigFile,
    mode: 'development',
    appType: 'custom',
    cacheDir,
    server: {
      middlewareMode: true,
      port: 0,
      strictPort: false,
    },
    optimizeDeps: {
      disabled: true,
      noDiscovery: true,
    },
    logLevel: 'error',
  })

  try {
    for (const filePath of rendererSourceFiles) {
      const modulePath = `/${path.relative(rendererRoot, filePath).replace(/\\/g, '/')}`
      const result = await server.transformRequest(modulePath)
      if (!result?.code) {
        throw new Error(`Vite returned no transform output for ${modulePath}`)
      }
    }
    process.stdout.write(`Renderer syntax OK (${rendererSourceFiles.length} files)\n`)
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  const message = error?.stack || error?.message || String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
