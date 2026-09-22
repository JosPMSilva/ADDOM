# OpenRouter Compatibility Matrix — 2026-09-16

## Purpose

This page records the September 2026 OpenRouter review used by ADDOM. Route availability does not imply native-provider parity for hosted tools, provider runtimes, reasoning events, attachments, background jobs, or processing modes.

The machine-readable authority is [`openrouter-compatibility-data.mjs`](../../src/common/api-clients/openrouter-compatibility-data.mjs). The OpenRouter Models API was checked on `2026-09-16`; exact routes were matched by ID and were not inferred from similar model names.

## Refreshed routes

| ADDOM provider | Curated model | OpenRouter route | Status | Notes |
| --- | --- | --- | --- | --- |
| `openai` | `gpt-6-astra` | `openai/gpt-6-astra` | direct | Native OpenAI Fast and account-runtime semantics do not transfer. |
| `anthropic` | `claude-opus-5` | `anthropic/claude-opus-5` | direct | Native Anthropic Fast beta handling does not transfer. |
| `anthropic` | `claude-fable-5-1` | `anthropic/claude-fable-5.1` | direct | OpenRouter uses dotted version punctuation. |
| `gemini` | `gemini-3.8-flash` | `google/gemini-3.8-flash` | direct | Provider namespace changes. |
| `gemini` | `gemini-3.5-flash-lite` | `google/gemini-3.5-flash-lite` | direct | Provider namespace changes. |
| `moonshot` | `kimi-k3` | `moonshotai/kimi-k3` | direct | Moonshot Formula runtime is not inherited. |
| `grok` | `grok-4.6` | `x-ai/grok-4.6` | direct | Provider namespace changes. |
| `deepseek` | `deepseek-flash` | `deepseek/deepseek-v4.1-flash` | remap | OpenRouter uses the marketed version name. |
| `groq` | `groq/compound-mini` | — | unsupported | No exact OpenRouter route was present on `2026-09-16`. |

Existing supported and unsupported routes remain enumerated in the machine-readable compatibility file and are covered by the OpenRouter review tests. Obsolete direct-provider IDs such as `deepseek-v4-flash` and `claude-fable-5` are migration aliases only; they are not separate selector rows.

## Status meanings

- `direct`: the reviewed route is an exact OpenRouter catalog ID for the selected model.
- `remap`: ADDOM uses a documented, explicit route mapping because the provider and OpenRouter IDs differ.
- `unsupported`: no exact safe route was reviewed; ADDOM must not construct one heuristically.

## Routing policy

- Prefer the native provider when its credential is configured.
- Use only entries marked `direct` or `remap`.
- Keep native-provider processing, hosted-tool, and provider-owned runtime capabilities out of OpenRouter rows unless separately qualified for OpenRouter.
- Treat every remap as curated data, never as a free-form string rewrite.
- Keep `ollama` and `lmstudio` outside this matrix.

## Verification

```powershell
npm run openrouter:models:review
node --test tests/integration/openrouter-models-review.test.mjs tests/integration/openrouter-live-models.test.mjs tests/integration/openrouter-manifest-merge.test.mjs tests/integration/model-registry.test.mjs
```

Live availability can change after the recorded date. A future refresh must update both the compatibility data and this verification date after reviewing the live catalog.
