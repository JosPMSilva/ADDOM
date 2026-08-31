import React from 'react'

export default function MoaRoleSimpleForm({
  form,
  editingId,
  formError,
  setForm,
  configuredProviders,
  activeFormProvider,
  activeFormModels,
  customModelInputEnabled = false,
  onSave,
  onCancel,
  embedded = false,
}) {
  const modelOptions = React.useMemo(() => {
    const rows = Array.isArray(activeFormModels) ? activeFormModels : []
    const selectedModel = String(form?.model || '').trim()
    if (!selectedModel || rows.some((row) => String(row?.id || '').trim() === selectedModel)) return rows
    return [{ id: selectedModel, label: `Custom: ${selectedModel}`, group: 'Custom' }, ...rows]
  }, [activeFormModels, form?.model])

  return (
    <div
      className={[
        'flex flex-col gap-3',
        embedded
          ? 'p-0 bg-transparent rounded-none border-0 shadow-none mt-0'
          : 'p-4 bg-surface-panel/30 rounded-xl border border-surface-border/50 shadow-sm mt-3',
      ].join(' ')}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-text-primary">{editingId ? 'Edit role' : 'Add agent role'}</p>
        <p className="text-[12px] text-text-tertiary">
          Basic mode uses read-only agents and managed safety defaults.
        </p>
      </div>

      <input
        type="text"
        placeholder="Role name (e.g. Security Reviewer)"
        value={form.name}
        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        className="w-full px-3 py-2 bg-surface text-[13px] text-text-primary border border-surface-border rounded-lg outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all font-sans shadow-inner hover:border-accent-muted placeholder-text-muted/60 mt-1"
      />

      <select
        value={form.providerId}
        onChange={(e) => setForm((prev) => ({ ...prev, providerId: e.target.value, model: '' }))}
        className="w-full px-3 py-2 bg-surface text-[13px] text-text-secondary border border-surface-border rounded-lg outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all shadow-inner hover:border-accent-muted cursor-pointer"
      >
        <option value="">Select provider...</option>
        {configuredProviders.map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.name}</option>
        ))}
      </select>

      {activeFormProvider && (
        <>
          {modelOptions.length > 0 ? (
            <select
              value={form.model}
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
              className="w-full px-3 py-2 bg-surface text-[13px] text-text-secondary border border-surface-border rounded-lg outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all shadow-inner hover:border-accent-muted cursor-pointer"
            >
              <option value="">Select model...</option>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>{model.label || model.id}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Model ID (e.g. gpt-4o-mini)"
              value={form.model}
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
              className="w-full px-3 py-2 bg-surface text-[13px] text-text-primary border border-surface-border rounded-lg outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all font-sans shadow-inner hover:border-accent-muted placeholder-text-muted/60"
            />
          )}

          {customModelInputEnabled && modelOptions.length > 0 && (
            <input
              type="text"
              placeholder="Or enter a custom OpenRouter route ID"
              value={form.model}
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
              className="w-full px-3 py-2 bg-surface text-[13px] text-text-primary border border-surface-border rounded-lg outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all font-sans shadow-inner hover:border-accent-muted placeholder-text-muted/60"
            />
          )}
        </>
      )}

      {formError ? <p className="text-[12px] font-medium text-danger-soft px-1 mt-1">{formError}</p> : null}

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-surface-border/50">
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2 font-semibold bg-accent hover:bg-accent-hover text-white text-[12px] rounded-lg shadow-sm transition-colors"
        >
          {editingId ? 'Save changes' : 'Add role'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 font-medium border border-surface-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-panel shadow-sm text-[12px] rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
