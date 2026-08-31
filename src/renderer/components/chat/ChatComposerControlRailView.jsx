import React from 'react'
import ContextMeter from './ContextMeter.jsx'
import { SendIcon, StopIcon } from './ChatComposerIcons.jsx'
import {
  ProviderModelSelector,
} from './ChatHeaderControls.jsx'
import { ChatModeToggleController } from './ChatModeControls.jsx'
import ChatProcessingModeControl from './ChatProcessingModeControl.jsx'
import { providerSupportsContextMeter } from './chat-context-meter-usage.mjs'
import {
  ChevronDownIcon,
  JobsIcon,
  MoAIcon,
  OpenAIAccountRateLimitsSection,
  OverflowIcon,
  RefreshIcon,
  TerminalIcon,
  formatEffortLabel,
} from './chat-composer-control-rail-helpers.jsx'
import {
  ConversationComposerActionButton,
  ConversationComposerControlSurface,
} from './ConversationComposerFoundation.jsx'

export default function ChatComposerControlRailView({
  activeThreadId,
  activeThreadIsEmpty,
  activeThreadContextFallbackMode,
  agentMenuOpen,
  agentQuickActionsEnabled,
  anthropicThinkingMenuContent,
  collaborationModeButtonTitle,
  collaborationModeControlEnabled,
  collaborationModeLabel,
  collaborationModeMenuOpen,
  collaborationModeOptionsAriaLabel,
  collaborationModeRef,
  contextUsage,
  effectiveCollaborationModeId,
  effectiveEffort,
  effortControlEnabled,
  effortMenuOpen,
  effortOptions,
  effortRef,
  handleCollaborationModeChange,
  handleReasoningEffortChange,
  hasConversation,
  isStreaming,
  loaded,
  modeSlotRef,
  modelCatalogVisibility,
  meterSlotRef,
  onAgentMenuOpenChange,
  onComplianceNotice,
  onModelChange,
  onOpenJobsModal,
  onProviderChange,
  onRefreshProviders,
  onSend,
  onStop,
  onToggleTerminalDock,
  openAIAccountCollaborationModes,
  openAIAccountSession,
  openTerminalTitle,
  overflowOpen,
  overflowRef,
  providerModelOnSecondRow,
  providerModelSlotRef,
  providers,
  selectedProviderRow,
  railRef,
  reasoningEffortButtonAriaLabel,
  reasoningEffortButtonTitle,
  reasoningEffortLabel,
  reasoningEffortOptionsAriaLabel,
  refreshing,
  rightClusterRef,
  selectedModel,
  selectedOpenAIModel,
  selectedProvider,
  sendDisabled,
  setCollaborationModeMenuOpen,
  setEffortMenuOpen,
  setOverflowOpen,
  showOpenAIAccountRateLimits,
  t,
  terminalButtonActive,
  terminalButtonEnabled,
}) {
  return (
    <div className="w-full">
      <ConversationComposerControlSurface
        ref={railRef}
        data-ui="chat-composer-control-rail"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {providerSupportsContextMeter(selectedProviderRow) ? (
            <div ref={meterSlotRef} className="order-1 shrink-0">
              <ContextMeter
                usage={contextUsage}
                activeThreadIsEmpty={activeThreadIsEmpty}
                activeThreadContextFallbackMode={activeThreadContextFallbackMode}
                compact
              />
            </div>
          ) : null}

          <div ref={modeSlotRef} className="order-2 flex shrink-0 items-center gap-2">
            <ChatModeToggleController
              executeOnly={selectedProviderRow?.capabilities?.requiresExecuteMode === true}
              disabled={isStreaming}
            />

            <ChatProcessingModeControl
              provider={selectedProviderRow}
              modelId={selectedModel}
              activeThreadId={activeThreadId}
              disabled={isStreaming}
            />

            {collaborationModeControlEnabled && (
              <div ref={collaborationModeRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setCollaborationModeMenuOpen((prev) => !prev)}
                  className={[
                    'inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10.5px] transition-colors',
                    collaborationModeMenuOpen
                      ? 'text-text-primary bg-surface-panel-alt/35'
                      : 'text-text-secondary hover:bg-surface-panel-alt/30 hover:text-text-primary bg-transparent',
                  ].join(' ')}
                  title={collaborationModeButtonTitle}
                  aria-haspopup="listbox"
                  aria-expanded={collaborationModeMenuOpen}
                  aria-label={collaborationModeButtonTitle}
                  data-ui="chat-composer-collaboration-mode"
                >
                  <span className="truncate text-[10.5px]">{collaborationModeLabel}</span>
                  <ChevronDownIcon open={collaborationModeMenuOpen} />
                </button>

                {collaborationModeMenuOpen && collaborationModeControlEnabled && (
                  <div className="absolute left-0 bottom-[calc(100%+6px)] z-[70] w-48 rounded-lg border border-surface-border bg-surface-panel p-1 shadow-[0_14px_32px_rgb(var(--theme-shadow-rgb)_/_0.28)]">
                    <div
                      className="max-h-56 overflow-y-auto pr-0.5"
                      role="listbox"
                      aria-label={collaborationModeOptionsAriaLabel}
                    >
                      {openAIAccountCollaborationModes.map((mode) => {
                        const value = String(mode.id || '').trim()
                        const selected = value === effectiveCollaborationModeId
                        const label = String(mode.name || value).trim() || value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              handleCollaborationModeChange(value)
                              setCollaborationModeMenuOpen(false)
                            }}
                            className={[
                              'min-h-7 w-full rounded-md border px-2 py-1 text-left text-[11px] transition-colors',
                              selected
                                ? 'border-transparent bg-surface-panel-alt text-text-primary font-medium'
                                : 'border-transparent text-text-subtle hover:bg-surface-panel hover:text-text-primary',
                            ].join(' ')}
                            role="option"
                            aria-selected={selected}
                            title={String(mode.description || label)}
                          >
                            <span className="block truncate">{label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {effortControlEnabled && (
              <div ref={effortRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setEffortMenuOpen((prev) => !prev)}
                  className={[
                    'inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10.5px] transition-colors',
                    effortMenuOpen
                      ? 'text-text-primary bg-surface-panel-alt/35'
                      : 'text-text-secondary hover:bg-surface-panel-alt/30 hover:text-text-primary bg-transparent',
                  ].join(' ')}
                  title={reasoningEffortButtonTitle}
                  aria-haspopup="listbox"
                  aria-expanded={effortMenuOpen}
                  aria-label={reasoningEffortButtonAriaLabel}
                  data-ui="chat-composer-reasoning-effort"
                >
                  <span className="truncate text-[10.5px]">{reasoningEffortLabel}</span>
                  <ChevronDownIcon open={effortMenuOpen} />
                </button>

                {effortMenuOpen && effortControlEnabled && (
                  <div className="absolute left-0 bottom-[calc(100%+6px)] z-[70] w-40 rounded-lg border border-surface-border bg-surface-panel p-1 shadow-[0_14px_32px_rgb(var(--theme-shadow-rgb)_/_0.28)]">
                    <div
                      className="max-h-56 overflow-y-auto pr-0.5"
                      role="listbox"
                      aria-label={reasoningEffortOptionsAriaLabel}
                    >
                      {effortOptions.map((value) => {
                        const selected = value === effectiveEffort
                        const label = formatEffortLabel(value, t)
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              handleReasoningEffortChange({ target: { value } })
                              setEffortMenuOpen(false)
                            }}
                            className={[
                              'min-h-7 w-full rounded-md border px-2 py-1 text-left text-[11px] transition-colors',
                              selected
                                ? 'border-transparent bg-surface-panel-alt text-text-primary font-medium'
                                : 'border-transparent text-text-subtle hover:bg-surface-panel hover:text-text-primary',
                            ].join(' ')}
                            role="option"
                            aria-selected={selected}
                            title={label}
                          >
                            <span className="block truncate">{label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            ref={rightClusterRef}
            className="order-4 ml-auto flex shrink-0 items-center gap-2"
            data-ui="chat-composer-rail-right-cluster"
          >
            {agentQuickActionsEnabled && !isStreaming && (
              <button
                type="button"
                onClick={() => onAgentMenuOpenChange(!agentMenuOpen)}
                className={[
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-7 sm:w-7',
                  agentMenuOpen
                    ? 'bg-accent-muted/40 text-accent-soft'
                    : 'bg-transparent text-text-subtle hover:bg-surface-panel-alt/30 hover:text-text-secondary',
                ].join(' ')}
                title={t('core:chat.controlRail.directAgentsMenu', {
                  defaultValue: 'Agent selection menu',
                })}
                aria-label={t('core:chat.controlRail.directAgentsMenu', {
                  defaultValue: 'Agent selection menu',
                })}
                aria-pressed={agentMenuOpen ? 'true' : 'false'}
                data-ui="chat-composer-agents-menu-toggle"
              >
                <MoAIcon />
              </button>
            )}

            <div ref={overflowRef} className="relative">
              <button
                type="button"
                onClick={() => setOverflowOpen((prev) => !prev)}
                title={t('core:chat.controlRail.moreActions', { defaultValue: 'More actions' })}
                aria-label={t('core:chat.controlRail.moreActions', { defaultValue: 'More actions' })}
                aria-expanded={overflowOpen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-transparent text-text-secondary transition-colors hover:bg-surface-panel-alt/30 hover:text-text-primary sm:h-7 sm:w-7"
                data-ui="chat-composer-overflow-toggle"
              >
                <OverflowIcon />
              </button>

              {overflowOpen && (
                <div
                  className="absolute right-0 bottom-[calc(100%+8px)] z-40 w-max max-w-[88vw] rounded-lg border border-surface-border bg-surface-panel p-1 shadow-[0_14px_32px_rgb(var(--theme-shadow-rgb)_/_0.28)]"
                  data-ui="chat-composer-overflow-menu"
                >
                  <div className="flex flex-col gap-0.5 min-w-[180px]">
                    <button
                      type="button"
                      disabled={refreshing}
                      onClick={() => onRefreshProviders?.()}
                      className={[
                        'flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors',
                        refreshing
                          ? 'cursor-not-allowed opacity-55 text-text-muted'
                          : 'text-text-secondary hover:bg-surface-panel hover:text-text-primary',
                      ].join(' ')}
                      title={refreshing
                        ? t('core:chat.controlRail.refreshingModels', { defaultValue: 'Refreshing models' })
                        : t('core:chat.controlRail.refreshModels', { defaultValue: 'Refresh models' })}
                    >
                      <RefreshIcon spinning={refreshing} />
                      <span>
                        {refreshing
                          ? t('core:chat.controlRail.refreshing', { defaultValue: 'Refreshing...' })
                          : t('core:chat.controlRail.refreshModels', { defaultValue: 'Refresh models' })}
                        </span>
                      </button>

                    <button
                      type="button"
                      disabled={!terminalButtonEnabled}
                      onClick={() => {
                        if (!terminalButtonEnabled) return
                        onToggleTerminalDock?.()
                        setOverflowOpen(false)
                      }}
                      className={[
                        'flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors',
                        !terminalButtonEnabled
                          ? 'cursor-not-allowed opacity-55 text-text-muted'
                          : (terminalButtonActive
                            ? 'bg-surface-panel-alt text-text-primary font-medium'
                            : 'text-text-secondary hover:bg-surface-panel hover:text-text-primary'),
                      ].join(' ')}
                      aria-pressed={terminalButtonActive ? 'true' : 'false'}
                      aria-label={openTerminalTitle}
                      title={openTerminalTitle}
                      data-ui="chat-composer-terminal-toggle"
                    >
                      <TerminalIcon />
                      <span>{openTerminalTitle}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onOpenJobsModal?.()
                        setOverflowOpen(false)
                      }}
                      className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary"
                      title={t('core:chat.controlRail.openBackgroundJobs', { defaultValue: 'Open background jobs' })}
                    >
                      <JobsIcon />
                      <span>{t('core:chat.controlRail.backgroundJobs', { defaultValue: 'Background jobs' })}</span>
                    </button>

                    {showOpenAIAccountRateLimits && (
                      <OpenAIAccountRateLimitsSection
                        sessionSummary={openAIAccountSession}
                        modelId={selectedOpenAIModel}
                        t={t}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {isStreaming && !sendDisabled ? (
              <ConversationComposerActionButton
                onClick={onSend}
                aria-label={t('core:chat.controlRail.replaceCurrentTurn', { defaultValue: 'Replace current turn' })}
                title={t('core:chat.controlRail.replaceCurrentTurn', { defaultValue: 'Replace current turn' })}
                data-ui="chat-composer-send"
              >
                <SendIcon />
              </ConversationComposerActionButton>
            ) : isStreaming ? (
              <ConversationComposerActionButton
                tone="stop"
                onClick={onStop}
                aria-label={t('core:chat.controlRail.stopResponse', { defaultValue: 'Stop response' })}
                title={t('core:chat.attachments.common.cancel', { defaultValue: 'Cancel' })}
                data-ui="chat-composer-stop"
              >
                <StopIcon />
              </ConversationComposerActionButton>
            ) : (
              <ConversationComposerActionButton
                onClick={onSend}
                disabled={sendDisabled}
                aria-label={t('core:chat.controlRail.sendMessage', { defaultValue: 'Send message' })}
                title={t('core:chat.controlRail.sendEnter', { defaultValue: 'Send (Enter)' })}
                data-ui="chat-composer-send"
              >
                <SendIcon />
              </ConversationComposerActionButton>
            )}
          </div>

          <div
            ref={providerModelSlotRef}
            className={providerModelOnSecondRow ? 'order-5 basis-full min-w-0 self-start pt-1' : 'order-3 min-w-0 flex-1'}
          >
            <ProviderModelSelector
              providers={providers}
              loaded={loaded}
              refreshing={refreshing}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              modelCatalogVisibility={modelCatalogVisibility}
              activeThreadId={activeThreadId}
              hasConversation={hasConversation}
              onComplianceNotice={onComplianceNotice}
              onChangeProvider={onProviderChange}
              onChangeModel={onModelChange}
              onRefresh={onRefreshProviders}
              showRefreshButton={false}
              showCustomModelInput
              customModelInputMode="openrouter_only"
              showModelSourceBadge={false}
              allowWrap={providerModelOnSecondRow}
              modelMenuTopContent={anthropicThinkingMenuContent}
            />
          </div>

        </div>
      </ConversationComposerControlSurface>
    </div>
  )
}
