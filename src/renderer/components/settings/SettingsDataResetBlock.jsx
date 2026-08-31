import React from 'react'
import SettingsSection from './SettingsSection.jsx'
import Icon from '../ui/Icon.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

const secondaryButtonClass = 'inline-flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45'
const destructiveButtonClass = 'inline-flex min-h-7 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-surface-panel disabled:cursor-not-allowed disabled:opacity-45'

export default function DataResetBlock({
  onExportCurrentThread,
  onImportThread,
  onDeleteApiKeysNow,
  onResetLocalDataAndRestart,
  activeProjectId,
  activeThreadId,
  localDataActionBusy = false,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const hasProject = Boolean(activeProjectId)
  const hasThread = Boolean(activeThreadId)

  return (
    <SettingsSection
      title={<><Icon name="database" className="text-text-secondary" size={18} weight="fill" /> {t('settings:blocks.dataReset.title', { defaultValue: 'Data Reset & Cleanup' })}</>}
      description={t('settings:blocks.dataReset.description', {
        defaultValue: 'Transfer thread backups, manage credentials, or reset local ADDOM data.',
      })}
    >
      <div className="mt-2 flex flex-col">
        <div className="grid gap-3 border-b border-surface-border/55 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-xs font-medium text-text-primary">{t('settings:blocks.dataReset.migrationTitle', { defaultValue: 'Active Thread Migration' })}</p>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">{t('settings:blocks.dataReset.migrationDescription', {
              defaultValue: 'Export your active chat directly to a portable JSON backup, or restore histories locally.',
            })}</p>
            {!hasThread ? <p className="mt-1 text-[11px] text-text-tertiary">{t('settings:blocks.dataReset.noActiveConversation', { defaultValue: 'No active conversation is selected to export.' })}</p> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <button onClick={onExportCurrentThread} disabled={!hasThread} className={secondaryButtonClass}>
              <Icon name="export" size={14} weight="bold" /> {t('settings:blocks.dataReset.exportCurrentThread', { defaultValue: 'Export Current Thread' })}
            </button>
            <button onClick={onImportThread} disabled={!hasProject} className={secondaryButtonClass}>
              <Icon name="download-simple" size={14} weight="bold" /> {t('settings:blocks.dataReset.restoreFromJson', { defaultValue: 'Restore from JSON' })}
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-surface-border/55 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-xs font-medium text-text-primary">{t('settings:blocks.dataReset.deleteSavedApiKeys', { defaultValue: 'Delete saved API keys' })}</p>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">{t('settings:blocks.dataReset.dialogs.deleteApiKeys.message', {
              defaultValue: 'Delete all stored API keys from this device now? Conversations, memory, artifacts, and settings will remain. This cannot be undone.',
            })}</p>
          </div>
          <button onClick={onDeleteApiKeysNow} disabled={Boolean(localDataActionBusy)} className={destructiveButtonClass}>
            <Icon name="key" size={14} weight="bold" /> {t('settings:blocks.dataReset.deleteSavedApiKeys', { defaultValue: 'Delete saved API keys' })}
          </button>
        </div>

        <div className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-xs font-medium text-text-primary">{t('settings:blocks.dataReset.localProfileResetTitle', { defaultValue: 'Local Profile Reset' })}</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-4 text-text-secondary">{t('settings:blocks.dataReset.localProfileResetDescription', {
              defaultValue: 'Remove saved provider keys, or fully reset ADDOM\'s local profile. A full reset deletes local history, cached models, attachments, and saved settings, then restarts the app.',
            })}</p>
          </div>
          <button onClick={onResetLocalDataAndRestart} disabled={Boolean(localDataActionBusy)} className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-danger-strong bg-danger-strong px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-danger-strong-hover disabled:cursor-not-allowed disabled:opacity-45">
            <Icon name="warning-circle" size={14} weight="bold" /> {t('settings:blocks.dataReset.resetLocalProfileAndRestart', { defaultValue: 'Reset local profile & restart' })}
          </button>
        </div>
      </div>
    </SettingsSection>
  )
}
