import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './ui/Icon.jsx'
import AddomTextLogoSimple from './AddomTextLogoSimple.jsx'
import { MenuSurface, MenuRow } from './ui/MenuSurface.jsx'
import { SendIcon } from './chat/ChatComposerIcons.jsx'
import useAppStore from '../store/useAppStore.js'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'

const HOME_INPUT_MIN_HEIGHT_PX = 60
const HOME_INPUT_MAX_HEIGHT_PX = 180
const HOME_PROJECT_MENU_LIMIT = 8

function resolveMostRecentProjectId(projects = []) {
  let recent = null
  for (const project of projects) {
    if (!project?.id) continue
    if (!recent || Number(project.lastWorkedAt || 0) > Number(recent.lastWorkedAt || 0)) {
      recent = project
    }
  }
  return recent?.id || ''
}

export default function ProjectEntryHomeSurface({
  projects = [],
  loading = false,
  onOpenProject,
  onOpenFolder,
}) {
  const { t } = useRendererTranslation(['core'])
  const queueChatDraftInjection = useAppStore((s) => s.queueChatDraftInjection)
  const clearPendingChatDraftInjection = useAppStore((s) => s.clearPendingChatDraftInjection)

  const [draftText, setDraftText] = useState('')
  const [targetProjectId, setTargetProjectId] = useState('')
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)

  const hasProjects = projects.length > 0
  const targetProject = useMemo(() => (
    targetProjectId
      ? projects.find((project) => project.id === targetProjectId) || null
      : null
  ), [projects, targetProjectId])

  useEffect(() => {
    if (targetProjectId && projects.some((project) => project.id === targetProjectId)) return
    setTargetProjectId(resolveMostRecentProjectId(projects))
  }, [projects, targetProjectId])

  useEffect(() => {
    if (!projectMenuOpen) return undefined
    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return
      if (triggerRef.current?.contains(event.target)) return
      setProjectMenuOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setProjectMenuOpen(false)
        triggerRef.current?.focus?.()
      }
    }
    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [projectMenuOpen])

  const autoSizeInput = useCallback((node) => {
    if (!node) return
    node.style.height = 'auto'
    const next = Math.min(Math.max(node.scrollHeight, HOME_INPUT_MIN_HEIGHT_PX), HOME_INPUT_MAX_HEIGHT_PX)
    node.style.height = `${next}px`
    node.style.overflowY = node.scrollHeight > HOME_INPUT_MAX_HEIGHT_PX ? 'auto' : 'hidden'
  }, [])

  const startWork = useCallback(async ({ projectId = targetProjectId, viaFolder = false } = {}) => {
    if (busy || loading) return
    const text = draftText.trim()
    setBusy(true)
    try {
      if (text) {
        queueChatDraftInjection({
          text,
          mode: 'append',
          source: 'project_entry_home',
        })
      }
      const opened = viaFolder || !projectId
        ? await onOpenFolder?.()
        : await onOpenProject?.(projectId)
      if (!opened && text) {
        clearPendingChatDraftInjection()
      }
    } finally {
      setBusy(false)
    }
  }, [
    busy,
    clearPendingChatDraftInjection,
    draftText,
    loading,
    onOpenFolder,
    onOpenProject,
    queueChatDraftInjection,
    targetProjectId,
  ])

  const handleSubmit = useCallback(() => {
    if (!draftText.trim()) return
    void startWork()
  }, [draftText, startWork])

  const handleInputKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleProjectTrigger = useCallback(() => {
    if (!hasProjects) {
      void startWork({ viaFolder: true })
      return
    }
    setProjectMenuOpen((prev) => !prev)
  }, [hasProjects, startWork])

  const noProjectLabel = t('core:projectEntry.home.noProject', { defaultValue: 'No project' })
  const targetLabel = targetProject?.name || noProjectLabel
  const sendDisabled = busy || loading || !draftText.trim()
  const menuProjects = projects.slice(0, HOME_PROJECT_MENU_LIMIT)

  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center px-8 pb-[8vh]"
      data-ui="project-entry-home"
    >
      <div className="w-full max-w-[38rem]">
        <div className="mb-7 flex justify-center">
          <AddomTextLogoSimple height={15} className="opacity-40" />
        </div>

        <div
          className="rounded-[18px] border border-surface-border bg-surface-panel/80 shadow-[0_12px_36px_rgb(var(--theme-shadow-rgb)_/_0.24),inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.04)] transition-colors focus-within:border-border-strong"
          data-ui="project-entry-home-composer"
        >
          <textarea
            ref={(node) => {
              inputRef.current = node
              autoSizeInput(node)
            }}
            value={draftText}
            onChange={(event) => {
              setDraftText(event.target.value)
              autoSizeInput(event.target)
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={t('core:projectEntry.home.placeholder', {
              defaultValue: 'Describe a task to start working',
            })}
            aria-label={t('core:projectEntry.home.placeholder', {
              defaultValue: 'Describe a task to start working',
            })}
            rows={2}
            className="w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted"
            style={{ minHeight: HOME_INPUT_MIN_HEIGHT_PX }}
            data-ui="project-entry-home-input"
          />
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
            <div className="relative min-w-0">
              <button
                ref={triggerRef}
                type="button"
                onClick={handleProjectTrigger}
                disabled={busy || loading}
                aria-haspopup={hasProjects ? 'menu' : undefined}
                aria-expanded={hasProjects ? projectMenuOpen : undefined}
                aria-label={t('core:projectEntry.home.projectMenu', {
                  defaultValue: 'Choose target project',
                })}
                title={targetProject?.path || targetLabel}
                className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel-alt hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
                data-ui="project-entry-home-project-trigger"
              >
                <Icon name="folder-simple" className="shrink-0 text-[13px] text-text-muted" />
                <span className="min-w-0 truncate">{targetLabel}</span>
                {hasProjects && <Icon name="caret-down" className="shrink-0 text-[10px] text-text-muted" />}
              </button>
              {projectMenuOpen && hasProjects && (
                <MenuSurface
                  ref={menuRef}
                  role="menu"
                  className="absolute left-0 top-[calc(100%+0.375rem)] z-20 max-h-56 w-60 overflow-y-auto"
                  data-ui="project-entry-home-project-menu"
                >
                  {menuProjects.map((project) => (
                    <MenuRow
                      key={project.id}
                      role="menuitem"
                      active={project.id === targetProjectId}
                      title={project.path}
                      onClick={() => {
                        setTargetProjectId(project.id)
                        setProjectMenuOpen(false)
                        inputRef.current?.focus?.()
                      }}
                    >
                      <Icon name="folder-simple" className="shrink-0 text-[13px] text-text-muted" />
                      <span className="min-w-0 truncate">{project.name}</span>
                    </MenuRow>
                  ))}
                </MenuSurface>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={sendDisabled}
              aria-label={t('core:projectEntry.home.start', { defaultValue: 'Start task' })}
              title={t('core:projectEntry.home.start', { defaultValue: 'Start task' })}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent bg-accent text-surface transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-35"
              data-ui="project-entry-home-send"
            >
              <SendIcon />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <kbd className="rounded border border-surface-border bg-surface-panel px-1.5 py-0.5 font-mono text-[10px] leading-none text-text-secondary">
              Ctrl+Shift+P
            </kbd>
            {t('core:projectEntry.home.commandsHint', { defaultValue: 'Commands' })}
          </span>
        </div>
      </div>
    </div>
  )
}
