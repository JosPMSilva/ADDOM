function cleanProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

const GENERIC_GUIDANCE = Object.freeze({
  label: 'General terms guidance',
  bullets: Object.freeze([
    'Review provider terms before production or commercial usage.',
    'Avoid output harvesting for model distillation or benchmark datasets unless explicitly allowed.',
    'Keep attribution/citation metadata when provider terms require it.',
    'Remote providers can process prompts, selected attachments, and provider-hosted tool activity on their infrastructure.',
  ]),
})

const GUIDANCE_BY_PROVIDER = Object.freeze({
  openai: Object.freeze({
    label: 'OpenAI usage reminder',
    bullets: Object.freeze([
      'Do not use outputs to train competing foundation models when terms prohibit it.',
      'Review model-specific usage and safety restrictions before large-scale exports.',
      'When OpenAI hosted tools or stored Responses state are enabled, prompts, selected attachments, and tool activity may be processed on provider infrastructure.',
      'If OpenAI MCP is enabled, configured third-party MCP servers can also receive prompt and tool data through the OpenAI-hosted tool path.',
    ]),
  }),
  anthropic: Object.freeze({
    label: 'Anthropic usage reminder',
    bullets: Object.freeze([
      'Check commercial terms before reuse in training, evaluation, or redistribution workflows.',
      'Keep safety and acceptable-use boundaries aligned with Anthropic policy updates.',
      'Claude Code style remote usage sends prompts and outputs over provider-controlled infrastructure rather than keeping execution fully local.',
    ]),
  }),
  gemini: Object.freeze({
    label: 'Gemini usage reminder',
    bullets: Object.freeze([
      'Review Google Gemini API terms for restricted workflows and policy-sensitive usage.',
      'Avoid bypassing safeguards or policy controls in automated runs.',
    ]),
  }),
  grok: Object.freeze({
    label: 'xAI Grok usage reminder',
    bullets: Object.freeze([
      'Review xAI terms before running high-volume probing or benchmark-style automation.',
      'Confirm allowed usage for output reuse across provider ecosystems.',
    ]),
  }),
  moonshot: Object.freeze({
    label: 'Moonshot usage reminder',
    bullets: Object.freeze([
      'Review Moonshot platform terms before production or large-scale automation.',
      'When Moonshot remote tools are enabled, prompts and selected attachments may be processed on provider infrastructure.',
    ]),
  }),
  groq: Object.freeze({
    label: 'Groq usage reminder',
    bullets: Object.freeze([
      'Groq serves third-party models; underlying model licenses can add extra restrictions.',
      'Validate benchmark/distillation permissions for each selected model family.',
    ]),
  }),
  mistral: Object.freeze({
    label: 'Mistral usage reminder',
    bullets: Object.freeze([
      'Check commercial and redistribution rights before packaging model outputs.',
      'Confirm benchmark/distillation permissions for your use case.',
    ]),
  }),
  deepseek: Object.freeze({
    label: 'DeepSeek usage reminder',
    bullets: Object.freeze([
      'Review platform terms and acceptable-use restrictions before automation at scale.',
      'Keep attribution/policy obligations intact when exporting or sharing outputs.',
    ]),
  }),
  perplexity: Object.freeze({
    label: 'Perplexity usage reminder',
    bullets: Object.freeze([
      'Preserve citations and source attributions when exporting or reusing responses.',
      'Review third-party model and search-related terms for downstream usage.',
    ]),
  }),
})

export function getProviderTermsGuidance(providerInput = {}) {
  const providerId = typeof providerInput === 'string'
    ? cleanProviderId(providerInput)
    : cleanProviderId(providerInput?.id || providerInput?.providerId)
  const guidance = GUIDANCE_BY_PROVIDER[providerId] || GENERIC_GUIDANCE
  return {
    providerId,
    label: String(guidance.label || GENERIC_GUIDANCE.label),
    bullets: Array.isArray(guidance.bullets) && guidance.bullets.length > 0
      ? guidance.bullets.map((row) => String(row || '').trim()).filter(Boolean)
      : [...GENERIC_GUIDANCE.bullets],
  }
}
