import React from 'react'

function normalizeAgentRoles(roles = []) {
  if (!Array.isArray(roles)) return []
  return roles
    .filter((role) => role && typeof role === 'object')
    .map((role) => ({
      id: String(role.id || '').trim(),
      name: String(role.name || '').trim(),
      providerId: String(role.providerId || '').trim(),
      model: String(role.model || '').trim(),
      canWriteFiles: !!role.canWriteFiles,
    }))
    .filter((role) => role.id && role.name)
}

export default function ComposerAgentQuickMenu({
  open,
  onClose,
  roles,
  loading,
  onRefresh,
  onInsert,
}) {
  const [route, setRoute] = React.useState('orchestrated_single')
  const [selectedRoleIds, setSelectedRoleIds] = React.useState([])

  React.useEffect(() => {
    if (!open) {
      setRoute('orchestrated_single')
      setSelectedRoleIds([])
    }
  }, [open])

  const normalizedRoles = React.useMemo(() => normalizeAgentRoles(roles), [roles])
  const selectedRoles = normalizedRoles.filter((role) => selectedRoleIds.includes(role.id))

  const toggleRole = React.useCallback((role) => {
    if (!role?.id) return
    setSelectedRoleIds((prev) => (
      prev.includes(role.id)
        ? prev.filter((id) => id !== role.id)
        : [...prev, role.id]
    ))
  }, [])

  const handleSingleClick = React.useCallback((role) => {
    if (!role) return
    onInsert?.({ route: 'orchestrated_single', roles: [role] })
    onClose?.()
  }, [onInsert, onClose])

  const handleInsertFanout = React.useCallback(() => {
    if (selectedRoles.length === 0) return
    onInsert?.({
      route: selectedRoles.length <= 1 ? 'orchestrated_single' : 'orchestrated_fanout',
      roles: selectedRoles,
    })
    onClose?.()
  }, [onInsert, onClose, selectedRoles])

  if (!open) return null

  return (
    <div
      className="absolute left-0 bottom-full z-20 mb-2 w-full max-w-[560px] space-y-1 rounded-lg border border-surface-border bg-surface-raised p-1 shadow-[0_18px_40px_rgb(var(--theme-shadow-rgb)_/_0.24)]"
      data-ui="direct-agent-menu"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="text-[11px] font-medium text-text-primary">Agents</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onRefresh?.()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-panel-alt hover:text-text-primary active:text-accent-soft"
            title="Refresh agent roles from Settings"
            aria-label="Refresh agent roles from Settings"
          >
            <span aria-hidden="true" className="ph ph-arrow-clockwise text-[13px] leading-none" />
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-panel-alt hover:text-text-primary active:text-accent-soft"
            title="Close"
            aria-label="Close"
          >
            <span aria-hidden="true" className="ph ph-x text-[13px] leading-none" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setRoute('orchestrated_single')}
          title="Click a role to insert an agent mention."
          className={`rounded-md px-2 py-1 text-[10px] transition-colors ${route === 'orchestrated_single' ? 'bg-surface-panel-alt text-accent-soft' : 'text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary'}`}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => setRoute('orchestrated_fanout')}
          title="Select roles, then insert mentions."
          className={`rounded-md px-2 py-1 text-[10px] transition-colors ${route === 'orchestrated_fanout' ? 'bg-surface-panel-alt text-accent-soft' : 'text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary'}`}
        >
          Fanout
        </button>
      </div>

      {loading ? (
        <div className="px-1 py-1 text-[11px] text-text-muted">Loading agent roles...</div>
      ) : normalizedRoles.length === 0 ? (
        <div className="px-1 py-1 text-[11px] text-warning-soft">
          No agent roles configured. Add roles in Settings &gt; Subagents.
        </div>
      ) : (
        <div className="grid max-h-44 grid-cols-1 gap-0.5 overflow-y-auto pr-1 scrollbar-thin">
          {normalizedRoles.slice(0, 20).map((role) => {
            const selected = selectedRoleIds.includes(role.id)
            const detailText = `${role.providerId || '-'} / ${role.model || '-'}${role.canWriteFiles ? ' | staged-write' : ''}`
            if (route === 'orchestrated_single') {
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSingleClick(role)}
                  className="group rounded-md px-2 py-1.5 text-left text-text-secondary transition-colors hover:bg-surface-panel-alt hover:text-text-primary"
                  title={`${role.name} (${role.id}) - ${detailText}`}
                >
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium">{role.name}</span>
                    {role.canWriteFiles ? <span className="shrink-0 text-[10px] text-text-tertiary">write</span> : null}
                  </div>
                  <span className="sr-only">{detailText}</span>
                </button>
              )
            }
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role)}
                className={`rounded-md px-2 py-1.5 text-left transition-colors ${selected
                  ? 'bg-surface-panel-alt text-text-primary'
                  : 'text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary'
                  }`}
                title={`${role.name} (${role.id}) - ${detailText}`}
              >
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-xs font-medium">{role.name}</div>
                  {selected ? <span className="shrink-0 text-[10px] text-accent-soft">Selected</span> : null}
                  {!selected && role.canWriteFiles ? <span className="shrink-0 text-[10px] text-text-tertiary">write</span> : null}
                </div>
                <span className="sr-only">{detailText}</span>
              </button>
            )
          })}
          {normalizedRoles.length > 20 && (
            <div className="px-1 text-[10px] text-text-tertiary">Showing first 20 roles.</div>
          )}
        </div>
      )}

      {route === 'orchestrated_fanout' && (
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="text-[10px] text-text-muted">
            {selectedRoles.length} role{selectedRoles.length === 1 ? '' : 's'} selected
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedRoleIds([])}
              disabled={selectedRoles.length === 0}
              className="rounded-md border border-surface-border bg-surface px-2 py-1 text-[10px] text-text-secondary hover:border-border-hover disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleInsertFanout}
              disabled={selectedRoles.length === 0}
              className="rounded-md bg-accent px-2 py-1 text-[10px] text-surface hover:bg-accent-hover disabled:opacity-40"
            >
              Insert mentions
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
