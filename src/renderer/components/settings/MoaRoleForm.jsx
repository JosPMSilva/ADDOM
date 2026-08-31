import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export default function MoaRoleForm({
  form,
  editingId,
  formError,
  showSystemPrompt,
  setShowSystemPrompt,
  setForm,
  configuredProviders,
  activeFormProvider,
  activeFormModels,
  customModelInputEnabled = false,
  onSave,
  onCancel,
  onDelete,
  allowWriteToggle = true,
  allowSystemPrompt = true,
  embedded = false,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
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
          ? 'p-0 bg-transparent rounded-none border-0 mt-0'
          : 'mt-3 border-t border-surface-border/55 pt-3',
      ].join(' ')}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-text-primary">{editingId
          ? t('settings:blocks.moaAgents.roles.editRoleTitle', { defaultValue: 'Edit agent role' })
          : t('settings:blocks.moaAgents.roles.addRoleTitle', { defaultValue: 'Add agent role' })}</p>
        {editingId && (
          <p className="text-[11px] font-mono text-text-muted">Role ID: {editingId}</p>
        )}
      </div>

      <input
        type="text"
        placeholder={t('settings:blocks.moaAgents.roles.namePlaceholder', { defaultValue: 'Role name (e.g. Security Reviewer)' })}
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder-text-muted/60 hover:border-border-hover focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
      />

      <select
        value={form.providerId}
        onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value, model: '' }))}
        className="w-full cursor-pointer rounded-md border border-surface-border bg-surface px-3 py-2 text-[13px] text-text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
      >
        <option value="">{t('settings:blocks.moaAgents.roles.providerPlaceholder', { defaultValue: 'Select provider...' })}</option>
        {configuredProviders.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {activeFormProvider && (
        <>
          {modelOptions.length > 0 ? (
            <select
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              className="w-full cursor-pointer rounded-md border border-surface-border bg-surface px-3 py-2 text-[13px] text-text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            >
              <option value="">{t('settings:blocks.moaAgents.roles.modelPlaceholder', { defaultValue: 'Select model...' })}</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.label || m.id}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder={t('settings:blocks.moaAgents.roles.modelIdPlaceholder', { defaultValue: 'Model ID (e.g. gpt-4o)' })}
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder-text-muted/60 hover:border-border-hover focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
          )}

          {customModelInputEnabled && modelOptions.length > 0 && (
            <input
              type="text"
              placeholder={t('settings:blocks.moaAgents.roles.openRouterRoutePlaceholder', { defaultValue: 'Or enter a custom OpenRouter route ID' })}
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder-text-muted/60 hover:border-border-hover focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
          )}
        </>
      )}

      {form.templateLabel && (
        <div className="border-y border-surface-border/55 py-2 text-[11px] text-text-tertiary">
          <span className="font-semibold text-text-secondary">{t('settings:blocks.moaAgents.roles.sourceTemplateLabel', { defaultValue: 'Source template:' })}</span> {form.templateLabel} <span className="text-text-muted ml-1">(v{Number(form.templateVersion || 1)})</span>
        </div>
      )}

      {allowWriteToggle && (
        <div className="mt-1 flex items-center justify-between border-y border-surface-border/55 py-2 transition-colors">
          <div>
            <p className="text-[13px] font-medium text-text-primary">Allow staged file writes</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">When enabled and policy allows, this agent can stage `write_file` suggestions.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.canWriteFiles}
            aria-label="Allow staged file writes"
            onClick={() => setForm((f) => ({ ...f, canWriteFiles: !f.canWriteFiles }))}
            className={[
              'relative ml-3 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-75',
              form.canWriteFiles ? 'bg-accent' : 'bg-surface-panel border border-surface-border',
            ].join(' ')}
            title={form.canWriteFiles ? 'Click to disable' : 'Click to enable'}
          >
            <span className={[
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-75',
              form.canWriteFiles ? 'translate-x-4 border border-accent' : 'translate-x-1 border border-surface-border',
            ].join(' ')} />
          </button>
        </div>
      )}

      {allowSystemPrompt && (
        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={() => setShowSystemPrompt((v) => !v)}
            className="self-start text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
          >
            {showSystemPrompt
              ? t('settings:blocks.moaAgents.roles.hideAdvancedInstructions', { defaultValue: 'Hide advanced role instructions' })
              : t('settings:blocks.moaAgents.roles.showAdvancedInstructions', { defaultValue: 'Advanced role instructions' })}
          </button>

          {showSystemPrompt && (
            <textarea
              rows={4}
              placeholder={t('settings:blocks.moaAgents.roles.instructionsPlaceholder', { defaultValue: 'Optional instructions for this agent role (max 2000 chars)' })}
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value.slice(0, 2000) }))}
              className="w-full resize-none rounded-md border border-surface-border bg-surface px-3 py-2 font-mono text-[13px] text-text-primary outline-none transition-colors placeholder-text-muted/60 hover:border-border-hover focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
          )}
        </div>
      )}

      {formError && <p className="text-[12px] font-medium text-danger-soft px-1 mt-1">{formError}</p>}

      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-surface-border/50">
        {editingId ? (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-8 rounded-md px-2 text-[12px] font-medium text-text-muted transition-colors hover:bg-danger-bg hover:text-danger-soft"
          >
            {t('settings:blocks.moaAgents.roles.removeDialog.confirm', { defaultValue: 'Remove role' })}
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-8 rounded-md px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary"
          >
            {t('core:common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="min-h-8 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-surface transition-colors hover:bg-accent-hover"
          >
            {editingId
              ? t('settings:blocks.moaAgents.roles.saveChanges', { defaultValue: 'Save changes' })
              : t('settings:blocks.moaAgents.roles.addRoleAction', { defaultValue: 'Add role' })}
          </button>
        </div>
      </div>
    </div>
  )
}
