# OpenRouter BYOK And Smoke

OpenRouter is supported as an explicit ADDOM provider for broad low-cost smoke coverage across reviewed curated routes.

## Setup
- Add an `OPENROUTER_API_KEY` in Settings.
- Select `OpenRouter` as the provider in chat.
- Choose a reviewed route such as `openai/gpt-5.4` or `google/gemini-2.5-pro`.

## Selector Behavior
- ADDOM shows raw OpenRouter route IDs.
- Reviewed routes appear in the normal model list.
- The main chat selector keeps custom model entry enabled for OpenRouter routes only.
- Custom OpenRouter route IDs use the conservative generic adapter profile until reviewed explicitly.

## Runtime Limits
- OpenRouter is explicit-only in v1. Native providers do not auto-fallback to it.
- OpenRouter routes do not inherit provider-native runtime ownership.
- ADDOM does not treat OpenRouter as native parity for:
  - OpenAI background/websocket flows
  - Moonshot Formula
  - Perplexity provider-owned search/research runtime
- Reviewed OpenRouter routes currently keep file/PDF input disabled unless verified separately.

## Live Smoke
- Enable smoke with `ADDOM_LIVE_SMOKE=1`.
- Select providers with `ADDOM_LIVE_SMOKE_PROVIDERS=openrouter`.
- Narrow to specific reviewed routes with `ADDOM_LIVE_SMOKE_OPENROUTER_MODELS=openai/gpt-5.4,google/gemini-2.5-pro`.
- Use `ADDOM_LIVE_SMOKE_OPENROUTER_SCOPE=default` to run only the OpenRouter default model.
- Enable streamed smoke coverage with `ADDOM_LIVE_SMOKE_STREAM=1`.

OpenRouter smoke results are OpenRouter-scoped verification, not native-provider certification.
