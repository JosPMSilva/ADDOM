/**
 * DispatchConfirmationCard.jsx
 *
 * Shows the AI-decomposed sub-tasks before dispatching them to agents.
 * Users can review, remove tasks, or confirm execution.
 */

import React, { useState, useCallback } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import Icon from '../ui/Icon.jsx'
import PromptSurface from '../ui/PromptSurface.jsx'

export default function DispatchConfirmationCard({
    tasks = [],
    summary = '',
    onExecute,
    onDismiss,
}) {
    const { t } = useRendererTranslation(['core'])
    const [selectedTasks, setSelectedTasks] = useState(
        () => new Set(tasks.map((_, i) => i))
    )
    const [executing, setExecuting] = useState(false)
    const [result, setResult] = useState(null)

    const toggleTask = useCallback((index) => {
        setSelectedTasks((prev) => {
            const next = new Set(prev)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }, [])

    const handleExecute = useCallback(async () => {
        if (executing || selectedTasks.size === 0) return
        setExecuting(true)
        try {
            const selectedItems = tasks.filter((_, i) => selectedTasks.has(i))
            const res = await onExecute(selectedItems)
            setResult(res)
        } catch (err) {
            setResult({ ok: false, message: err?.message || t('core:chat.dispatchConfirmation.dispatchFailed', { defaultValue: 'Dispatch failed.' }) })
        } finally {
            setExecuting(false)
        }
    }, [executing, selectedTasks, tasks, onExecute, t])

    if (result?.ok) {
        return (
            <PromptSurface tone="success" className="my-2 space-y-1.5">
                <p className="font-display text-xs font-semibold text-success-soft">{t('core:chat.dispatchConfirmation.executed', { defaultValue: 'Dispatch Executed' })}</p>
                <p className="text-[11px] leading-relaxed text-text-secondary">
                    {t('core:chat.dispatchConfirmation.executedDescription', {
                        defaultValue: '{{count}} agent{{suffix}} dispatched. Results will appear below as agents complete.',
                        count: result.taskCount || selectedTasks.size,
                        suffix: (result.taskCount || selectedTasks.size) !== 1 ? 's' : '',
                    })}
                </p>
            </PromptSurface>
        )
    }

    if (result && !result.ok) {
        return (
            <PromptSurface tone="danger" className="my-2 space-y-2">
                <p className="font-display text-xs font-semibold text-danger-soft">{t('core:chat.dispatchConfirmation.failed', { defaultValue: 'Dispatch Failed' })}</p>
                <p className="text-[11px] leading-relaxed text-text-secondary">{result.message || t('core:chat.dispatchConfirmation.unknownError', { defaultValue: 'Unknown error.' })}</p>
                <ActionButton
                    variant="danger"
                    onClick={() => setResult(null)}
                >
                    {t('core:chat.dispatchConfirmation.retry', { defaultValue: 'Retry' })}
                </ActionButton>
            </PromptSurface>
        )
    }

    return (
        <PromptSurface tone="decision" className="my-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-xs font-semibold text-text-primary">{t('core:chat.dispatchConfirmation.title', { defaultValue: 'Task Dispatch Plan' })}</p>
                <span className="rounded-md border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">
                    {t('core:chat.dispatchConfirmation.selected', {
                        defaultValue: '{{selected}}/{{total}} selected',
                        selected: selectedTasks.size,
                        total: tasks.length,
                    })}
                </span>
            </div>

            {summary && (
                <p className="text-[11px] leading-relaxed text-text-muted">{summary}</p>
            )}

            <div className="space-y-1.5">
                {tasks.map((task, index) => {
                    const isSelected = selectedTasks.has(index)
                    return (
                        <button
                            type="button"
                            key={index}
                            onClick={() => toggleTask(index)}
                            aria-pressed={isSelected ? 'true' : 'false'}
                            className={[
                                'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                                isSelected
                                    ? 'border-accent-muted bg-surface-panel text-text-primary'
                                    : 'border-surface-border/50 bg-surface text-text-tertiary opacity-70 hover:opacity-100',
                            ].join(' ')}
                        >
                            <div className="flex items-start gap-2">
                                <div className={[
                                    'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[8px] transition-colors',
                                    isSelected
                                        ? 'border-accent bg-accent text-surface'
                                        : 'border-surface-border bg-transparent',
                                ].join(' ')}>
                                    {isSelected ? <Icon name="check" size={10} /> : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium text-text-secondary">
                                        {task.agent_role || task.agent_role_id || `Agent ${index + 1}`}
                                    </p>
                                    <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-3">
                                        {task.instruction}
                                    </p>
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>

            <div className="flex items-center gap-2 pt-1">
                <ActionButton
                    variant="primary"
                    onClick={handleExecute}
                    disabled={executing || selectedTasks.size === 0}
                >
                    {executing
                        ? t('core:chat.dispatchConfirmation.dispatching', { defaultValue: 'Dispatching...' })
                        : t('core:chat.dispatchConfirmation.executeTasks', {
                            defaultValue: 'Execute {{count}} task{{suffix}}',
                            count: selectedTasks.size,
                            suffix: selectedTasks.size !== 1 ? 's' : '',
                        })}
                </ActionButton>
                <ActionButton
                    onClick={onDismiss}
                    disabled={executing}
                >
                    {t('core:common.cancel', { defaultValue: 'Cancel' })}
                </ActionButton>
            </div>
        </PromptSurface>
    )
}
