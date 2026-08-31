/**
 * CodeReviewReportCard.jsx
 *
 * Displays a unified code review report from the 3-step review pipeline.
 * Groups findings by severity, shows step attribution, and provides
 * an actionable summary.
 */

import React, { useState } from 'react'

export default function CodeReviewReportCard({
  steps = [],
  summary = '',
}) {
  const [activeStep, setActiveStep] = useState('summary')

  const tabs = [
    { id: 'summary', label: 'Summary' },
    ...steps.map((step, index) => ({
      id: `step_${index}`,
      label: step.roleName || `Step ${index + 1}`,
      status: step.status || 'completed',
    })),
  ]

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-surface-border bg-surface-panel text-text-primary shadow-[inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.035)]">
      <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2">
        <p className="font-display text-xs font-semibold">Code Review Report</p>
        <span className="rounded-md border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {steps.length} pass{steps.length !== 1 ? 'es' : ''}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-surface-border px-2 py-1.5 scrollbar-thin">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveStep(tab.id)}
            aria-pressed={activeStep === tab.id ? 'true' : 'false'}
            className={[
              'flex h-7 items-center gap-1 rounded-md px-2 text-[10px] whitespace-nowrap transition-colors',
              activeStep === tab.id
                ? 'bg-surface-panel-alt text-text-primary'
                : 'text-text-tertiary hover:bg-surface-panel-alt hover:text-text-secondary',
            ].join(' ')}
          >
            {tab.status === 'error' ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger-soft" /> : null}
            {tab.status === 'completed' && tab.id !== 'summary' ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-soft" /> : null}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-h-[400px] min-h-[80px] overflow-y-auto bg-surface px-3 py-3 scrollbar-thin">
        {activeStep === 'summary' ? (
          <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-text-secondary">
            {summary || (
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div key={index} className="rounded-lg border border-surface-border/70 bg-surface-panel px-2.5 py-2">
                    <p className="mb-1 text-[10px] font-medium text-text-muted">{step.roleName || `Pass ${index + 1}`}</p>
                    <p className="line-clamp-4 text-[11px] text-text-secondary">{step.output || 'No output'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          (() => {
            const index = parseInt(activeStep.replace('step_', ''), 10)
            const step = steps[index]
            if (!step) return null
            return (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={[
                      'inline-block h-1.5 w-1.5 rounded-full',
                      step.status === 'error' ? 'bg-danger-soft' : 'bg-success-soft',
                    ].join(' ')}
                  />
                  <span className="text-[10px] font-medium text-text-tertiary">
                    {step.roleName}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-text-secondary">
                  {step.output || <span className="text-text-tertiary italic">No output produced.</span>}
                </div>
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}
