export const ANTHROPIC_ADAPTIVE_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['anthropic:effort'],
  notes: 'Adaptive thinking is enabled explicitly; effort is the supported reasoning control.',
})
export const ANTHROPIC_EFFORT_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['anthropic:effort'],
  notes: 'Thinking uses the provider default; effort is the supported reasoning control.',
})
export const ANTHROPIC_DISABLEABLE_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['anthropic:thinking.disable', 'anthropic:effort'],
  notes: 'Thinking is enabled by default and may be disabled; effort controls reasoning depth.',
})
export const ANTHROPIC_THINKING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['anthropic:thinking.type', 'anthropic:thinking.budgetTokens'],
  notes: 'Curated Claude defaults enable extended thinking through Anthropic provider options.',
})
export const ANTHROPIC_ADAPTIVE_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze({
  anthropic: {
    thinking: { type: 'adaptive' },
    effort: 'high',
  },
})
export const ANTHROPIC_ADAPTIVE_REASONING_VARIANTS = Object.freeze([
  {
    id: 'fast',
    label: 'Fast',
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: 'low' },
    },
  },
  {
    id: 'medium',
    label: 'Medium',
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: 'medium' },
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    default: true,
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: 'high' },
    },
  },
  {
    id: 'xhigh',
    label: 'XHigh',
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: 'xhigh' },
    },
  },
  {
    id: 'deep',
    label: 'Deep',
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: 'max' },
    },
  },
])
function anthropicProgressAdaptiveOptions(effort) {
  return {
    anthropic: {
      thinking: { type: 'adaptive', display: 'updates' },
      effort,
    },
  }
}
export const ANTHROPIC_PROGRESS_ADAPTIVE_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze(
  anthropicProgressAdaptiveOptions('medium'),
)
export const ANTHROPIC_PROGRESS_ADAPTIVE_REASONING_VARIANTS = Object.freeze([
  {
    id: 'fast',
    label: 'Fast',
    providerOptions: anthropicProgressAdaptiveOptions('low'),
  },
  {
    id: 'balanced',
    label: 'Balanced',
    default: true,
    providerOptions: anthropicProgressAdaptiveOptions('medium'),
  },
  {
    id: 'high',
    label: 'High',
    providerOptions: anthropicProgressAdaptiveOptions('high'),
  },
  {
    id: 'xhigh',
    label: 'XHigh',
    providerOptions: anthropicProgressAdaptiveOptions('xhigh'),
  },
  {
    id: 'deep',
    label: 'Deep',
    providerOptions: anthropicProgressAdaptiveOptions('max'),
  },
])
export const ANTHROPIC_EFFORT_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze({
  anthropic: { effort: 'high' },
})
export const ANTHROPIC_EFFORT_REASONING_VARIANTS = Object.freeze([
  {
    id: 'fast',
    label: 'Fast',
    providerOptions: {
      anthropic: { effort: 'low' },
    },
  },
  {
    id: 'medium',
    label: 'Medium',
    providerOptions: {
      anthropic: { effort: 'medium' },
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    default: true,
    providerOptions: {
      anthropic: { effort: 'high' },
    },
  },
  {
    id: 'xhigh',
    label: 'XHigh',
    providerOptions: {
      anthropic: { effort: 'xhigh' },
    },
  },
  {
    id: 'deep',
    label: 'Deep',
    providerOptions: {
      anthropic: { effort: 'max' },
    },
  },
])
export const ANTHROPIC_MANUAL_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze({
  anthropic: {
    thinking: {
      type: 'enabled',
      budgetTokens: 16000,
    },
  },
})
export const ANTHROPIC_MANUAL_REASONING_VARIANTS = Object.freeze([
  {
    id: 'balanced',
    label: 'Balanced',
    default: true,
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 16000,
        },
      },
    },
  },
  {
    id: 'deep',
    label: 'Deep',
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 32000,
        },
      },
    },
  },
])
