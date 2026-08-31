import React from 'react'
import SettingsInstructionsModal from '../SettingsInstructionsModal.jsx'
import { getDefaultSettingsTranslator } from './settings-panel-ui-utils.mjs'
import OpenRouterCatalogVisibilitySection from './OpenRouterCatalogVisibilitySection.jsx'
import {
  InstructionsBlock,
  ExecutionModeBlock,
  AssistantPromptBlock,
  LanguageBlock,
  ApiKeysBlock,
  OpenAIRemoteAssetsBlock,
  CommandSafetyBlock,
  UiScalingBlock,
  BackgroundToneBlock,
  AppearanceModeBlock,
  SettingsTerminalBlock,
  MoaAgentsBlock,
  DataResetBlock,
  UpdatesBlock,
  AboutBlock,
} from './SettingsBlocks.jsx'

export { SettingsInstructionsModal }

function shouldShowOpenAIProjectKnowledge(openaiRuntimeSettings = null) {
  if (!openaiRuntimeSettings || typeof openaiRuntimeSettings !== 'object') return false
  if (openaiRuntimeSettings.hostedToolsEnabled !== true) return false
  const enabledHostedTools = Array.isArray(openaiRuntimeSettings.enabledHostedTools)
    ? openaiRuntimeSettings.enabledHostedTools
    : []
  return enabledHostedTools.includes('file_search')
}

export function buildSettingsCategories({
  t,
  openaiRuntimeSettings,
} = {}) {
  const providersSectionCount = shouldShowOpenAIProjectKnowledge(openaiRuntimeSettings) ? 2 : 1
  const safetySectionCount = 2
  const translate = typeof t === 'function' ? t : getDefaultSettingsTranslator()

  return [
    {
      id: 'general',
      groupId: 'general',
      label: translate('settings:categories.general.label', { defaultValue: 'General' }),
      description: translate('settings:categories.general.description', {
        defaultValue: 'Language, product guidance, updates, and app information.',
      }),
      badges: [],
      sectionCount: 4,
    },
    {
      id: 'appearance',
      groupId: 'appearance',
      label: translate('settings:categories.appearance.label', { defaultValue: 'Appearance' }),
      description: translate('settings:categories.appearance.description', {
        defaultValue: 'Choose a theme, interface density, reading scale, and workspace tone.',
      }),
      badges: [],
      sectionCount: 3,
    },
    {
      id: 'terminal',
      groupId: 'terminal',
      label: translate('settings:categories.terminal.label', { defaultValue: 'Terminal' }),
      description: translate('settings:categories.terminal.description', {
        defaultValue: 'Configure terminal type, shell, working folder, and interaction behavior.',
      }),
      badges: [],
      sectionCount: 1,
    },
    {
      id: 'agents',
      groupId: 'agents',
      label: translate('settings:categories.agents.label', { defaultValue: 'Agents' }),
      description: translate('settings:categories.agents.description', {
        defaultValue: 'Set persistent instructions and manage Subagent roles.',
      }),
      badges: [],
      sectionCount: 2,
    },
    {
      id: 'providers',
      groupId: 'providers',
      label: translate('settings:categories.providers.label', { defaultValue: 'Providers' }),
      description: translate('settings:categories.providers.description', {
        defaultValue: 'Provider connections, credentials, OpenAI account access, and Project Knowledge when enabled.',
      }),
      badges: [],
      sectionCount: providersSectionCount,
    },
    {
      id: 'tools_safety',
      groupId: 'safety',
      label: translate('settings:categories.toolsSafety.label', { defaultValue: 'Safety' }),
      description: translate('settings:categories.toolsSafety.description', {
        defaultValue: 'Execution mode and concise guardrail behavior.',
      }),
      badges: [],
      sectionCount: safetySectionCount,
    },
    {
      id: 'data_privacy',
      groupId: 'data',
      label: translate('settings:categories.dataPrivacy.label', { defaultValue: 'Data' }),
      description: translate('settings:categories.dataPrivacy.description', {
        defaultValue: 'Export, restore, delete, or reset local ADDOM data.',
      }),
      badges: [],
      sectionCount: 1,
    },
  ]
}

export function buildActiveSettingsSections({
  t,
  activeCategoryId,
  setInstructionsOpen,
  projectFolder,
  uiLocale,
  handleUiLocaleChange,
  systemPromptAppendix,
  handleSaveSystemPromptAppendix,
  updateStatus,
  updateInfo,
  updatePct,
  handleCheckUpdate,
  handleDownloadUpdate,
  handleInstallUpdate,
  appVersion,
  uiScale,
  uiScalingSettings,
  handleUiScalingModeChange,
  handleUiScalingScaleChange,
  handleResetUiScaling,
  appearanceSettings,
  resolvedAppearance,
  handleAppearanceModeChange,
  backgroundToneSettings,
  handleBackgroundToneChange,
  terminalSettings,
  handleTerminalSettingsChange,
  chatTypographySettings,
  handleChatTypographyScaleChange,
  handleResetChatTypographyScale,
  providers,
  setKeyForProvider,
  deleteKeyForProvider,
  setAuthMethodForProvider,
  activeProjectId,
  openaiProjectAssets,
  openaiAssetsBusy,
  modelCatalogVisibility,
  handleRefreshOpenAIProjectAssets,
  handleEnsureOpenAIProjectVectorStore,
  handleUploadOpenAIFiles,
  handleAttachOpenAIProjectFiles,
  handleRemoveOpenAIProjectAsset,
  handleDeleteOpenAIProjectVectorStore,
  handleModelCatalogVisibilityChange,
  permissionMode,
  permissionModeChangePending,
  handlePermissionModeChange,
  openaiRuntimeSettings,
  moaRoles,
  setMoaRoles,
  agentSettings,
  setAgentSettings,
  roleTemplates,
  activeThreadId,
  localDataActionBusy,
  handleExportCurrentThread,
  handleImportThread,
  handleDeleteApiKeysNow,
  handleResetLocalDataAndRestart,
} = {}) {
  const translate = typeof t === 'function' ? t : getDefaultSettingsTranslator()
  const showOpenAIProjectKnowledge = shouldShowOpenAIProjectKnowledge(openaiRuntimeSettings)
  switch (activeCategoryId) {
    case 'general':
      return [
        {
          id: 'instructions',
          title: translate('settings:sections.general.instructions.title', { defaultValue: 'Usage Guide' }),
          summary: translate('settings:sections.general.instructions.summary', {
            defaultValue: 'Open the in-app guide for current behavior, safety defaults, and workflows.',
          }),
          defaultOpen: false,
          render: () => (
            <InstructionsBlock
              onOpenInstructions={() => setInstructionsOpen(true)}
            />
          ),
        },
        {
          id: 'language',
          title: translate('settings:sections.general.language.title', { defaultValue: 'Language' }),
          summary: translate('settings:sections.general.language.summary', {
            defaultValue: 'Select the ADDOM app language.',
          }),
          defaultOpen: false,
          render: () => (
            <LanguageBlock
              uiLocale={uiLocale}
              onChangeUiLocale={handleUiLocaleChange}
            />
          ),
        },
        {
          id: 'updates',
          title: translate('settings:sections.general.updates.title', { defaultValue: 'Updates' }),
          summary: translate('settings:sections.general.updates.summary', {
            defaultValue: 'Check, download, and install ADDOM updates.',
          }),
          defaultOpen: false,
          render: () => (
            <UpdatesBlock
              updateStatus={updateStatus}
              updateInfo={updateInfo}
              updatePct={updatePct}
              onCheckUpdate={handleCheckUpdate}
              onDownloadUpdate={handleDownloadUpdate}
              onInstallUpdate={handleInstallUpdate}
            />
          ),
        },
        {
          id: 'about',
          title: translate('settings:sections.general.about.title', { defaultValue: 'About' }),
          summary: translate('settings:sections.general.about.summary', {
            defaultValue: 'Version and build information.',
          }),
          defaultOpen: false,
          render: () => <AboutBlock version={appVersion} />,
        },
      ]
    case 'appearance':
      return [
        {
          id: 'appearance-mode',
          title: translate('settings:sections.general.appearanceMode.title', { defaultValue: 'Theme' }),
          summary: translate('settings:sections.general.appearanceMode.summary', {
            defaultValue: 'Choose light, dark, or system appearance.',
          }),
          render: () => (
            <AppearanceModeBlock
              appearanceSettings={appearanceSettings}
              resolvedAppearance={resolvedAppearance}
              onAppearanceModeChange={handleAppearanceModeChange}
            />
          ),
        },
        {
          id: 'background-tone',
          title: translate('settings:sections.general.backgroundTone.title', { defaultValue: 'Background' }),
          summary: translate('settings:sections.general.backgroundTone.summary', {
            defaultValue: 'Choose a gray workspace tone.',
          }),
          render: () => (
            <BackgroundToneBlock
              backgroundToneSettings={backgroundToneSettings}
              onBackgroundToneChange={handleBackgroundToneChange}
              disabled={resolvedAppearance !== 'dark'}
            />
          ),
        },
        {
          id: 'ui-scaling',
          title: translate('settings:sections.general.uiScaling.title', { defaultValue: 'Interface scale' }),
          summary: translate('settings:sections.general.uiScaling.summary', {
            defaultValue: 'Adjust shell density and chat text size.',
          }),
          render: () => (
            <UiScalingBlock
              uiScale={uiScale}
              uiScalingSettings={uiScalingSettings}
              onUiScalingModeChange={handleUiScalingModeChange}
              onUiScalingScaleChange={handleUiScalingScaleChange}
              onResetUiScaling={handleResetUiScaling}
              chatTypographySettings={chatTypographySettings}
              onChatTypographyScaleChange={handleChatTypographyScaleChange}
              onResetChatTypographyScale={handleResetChatTypographyScale}
            />
          ),
        },
      ]
    case 'terminal':
      return [
        {
          id: 'terminal',
          title: translate('settings:sections.general.terminal.title', { defaultValue: 'Terminal defaults' }),
          summary: translate('settings:sections.general.terminal.summary', {
            defaultValue: 'Set terminal font, shell, start folder, and interaction behavior.',
          }),
          render: () => (
            <SettingsTerminalBlock
              terminalSettings={terminalSettings}
              onChange={handleTerminalSettingsChange}
            />
          ),
        },
      ]
    case 'agents':
      return [
        {
          id: 'assistant-prompt',
          title: translate('settings:sections.general.assistantPrompt.title', { defaultValue: 'Custom instructions' }),
          summary: translate('settings:sections.general.assistantPrompt.summary', {
            defaultValue: 'Add persistent guidance to each chat turn.',
          }),
          render: () => (
            <AssistantPromptBlock
              value={systemPromptAppendix}
              onSave={handleSaveSystemPromptAppendix}
            />
          ),
        },
        {
          id: 'moa-agents',
          title: translate('settings:sections.moa.agents.title', { defaultValue: 'Subagents' }),
          summary: translate('settings:sections.moa.agents.summary', {
            defaultValue: 'Configure agent roles, models, skills, and instructions.',
          }),
          render: ({ openDetailView } = {}) => (
            <MoaAgentsBlock
              view="summary"
              moaRoles={moaRoles}
              setMoaRoles={setMoaRoles}
              agentSettings={agentSettings}
              setAgentSettings={setAgentSettings}
              providers={providers}
              modelCatalogVisibility={modelCatalogVisibility}
              roleTemplates={roleTemplates}
              onManage={() => openDetailView?.('subagents', 'settings-manage-subagents')}
            />
          ),
          detailViews: {
            subagents: {
              id: 'subagents',
              render: ({ closeDetailView }) => (
                <MoaAgentsBlock
                  view="manager"
                  moaRoles={moaRoles}
                  setMoaRoles={setMoaRoles}
                  agentSettings={agentSettings}
                  setAgentSettings={setAgentSettings}
                  providers={providers}
                  modelCatalogVisibility={modelCatalogVisibility}
                  roleTemplates={roleTemplates}
                  onClose={closeDetailView}
                />
              ),
            },
          },
        },
      ]
    case 'providers':
      return [
        {
          id: 'api-keys',
          title: translate('settings:sections.providers.apiKeys.title', { defaultValue: 'API Keys' }),
          summary: translate('settings:sections.providers.apiKeys.summary', {
            defaultValue: 'Save provider credentials, use the preferred OpenAI sign-in path, and inspect local provider availability.',
          }),
          defaultOpen: true,
          render: ({ openDetailView } = {}) => (
            <ApiKeysBlock
              providers={providers}
              onSaveProviderKey={setKeyForProvider}
              onDeleteProviderKey={deleteKeyForProvider}
              onSetProviderAuthMethod={setAuthMethodForProvider}
              openDetailView={openDetailView}
            />
          ),
          detailViews: {
            'openrouter-catalog': {
              id: 'openrouter-catalog',
              render: ({ closeDetailView }) => (
                <OpenRouterCatalogVisibilitySection
                  providers={providers}
                  value={modelCatalogVisibility?.openrouter}
                  onChange={handleModelCatalogVisibilityChange}
                  onClose={closeDetailView}
                />
              ),
            },
          },
        },
        ...(showOpenAIProjectKnowledge ? [{
          id: 'openai-project-knowledge',
          title: translate('settings:sections.providers.openAiKnowledgeBase.title', {
            defaultValue: 'Project Knowledge',
          }),
          summary: translate('settings:sections.providers.openAiKnowledgeBase.summary', {
            defaultValue: 'Project-scoped files for OpenAI file_search retrieval when hosted tools are enabled in advanced config.',
          }),
          defaultOpen: true,
          render: () => (
            <OpenAIRemoteAssetsBlock
              providers={providers}
              activeProjectId={activeProjectId}
              openaiProjectAssets={openaiProjectAssets}
              openaiAssetsBusy={openaiAssetsBusy}
              onRefreshOpenAIProjectAssets={handleRefreshOpenAIProjectAssets}
              onEnsureOpenAIProjectVectorStore={handleEnsureOpenAIProjectVectorStore}
              onUploadOpenAIFiles={handleUploadOpenAIFiles}
              onAttachOpenAIProjectFiles={handleAttachOpenAIProjectFiles}
              onRemoveOpenAIProjectAsset={handleRemoveOpenAIProjectAsset}
              onDeleteOpenAIProjectVectorStore={handleDeleteOpenAIProjectVectorStore}
            />
          ),
        }] : []),
      ]
    case 'tools_safety':
      return [
        {
          id: 'execution-mode',
          title: translate('settings:sections.toolsSafety.executionMode.title', { defaultValue: 'Execution Mode' }),
          summary: translate('settings:sections.toolsSafety.executionMode.summary', {
            defaultValue: 'Choose how much ADDOM should pause before running tools.',
          }),
          defaultOpen: true,
          render: () => (
            <ExecutionModeBlock
              permissionMode={permissionMode}
              permissionModeChangePending={permissionModeChangePending}
              onPermissionModeChange={handlePermissionModeChange}
            />
          ),
        },
        {
          id: 'command-safety',
          title: translate('settings:sections.toolsSafety.commandSafety.title', {
            defaultValue: 'Guardrails',
          }),
          summary: translate('settings:sections.toolsSafety.commandSafety.summary', {
            defaultValue: 'Hard guardrails and first-risky-use behavior.',
          }),
          defaultOpen: false,
          render: () => (
            <CommandSafetyBlock
              projectFolder={projectFolder}
            />
          ),
        },
      ]
    case 'data_privacy':
      return [
        {
          id: 'data-reset',
          title: translate('settings:sections.dataPrivacy.resetCleanup.title', {
            defaultValue: 'Reset & Cleanup',
          }),
          summary: translate('settings:sections.dataPrivacy.resetCleanup.summary', {
            defaultValue: 'Export/import thread JSON and perform cleanup at thread, project, or workspace scope.',
          }),
          defaultOpen: true,
          render: () => (
            <DataResetBlock
              activeProjectId={activeProjectId}
              activeThreadId={activeThreadId}
              localDataActionBusy={localDataActionBusy}
              onExportCurrentThread={handleExportCurrentThread}
              onImportThread={handleImportThread}
              onDeleteApiKeysNow={handleDeleteApiKeysNow}
              onResetLocalDataAndRestart={handleResetLocalDataAndRestart}
            />
          ),
        },
      ]
    default:
      return []
  }
}
