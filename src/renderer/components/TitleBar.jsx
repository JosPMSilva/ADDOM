import React from 'react'
import useAppStore from '../store/useAppStore.js'
import AddomTextLogoSimple from './AddomTextLogoSimple.jsx'

/**
 * TitleBar - custom frameless window titlebar.
 * Navigation (home / project switcher) lives in the Sidebar bottom section.
 */
export default function TitleBar() {
  const projectFolder = useAppStore((s) => s.projectFolder)
  const projectName = projectFolder
    ? projectFolder.split(/[\\/]/).pop()
    : null

  const minimize = () => window.addom.window.minimize()
  const maximize = () => window.addom.window.maximize()
  const close = () => window.addom.window.close()

  return (
    <div className="titlebar-drag flex items-center justify-between min-h-10 px-3 py-1 bg-surface-raised border-b border-surface-border shrink-0">
      {/* Left: brand + project name */}
      <div className="flex items-center gap-2 min-w-0">
        <AddomTextLogoSimple height={12} className="opacity-90 mt-0.5" />
        {projectName && (
          <>
            <span className="text-text-muted text-xs select-none">/</span>
            <span className="text-text-secondary text-xs font-mono truncate max-w-28 sm:max-w-48">
              {projectName}
            </span>
          </>
        )}
      </div>

      {/* Right: window controls */}
      <div className="flex items-center gap-1">
        <TitleBarButton onClick={minimize} label="Minimize">
          <span className="block w-2.5 h-0.5 bg-current rounded-full" />
        </TitleBarButton>
        <TitleBarButton onClick={maximize} label="Maximize">
          <span className="block w-2.5 h-2.5 border-2 border-current rounded-sm" />
        </TitleBarButton>
        <TitleBarButton onClick={close} label="Close" danger>
          <span className="relative block w-3 h-3" aria-hidden="true">
            <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 rotate-45 bg-current rounded-full" />
            <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 -rotate-45 bg-current rounded-full" />
          </span>
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({ onClick, label, children, danger = false }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={[
        'titlebar-no-drag flex items-center justify-center w-7 h-7 rounded',
        'text-text-muted transition-colors duration-100',
        danger
          ? 'hover:bg-danger hover:text-white'
          : 'hover:bg-surface-border hover:text-text-primary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
