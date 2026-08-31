import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useAppStore, { requestAppAlert } from '../store/useAppStore.js'
import useChatStore from '../store/useChatStore.js'
import useEditorStore from '../store/useEditorStore.js'
import { DIALOG_Z_IMMERSIVE } from './dialog-layering.mjs'
import { buildEditorCapabilityActionTitle } from './editor/editor-setup-hints.mjs'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import { useCommandPaletteTerminalActions } from './command-palette-terminal-actions.mjs'
import Icon from './ui/Icon.jsx'

const RECENT_COMMANDS_STORAGE_KEY = 'addom.commandPalette.recent'
const MAX_RECENT_COMMANDS = 8
const ALL_CATEGORY_FILTER = 'all'
const RECENT_CATEGORY_FILTER = 'recent'

function readRecentCommands() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return []
    const raw = window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.map((id) => String(id || '').trim()).filter(Boolean).slice(0, MAX_RECENT_COMMANDS)
      : []
  } catch {
    return []
  }
}

function writeRecentCommands(ids) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(
      RECENT_COMMANDS_STORAGE_KEY,
      JSON.stringify((Array.isArray(ids) ? ids : []).slice(0, MAX_RECENT_COMMANDS)),
    )
  } catch {
    // Ignore localStorage failures.
  }
}

function isWorkspaceActive(workspaceViewMode, projectFolder) {
  return workspaceViewMode === 'workspace' && !!projectFolder
}

function scoreCommand(command, query, recentIndexMap) {
  const q = String(query || '').trim().toLowerCase()
  const title = String(command.title || '').toLowerCase()
  const aliases = Array.isArray(command.aliases) ? command.aliases.map((v) => String(v).toLowerCase()) : []
  const recentIndex = recentIndexMap.get(command.id)
  const recencyBoost = recentIndex === undefined ? 0 : (MAX_RECENT_COMMANDS - recentIndex) * 5

  if (!q) {
    return (recentIndex === undefined ? 0 : 1000 + recencyBoost) + title.charCodeAt(0)
  }

  if (title === q) return 5000 + recencyBoost
  if (title.startsWith(q)) return 4000 + recencyBoost
  if (title.includes(q)) return 3000 + recencyBoost

  for (const alias of aliases) {
    if (alias === q) return 2500 + recencyBoost
    if (alias.startsWith(q)) return 2000 + recencyBoost
    if (alias.includes(q)) return 1500 + recencyBoost
  }

  return -1
}

function commandResult(enabled, reason = '') {
  return { visible: true, enabled: !!enabled, reason: enabled ? '' : reason }
}

function normalizeCommandPaletteKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function CommandPalette({
  open,
  onClose,
  onOpenWorkspaceRail,
}) {
  const { t } = useRendererTranslation(['core'])
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY_FILTER)
  const [recentCommandIds, setRecentCommandIds] = useState(readRecentCommands)

  const {
    projectFolder,
    activeProjectId,
    activeThreadId,
    activePanel,
    permissionMode,
    workspaceViewMode,
    sidebarCollapsed,
    setActivePanel,
    toggleSidebar,
    emitCommandPaletteEvent,
  } = useAppStore(useShallow((s) => ({
    projectFolder: s.projectFolder,
    activeProjectId: s.activeProjectId,
    activeThreadId: s.activeThreadId,
    activePanel: s.activePanel,
    permissionMode: s.permissionMode,
    workspaceViewMode: s.workspaceViewMode,
    sidebarCollapsed: s.sidebarCollapsed,
    setActivePanel: s.setActivePanel,
    toggleSidebar: s.toggleSidebar,
    emitCommandPaletteEvent: s.emitCommandPaletteEvent,
  })))
  const timeline = useChatStore((s) => s.timeline)
  const chatMode = useChatStore((s) => s.chatMode)
  const providerSwitchHint = useChatStore((s) => s.providerSwitchHint)
  const streamingId = useChatStore((s) => s.streamingId)
  const { tabs, activeTabId, serviceStateByTab } = useEditorStore(useShallow((s) => ({
    tabs: s.tabs,
    activeTabId: s.activeTab,
    serviceStateByTab: s.serviceStateByTab,
  })))

  const currentEditorTab = useMemo(
    () => (Array.isArray(tabs) ? tabs.find((tab) => tab.id === activeTabId) || null : null),
    [tabs, activeTabId],
  )

  const workspaceActive = isWorkspaceActive(workspaceViewMode, projectFolder)
  const hasActiveThread = !!activeThreadId
  const hasTimeline = Array.isArray(timeline) && timeline.length > 0
  const editorTabOpen = !!currentEditorTab
  const currentEditorServiceState = currentEditorTab ? (serviceStateByTab[currentEditorTab.id] ?? null) : null
  const currentEditorCapabilities = currentEditorServiceState?.capabilities || {}
  const editorFormatSupported = !!currentEditorCapabilities.formatting?.available
  const editorFixSupported = !!currentEditorCapabilities.codeActions?.available
  const editorMarkdownOpen = editorTabOpen && String(currentEditorTab.language || '').trim().toLowerCase() === 'markdown'
  const { openChatTerminal, terminalCommands } = useCommandPaletteTerminalActions({
    workspaceActive,
    activeThreadId,
    projectFolder,
    permissionMode,
    setActivePanel,
    emitCommandPaletteEvent,
  })

  const localizeCommandTitle = useCallback(
    (command) => {
      if (command.id === 'nav.sidebar.toggle') {
        const titleKey = sidebarCollapsed
          ? 'core:commandPalette.commands.nav.sidebar.toggle.expandTitle'
          : 'core:commandPalette.commands.nav.sidebar.toggle.collapseTitle'
        return t(titleKey, { defaultValue: command.title })
      }
      return t(`core:commandPalette.commands.${command.id}.title`, { defaultValue: command.title })
    },
    [sidebarCollapsed, t],
  )

  const localizeCommandCategory = useCallback(
    (category) => t(`core:commandPalette.categories.${normalizeCommandPaletteKey(category)}`, { defaultValue: category }),
    [t],
  )

  const localizeCommandReason = useCallback(
    (commandId, reason) => {
      const trimmedReason = String(reason || '').trim()
      if (!trimmedReason) return ''
      const normalizedReason = normalizeCommandPaletteKey(trimmedReason)
      const sharedFallback = t(`core:commandPalette.reasons.${normalizedReason}`, {
        defaultValue: trimmedReason,
      })
      return t(`core:commandPalette.commands.${commandId}.reasons.${normalizedReason}`, {
        defaultValue: sharedFallback,
      })
    },
    [t],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    setSelectedCategory(ALL_CATEGORY_FILTER)
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const emitPanelCommand = useCallback((targetPanel, type, payload = {}) => {
    if (targetPanel) setActivePanel(targetPanel)
    emitCommandPaletteEvent(type, payload)
  }, [emitCommandPaletteEvent, setActivePanel])

  const editorFormattingReason = buildEditorCapabilityActionTitle({
    capabilityKey: 'formatting',
    capability: currentEditorCapabilities.formatting,
    disabledFallbackTitle: 'Formatting is unavailable for the current file',
  }).replace(/^Format unavailable:\s*/i, '')
  const editorCodeActionsReason = buildEditorCapabilityActionTitle({
    capabilityKey: 'codeActions',
    capability: currentEditorCapabilities.codeActions,
    disabledFallbackTitle: 'Code actions are unavailable for the current file',
  }).replace(/^Fix unavailable:\s*/i, '')
  const commands = useMemo(() => {
    const defs = []
    const push = (def) => defs.push(def)

    push({
      id: 'nav.projectEntry',
      title: 'Open Projects',
      category: 'Navigation',
      aliases: ['projects', 'project switcher', 'workspace list', 'switch project', 'home'],
      getState: () => commandResult(true),
      run: () => onOpenWorkspaceRail?.(),
    })
    push({
      id: 'nav.chat',
      title: 'Go to Chat',
      category: 'Navigation',
      aliases: ['chat', 'open chat', 'panel chat'],
      getState: () => commandResult(workspaceActive, 'Open a project first'),
      run: () => setActivePanel('chat'),
    })
    push({
      id: 'nav.editor',
      title: 'Go to Editor',
      category: 'Navigation',
      aliases: ['editor', 'open editor', 'code'],
      getState: () => commandResult(workspaceActive, 'Open a project first'),
      run: () => setActivePanel('editor'),
    })
    push({
      id: 'nav.artifacts',
      title: 'Go to Artifacts',
      category: 'Navigation',
      aliases: ['artifacts', 'files', 'generated files'],
      getState: () => commandResult(workspaceActive, 'Open a project first'),
      run: () => setActivePanel('artifacts'),
    })
    push({
      id: 'nav.memory',
      title: 'Go to Memory',
      category: 'Navigation',
      aliases: ['memory', 'context memory'],
      getState: () => commandResult(workspaceActive, 'Open a project first'),
      run: () => setActivePanel('memory'),
    })
    push({
      id: 'chat.openTerminal',
      title: 'Open Terminal',
      category: 'Chat',
      aliases: ['terminal', 'shell', 'console', 'open terminal', 'live shell', 'chat terminal', 'terminal browser'],
      getState: () => commandResult(
        workspaceActive && hasActiveThread,
        !workspaceActive
          ? 'Open a project first'
          : 'Open/select a thread first',
      ),
      run: openChatTerminal,
    })
    terminalCommands.forEach(push)
    push({
      id: 'nav.settings',
      title: 'Go to Settings',
      category: 'Navigation',
      aliases: ['settings', 'preferences', 'config'],
      getState: () => commandResult(true),
      run: () => setActivePanel('settings'),
    })
    push({
      id: 'nav.openProjectFolder',
      title: 'Open Project Folder',
      category: 'Navigation',
      aliases: ['open folder', 'reveal project', 'workspace folder', 'project path'],
      getState: () => commandResult(!!projectFolder, 'Open a project first'),
      run: () => window.addom?.shell?.openPath?.(projectFolder),
    })
    push({
      id: 'nav.sidebar.toggle',
      title: sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar',
      category: 'Navigation',
      aliases: ['toggle sidebar', 'sidebar', 'expand sidebar', 'collapse sidebar'],
      getState: () => commandResult(true),
      run: () => toggleSidebar(),
    })

    push({
      id: 'chat.thread.new',
      title: 'New Thread',
      category: 'Chat',
      aliases: ['create thread', 'thread new'],
      getState: () => commandResult(!!activeProjectId, 'Open a project first'),
      run: () => emitPanelCommand('chat', 'chat.thread.new'),
    })
    push({
      id: 'chat.thread.rename',
      title: 'Rename Current Thread',
      category: 'Chat',
      aliases: ['rename thread', 'thread name'],
      getState: () => commandResult(hasActiveThread, 'No active thread'),
      run: () => emitPanelCommand('chat', 'chat.thread.rename'),
    })
    push({
      id: 'chat.thread.delete',
      title: 'Delete Current Thread',
      category: 'Chat',
      aliases: ['delete thread', 'remove thread'],
      getState: () => commandResult(hasActiveThread, 'No active thread'),
      run: () => emitPanelCommand('chat', 'chat.thread.delete'),
    })
    push({
      id: 'chat.focusComposer',
      title: 'Focus Chat Composer',
      category: 'Chat',
      aliases: ['focus input', 'chat input', 'type prompt'],
      getState: () => commandResult(hasActiveThread, 'Open/select a thread first'),
      run: () => emitPanelCommand('chat', 'chat.focusComposer'),
    })
    push({
      id: 'chat.jumpToLatest',
      title: 'Jump to Latest Message',
      category: 'Chat',
      aliases: ['latest message', 'bottom', 'scroll to bottom', 'jump latest'],
      getState: () => commandResult(hasActiveThread && hasTimeline, hasActiveThread ? 'Thread has no messages yet' : 'No active thread'),
      run: () => emitPanelCommand('chat', 'chat.jumpToLatest'),
    })
    push({
      id: 'chat.openThreadSelector',
      title: 'Open Thread Selector',
      category: 'Chat',
      aliases: ['thread selector', 'switch thread', 'thread list'],
      getState: () => commandResult(!!activeProjectId, 'Open a project first'),
      run: () => onOpenWorkspaceRail?.(),
    })
    push({
      id: 'chat.openBackgroundJobs',
      title: t('core:commandPalette.commands.chat.openBackgroundJobs.title', { defaultValue: 'Open Background Jobs' }),
      category: 'Chat',
      aliases: ['background jobs', 'jobs', 'running jobs'],
      getState: () => commandResult(!!activeProjectId, 'Open a project first'),
      run: () => emitPanelCommand('chat', 'chat.openBackgroundJobs'),
    })
    push({
      id: 'chat.openDirectAgents',
      title: 'Open Agents Menu',
      category: 'Chat',
      aliases: ['direct agents', 'agents menu', 'open agents', 'agent quick actions'],
      getState: () => commandResult(
        !!(chatMode === 'execute' && activeThreadId && !streamingId),
        !activeThreadId
          ? 'Open/select a thread first'
          : (chatMode !== 'execute'
            ? 'Agents are only available in Execute mode'
            : 'Wait for the current response to finish'),
      ),
      run: () => emitPanelCommand('chat', 'chat.openDirectAgents'),
    })
    push({
      id: 'chat.inject.memory',
      title: 'Inject Memory Into Chat',
      category: 'Chat',
      aliases: ['inject memory', 'memory context'],
      getState: () => commandResult(!!providerSwitchHint, 'Provider/model switch context banner is not active'),
      run: () => emitPanelCommand('chat', 'chat.inject.memory'),
    })
    push({
      id: 'chat.inject.artifacts',
      title: 'Inject Artifacts Into Chat',
      category: 'Chat',
      aliases: ['inject artifacts', 'artifact context', 'inject files'],
      getState: () => commandResult(!!providerSwitchHint, 'Provider/model switch context banner is not active'),
      run: () => emitPanelCommand('chat', 'chat.inject.artifacts'),
    })
    push({
      id: 'chat.inject.both',
      title: 'Inject Memory + Artifacts',
      category: 'Chat',
      aliases: ['inject both', 'inject context', 'bootstrap context'],
      getState: () => commandResult(!!providerSwitchHint, 'Provider/model switch context banner is not active'),
      run: () => emitPanelCommand('chat', 'chat.inject.both'),
    })

    push({
      id: 'editor.formatDocument',
      title: 'Format Document',
      category: 'Editor',
      aliases: ['format', 'project format', 'pretty'],
      getState: () => commandResult(
        activePanel === 'editor' && editorFormatSupported,
        activePanel !== 'editor' || !editorTabOpen
          ? 'Open a file in Editor first'
          : (editorFormattingReason || 'Formatting is unavailable for the current file'),
      ),
      run: () => emitPanelCommand('editor', 'editor.formatDocument'),
    })
    push({
      id: 'editor.fixAutofixable',
      title: 'Fix Auto-fixable Issues',
      category: 'Editor',
      aliases: ['fix lint', 'autofix', 'project fixes'],
      getState: () => commandResult(
        activePanel === 'editor' && editorFixSupported,
        activePanel !== 'editor' || !editorTabOpen
          ? 'Open a file in Editor first'
          : (editorCodeActionsReason || 'Code actions are unavailable for the current file'),
      ),
      run: () => emitPanelCommand('editor', 'editor.fixAutofixable'),
    })
    push({
      id: 'editor.toggleProblemsPanel',
      title: 'Toggle Problems Panel',
      category: 'Editor',
      aliases: ['problems', 'diagnostics', 'errors panel'],
      getState: () => commandResult(activePanel === 'editor' && editorTabOpen, 'Open a file in Editor first'),
      run: () => emitPanelCommand('editor', 'editor.toggleProblemsPanel'),
    })
    push({
      id: 'editor.toggleOutlinePanel',
      title: 'Toggle Outline Panel',
      category: 'Editor',
      aliases: ['outline', 'symbols', 'symbol tree'],
      getState: () => commandResult(activePanel === 'editor' && editorTabOpen, 'Open a file in Editor first'),
      run: () => emitPanelCommand('editor', 'editor.toggleOutlinePanel'),
    })
    push({
      id: 'editor.markdownPreview.toggle',
      title: 'Markdown: Toggle Preview',
      category: 'Editor',
      aliases: ['markdown preview', 'toggle markdown', 'preview markdown'],
      getState: () => commandResult(activePanel === 'editor' && editorMarkdownOpen, 'Open a Markdown file in Editor first'),
      run: () => emitPanelCommand('editor', 'editor.markdownPreview.toggle'),
    })
    push({
      id: 'editor.markdownPreview.open',
      title: 'Markdown: Open Preview to Side',
      category: 'Editor',
      aliases: ['open markdown preview', 'preview to side', 'markdown side preview'],
      getState: () => commandResult(activePanel === 'editor' && editorMarkdownOpen, 'Open a Markdown file in Editor first'),
      run: () => emitPanelCommand('editor', 'editor.markdownPreview.open'),
    })
    push({
      id: 'editor.aiSelection.explain',
      title: 'AI on Selection: Explain',
      category: 'Editor',
      aliases: ['explain selection', 'ai explain', 'selection explain'],
      getState: () => commandResult(activePanel === 'editor' && editorTabOpen, 'Open the Editor and select code first'),
      run: () => emitPanelCommand('editor', 'editor.aiSelection.explain'),
    })
    push({
      id: 'editor.aiSelection.fix',
      title: 'AI on Selection: Fix',
      category: 'Editor',
      aliases: ['fix selection', 'ai fix selection', 'selection bugfix'],
      getState: () => commandResult(activePanel === 'editor' && editorTabOpen, 'Open the Editor and select code first'),
      run: () => emitPanelCommand('editor', 'editor.aiSelection.fix'),
    })
    push({
      id: 'editor.aiSelection.refactor',
      title: 'AI on Selection: Refactor',
      category: 'Editor',
      aliases: ['refactor selection', 'ai refactor'],
      getState: () => commandResult(activePanel === 'editor' && editorTabOpen, 'Open the Editor and select code first'),
      run: () => emitPanelCommand('editor', 'editor.aiSelection.refactor'),
    })
    push({
      id: 'editor.aiSelection.tests',
      title: 'AI on Selection: Generate Tests',
      category: 'Editor',
      aliases: ['tests selection', 'write tests', 'generate tests'],
      getState: () => commandResult(activePanel === 'editor' && editorTabOpen, 'Open the Editor and select code first'),
      run: () => emitPanelCommand('editor', 'editor.aiSelection.tests'),
    })

    push({
      id: 'memory.exportProjectJson',
      title: 'Export Project Context JSON',
      category: 'Memory',
      aliases: ['export context', 'export memory', 'backup context', 'json export'],
      getState: () => commandResult(!!projectFolder, 'Open a project first'),
      run: async () => {
        const result = await window.addom.memory.exportProjectJson(projectFolder)
        if (result?.cancelled) return
        if (!result?.ok) {
          await requestAppAlert({
            title: t('core:commandPalette.commands.memory.exportProjectJson.alerts.failedTitle', {
              defaultValue: 'Export failed',
            }),
            message: t('core:commandPalette.commands.memory.exportProjectJson.alerts.failedMessage', {
              defaultValue: 'Failed to export context JSON: {{error}}',
              error: String(result?.error || 'Export failed'),
            }),
          })
          return
        }
        await requestAppAlert({
          title: t('core:commandPalette.commands.memory.exportProjectJson.alerts.completedTitle', {
            defaultValue: 'Export complete',
          }),
          message: t('core:commandPalette.commands.memory.exportProjectJson.alerts.completedMessage', {
            defaultValue: 'Exported context JSON.\n\nFile: {{filePath}}\nMemory nodes: {{memoryNodeCount}}\nArtifact files: {{artifactFileCount}}\nArtifact revisions: {{artifactRevisionCount}}',
            filePath: result.filePath,
            memoryNodeCount: Number(result.memoryNodeCount || 0),
            artifactFileCount: Number(result.artifactFileCount || 0),
            artifactRevisionCount: Number(result.artifactRevisionCount || 0),
          }),
        })
      },
    })
    push({
      id: 'memory.openPanel',
      title: 'Open Memory Panel',
      category: 'Memory',
      aliases: ['memory panel', 'open memory'],
      getState: () => commandResult(workspaceActive, 'Open a project first'),
      run: () => setActivePanel('memory'),
    })

    return defs
  }, [
    workspaceActive,
    activeProjectId,
    activeThreadId,
    activePanel,
    chatMode,
    editorFixSupported,
    editorFormatSupported,
    editorCodeActionsReason,
    editorFormattingReason,
    editorMarkdownOpen,
    editorTabOpen,
    emitPanelCommand,
    hasActiveThread,
    hasTimeline,
    onOpenWorkspaceRail,
    openChatTerminal,
    projectFolder,
    providerSwitchHint,
    sidebarCollapsed,
    streamingId,
    setActivePanel,
    t,
    terminalCommands,
    toggleSidebar,
  ])

  const recentIndexMap = useMemo(() => {
    const map = new Map()
    recentCommandIds.forEach((id, index) => {
      if (!map.has(id)) map.set(id, index)
    })
    return map
  }, [recentCommandIds])

  const localizedCommands = useMemo(
    () => commands.map((command) => ({
      ...command,
      title: localizeCommandTitle(command),
      category: localizeCommandCategory(command.category),
    })),
    [commands, localizeCommandCategory, localizeCommandTitle],
  )

  const items = useMemo(() => {
    return localizedCommands
      .map((command) => {
        const state = typeof command.getState === 'function' ? command.getState() : commandResult(true)
        const score = scoreCommand(command, query, recentIndexMap)
        return {
          ...command,
          visible: state.visible !== false,
          enabled: !!state.enabled,
          disabledReason: localizeCommandReason(command.id, state.reason),
          _score: score,
          _recent: recentIndexMap.has(command.id),
          _recentIndex: recentIndexMap.get(command.id) ?? Number.POSITIVE_INFINITY,
        }
      })
      .filter((item) => item.visible && item._score >= 0)
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score
        if (a._recent !== b._recent) return a._recent ? -1 : 1
        if (a._recent && b._recent && a._recentIndex !== b._recentIndex) return a._recentIndex - b._recentIndex
        return a.title.localeCompare(b.title)
      })
      .slice(0, 40)
  }, [localizedCommands, localizeCommandReason, query, recentIndexMap])

  const categoryFilters = useMemo(() => {
    const categories = Array.from(new Set(
      localizedCommands
        .map((command) => String(command.category || '').trim())
        .filter(Boolean),
    ))

    return [
      { id: ALL_CATEGORY_FILTER, label: t('core:commandPalette.filters.all', { defaultValue: 'All' }) },
      ...(recentCommandIds.length > 0 ? [{ id: RECENT_CATEGORY_FILTER, label: t('core:commandPalette.filters.recent', { defaultValue: 'Recent' }) }] : []),
      ...categories.map((category) => ({
        id: category.toLowerCase(),
        label: category,
      })),
    ]
  }, [localizedCommands, recentCommandIds.length, t])

  const filteredItems = useMemo(() => {
    if (selectedCategory === ALL_CATEGORY_FILTER) return items
    if (selectedCategory === RECENT_CATEGORY_FILTER) {
      return items.filter((item) => item._recent)
    }
    return items.filter((item) => String(item.category || '').trim().toLowerCase() === selectedCategory)
  }, [items, selectedCategory])

  useEffect(() => {
    if (!open) return
    if (filteredItems.length === 0) {
      setSelectedIndex(0)
      return
    }
    setSelectedIndex((prev) => {
      const clamped = Math.max(0, Math.min(prev, filteredItems.length - 1))
      return clamped
    })
  }, [filteredItems, open])

  useEffect(() => {
    if (!open) return
    const listEl = listRef.current
    if (!listEl) return
    const node = listEl.querySelector(`[data-cmd-item-index="${selectedIndex}"]`)
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, open])

  const executeCommand = async (item) => {
    if (!item || !item.enabled) return
    try {
      const result = await item.run?.()
      if (result !== false) {
        const nextRecent = [item.id, ...recentCommandIds.filter((id) => id !== item.id)].slice(0, MAX_RECENT_COMMANDS)
        setRecentCommandIds(nextRecent)
        writeRecentCommands(nextRecent)
      }
    } finally {
      onClose?.()
    }
  }

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 ${DIALOG_Z_IMMERSIVE} bg-black/35 px-4 py-10 backdrop-blur-[1px]`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
      data-ui="command-palette-backdrop"
    >
      <div
        className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-border-strong bg-surface-raised text-text-primary shadow-[0_18px_46px_rgb(var(--theme-shadow-rgb)_/_0.34)]"
        role="dialog"
        aria-modal="true"
        aria-label={t('core:commandPalette.title', { defaultValue: 'Command palette' })}
        data-ui="command-palette"
      >
        <div className="border-b border-surface-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Icon name="magnifying-glass" className="shrink-0 text-[14px] text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredItems.length - 1)))
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setSelectedIndex((prev) => Math.max(prev - 1, 0))
                  return
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  const item = filteredItems[selectedIndex]
                  if (item?.enabled) void executeCommand(item)
                }
              }}
              placeholder={t('core:commandPalette.searchPlaceholder', { defaultValue: 'Type a command or search...' })}
              className="h-8 flex-1 appearance-none rounded-md border border-surface-border/70 bg-surface/35 px-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-border-hover focus:bg-surface-panel/45"
              aria-label={t('core:commandPalette.searchAriaLabel', { defaultValue: 'Search commands' })}
              aria-activedescendant={filteredItems[selectedIndex] ? `command-palette-item-${filteredItems[selectedIndex].id}` : undefined}
              aria-controls="command-palette-results"
              data-ui="command-palette-search"
            />
            <div className="shrink-0 rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-text-tertiary">
              Ctrl+Shift+P
            </div>
          </div>
          <div
            className="mt-1 flex gap-1 overflow-x-auto"
            aria-label={t('core:commandPalette.categories.ariaLabel', { defaultValue: 'Command categories' })}
            data-ui="command-palette-category-filters"
          >
            {categoryFilters.map((filter) => {
              const selected = filter.id === selectedCategory
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(filter.id)
                    setSelectedIndex(0)
                  }}
                  className={[
                    'shrink-0 rounded-md border px-2 py-0.5 text-[10px] leading-5 transition-colors',
                    selected
                      ? 'border-border-hover bg-surface-panel-alt text-text-primary'
                      : 'border-transparent text-text-muted hover:bg-surface-panel hover:text-text-secondary',
                  ].join(' ')}
                  aria-pressed={selected}
                  title={t('core:commandPalette.filters.filterByCategory', {
                    defaultValue: 'Filter commands by {{label}}',
                    label: filter.label,
                  })}
                  data-ui="command-palette-category-filter"
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>

        <div
          ref={listRef}
          id="command-palette-results"
          className="max-h-[58vh] overflow-y-auto p-1.5"
          role="listbox"
          aria-label={t('core:commandPalette.results.commands', { defaultValue: 'Commands' })}
        >
          {filteredItems.length === 0 ? (
            <div className="px-3 py-7 text-center">
              <p className="text-[13px] text-text-secondary">{t('core:commandPalette.empty.title', { defaultValue: 'No commands match your search.' })}</p>
              <p className="mt-1 text-[11px] text-text-muted">{t('core:commandPalette.empty.description', { defaultValue: 'Try a different keyword or alias.' })}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredItems.map((item, index) => {
                const selected = index === selectedIndex
                const recentLabel = t('core:commandPalette.filters.recent', { defaultValue: 'Recent' })
                const metadata = [
                  !item.enabled && item.disabledReason ? item.disabledReason : '',
                  item.enabled ? item.category : '',
                  query.trim().length === 0 && item._recent ? recentLabel : '',
                ].filter(Boolean).join(' / ')
                const title = metadata ? `${item.title} - ${metadata}` : item.title
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`command-palette-item-${item.id}`}
                    data-cmd-item-index={index}
                    data-ui="command-palette-item"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      if (item.enabled) void executeCommand(item)
                    }}
                    className={[
                      'group flex min-h-8 w-full items-center gap-3 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                      selected
                        ? 'border-border-hover bg-surface-panel'
                        : 'border-transparent bg-transparent hover:bg-surface-panel/70',
                      item.enabled ? '' : 'text-text-muted',
                    ].join(' ')}
                    aria-disabled={!item.enabled}
                    aria-selected={selected}
                    aria-label={title}
                    role="option"
                    title={title}
                  >
                    <span className={`min-w-0 flex-1 truncate text-[12px] font-medium ${item.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
                      {item.title}
                    </span>
                    {metadata && (
                      <span
                        className={[
                          'min-w-0 max-w-0 overflow-hidden truncate whitespace-nowrap text-[10px] text-text-tertiary opacity-0 transition-opacity',
                          'group-hover:w-auto group-hover:max-w-[45%] group-hover:opacity-100 group-focus-visible:w-auto group-focus-visible:max-w-[45%] group-focus-visible:opacity-100',
                        ].join(' ')}
                        aria-hidden="true"
                        data-ui="command-palette-item-detail"
                      >
                        {metadata}
                      </span>
                    )}
                    <span className={`shrink-0 text-[10px] ${selected && item.enabled ? 'text-text-muted' : 'text-transparent'}`}>
                      {item.enabled ? t('core:commandPalette.hint.enter', { defaultValue: 'Enter' }) : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
