import React from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles/globals.css'
import './theme/appearance-runtime.mjs'
// Eager by design: editor surfaces should be ready immediately after workspace entry.
import './monaco-setup.js'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import rendererI18n, { initializeRendererI18n } from './i18n/init.mjs'
import { signalStartupReady } from './startup/startup-splash.mjs'
import useAppStore from './store/useAppStore.js'
import useSettingsStore from './store/useSettingsStore.js'
import useChatStore from './store/useChatStore.js'
import useTerminalStore from './store/useTerminalStore.js'
import useToolStore from './store/useToolStore.js'
import useVaultStore from './store/useVaultStore.js'

const reactGrabEnabled = (
  import.meta.env.DEV
  && import.meta.env.VITE_DISABLE_REACT_GRAB !== '1'
)
const smokeStoresEnabled = (
  import.meta.env.DEV
  && import.meta.env.VITE_ADDOM_SMOKE_STORES === '1'
)

if (smokeStoresEnabled && typeof window !== 'undefined') {
  Object.defineProperty(window, '__ADDOM_SMOKE_STORES__', {
    configurable: true,
    value: {
      app: useAppStore,
      chat: useChatStore,
      settings: useSettingsStore,
      terminal: useTerminalStore,
      tool: useToolStore,
      vault: useVaultStore,
    },
  })
}

if (reactGrabEnabled) {
  // React Grab + MCP bridge for local Codex context capture in development.
  void (async () => {
    await import('react-grab')
    await import('@react-grab/mcp/client')
  })()
}

async function bootstrapRenderer() {
  let initialSettings = null
  const settingsApi = window?.addom?.settings

  if (settingsApi && typeof settingsApi.get === 'function') {
    try {
      initialSettings = await settingsApi.get()
    } catch (error) {
      console.warn('[i18n] failed to preload settings before renderer bootstrap:', error)
    }
  }

  await initializeRendererI18n({
    uiLocale: initialSettings?.uiLocale,
  })

  if (initialSettings && typeof initialSettings === 'object') {
    useSettingsStore.getState().cacheCoreSettings(initialSettings)
  }

  const root = createRoot(document.getElementById('root'))
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  )
}

function translateBootstrapFailure(key, defaultValue) {
  if (!rendererI18n?.isInitialized) return defaultValue
  return rendererI18n.t(`startup.bootstrapFailure.${key}`, { defaultValue })
}

function BootstrapFailure({ error }) {
  const message = String(error?.message || translateBootstrapFailure('messageFallback', 'Renderer bootstrap failed'))
  return (
    <div className="min-h-screen w-full bg-surface text-text-primary flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-danger-border bg-surface-raised p-5 shadow-[0_18px_40px_rgb(0_0_0_/_0.22)]">
        <p className="text-[11px] font-semibold uppercase tracking-normal text-danger-soft">
          {translateBootstrapFailure('eyebrow', 'Startup failed')}
        </p>
        <h1 className="mt-2 text-base font-semibold text-text-primary">
          {translateBootstrapFailure('title', 'ADDOM could not finish starting.')}
        </h1>
        <p className="mt-2 break-words text-sm text-text-secondary">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md border border-border-strong bg-surface-panel px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
        >
          {translateBootstrapFailure('reload', 'Reload app')}
        </button>
      </div>
    </div>
  )
}

void bootstrapRenderer().catch((error) => {
  try {
    console.error('[ADDOM Renderer Bootstrap]', error)
  } catch {
    // Non-fatal.
  }
  const rootElement = document.getElementById('root')
  if (rootElement) {
    createRoot(rootElement).render(<BootstrapFailure error={error} />)
  }
  signalStartupReady()
})
