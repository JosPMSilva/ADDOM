import React from 'react'
import SettingsSection from './SettingsSection.jsx'
import Icon from '../ui/Icon.jsx'
import SettingsUpdateSection from './SettingsUpdateSection.jsx'
import SettingsSubagentsManager from './SettingsSubagentsManager.jsx'
import SettingsSubagentsSummary from './SettingsSubagentsSummary.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export function MoaAgentsBlock({ view = 'summary', onManage = () => {}, onClose = () => {}, ...props }) {
  if (view === 'manager') {
    return <SettingsSubagentsManager {...props} onClose={onClose} />
  }

  return (
    <SettingsSubagentsSummary
      roleCount={Array.isArray(props.moaRoles) ? props.moaRoles.length : 0}
      agentSettings={props.agentSettings}
      onManage={onManage}
    />
  )
}

export function UpdatesBlock({ updateStatus, updateInfo, updatePct, onCheckUpdate, onDownloadUpdate, onInstallUpdate }) {
  const t = useSettingsTranslator(['settings', 'core'])
  return (
    <SettingsSection
      title={<><Icon name="arrows-clockwise" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.updates.title', { defaultValue: 'Updates' })}</>}
      description={t('settings:blocks.updates.description', {
        defaultValue: 'ADDOM checks for updates automatically on launch. You control when updates are downloaded and installed.',
      })}
    >
      <SettingsUpdateSection
        status={updateStatus}
        info={updateInfo}
        pct={updatePct}
        onCheck={onCheckUpdate}
        onDownload={onDownloadUpdate}
        onInstall={onInstallUpdate}
      />
    </SettingsSection>
  )
}

export function AboutBlock({ version }) {
  const t = useSettingsTranslator(['settings', 'core'])
  const [legalError, setLegalError] = React.useState('')
  const openLegalDocumentError = t('settings:blocks.about.openLegalDocumentError', {
    defaultValue: 'Unable to open legal document.',
  })

  const handleOpenLegalDocument = React.useCallback(async (documentId) => {
    setLegalError('')
    try {
      const result = await window.addom?.app?.openLegalDocument?.(documentId)
      if (!result?.ok) {
        setLegalError(String(result?.error || openLegalDocumentError))
      }
    } catch (error) {
      setLegalError(String(error?.message || error || openLegalDocumentError))
    }
  }, [openLegalDocumentError])

  return (
    <SettingsSection title={<><Icon name="info" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.about.title', { defaultValue: 'About' })}</>} description="">
      <div data-ui="settings-about" className="flex flex-col gap-3 py-3 text-xs text-text-muted font-mono">
        <span>ADDOM v{version || 'unknown'}</span>
        <span>{t('settings:blocks.about.tagline', { defaultValue: 'Local-first AI coding assistant | BYOK | No telemetry' })}</span>
        <span className="mt-1 text-text-tertiary">{t('settings:blocks.about.copyright', { defaultValue: 'Copyright (c) 2026 ADDOM contributors.' })}</span>
        <span>{t('settings:blocks.about.licenseLineOne', { defaultValue: 'Licensed under the MIT License.' })}</span>
        <span>{t('settings:blocks.about.licenseLineTwo', { defaultValue: 'See LICENSE for details.' })}</span>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={() => { handleOpenLegalDocument('third-party-notices') }}
            className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface-panel text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary transition-colors"
          >
            {t('settings:blocks.about.openSourceNotices', { defaultValue: 'Open source notices' })}
          </button>
          <button
            type="button"
            onClick={() => { handleOpenLegalDocument('oss-inventory') }}
            className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface-panel text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary transition-colors"
          >
            {t('settings:blocks.about.thirdPartyInventory', { defaultValue: 'Third-party inventory' })}
          </button>
        </div>

        {legalError ? (
          <span className="text-[11px] text-danger-soft">
            {t('settings:blocks.about.legalDocumentsUnavailable', {
              defaultValue: 'Legal documents unavailable: {{error}}',
              error: legalError,
            })}
          </span>
        ) : null}
      </div>
    </SettingsSection>
  )
}
