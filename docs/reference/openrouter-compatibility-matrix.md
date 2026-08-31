# OpenRouter Compatibility Matrix

## Purpose
This page tracks which curated ADDOM models can be routed through OpenRouter.

It is an implementation reference, not a guarantee of full feature parity. A model being available on OpenRouter does not automatically mean ADDOM should treat it as equivalent for:
- provider-native tools
- background jobs
- websocket runtimes
- reasoning/tool event richness
- attachment behavior

## Scope
- Source of curated models: [`src/common/api-clients/model-registry-data.mjs`](../../src/common/api-clients/model-registry-data.mjs)
- Source of OpenRouter availability: [OpenRouter Models API](https://openrouter.ai/api/v1/models)
- Verified on: `2026-03-13`
- Deprecated curated models are omitted.
- Local providers `ollama` and `lmstudio` are omitted because OpenRouter is not relevant to them.

## Status Meanings
- `direct`: curated model is present on OpenRouter with a straightforward route.
- `remap`: curated model is not the exact same ID, but there is a clear OpenRouter route to map to.
- `unsupported`: no safe OpenRouter route was found from the current curated set.

## Matrix

| ADDOM Provider | Curated Model | OpenRouter Route | Status | Notes |
|---|---|---|---|---|
| `anthropic` | `claude-opus-4-6` | `anthropic/claude-opus-4.6` | direct | ID punctuation differs. |
| `anthropic` | `claude-sonnet-4-6` | `anthropic/claude-sonnet-4.6` | direct | ID punctuation differs. |
| `anthropic` | `claude-haiku-4-5` | `anthropic/claude-haiku-4.5` | direct | ID punctuation differs. |
| `anthropic` | `claude-opus-4-5` | `anthropic/claude-opus-4.5` | direct | ID punctuation differs. |
| `anthropic` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4.5` | direct | ID punctuation differs. |
| `anthropic` | `claude-opus-4-0` | `anthropic/claude-opus-4` | remap | Drop trailing `.0`. |
| `anthropic` | `claude-sonnet-4-0` | `anthropic/claude-sonnet-4` | remap | Drop trailing `.0`. |
| `anthropic` | `claude-opus-4-1` | `anthropic/claude-opus-4.1` | direct | ID punctuation differs. |
| `openai` | `gpt-5.4` | `openai/gpt-5.4` | direct |  |
| `openai` | `gpt-5.4-pro` | `openai/gpt-5.4-pro` | direct |  |
| `openai` | `gpt-5.3-codex` | `openai/gpt-5.3-codex` | direct |  |
| `openai` | `gpt-5.2` | `openai/gpt-5.2` | direct |  |
| `openai` | `gpt-5.1` | `openai/gpt-5.1` | direct |  |
| `openai` | `gpt-5-mini` | `openai/gpt-5-mini` | direct |  |
| `openai` | `gpt-5-nano` | `openai/gpt-5-nano` | direct |  |
| `openai` | `gpt-5.2-codex` | `openai/gpt-5.2-codex` | direct |  |
| `openai` | `gpt-5.1-codex` | `openai/gpt-5.1-codex` | direct |  |
| `openai` | `gpt-5.1-codex-mini` | `openai/gpt-5.1-codex-mini` | direct |  |
| `openai` | `gpt-5-codex` | `openai/gpt-5-codex` | direct |  |
| `openai` | `gpt-5.1-codex-max` | `openai/gpt-5.1-codex-max` | direct |  |
| `openai` | `gpt-4.1-mini` | `openai/gpt-4.1-mini` | direct |  |
| `gemini` | `gemini-3.1-pro-preview` | `google/gemini-3.1-pro-preview` | direct | Provider namespace changes. |
| `gemini` | `gemini-3-pro-preview` | `google/gemini-3-pro-preview` | direct | Provider namespace changes. |
| `gemini` | `gemini-3-flash-preview` | `google/gemini-3-flash-preview` | direct | Provider namespace changes. |
| `gemini` | `gemini-2.5-pro` | `google/gemini-2.5-pro` | direct | Provider namespace changes. |
| `gemini` | `gemini-2.5-flash` | `google/gemini-2.5-flash` | direct | Provider namespace changes. |
| `gemini` | `gemini-2.5-flash-lite` | `google/gemini-2.5-flash-lite` | direct | Provider namespace changes. |
| `gemini` | `gemini-2.0-flash` | `google/gemini-2.0-flash-001` | remap | Curated model should map to OpenRouter’s `-001` ID. |
| `gemini` | `gemini-2.0-flash-lite` | `google/gemini-2.0-flash-lite-001` | remap | Curated model should map to OpenRouter’s `-001` ID. |
| `moonshot` | `kimi-k2.5` | `moonshotai/kimi-k2.5` | direct |  |
| `moonshot` | `kimi-k2-0905-preview` | `moonshotai/kimi-k2-0905` | remap | Preview suffix differs. |
| `moonshot` | `kimi-k2-turbo-preview` |  | unsupported | No current OpenRouter route found. |
| `moonshot` | `kimi-k2-thinking` | `moonshotai/kimi-k2-thinking` | direct |  |
| `moonshot` | `kimi-k2-thinking-turbo` |  | unsupported | No current OpenRouter route found. |
| `grok` | `grok-4` | `x-ai/grok-4` | direct | Provider namespace changes. |
| `grok` | `grok-4-fast-reasoning` | `x-ai/grok-4-fast` | remap | OpenRouter does not split this into reasoning/non-reasoning IDs. |
| `grok` | `grok-4-fast-non-reasoning` | `x-ai/grok-4-fast` | remap | OpenRouter does not split this into reasoning/non-reasoning IDs. |
| `grok` | `grok-4-1-fast-reasoning` | `x-ai/grok-4.1-fast` | remap | OpenRouter uses dotted `4.1` form. |
| `grok` | `grok-4-1-fast-non-reasoning` | `x-ai/grok-4.1-fast` | remap | OpenRouter uses dotted `4.1` form. |
| `grok` | `grok-code-fast-1` | `x-ai/grok-code-fast-1` | direct | Provider namespace changes. |
| `grok` | `grok-3` | `x-ai/grok-3` | direct | Provider namespace changes. |
| `grok` | `grok-3-mini` | `x-ai/grok-3-mini` | direct | Provider namespace changes. |
| `groq` | `llama-3.3-70b-versatile` | `meta-llama/llama-3.3-70b-instruct` | remap | Same family, different provider-hosted SKU. |
| `groq` | `llama-3.1-8b-instant` | `meta-llama/llama-3.1-8b-instruct` | remap | Same family, different provider-hosted SKU. |
| `groq` | `meta-llama/llama-4-scout-17b-16e-instruct` |  | unsupported | Current OpenRouter catalog did not expose this exact route. |
| `groq` | `moonshotai/kimi-k2-instruct-0905` | `moonshotai/kimi-k2-0905` | remap | Similar family; requires explicit remap. |
| `groq` | `openai/gpt-oss-120b` | `openai/gpt-oss-120b` | direct |  |
| `groq` | `openai/gpt-oss-20b` | `openai/gpt-oss-20b` | direct |  |
| `groq` | `openai/gpt-oss-safeguard-20b` | `openai/gpt-oss-safeguard-20b` | direct |  |
| `groq` | `qwen/qwen3-32b` | `qwen/qwen3-32b` | direct |  |
| `mistral` | `mistral-large-2512` | `mistralai/mistral-large-2512` | direct | Provider namespace changes. |
| `mistral` | `mistral-medium-2508` | `mistralai/mistral-medium-3.1` | remap | Branding/version naming differs. |
| `mistral` | `mistral-small-2506` | `mistralai/mistral-small-3.2-24b-instruct` | remap | Branding/version naming differs. |
| `mistral` | `magistral-medium-2509` |  | unsupported | No current OpenRouter route found. |
| `mistral` | `magistral-small-2509` |  | unsupported | No current OpenRouter route found. |
| `mistral` | `devstral-2512` | `mistralai/devstral-2512` | direct | Provider namespace changes. |
| `mistral` | `codestral-2508` | `mistralai/codestral-2508` | direct | Provider namespace changes. |
| `mistral` | `devstral-medium-2507` | `mistralai/devstral-medium` | remap | Version suffix differs. |
| `mistral` | `devstral-small-2507` | `mistralai/devstral-small` | remap | Version suffix differs. |
| `deepseek` | `deepseek-chat` | `deepseek/deepseek-chat` | direct | Provider namespace changes. |
| `deepseek` | `deepseek-reasoner` | `deepseek/deepseek-r1` | remap | Reasoner should map to R1 family. |
| `perplexity` | `sonar-pro` | `perplexity/sonar-pro` | direct | Provider namespace changes. |
| `perplexity` | `sonar` | `perplexity/sonar` | direct | Provider namespace changes. |
| `perplexity` | `sonar-reasoning-pro` | `perplexity/sonar-reasoning-pro` | direct | Provider namespace changes. |
| `perplexity` | `sonar-deep-research` | `perplexity/sonar-deep-research` | direct | Provider namespace changes. |

## Recommended Routing Policy
- Prefer native provider when its API key is configured.
- Use OpenRouter only for models marked `direct` or `remap`.
- Do not route `unsupported` entries through OpenRouter.
- Keep local providers `ollama` and `lmstudio` out of this system.
- Treat `remap` entries as explicit curated aliases, not free-form string rewrites.

## Implementation Notes
- The right home for routing aliases is the provider/model normalization layer, not the UI.
- Safe implementation points:
  - [`src/main/api-clients/ai-provider-adapter-core.mjs`](../../src/main/api-clients/ai-provider-adapter-core.mjs)
  - [`src/main/api-clients/ai-provider-openai-compatible-core.mjs`](../../src/main/api-clients/ai-provider-openai-compatible-core.mjs)
  - [`src/common/api-clients/model-registry.mjs`](../../src/common/api-clients/model-registry.mjs)

## Caveat
This matrix is only about route availability. It does not claim parity for:
- hosted tools
- background execution
- provider-specific reasoning streams
- provider-specific capability probes
- attachment semantics
