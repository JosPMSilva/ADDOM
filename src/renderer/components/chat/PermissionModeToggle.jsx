import React from 'react'
import { normalizePermissionMode } from '../../../common/chat/permission-mode.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

function AskIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M8 1.75 3.25 3.5v3.35c0 3 2.1 5.7 4.75 6.9 2.65-1.2 4.75-3.9 4.75-6.9V3.5L8 1.75Z" />
      <path d="M8 5.25v2.25" />
      <path d="M8 10.5h.01" />
    </svg>
  )
}

function AutonomyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M1.75 4.25h4l1.4 1.5h7.1v5.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-7Z" />
      <path d="m7.25 7.1 1.8 1-1.8 1" />
      <path d="M9.75 7.1h1" />
    </svg>
  )
}

function FullAccessIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M8 1.75 3.25 3.5v3.35c0 3 2.1 5.7 4.75 6.9 2.65-1.2 4.75-3.9 4.75-6.9V3.5L8 1.75Z" />
      <path d="m8 4.9.62 1.28 1.41.2-1.01.98.24 1.39L8 8.1l-1.26.65.24-1.39-1.01-.98 1.41-.2L8 4.9Z" />
    </svg>
  )
}

function ChevronDownIcon({ open = false }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export default function PermissionModeToggle({
  permissionMode = 'ask',
  align = 'end',
  disabled = false,
  neutralTones = false,
  onChange,
}) {
  const { t } = useRendererTranslation(['core', 'settings'])
  const menuRef = React.useRef(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const modeOptions = React.useMemo(() => ([
    {
      id: 'ask',
      label: t('settings:blocks.executionMode.mode.ask', { defaultValue: '[[canon:ask]]' }),
      helper: t('core:chat.permissionMode.helpers.ask', { defaultValue: 'Prompt before risky actions' }),
      Icon: AskIcon,
      toneClass: neutralTones ? 'text-text-secondary' : 'text-success-soft',
    },
    {
      id: 'autonomy',
      label: t('settings:blocks.executionMode.mode.autonomy', { defaultValue: '[[canon:autonomy]]' }),
      helper: t('core:chat.permissionMode.helpers.autonomy', { defaultValue: 'Act inside workspace guardrails' }),
      Icon: AutonomyIcon,
      toneClass: neutralTones ? 'text-text-secondary' : 'text-warning-soft',
    },
    {
      id: 'full_access',
      label: t('settings:blocks.executionMode.mode.fullAccess', { defaultValue: '[[canon:full_access]]' }),
      helper: t('core:chat.permissionMode.helpers.fullAccess', { defaultValue: 'Host-level tool execution' }),
      Icon: FullAccessIcon,
      toneClass: neutralTones ? 'text-text-secondary' : 'text-orange-400/80',
    },
  ]), [neutralTones, t])
  const activeMode = normalizePermissionMode(permissionMode)
  const activeOption = modeOptions.find((option) => option.id === activeMode) || modeOptions[0]
  const inactiveOptions = modeOptions.filter((option) => option.id !== activeOption.id)
  const buttonsDisabled = disabled
  const containerAlignmentClass = align === 'start' ? 'justify-start' : 'justify-end'

  React.useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  React.useEffect(() => {
    if (!buttonsDisabled) return
    setMenuOpen(false)
  }, [buttonsDisabled])

  return (
    <div className={`flex min-w-0 flex-wrap items-center ${containerAlignmentClass} gap-1.5`} data-ui="chat-permission-mode">
      <span className="shrink-0 text-[11px] text-text-secondary">{t('core:chat.permissionMode.label', { defaultValue: '[[canon:permission]]' })}</span>

      <div
        ref={menuRef}
        role="group"
        aria-label={t('core:chat.permissionMode.groupAriaLabel', { defaultValue: '[[canon:permission_mode]]' })}
        aria-disabled={buttonsDisabled ? 'true' : undefined}
        className="relative"
      >
        <button
          type="button"
          aria-label={t('core:chat.permissionMode.groupAriaLabel', { defaultValue: '[[canon:permission_mode]]' })}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={() => {
            if (buttonsDisabled) return
            setMenuOpen((value) => !value)
          }}
          disabled={buttonsDisabled}
          title={activeOption.helper}
          className={[
            'inline-flex h-7 min-w-[8.5rem] w-[8.5rem] items-center justify-between gap-2 border border-surface-border bg-surface-panel-alt px-2.5 text-[11px] transition-colors',
            menuOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg hover:border-border-hover hover:text-text-primary',
            'text-text-subtle',
            buttonsDisabled ? 'cursor-not-allowed opacity-80' : '',
          ].join(' ')}
          data-ui="chat-permission-mode-trigger"
        >
          <span className={`inline-flex items-center gap-1.5 ${activeOption.toneClass}`}>
            <activeOption.Icon />
            <span>{activeOption.label}</span>
          </span>
          <ChevronDownIcon open={menuOpen} />
        </button>

        {menuOpen && !buttonsDisabled && (
          <div className="absolute left-0 right-0 top-full z-50 w-full rounded-b-lg border border-t-0 border-surface-border bg-surface-panel shadow-[0_12px_28px_rgb(var(--theme-shadow-rgb)_/_0.45)] overflow-hidden">
            <div role="listbox" aria-label={t('core:chat.permissionMode.optionsAriaLabel', { defaultValue: 'Permission mode options' })} className="flex flex-col">
              {inactiveOptions.map(({ id, label, helper, Icon, toneClass }, idx) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  title={helper}
                  onClick={() => {
                    onChange?.(id)
                    setMenuOpen(false)
                  }}
                  className={[
                    'w-full h-7 flex items-center bg-surface-panel-alt px-2.5 text-left text-[11px] transition-colors hover:bg-surface-panel hover:text-text-primary',
                    idx < inactiveOptions.length - 1 ? 'border-b border-surface-border/50' : '',
                  ].join(' ')}
                  data-ui={`chat-permission-mode-${id}`}
                >
                  <span className={`inline-flex items-center gap-1.5 ${toneClass}`}>
                    <Icon />
                    <span className="font-medium text-text-primary">{label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
