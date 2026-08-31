/**
 * CouncilResultCard.jsx
 *
 * Displays council results: individual model outputs in tabs,
 * plus the synthesized consensus report.
 */

import React, { useState } from 'react'

export default function CouncilResultCard({
    memberOutputs = [],
    synthesisResult = '',
}) {
    const [activeTab, setActiveTab] = useState('consensus')

    const tabs = [
        { id: 'consensus', label: 'Consensus' },
        ...memberOutputs.map((member, index) => ({
            id: `member_${index}`,
            label: member.roleName || `Model ${index + 1}`,
            status: member.status || 'completed',
        })),
    ]

    return (
        <div className="my-2 overflow-hidden rounded-lg border border-surface-border bg-surface-panel text-text-primary shadow-[inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.035)]">
            <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2">
                <p className="font-display text-xs font-semibold">LLM Council Results</p>
                <span className="rounded-md border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">
                    {memberOutputs.length} model{memberOutputs.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-surface-border px-2 py-1.5 scrollbar-thin">
                {tabs.map((tab) => (
                    <button
                        type="button"
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        aria-pressed={activeTab === tab.id ? 'true' : 'false'}
                        className={[
                            'flex h-7 items-center gap-1 rounded-md px-2 text-[10px] whitespace-nowrap transition-colors',
                            activeTab === tab.id
                                ? 'bg-surface-panel-alt text-text-primary'
                                : 'text-text-tertiary hover:bg-surface-panel-alt hover:text-text-secondary',
                        ].join(' ')}
                    >
                        {tab.status === 'error' ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger-soft" /> : null}
                        {tab.status === 'completed' && tab.id !== 'consensus' ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-soft" /> : null}
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="max-h-[400px] min-h-[80px] overflow-y-auto bg-surface px-3 py-3 scrollbar-thin">
                {activeTab === 'consensus' ? (
                    <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-text-secondary">
                        {synthesisResult || (
                            <span className="text-text-tertiary italic">
                                Synthesis pending. Council outputs collected, awaiting consensus generation.
                            </span>
                        )}
                    </div>
                ) : (
                    (() => {
                        const index = parseInt(activeTab.replace('member_', ''), 10)
                        const member = memberOutputs[index]
                        if (!member) return null
                        return (
                            <div>
                                <div className="mb-2 flex items-center gap-2">
                                    <span className={[
                                        'inline-block h-1.5 w-1.5 rounded-full',
                                        member.status === 'error' ? 'bg-danger-soft' : 'bg-success-soft',
                                    ].join(' ')} />
                                    <span className="text-[10px] text-text-tertiary">
                                        {member.modelLabel || member.roleName}
                                    </span>
                                </div>
                                <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-text-secondary">
                                    {member.output || (
                                        <span className="text-text-tertiary italic">No output produced.</span>
                                    )}
                                </div>
                            </div>
                        )
                    })()
                )}
            </div>
        </div>
    )
}
