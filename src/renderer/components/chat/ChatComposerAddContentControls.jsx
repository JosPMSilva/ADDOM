import React from 'react'
import { AttachFileIcon, CodeBracketsIcon, PlusIcon, TextSnippetIcon } from './chat-composer-icons.jsx'

export default function ChatComposerAddContentControls({
  composerActionsRef,
  fileInputRef,
  snippetTriggerRef,
  snippetMenuRef,
  snippetMenuOpen = false,
  setSnippetMenuOpen = () => {},
  handleAttachInputChange = () => {},
  handleAttachClick = () => {},
  addSnippetBlock = () => {},
  attachDisabled = true,
  attachButtonTitle = '',
  disabled = false,
  isStreaming = false,
  t,
}) {
  return (
    <div
      ref={composerActionsRef}
      className="absolute right-4 bottom-1.5 z-30 flex items-center gap-1.5"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        multiple
        className="hidden"
        onChange={handleAttachInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      {!disabled && !isStreaming && (
        <div className="relative">
          <button
            ref={snippetTriggerRef}
            type="button"
            onClick={() => setSnippetMenuOpen((value) => !value)}
            className={[
              'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
              snippetMenuOpen
                ? 'border-accent/60 bg-accent-muted/40 text-accent-soft'
                : 'border-transparent bg-surface-panel/30 text-text-subtle hover:bg-surface-panel hover:text-text-secondary',
            ].join(' ')}
            title={t('core:chat.composer.addContent', { defaultValue: 'Add content' })}
            aria-label={t('core:chat.composer.addContent', { defaultValue: 'Add content' })}
            aria-haspopup="true"
            aria-expanded={snippetMenuOpen}
            data-ui="chat-composer-add-content"
          >
            <PlusIcon />
          </button>

          {snippetMenuOpen && (
            <div
              ref={snippetMenuRef}
              className="absolute bottom-full mb-2 right-0 z-40 w-44 rounded-xl border border-surface-border/50 bg-surface-panel/80 p-1 shadow-md backdrop-blur-xl"
            >
              <p className="px-2 pt-1 pb-1.5 text-[9px] uppercase tracking-widest text-text-muted select-none">
                {t('core:chat.composer.addContent', { defaultValue: 'Add content' })}
              </p>
              <button
                type="button"
                onClick={handleAttachClick}
                disabled={attachDisabled}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                title={attachButtonTitle || t('core:chat.controlRail.attach.files', { defaultValue: 'Attach files' })}
              >
                <AttachFileIcon />
                {attachButtonTitle || t('core:chat.controlRail.attach.files', { defaultValue: 'Attach files' })}
              </button>
              <button
                type="button"
                onClick={() => addSnippetBlock('code')}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors"
              >
                <CodeBracketsIcon />
                {t('core:chat.composer.codeSnippet', { defaultValue: 'Code snippet' })}
              </button>
              <button
                type="button"
                onClick={() => addSnippetBlock('text')}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors"
              >
                <TextSnippetIcon />
                {t('core:chat.composer.textSnippet', { defaultValue: 'Text snippet' })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
