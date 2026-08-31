import React from 'react'
import SettingsSection from './SettingsSection.jsx'
import Icon from '../ui/Icon.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import {
  providerHasCredential,
  providerUsesOpenAIAccountAuth,
} from '../../../common/api-clients/provider-credential-state.mjs'

export function OpenAIRemoteAssetsBlock({
  providers = [],
  activeProjectId = '',
  openaiProjectAssets = null,
  openaiAssetsBusy = false,
  onRefreshOpenAIProjectAssets = () => { },
  onEnsureOpenAIProjectVectorStore = () => { },
  onUploadOpenAIFiles = () => { },
  onAttachOpenAIProjectFiles = () => { },
  onRemoveOpenAIProjectAsset = () => { },
  onDeleteOpenAIProjectVectorStore = () => { },
}) {
  const providerRows = Array.isArray(providers) ? providers : []
  const t = useSettingsTranslator(['settings', 'core'])
  const openaiProvider = providerRows.find((row) => String(row?.id || '').trim().toLowerCase() === 'openai') || null
  if (!openaiProvider) return null

  const hasOpenAICredential = providerHasCredential(openaiProvider)
  const openAIUsesAccountAuth = providerUsesOpenAIAccountAuth(openaiProvider)
  const assets = openaiProjectAssets && typeof openaiProjectAssets === 'object'
    ? openaiProjectAssets
    : { files: [], vectorStore: null, vectorStoreFiles: [] }
  const files = Array.isArray(assets.files) ? assets.files : []
  const vectorStoreFiles = Array.isArray(assets.vectorStoreFiles) ? assets.vectorStoreFiles : []
  const attachedFileIds = new Set(
    vectorStoreFiles.map((row) => String(row?.providerFileRecordId || '').trim()).filter(Boolean),
  )
  const hasProject = String(activeProjectId || '').trim().length > 0
  const canOperate = hasOpenAICredential && !openAIUsesAccountAuth && hasProject
  const pendingAttachCount = files.filter((row) => !attachedFileIds.has(String(row?.id || '').trim())).length
  const hasVectorStore = !!assets.vectorStore
  const attachedFileCount = vectorStoreFiles.length
  const knowledgeBaseReady = !openAIUsesAccountAuth && hasVectorStore && files.length > 0 && pendingAttachCount <= 0
  const nextRecommendedStep = !hasOpenAICredential
    ? t('settings:blocks.openAiKnowledgeBase.nextStep.addApiKey', { defaultValue: 'Add an OpenAI API key.' })
    : openAIUsesAccountAuth
      ? t('settings:blocks.openAiKnowledgeBase.nextStep.switchBackToApiKey', {
        defaultValue: 'Switch OpenAI to API key mode. Project knowledge currently needs API-key access.',
      })
      : !hasProject
        ? t('settings:blocks.openAiKnowledgeBase.nextStep.openProjectWorkspace', {
          defaultValue: 'Open a project workspace.',
        })
        : files.length === 0
          ? t('settings:blocks.openAiKnowledgeBase.nextStep.uploadFiles', {
            defaultValue: 'Upload files you want searchable.',
          })
          : !hasVectorStore
            ? t('settings:blocks.openAiKnowledgeBase.nextStep.createVectorStore', {
              defaultValue: 'Prepare project knowledge storage.',
            })
            : pendingAttachCount > 0
              ? t(
                pendingAttachCount === 1
                  ? 'settings:blocks.openAiKnowledgeBase.nextStep.attachPendingOne'
                  : 'settings:blocks.openAiKnowledgeBase.nextStep.attachPendingOther',
                {
                  count: pendingAttachCount,
                  defaultValue: pendingAttachCount === 1
                    ? 'Attach {{count}} uploaded file to Project knowledge.'
                    : 'Attach {{count}} uploaded files to Project knowledge.',
                },
              )
              : t('settings:blocks.openAiKnowledgeBase.nextStep.readyForRetrieval', {
                defaultValue: 'Project knowledge is ready for retrieval.',
              })

  return (
    <SettingsSection
      title={<><Icon name="database" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.openAiKnowledgeBase.title', { defaultValue: 'Project knowledge' })}</>}
      description={t('settings:blocks.openAiKnowledgeBase.description', {
        defaultValue: 'Project-scoped files for OpenAI hosted retrieval. Uploads are explicit, and files added here stay separate from normal chat attachments.',
      })}
    >
      <div className="mt-2 flex flex-col">
        {!hasOpenAICredential && (
          <div className="flex items-center gap-2 border-b border-surface-border/55 py-2.5 text-[12px] text-text-secondary">
            <Icon name="info" size={12} /> {t('settings:blocks.openAiKnowledgeBase.notices.addApiKey', {
              defaultValue: 'Add an OpenAI API key to upload project knowledge files.',
            })}
          </div>
        )}
        {hasOpenAICredential && openAIUsesAccountAuth && (
          <div className="flex items-center gap-2 border-b border-surface-border/55 py-2.5 text-[12px] text-text-secondary">
            <Icon name="info" size={12} /> {t('settings:blocks.openAiKnowledgeBase.notices.accountModeUnsupported', {
              defaultValue: 'Project knowledge currently requires OpenAI API key access. Switch the provider to API key mode to use this panel.',
            })}
          </div>
        )}
        {!hasProject && (
          <div className="flex items-center gap-2 border-b border-surface-border/55 py-2.5 text-[12px] text-text-secondary">
            <Icon name="info" size={12} /> {t('settings:blocks.openAiKnowledgeBase.notices.projectRequired', {
              defaultValue: 'Open a project first. Project knowledge is scoped to the active project.',
            })}
          </div>
        )}

        <div className="grid gap-3 border-b border-surface-border/55 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-xs font-medium text-text-primary">
                {t('settings:blocks.openAiKnowledgeBase.projectScope', { defaultValue: 'Project scope' })}
              </p>
              <span className="text-[11px] text-text-secondary">
                {knowledgeBaseReady
                  ? t('settings:blocks.openAiKnowledgeBase.ready', { defaultValue: 'Ready' })
                  : t('settings:blocks.openAiKnowledgeBase.actionNeeded', { defaultValue: 'Action needed' })}
              </span>
            </div>
            <p className="mt-1 break-all font-mono text-[11px] text-text-secondary">
              {hasProject
                ? activeProjectId
                : t('settings:blocks.openAiKnowledgeBase.noActiveProjectSelected', {
                  defaultValue: 'No active project selected',
                })}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">
              {t('settings:blocks.openAiKnowledgeBase.nextStepLabel', { defaultValue: 'Next step:' })} <span className="text-text-primary">{nextRecommendedStep}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary sm:justify-end">
            <span>{t('settings:blocks.openAiKnowledgeBase.filesLabel', { defaultValue: 'Uploaded files' })}: <strong className="font-medium text-text-primary">{files.length}</strong></span>
            <span>{t('settings:blocks.openAiKnowledgeBase.pendingAttachLabel', { defaultValue: 'Needs attach' })}: <strong className="font-medium text-text-primary">{pendingAttachCount}</strong></span>
            <span>{t('settings:blocks.openAiKnowledgeBase.attachedFilesLabel', { defaultValue: 'Attached files' })}: <strong className="font-medium text-text-primary">{attachedFileCount}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-surface-border/55 py-3">
          <button type="button" disabled={!canOperate || openaiAssetsBusy} onClick={onRefreshOpenAIProjectAssets} className="flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45">
            <Icon name="arrows-clockwise" className={openaiAssetsBusy ? 'animate-spin' : ''} size={14} weight="bold" /> {t('settings:blocks.openAiKnowledgeBase.actions.refresh', { defaultValue: 'Refresh' })}
          </button>
          <button type="button" disabled={!canOperate || openaiAssetsBusy} onClick={onUploadOpenAIFiles} className="flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45">
            <Icon name="upload-simple" size={14} weight="bold" /> {t('settings:blocks.openAiKnowledgeBase.actions.uploadFiles', { defaultValue: 'Upload files' })}
          </button>
          <button type="button" disabled={!canOperate || openaiAssetsBusy} onClick={onEnsureOpenAIProjectVectorStore} className="flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45">
            <Icon name="database" size={14} weight="bold" /> {assets.vectorStore
              ? t('settings:blocks.openAiKnowledgeBase.actions.reuseVectorStore', { defaultValue: 'Refresh project knowledge' })
              : t('settings:blocks.openAiKnowledgeBase.actions.createVectorStore', { defaultValue: 'Prepare project knowledge' })}
          </button>
          <button type="button" disabled={!canOperate || openaiAssetsBusy || !assets.vectorStore || pendingAttachCount <= 0} onClick={onAttachOpenAIProjectFiles} className="flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45">
            <Icon name="paperclip" size={14} weight="bold" /> {pendingAttachCount > 0
              ? t('settings:blocks.openAiKnowledgeBase.actions.attachFilesWithCount', { count: pendingAttachCount, defaultValue: 'Attach files ({{count}})' })
              : t('settings:blocks.openAiKnowledgeBase.actions.attachFiles', { defaultValue: 'Attach files' })}
          </button>
          {assets.vectorStore ? (
            <button type="button" disabled={!canOperate || openaiAssetsBusy} onClick={onDeleteOpenAIProjectVectorStore} className="flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-danger transition-colors hover:border-danger/40 disabled:cursor-not-allowed disabled:opacity-45">
              <Icon name="trash" size={14} weight="bold" /> {t('settings:blocks.openAiKnowledgeBase.actions.deleteVectorStore', { defaultValue: 'Reset project knowledge' })}
            </button>
          ) : null}
        </div>

        <div className="border-b border-surface-border/55 py-3">
          <p className="mb-1 text-xs font-medium text-text-primary">{t('settings:blocks.openAiKnowledgeBase.uploadedFilesTitle', { defaultValue: 'Uploaded files' })}</p>
          {files.length === 0 ? (
            <p className="py-2 text-[11px] text-text-tertiary">{t('settings:blocks.openAiKnowledgeBase.emptyFiles', { defaultValue: 'No project knowledge files uploaded yet.' })}</p>
          ) : files.map((row) => {
            const attached = attachedFileIds.has(String(row?.id || '').trim())
            return (
              <div key={row.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-surface-border/45 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-primary">{row.fileName || row.localPath || row.id}</p>
                  <p className="text-[11px] text-text-secondary">
                    {attached
                      ? t('settings:blocks.openAiKnowledgeBase.fileState.attached', { defaultValue: 'Attached' })
                      : t('settings:blocks.openAiKnowledgeBase.fileState.uploadedOnly', { defaultValue: 'Uploaded only' })}
                  </p>
                </div>
                <button type="button" disabled={openaiAssetsBusy} onClick={() => onRemoveOpenAIProjectAsset(row.id)} className="flex min-h-7 flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-danger transition-colors hover:bg-surface-panel disabled:cursor-not-allowed disabled:opacity-45">
                  <Icon name="trash" size={12} weight="bold" /> {t('settings:blocks.openAiKnowledgeBase.actions.remove', { defaultValue: 'Remove' })}
                </button>
              </div>
            )
          })}
        </div>

        <p className="py-2.5 text-[11px] leading-4 text-text-tertiary">
          {t('settings:blocks.openAiKnowledgeBase.footerNotice', {
            defaultValue: 'Files added here are stored for project retrieval. Normal chat attachments stay local unless you add them to Project knowledge explicitly.',
          })}
        </p>
      </div>
    </SettingsSection>
  )
}
