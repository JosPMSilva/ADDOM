import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import Icon from '../ui/Icon.jsx'
import { getRoleTemplateInstallState } from './moa-role-editor.mjs'

const CATEGORY_LABELS = {
  all: 'All',
  security: 'Security',
  frontend: 'Frontend',
  backend: 'Backend',
  quality: 'Quality',
  engineering: 'Engineering',
  devops: 'DevOps',
  testing: 'Testing',
  content: 'Content',
  web: 'Web',
  performance: 'Performance',
  desktop: 'Desktop',
  general: 'General',
}

const CATEGORY_ICON_NAMES = {
  all: 'squares-four',
  security: 'shield-check',
  frontend: 'palette',
  backend: 'gear-six',
  quality: 'seal-check',
  engineering: 'wrench',
  devops: 'rocket-launch',
  testing: 'test-tube',
  content: 'note-pencil',
  web: 'globe-hemisphere-west',
  performance: 'lightning',
  desktop: 'desktop',
  general: 'archive-box',
}

function getCategoryLabel(category, t) {
  return t(`settings:blocks.moaAgents.templateGallery.categories.${category}`, {
    defaultValue: CATEGORY_LABELS[category] || category,
  })
}

function CategoryIcon({ category, className = 'text-[11px]', size = 14 }) {
  return (
    <Icon
      name={CATEGORY_ICON_NAMES[category] || CATEGORY_ICON_NAMES.general}
      className={className}
      size={size}
    />
  )
}

export default function MoaTemplateGallery({ roleTemplates, onUseTemplate, existingRoles = [] }) {
  const t = useSettingsTranslator(['settings'])
  const [skills, setSkills] = useState([])
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [useSkillsApi, setUseSkillsApi] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSkills() {
      try {
        if (!window.addom?.skills?.list) {
          setUseSkillsApi(false)
          setLoading(false)
          return
        }
        const [skillsResult, catsResult] = await Promise.all([
          window.addom.skills.list(),
          window.addom.skills.categories(),
        ])
        if (cancelled) return
        if (skillsResult?.ok && Array.isArray(skillsResult.skills)) {
          setSkills(skillsResult.skills)
          setUseSkillsApi(true)
        }
        if (catsResult?.ok && Array.isArray(catsResult.categories)) {
          setCategories(catsResult.categories)
        }
      } catch {
        setUseSkillsApi(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadSkills()
    return () => { cancelled = true }
  }, [])

  const displayItems = useMemo(() => {
    const source = useSkillsApi ? skills : (Array.isArray(roleTemplates) ? roleTemplates : [])
    if (!source.length) return []

    let filtered = source
    if (activeCategory !== 'all' && useSkillsApi) {
      filtered = filtered.filter((s) => s.category === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter((s) => {
        const searchable = [
          s.label || '',
          s.description || '',
          s.defaultName || '',
          ...(s.tags || []),
          ...(s.recommendedUseCases || []),
        ].join(' ').toLowerCase()
        return searchable.includes(q)
      })
    }
    return filtered
  }, [useSkillsApi, skills, roleTemplates, activeCategory, searchQuery])

  const handleUse = useCallback((item, existingRole = null) => {
    if (typeof onUseTemplate === 'function') {
      onUseTemplate(item, existingRole)
    }
  }, [onUseTemplate])

  if (loading) {
    return (
      <div className="py-4">
        <p className="text-xs text-text-tertiary animate-pulse">{t('settings:blocks.moaAgents.templateGallery.loading', { defaultValue: 'Loading skill catalog...' })}</p>
      </div>
    )
  }

  const allItems = useSkillsApi ? skills : (Array.isArray(roleTemplates) ? roleTemplates : [])
  if (!allItems.length) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-text-primary">
            {t('settings:blocks.moaAgents.templateGallery.title', { defaultValue: 'Skill Catalog' })}
          </p>
          <span className="text-[10px] text-text-tertiary">
            {t('settings:blocks.moaAgents.templateGallery.skillCount', { defaultValue: '{{count}} skills', count: allItems.length })}
          </span>
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('settings:blocks.moaAgents.templateGallery.searchPlaceholder', { defaultValue: 'Search skills...' })}
          className="w-full text-xs bg-surface-panel border border-surface-border rounded px-3 py-1.5 text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent/50 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-text-tertiary hover:text-text-muted"
            aria-label={t('settings:blocks.moaAgents.templateGallery.clearSearch', { defaultValue: 'Clear skill search' })}
            title={t('settings:blocks.moaAgents.templateGallery.clearSearch', { defaultValue: 'Clear skill search' })}
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </div>

      {useSkillsApi && categories.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`border-b px-1 py-1 text-[10px] transition-colors ${activeCategory === 'all'
              ? 'border-text-secondary text-text-primary'
              : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
          >
            <span className="inline-flex items-center gap-1">
              <CategoryIcon category="all" className="text-[10px]" size={10} />
              <span>{getCategoryLabel('all', t)}</span>
            </span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? 'all' : cat)}
              className={`border-b px-1 py-1 text-[10px] transition-colors ${activeCategory === cat
                ? 'border-text-secondary text-text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-primary'
                }`}
            >
              <span className="inline-flex items-center gap-1">
                <CategoryIcon category={cat} className="text-[10px]" size={10} />
                <span>{getCategoryLabel(cat, t)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {searchQuery && (
        <p className="text-[10px] text-text-tertiary">
          {t('settings:blocks.moaAgents.templateGallery.searchResults', {
            defaultValue: '{{count}} result{{suffix}} for "{{query}}"{{categorySuffix}}',
            count: displayItems.length,
            suffix: displayItems.length !== 1 ? 's' : '',
            query: searchQuery,
            categorySuffix: activeCategory !== 'all'
              ? ` ${t('settings:blocks.moaAgents.templateGallery.inCategory', {
                defaultValue: 'in {{category}}',
                category: getCategoryLabel(activeCategory, t),
              })}`
              : '',
          })}
        </p>
      )}

      <div className="divide-y divide-surface-border/55 border-y border-surface-border/55">
        {displayItems.length === 0 && (
          <p className="text-[10px] text-text-tertiary py-2 text-center">
            {t('settings:blocks.moaAgents.templateGallery.emptySearch', { defaultValue: 'No skills match your search.' })}
          </p>
        )}
        {displayItems.map((item) => {
          const installState = getRoleTemplateInstallState(item, existingRoles)
          const isAdded = installState.state === 'added'
          const hasUpdate = installState.state === 'update_available'
          return (
            <div
              key={item.id}
              className="group py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {item.category && (
                      <span className="inline-flex h-4 w-4 items-center justify-center text-accent-soft">
                        <CategoryIcon category={item.category} className="text-[11px]" size={11} />
                      </span>
                    )}
                    <p className="text-xs text-text-primary font-medium truncate">{item.label}</p>
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-2">{item.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {item.category && (
                      <span className="inline-flex items-center gap-1 text-[9px] text-text-tertiary bg-surface px-1.5 py-0.5 rounded">
                        <CategoryIcon category={item.category} className="text-[9px]" size={9} />
                        <span>{getCategoryLabel(item.category, t)}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[9px] text-text-tertiary">
                      <Icon name="eye" size={10} />
                      <span>{t('settings:blocks.moaAgents.templateGallery.readOnly', { defaultValue: 'Read-only' })}</span>
                    </span>
                    {item.source && item.source !== 'addom/built-in' && item.source !== 'addom/built-in-template' && (
                      <span className="inline-flex items-center gap-1 text-[9px] text-text-tertiary">
                        <Icon name="folder-notch-open" size={10} />
                        <span>{item.source}</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleUse(item, installState.role)}
                  disabled={isAdded}
                  className={[
                    'text-[10px] px-2.5 py-1 rounded border transition-colors shrink-0',
                    isAdded
                      ? 'border-transparent bg-transparent text-text-muted cursor-default'
                      : 'border-surface-border bg-transparent text-text-secondary hover:border-border-hover hover:text-text-primary',
                  ].join(' ')}
                >
                  <span className="inline-flex items-center gap-1">
                    <Icon name={isAdded ? 'check' : hasUpdate ? 'arrow-clockwise' : 'plus'} size={10} />
                    <span>{isAdded
                      ? t('settings:blocks.moaAgents.templateGallery.added', { defaultValue: 'Added' })
                      : hasUpdate
                        ? t('settings:blocks.moaAgents.templateGallery.update', { defaultValue: 'Update' })
                      : t('settings:blocks.moaAgents.templateGallery.use', { defaultValue: 'Use' })}</span>
                  </span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
