import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const tailwindcss = require('@tailwindcss/postcss')
const autoprefixer = require('autoprefixer')

function buildRendererCsp({ isProd }) {
  return [
    "default-src 'self'",
    isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'",
    isProd ? "worker-src 'self' blob:" : "worker-src 'self' blob: http://localhost:5173",
    isProd
      ? "style-src 'self' 'unsafe-inline'"
      : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    isProd
      ? "font-src 'self' data:"
      : "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: addom-attachment:",
    isProd ? "connect-src 'self'" : "connect-src 'self' http://localhost:5173 ws://localhost:5173 http://localhost:4723",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

// Vite config for the renderer process only.
// Electron main process is plain Node.js — not bundled by Vite.
//
// Monaco workers are configured via src/renderer/monaco-setup.js using
// Vite's native ?worker import syntax — no plugin needed.
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  const plugins = [react()]
  const rendererCsp = buildRendererCsp({ isProd })

  plugins.push({
    name: 'addom-renderer-csp',
    transformIndexHtml(html) {
      return html.replace(/%ADDOM_RENDERER_CSP%/g, rendererCsp)
    },
  })

  return {
    plugins,
    root: 'src/renderer',
    base: './',
    css: {
      postcss: {
        plugins: [
          tailwindcss(),
          autoprefixer(),
        ],
      },
    },
    optimizeDeps: {
      include: [
        '@monaco-editor/react',
        'monaco-editor',
      ],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
      },
    },
    build: {
      outDir: '../../dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 5000,  // Monaco core is ~4 MB — expected for a desktop app
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/')
            if (normalizedId.includes('/node_modules/@xterm/')) {
              return 'terminal-xterm'
            }
            if (normalizedId.includes('/node_modules/@monaco-editor/')) return 'monaco-react'
            if (normalizedId.includes('/node_modules/monaco-editor/esm/vs/editor/contrib/')) return 'monaco-editor-contrib'
            if (normalizedId.includes('/node_modules/monaco-editor/esm/vs/editor/common/')) return 'monaco-editor-common'
            if (normalizedId.includes('/node_modules/monaco-editor/esm/vs/editor/browser/')) return 'monaco-editor-browser'
            if (normalizedId.includes('/node_modules/monaco-editor/esm/vs/platform/')) return 'monaco-platform'
            if (normalizedId.includes('/node_modules/monaco-editor/esm/vs/base/')) return 'monaco-base'
            if (
              normalizedId.includes('/src/common/api-clients/generated/')
              || normalizedId.includes('/src/common/api-clients/model-catalog')
              || normalizedId.includes('/src/common/api-clients/model-registry')
              || normalizedId.includes('/src/common/api-clients/openrouter-compatibility-data.mjs')
              || normalizedId.includes('/src/main/api-clients/provider-model-adapters.mjs')
              || normalizedId.includes('/src/main/api-clients/openai-model-runtime-support.mjs')
              || normalizedId.includes('/src/main/api-clients/openai-account-capability-contract.mjs')
            ) {
              return 'model-catalog'
            }
            return undefined
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: {
        allow: [
          path.resolve(__dirname),
          path.resolve(__dirname, 'node_modules'),
        ],
      },
    },
  }
})
