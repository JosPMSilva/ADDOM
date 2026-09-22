import React from 'react'
import { createPortal } from 'react-dom'
import useUpdateStore from '../store/useUpdateStore.js'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import { VISIBLE_UPDATE_PHASES, getSidebarUpdateOffset, getUpdateStatus, getUpdateVersion } from './sidebar-update-presentation.mjs'
import { SidebarUpdateButton, UpdateInstallConfirmation } from './SidebarUpdateSurface.jsx'

export default function SidebarUpdateControl({ collapsed, activePanel }) {
  const { t } = useRendererTranslation(['settings'])
  const snapshot = useUpdateStore((state) => state.snapshot)
  const [hovered, setHovered] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [actionBusy, setActionBusy] = React.useState(false)
  const busyRef = React.useRef(false)
  const buttonRef = React.useRef(null)
  const tooltipId = React.useId()
  const visible = Boolean(getUpdateVersion(snapshot) && VISIBLE_UPDATE_PHASES.has(snapshot.phase))
  const blocked = Boolean(snapshot.installBlockers?.length)
  const status = getUpdateStatus(t, snapshot)
  const blockers = snapshot.installBlockers?.map((blocker) => blocker.label).join('. ')
  const action = ['available', 'error'].includes(snapshot.phase)
    ? t('settings:blocks.updates.actions.download', { version: getUpdateVersion(snapshot) })
    : snapshot.phase === 'ready' && !blocked
      ? t('settings:blocks.updates.actions.restartAndInstall') : ''
  const label = snapshot.phase === 'error'
    ? t('settings:blocks.updates.sidebar.retry')
    : snapshot.phase === 'ready'
      ? blocked ? `${t('settings:blocks.updates.sidebar.waiting')} · ${blockers}` : `${action} · v${getUpdateVersion(snapshot)}`
      : snapshot.phase === 'available' ? action : status

  React.useEffect(() => { setHovered(false); setConfirming(false) }, [activePanel])
  React.useEffect(() => {
    if (!visible || snapshot.phase !== 'ready' || blocked) setConfirming(false)
  }, [visible, snapshot.phase, blocked])
  React.useEffect(() => {
    if (snapshot.phase !== 'ready' || !blocked) return undefined
    const refresh = () => { void useUpdateStore.getState().refreshInstallReadiness() }
    refresh()
    const interval = setInterval(refresh, 2_000)
    return () => clearInterval(interval)
  }, [snapshot.phase, blocked])
  React.useEffect(() => {
    if (!hovered) return undefined
    const dismiss = (event) => { if (event.key === 'Escape') setHovered(false) }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [hovered])

  const invoke = async (install = false) => {
    if (busyRef.current) return
    const state = useUpdateStore.getState()
    if (install && (state.snapshot.phase !== 'ready' || state.snapshot.installBlockers.length)) return
    busyRef.current = true
    setActionBusy(true)
    setHovered(false)
    setConfirming(false)
    try {
      if (install) await state.installUpdate()
      else await state.downloadUpdate()
    } finally {
      busyRef.current = false
      setActionBusy(false)
    }
  }
  const activate = () => {
    if (actionBusy) return
    if (['available', 'error'].includes(snapshot.phase)) void invoke()
    else if (snapshot.phase === 'ready' && !blocked) {
      setHovered(false)
      setConfirming(true)
    }
  }
  if (!visible) return null
  const offset = getSidebarUpdateOffset(collapsed)
  const portalRoot = typeof document === 'undefined' ? null : document.body
  return (
    <>
      <SidebarUpdateButton
        buttonRef={buttonRef} snapshot={snapshot} collapsed={collapsed}
        label={label} busy={actionBusy} onClick={activate}
        tooltipId={hovered && !confirming ? tooltipId : undefined}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}
      />
      {portalRoot && hovered && !confirming && createPortal(
        <div id={tooltipId} role="tooltip"
          className="fixed bottom-[58px] z-[120] w-max break-words [overflow-wrap:anywhere] rounded-md bg-surface-panel px-2 py-1 text-center text-[11px] font-normal leading-4 text-text-secondary shadow-sm"
          style={{ ...offset, maxWidth: `min(15rem, ${offset.maxWidth})`, maxHeight: 'calc(100vh - 66px)', overflowY: 'auto' }}
        >{label}</div>, portalRoot,
      )}
      {portalRoot && confirming && createPortal(
        <UpdateInstallConfirmation status={status} onConfirm={() => void invoke(true)} onCancel={() => {
          setConfirming(false)
          buttonRef.current?.focus()
        }} />, portalRoot,
      )}
    </>
  )
}

