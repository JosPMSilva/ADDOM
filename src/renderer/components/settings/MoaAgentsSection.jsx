import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import { requestAppConfirm } from '../../store/useAppStore.js'
import MoaRoleForm from './MoaRoleForm.jsx'
import MoaRolesSection from './MoaRolesSection.jsx'
import MoaTemplateGallery from './MoaTemplateGallery.jsx'
import SettingsDetailView from './SettingsDetailView.jsx'
import {
  EMPTY_ROLE_FORM,
  ROLE_FORM_MODES,
  createRoleFormFromTemplate,
  createRoleFormFromExisting,
  validateRoleForm,
  toPersistedRole,
} from './moa-role-editor.mjs'
import { buildProviderModelSelectionList } from '../../../common/api-clients/model-catalog-visibility.mjs'
import { providerHasCredential } from '../../../common/api-clients/provider-credential-state.mjs'

const VIEW_ROLES = 'roles'
const VIEW_CATALOG = 'catalog'
const VIEW_ROLE_FORM = 'role_form'

export default function MoaAgentsSection({
  moaRoles = [],
  setMoaRoles,
  providers,
  modelCatalogVisibility,
  roleTemplates,
  onClose = () => {},
  children = null,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const [view, setView] = React.useState(VIEW_ROLES)
  const [editingId, setEditingId] = React.useState(null)
  const [form, setForm] = React.useState(EMPTY_ROLE_FORM)
  const [formError, setFormError] = React.useState('')
  const [showSystemPrompt, setShowSystemPrompt] = React.useState(false)

  const configuredProviders = (providers ?? []).filter((provider) => providerHasCredential(provider))
  const activeFormProvider = configuredProviders.find((provider) => provider.id === form.providerId)
  const activeFormModels = React.useMemo(() => buildProviderModelSelectionList({
    providerId: activeFormProvider?.id,
    models: activeFormProvider?.models ?? [],
    modelCatalogVisibility,
    selectedModel: form.model,
  }), [activeFormProvider?.id, activeFormProvider?.models, form.model, modelCatalogVisibility])
  const customModelInputEnabled = String(activeFormProvider?.id || '').trim().toLowerCase() === 'openrouter'

  const persistRoles = React.useCallback((nextRoles) => {
    const finalRoles = (Array.isArray(nextRoles) ? nextRoles : []).map((role) => ({ ...role, canWriteFiles: false }))
    setMoaRoles(finalRoles)
    window.addom.settings.setMoaRoles(finalRoles).catch(() => {})
  }, [setMoaRoles])

  const returnToRoles = React.useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_ROLE_FORM)
    setFormError('')
    setShowSystemPrompt(false)
    setView(VIEW_ROLES)
  }, [])

  const openAddForm = React.useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_ROLE_FORM)
    setFormError('')
    setShowSystemPrompt(false)
    setView(VIEW_ROLE_FORM)
  }, [])

  const openTemplateForm = React.useCallback((template, existingRole = null) => {
    setEditingId(existingRole?.id || null)
    setForm(createRoleFormFromTemplate(template, { existingRole }))
    setFormError('')
    setShowSystemPrompt(false)
    setView(VIEW_ROLE_FORM)
  }, [])

  const openEditForm = React.useCallback((role) => {
    setEditingId(role.id)
    setForm(createRoleFormFromExisting(role))
    setFormError('')
    setShowSystemPrompt(false)
    setView(VIEW_ROLE_FORM)
  }, [])

  const handleSave = React.useCallback(() => {
    const persistedRoleKey = editingId
      ? String(moaRoles.find((role) => role.id === editingId)?.roleKey || '')
      : ''
    const error = validateRoleForm({
      form,
      moaRoles,
      editingId,
      persistedRoleKey,
      mode: ROLE_FORM_MODES.basic,
    })
    if (error) {
      setFormError(error)
      return
    }
    const nextRoles = editingId
      ? moaRoles.map((role) => (
        role.id === editingId
          ? toPersistedRole(form, { id: role.id, roleKey: role.roleKey, mode: ROLE_FORM_MODES.basic })
          : role
      ))
      : [...moaRoles, toPersistedRole(form, {
        id: `role_${Date.now()}_${globalThis.crypto.randomUUID().slice(0, 8)}`,
        roleKey: persistedRoleKey,
        mode: ROLE_FORM_MODES.basic,
      })]
    persistRoles(nextRoles)
    returnToRoles()
  }, [editingId, form, moaRoles, persistRoles, returnToRoles])

  const handleDelete = React.useCallback(async (id) => {
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.moaAgents.roles.removeDialog.title', { defaultValue: 'Remove Agent Role' }),
      message: t('settings:blocks.moaAgents.roles.removeDialog.message', { defaultValue: 'Remove this agent role?' }),
      confirmLabel: t('settings:blocks.moaAgents.roles.removeDialog.confirm', { defaultValue: 'Remove Role' }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (confirmed) {
      persistRoles(moaRoles.filter((role) => role.id !== id))
      returnToRoles()
    }
  }, [moaRoles, persistRoles, returnToRoles, t])

  const closeLabel = t('settings:blocks.moaAgents.backToAgents', { defaultValue: 'Back to Agents' })
  const backToRolesLabel = t('settings:blocks.moaAgents.backToRoles', { defaultValue: 'Back to roles' })
  const title = t('settings:blocks.moaAgents.title', { defaultValue: 'Agent roles' })

  return (
    <SettingsDetailView
      title={title}
      description={t('settings:blocks.moaAgents.description', {
        defaultValue: 'Create and manage the agent roles ADDOM can delegate work to.',
      })}
      closeLabel={closeLabel}
      onClose={onClose}
    >
      {view === VIEW_ROLES ? children : null}
      {view === VIEW_ROLES ? (
        <>
          <div className="flex items-center justify-between gap-3 pb-3 pt-4">
            <p className="text-xs text-text-muted">
              {t('settings:shell.badges.rolesCount', { defaultValue: '{{count}} roles', count: moaRoles.length })}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setView(VIEW_CATALOG)} className="min-h-7 rounded-md px-2.5 text-xs text-text-secondary hover:bg-surface-panel hover:text-text-primary">
                {t('settings:blocks.moaAgents.templateGallery.title', { defaultValue: 'Skill Catalog' })}
              </button>
              <button type="button" onClick={openAddForm} className="min-h-7 rounded-md border border-surface-border px-2.5 text-xs font-medium text-text-secondary hover:bg-surface-panel hover:text-text-primary">
                {t('settings:blocks.moaAgents.roles.addRoleTitle', { defaultValue: 'Add agent role' })}
              </button>
            </div>
          </div>
          <MoaRolesSection moaRoles={moaRoles} onEdit={openEditForm} />
        </>
      ) : null}

      {view === VIEW_CATALOG ? (
        <>
          <button type="button" onClick={returnToRoles} className="mb-3 text-xs text-text-secondary hover:text-text-primary">
            {backToRolesLabel}
          </button>
          <MoaTemplateGallery roleTemplates={roleTemplates} onUseTemplate={openTemplateForm} existingRoles={moaRoles} />
        </>
      ) : null}

      {view === VIEW_ROLE_FORM ? (
        <MoaRoleForm
          form={form}
          editingId={editingId}
          formError={formError}
          showSystemPrompt={showSystemPrompt}
          setShowSystemPrompt={setShowSystemPrompt}
          setForm={setForm}
          configuredProviders={configuredProviders}
          activeFormProvider={activeFormProvider}
          activeFormModels={activeFormModels}
          customModelInputEnabled={customModelInputEnabled}
          allowWriteToggle={false}
          allowSystemPrompt
          onSave={handleSave}
          onCancel={returnToRoles}
          onDelete={() => handleDelete(editingId)}
          embedded
        />
      ) : null}
    </SettingsDetailView>
  )
}
