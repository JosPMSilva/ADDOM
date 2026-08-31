import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useEditorStore from '../../store/useEditorStore.js'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'
import {
  flattenVisibleTree,
  resolveFileTreeKeyboardNavigation,
} from './editor-file-tree-helpers.mjs'

export function FileTree({
  tree,
  loading,
  projectFolder,
  onOpenFile,
  activeFilePath,
  onRefresh,
  onOpenProjectFolder,
  width = 220,
}) {
  const { t } = useRendererTranslation(['core'])
  const { expandedDirs, toggleDir } = useEditorStore()
  const projectName = projectFolder?.split(/[\\/]/).pop()
    ?? t('core:editor.fileTree.projectFallback', { defaultValue: 'Project' })
  const visibleNodes = useMemo(() => flattenVisibleTree(tree, expandedDirs), [expandedDirs, tree])
  const showInitialLoading = loading && tree.length === 0
  const showRefreshing = loading && tree.length > 0
  const [focusedItemPath, setFocusedItemPath] = useState('')
  const treeItemRefs = useRef(new Map())
  const pendingFocusPathRef = useRef('')

  useEffect(() => {
    if (visibleNodes.length === 0) {
      pendingFocusPathRef.current = ''
      if (focusedItemPath) setFocusedItemPath('')
      return
    }

    const hasFocusedPath = focusedItemPath && visibleNodes.some((node) => node.path === focusedItemPath)
    const hasActivePath = activeFilePath && visibleNodes.some((node) => node.path === activeFilePath)
    const nextPath = hasActivePath
      ? activeFilePath
      : hasFocusedPath
        ? focusedItemPath
        : visibleNodes[0].path

    if (nextPath && nextPath !== focusedItemPath) {
      setFocusedItemPath(nextPath)
    }
  }, [activeFilePath, focusedItemPath, visibleNodes])

  useEffect(() => {
    const pendingPath = String(pendingFocusPathRef.current || '').trim()
    if (!pendingPath) return
    const node = treeItemRefs.current.get(pendingPath)
    if (!node) return
    node.focus()
    pendingFocusPathRef.current = ''
  }, [focusedItemPath, visibleNodes])

  const registerTreeItemRef = useCallback((itemPath, node) => {
    const normalizedPath = String(itemPath || '').trim()
    if (!normalizedPath) return
    if (node) {
      treeItemRefs.current.set(normalizedPath, node)
      return
    }
    treeItemRefs.current.delete(normalizedPath)
  }, [])

  const focusTreeItem = useCallback((itemPath) => {
    const normalizedPath = String(itemPath || '').trim()
    if (!normalizedPath) return
    pendingFocusPathRef.current = normalizedPath
    setFocusedItemPath(normalizedPath)
    const node = treeItemRefs.current.get(normalizedPath)
    if (node) {
      node.focus()
      pendingFocusPathRef.current = ''
    }
  }, [])

  const handleTreeItemKeyDown = useCallback((event, itemPath) => {
    const result = resolveFileTreeKeyboardNavigation({
      tree,
      expandedDirs,
      focusedPath: itemPath,
      key: event.key,
    })
    if (!result) return

    event.preventDefault()

    if (result.action?.type === 'toggleDir') {
      toggleDir(result.action.path)
    } else if (result.action?.type === 'openFile') {
      onOpenFile?.(result.action.path)
    }

    if (result.focusPath) {
      focusTreeItem(result.focusPath)
    }
  }, [expandedDirs, focusTreeItem, onOpenFile, toggleDir, tree])

  return (
    <div style={{ width }} className="shrink-0 min-h-0 h-full flex flex-col bg-surface-panel-alt overflow-hidden">
      <div className="flex h-[38px] items-center justify-between border-b border-surface-border px-3 shrink-0">
        <span className="text-[11px] font-semibold font-display tracking-widest text-text-tertiary uppercase truncate mr-2">
          {projectName}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {showRefreshing && (
            <span className="text-[10px] font-mono text-text-muted animate-pulse">
              {t('core:editor.fileTree.syncing', { defaultValue: 'Syncing' })}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenProjectFolder}
            aria-label={t('core:editor.fileTree.openProjectFolder', { defaultValue: 'Open project folder' })}
            title={t('core:editor.fileTree.openProjectFolder', { defaultValue: 'Open project folder' })}
            className="text-text-muted hover:text-text-primary transition-colors shrink-0"
          >
            <Icon name="folder-open" className="text-[14px]" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            aria-label={t('core:editor.fileTree.refresh', { defaultValue: 'Refresh file tree' })}
            title={t('core:editor.fileTree.refresh', { defaultValue: 'Refresh file tree' })}
            className="text-text-muted hover:text-text-primary transition-colors shrink-0"
          >
            <Icon name="arrows-clockwise" className={`text-[14px] ${showRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div
        role="tree"
        aria-label={t('core:editor.fileTree.ariaLabel', {
          defaultValue: '{{projectName}} files',
          projectName,
        })}
        aria-busy={loading}
        className="file-tree-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1"
      >
        <div className="min-w-0 pr-2 pb-2">
          {showInitialLoading && (
            <p role="status" className="text-text-muted text-xs px-4 py-2">
              {t('core:editor.fileTree.loading', { defaultValue: 'Loading...' })}
            </p>
          )}
          {!loading && tree.length === 0 && (
            <p className="text-text-muted text-xs px-4 py-2">
              {t('core:editor.fileTree.emptyProject', { defaultValue: 'Empty project.' })}
            </p>
          )}
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
              onOpenFile={onOpenFile}
              activeFilePath={activeFilePath}
              focusedItemPath={focusedItemPath}
              onItemFocus={setFocusedItemPath}
              onItemKeyDown={handleTreeItemKeyDown}
              registerTreeItemRef={registerTreeItemRef}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  expandedDirs,
  toggleDir,
  onOpenFile,
  activeFilePath,
  focusedItemPath,
  onItemFocus,
  onItemKeyDown,
  registerTreeItemRef,
}) {
  const { t } = useRendererTranslation(['core'])
  const indent = depth * 12 + 8

  if (node.type === 'dir') {
    const open = expandedDirs.has(node.path)
    return (
      <>
        <button
          ref={(element) => registerTreeItemRef(node.path, element)}
          type="button"
          onClick={() => toggleDir(node.path)}
          onFocus={() => onItemFocus?.(node.path)}
          onKeyDown={(event) => onItemKeyDown?.(event, node.path)}
          role="treeitem"
          aria-expanded={open}
          tabIndex={focusedItemPath === node.path ? 0 : -1}
          className="group flex items-center gap-1.5 w-full min-w-0 text-left py-1 pr-2 text-text-muted hover:text-text-primary hover:bg-surface-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/80 transition-colors text-xs"
          style={{ paddingLeft: indent }}
        >
          <Icon
            name="caret-right"
            weight="bold"
            className={`text-[12px] opacity-60 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <Icon
            name={open ? 'folder-open' : 'folder'}
            weight={open ? 'fill' : 'regular'}
            className={`text-[14px] ${open ? 'text-accent' : 'text-text-secondary group-hover:text-text-primary'}`}
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </button>
        {open && (
          <div role="group">
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                toggleDir={toggleDir}
                onOpenFile={onOpenFile}
                activeFilePath={activeFilePath}
                focusedItemPath={focusedItemPath}
                onItemFocus={onItemFocus}
                onItemKeyDown={onItemKeyDown}
                registerTreeItemRef={registerTreeItemRef}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  const active = activeFilePath === node.path
  return (
    <button
      ref={(element) => registerTreeItemRef(node.path, element)}
      type="button"
      onClick={() => { if (node.isText) onOpenFile(node.path) }}
      onFocus={() => onItemFocus?.(node.path)}
      onKeyDown={(event) => onItemKeyDown?.(event, node.path)}
      role="treeitem"
      aria-selected={active}
      aria-disabled={!node.isText}
      tabIndex={focusedItemPath === node.path ? 0 : -1}
      title={node.isText
        ? node.path
        : t('core:editor.fileTree.binaryTitle', {
          defaultValue: '{{path}} (cannot open binary file)',
          path: node.path,
        })}
      className={[
        'flex items-center gap-1.5 w-full min-w-0 text-left py-1 pr-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/80',
        active
          ? 'bg-accent/10 border-l-2 border-accent text-accent'
          : node.isText
            ? 'text-text-secondary hover:text-text-primary hover:bg-surface-border'
            : 'text-text-muted cursor-default',
      ].join(' ')}
      style={{ paddingLeft: indent + 16 }}
    >
      <FileIcon ext={node.ext} active={active} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{node.name}</span>
    </button>
  )
}

export function EmptyEditor() {
  const { t } = useRendererTranslation(['core'])
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-text-muted select-none bg-surface-panel-alt">
      <Icon name="files" weight="light" className="text-[64px] mb-4 text-surface-border" />
      <p className="text-sm font-medium font-display tracking-tight text-text-secondary">
        {t('core:editor.emptyState.title', { defaultValue: 'Select a file from the tree to open it' })}
      </p>
      <p className="text-xs mt-1.5 opacity-60">
        {t('core:editor.emptyState.shortcutHint', { defaultValue: 'Ctrl+S to save | click x to close tab' })}
      </p>
    </div>
  )
}

export function LoadingPane() {
  const { t } = useRendererTranslation(['core'])
  return (
    <div className="flex-1 flex items-center justify-center bg-surface-panel-alt">
      <p className="text-text-muted text-xs animate-pulse">
        {t('core:editor.loadingPane', { defaultValue: 'Loading...' })}
      </p>
    </div>
  )
}

export function ErrorPane({ message }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-surface-panel-alt">
      <p className="text-danger-soft text-xs font-mono">{message}</p>
    </div>
  )
}

function FileIcon({ ext, active }) {
  const color = FILE_COLORS[ext] ?? (active ? 'inherit' : 'var(--color-text-muted)')
  let iconName = 'file-text'

  if (['js', 'jsx', 'mjs'].includes(ext)) {
    iconName = 'file-js'
  } else if (['ts', 'tsx'].includes(ext)) {
    iconName = 'file-ts'
  } else if (ext === 'css') {
    iconName = 'file-css'
  } else if (['html', 'htm'].includes(ext)) {
    iconName = 'file-html'
  } else if (ext === 'sql') {
    iconName = 'file-sql'
  } else if (ext === 'vue') {
    iconName = 'file-vue'
  } else if (['rs', 'py', 'go', 'rb', 'java', 'cs', 'php', 'c', 'cpp', 'swift', 'kt'].includes(ext)) {
    iconName = 'file-code'
  } else if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) {
    iconName = 'file-dashed'
  } else if (['scss', 'less', 'svg'].includes(ext)) {
    iconName = 'paint-brush'
  } else if (['sh', 'bash', 'ps1', 'bat'].includes(ext)) {
    iconName = 'terminal-window'
  } else if (['md', 'txt', 'csv', 'log'].includes(ext)) {
    iconName = 'article'
  } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext)) {
    iconName = 'image'
  }

  return <Icon name={iconName} weight={active ? 'fill' : 'regular'} style={{ color: active ? 'inherit' : color }} className="text-[14px] shrink-0" />
}

const FILE_COLORS = {
  js: '#fbbf24', jsx: '#fbbf24', mjs: '#fbbf24',
  ts: 'var(--color-accent-soft)', tsx: 'var(--color-accent-soft)',
  py: '#34d399',
  rb: '#f87171', go: 'var(--color-accent-soft)', rs: '#f97316',
  java: '#f97316', cs: '#a78bfa', php: '#a78bfa',
  html: '#f87171', css: 'var(--color-accent-soft)', scss: '#f472b6', less: 'var(--color-accent-soft)',
  json: '#fbbf24', yaml: '#34d399', yml: '#34d399', toml: '#fbbf24',
  md: 'var(--color-text-secondary)', txt: 'var(--color-text-muted)',
  sh: '#34d399', bash: '#34d399', ps1: 'var(--color-accent-soft)',
  sql: '#f97316', graphql: '#f472b6',
  svg: '#f472b6', xml: 'var(--color-accent-soft)',
}
