export const GENERATED_MODEL_CATALOG_LOOKUP = {
  "providersById": {
    "openai": {
      "index": 0,
      "providerId": "openai",
      "name": "OpenAI",
      "defaultModel": "chatgpt-image-latest",
      "sourceFile": "providers/openai/provider.toml",
      "logoPath": "provider-logos/openai.svg",
      "upstreamProviderId": "openai"
    },
    "anthropic": {
      "index": 1,
      "providerId": "anthropic",
      "name": "Anthropic",
      "defaultModel": "claude-fable-5",
      "sourceFile": "providers/anthropic/provider.toml",
      "logoPath": "provider-logos/anthropic.svg",
      "upstreamProviderId": "anthropic"
    },
    "gemini": {
      "index": 2,
      "providerId": "gemini",
      "name": "Google Gemini",
      "defaultModel": "gemini-2.0-flash",
      "sourceFile": "providers/google/provider.toml",
      "logoPath": "provider-logos/gemini.svg",
      "upstreamProviderId": "google"
    },
    "moonshot": {
      "index": 3,
      "providerId": "moonshot",
      "name": "Moonshot AI",
      "defaultModel": "kimi-k2-0711-preview",
      "sourceFile": "providers/moonshotai/provider.toml",
      "logoPath": "provider-logos/moonshot.svg",
      "upstreamProviderId": "moonshotai"
    },
    "grok": {
      "index": 4,
      "providerId": "grok",
      "name": "xAI Grok",
      "defaultModel": "grok-4.20-0309-non-reasoning",
      "sourceFile": "providers/xai/provider.toml",
      "logoPath": "provider-logos/grok.svg",
      "upstreamProviderId": "xai"
    },
    "groq": {
      "index": 5,
      "providerId": "groq",
      "name": "Groq",
      "defaultModel": "canopylabs/orpheus-arabic-saudi",
      "sourceFile": "providers/groq/provider.toml",
      "logoPath": "provider-logos/groq.svg",
      "upstreamProviderId": "groq"
    },
    "mistral": {
      "index": 6,
      "providerId": "mistral",
      "name": "Mistral",
      "defaultModel": "codestral-latest",
      "sourceFile": "providers/mistral/provider.toml",
      "logoPath": "provider-logos/mistral.svg",
      "upstreamProviderId": "mistral"
    },
    "deepseek": {
      "index": 7,
      "providerId": "deepseek",
      "name": "DeepSeek",
      "defaultModel": "deepseek-chat",
      "sourceFile": "providers/deepseek/provider.toml",
      "logoPath": "provider-logos/deepseek.svg",
      "upstreamProviderId": "deepseek"
    },
    "perplexity": {
      "index": 8,
      "providerId": "perplexity",
      "name": "Perplexity",
      "defaultModel": "sonar",
      "sourceFile": "providers/perplexity/provider.toml",
      "logoPath": "provider-logos/perplexity.svg",
      "upstreamProviderId": "perplexity"
    },
    "openrouter": {
      "index": 9,
      "providerId": "openrouter",
      "name": "OpenRouter",
      "defaultModel": "~anthropic/claude-fable-latest",
      "sourceFile": "providers/openrouter/provider.toml",
      "logoPath": "provider-logos/openrouter.svg",
      "upstreamProviderId": "openrouter"
    }
  },
  "modelsByProviderId": {
    "openai": {
      "chatgpt-image-latest": {
        "index": 0,
        "id": "chatgpt-image-latest",
        "label": "chatgpt-image-latest",
        "group": "gpt-image",
        "sourceFile": "providers/openai/models/chatgpt-image-latest.toml",
        "deprecated": false
      },
      "gpt-3.5-turbo": {
        "index": 1,
        "id": "gpt-3.5-turbo",
        "label": "GPT-3.5-turbo",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-3.5-turbo.toml",
        "deprecated": false
      },
      "gpt-4": {
        "index": 2,
        "id": "gpt-4",
        "label": "GPT-4",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-4.toml",
        "deprecated": false
      },
      "gpt-4-turbo": {
        "index": 3,
        "id": "gpt-4-turbo",
        "label": "GPT-4 Turbo",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-4-turbo.toml",
        "deprecated": false
      },
      "gpt-4.1": {
        "index": 4,
        "id": "gpt-4.1",
        "label": "GPT-4.1",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-4.1.toml",
        "deprecated": false
      },
      "gpt-4.1-mini": {
        "index": 5,
        "id": "gpt-4.1-mini",
        "label": "GPT-4.1 mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openai/models/gpt-4.1-mini.toml",
        "deprecated": false
      },
      "gpt-4.1-nano": {
        "index": 6,
        "id": "gpt-4.1-nano",
        "label": "GPT-4.1 nano",
        "group": "gpt-nano",
        "sourceFile": "providers/openai/models/gpt-4.1-nano.toml",
        "deprecated": false
      },
      "gpt-4o": {
        "index": 7,
        "id": "gpt-4o",
        "label": "GPT-4o",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-4o.toml",
        "deprecated": false
      },
      "gpt-4o-2024-05-13": {
        "index": 8,
        "id": "gpt-4o-2024-05-13",
        "label": "GPT-4o (2024-05-13)",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-4o-2024-05-13.toml",
        "deprecated": false
      },
      "gpt-4o-2024-08-06": {
        "index": 9,
        "id": "gpt-4o-2024-08-06",
        "label": "GPT-4o (2024-08-06)",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-4o-2024-08-06.toml",
        "deprecated": false
      },
      "gpt-4o-2024-11-20": {
        "index": 10,
        "id": "gpt-4o-2024-11-20",
        "label": "GPT-4o (2024-11-20)",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-4o-2024-11-20.toml",
        "deprecated": false
      },
      "gpt-4o-mini": {
        "index": 11,
        "id": "gpt-4o-mini",
        "label": "GPT-4o mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openai/models/gpt-4o-mini.toml",
        "deprecated": false
      },
      "gpt-5": {
        "index": 12,
        "id": "gpt-5",
        "label": "GPT-5",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-5.toml",
        "deprecated": false
      },
      "gpt-5-chat-latest": {
        "index": 13,
        "id": "gpt-5-chat-latest",
        "label": "GPT-5 Chat (latest)",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5-chat-latest.toml",
        "deprecated": false
      },
      "gpt-5-codex": {
        "index": 14,
        "id": "gpt-5-codex",
        "label": "GPT-5-Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5-codex.toml",
        "deprecated": false
      },
      "gpt-5-mini": {
        "index": 15,
        "id": "gpt-5-mini",
        "label": "GPT-5 Mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openai/models/gpt-5-mini.toml",
        "deprecated": false
      },
      "gpt-5-nano": {
        "index": 16,
        "id": "gpt-5-nano",
        "label": "GPT-5 Nano",
        "group": "gpt-nano",
        "sourceFile": "providers/openai/models/gpt-5-nano.toml",
        "deprecated": false
      },
      "gpt-5-pro": {
        "index": 17,
        "id": "gpt-5-pro",
        "label": "GPT-5 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openai/models/gpt-5-pro.toml",
        "deprecated": false
      },
      "gpt-5.1": {
        "index": 18,
        "id": "gpt-5.1",
        "label": "GPT-5.1",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-5.1.toml",
        "deprecated": false
      },
      "gpt-5.1-chat-latest": {
        "index": 19,
        "id": "gpt-5.1-chat-latest",
        "label": "GPT-5.1 Chat",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5.1-chat-latest.toml",
        "deprecated": false
      },
      "gpt-5.1-codex": {
        "index": 20,
        "id": "gpt-5.1-codex",
        "label": "GPT-5.1 Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5.1-codex.toml",
        "deprecated": false
      },
      "gpt-5.1-codex-max": {
        "index": 21,
        "id": "gpt-5.1-codex-max",
        "label": "GPT-5.1 Codex Max",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5.1-codex-max.toml",
        "deprecated": false
      },
      "gpt-5.1-codex-mini": {
        "index": 22,
        "id": "gpt-5.1-codex-mini",
        "label": "GPT-5.1 Codex mini",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5.1-codex-mini.toml",
        "deprecated": false
      },
      "gpt-5.2": {
        "index": 23,
        "id": "gpt-5.2",
        "label": "GPT-5.2",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-5.2.toml",
        "deprecated": false
      },
      "gpt-5.2-chat-latest": {
        "index": 24,
        "id": "gpt-5.2-chat-latest",
        "label": "GPT-5.2 Chat",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5.2-chat-latest.toml",
        "deprecated": false
      },
      "gpt-5.2-codex": {
        "index": 25,
        "id": "gpt-5.2-codex",
        "label": "GPT-5.2 Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5.2-codex.toml",
        "deprecated": false
      },
      "gpt-5.2-pro": {
        "index": 26,
        "id": "gpt-5.2-pro",
        "label": "GPT-5.2 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openai/models/gpt-5.2-pro.toml",
        "deprecated": false
      },
      "gpt-5.3-chat-latest": {
        "index": 27,
        "id": "gpt-5.3-chat-latest",
        "label": "GPT-5.3 Chat (latest)",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-5.3-chat-latest.toml",
        "deprecated": false
      },
      "gpt-5.3-codex": {
        "index": 28,
        "id": "gpt-5.3-codex",
        "label": "GPT-5.3 Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openai/models/gpt-5.3-codex.toml",
        "deprecated": false
      },
      "gpt-5.3-codex-spark": {
        "index": 29,
        "id": "gpt-5.3-codex-spark",
        "label": "GPT-5.3 Codex Spark",
        "group": "gpt-codex-spark",
        "sourceFile": "providers/openai/models/gpt-5.3-codex-spark.toml",
        "deprecated": false
      },
      "gpt-5.4": {
        "index": 30,
        "id": "gpt-5.4",
        "label": "GPT-5.4",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-5.4.toml",
        "deprecated": false
      },
      "gpt-5.4-mini": {
        "index": 31,
        "id": "gpt-5.4-mini",
        "label": "GPT-5.4 mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openai/models/gpt-5.4-mini.toml",
        "deprecated": false
      },
      "gpt-5.4-nano": {
        "index": 32,
        "id": "gpt-5.4-nano",
        "label": "GPT-5.4 nano",
        "group": "gpt-nano",
        "sourceFile": "providers/openai/models/gpt-5.4-nano.toml",
        "deprecated": false
      },
      "gpt-5.4-pro": {
        "index": 33,
        "id": "gpt-5.4-pro",
        "label": "GPT-5.4 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openai/models/gpt-5.4-pro.toml",
        "deprecated": false
      },
      "gpt-5.5": {
        "index": 34,
        "id": "gpt-5.5",
        "label": "GPT-5.5",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-5.5.toml",
        "deprecated": false
      },
      "gpt-5.5-pro": {
        "index": 35,
        "id": "gpt-5.5-pro",
        "label": "GPT-5.5 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openai/models/gpt-5.5-pro.toml",
        "deprecated": false
      },
      "gpt-5.6": {
        "index": 36,
        "id": "gpt-5.6",
        "label": "GPT-5.6",
        "group": "gpt-sol",
        "sourceFile": "providers/openai/models/gpt-5.6.toml",
        "deprecated": false
      },
      "gpt-5.6-luna": {
        "index": 37,
        "id": "gpt-5.6-luna",
        "label": "GPT-5.6 Luna",
        "group": "gpt-luna",
        "sourceFile": "providers/openai/models/gpt-5.6-luna.toml",
        "deprecated": false
      },
      "gpt-5.6-sol": {
        "index": 38,
        "id": "gpt-5.6-sol",
        "label": "GPT-5.6 Sol",
        "group": "gpt-sol",
        "sourceFile": "providers/openai/models/gpt-5.6-sol.toml",
        "deprecated": false
      },
      "gpt-5.6-terra": {
        "index": 39,
        "id": "gpt-5.6-terra",
        "label": "GPT-5.6 Terra",
        "group": "gpt-terra",
        "sourceFile": "providers/openai/models/gpt-5.6-terra.toml",
        "deprecated": false
      },
      "gpt-image-1": {
        "index": 40,
        "id": "gpt-image-1",
        "label": "gpt-image-1",
        "group": "gpt-image",
        "sourceFile": "providers/openai/models/gpt-image-1.toml",
        "deprecated": false
      },
      "gpt-image-1-mini": {
        "index": 41,
        "id": "gpt-image-1-mini",
        "label": "gpt-image-1-mini",
        "group": "gpt-image",
        "sourceFile": "providers/openai/models/gpt-image-1-mini.toml",
        "deprecated": false
      },
      "gpt-image-1.5": {
        "index": 42,
        "id": "gpt-image-1.5",
        "label": "gpt-image-1.5",
        "group": "gpt-image",
        "sourceFile": "providers/openai/models/gpt-image-1.5.toml",
        "deprecated": false
      },
      "gpt-image-2": {
        "index": 43,
        "id": "gpt-image-2",
        "label": "gpt-image-2",
        "group": "gpt-image",
        "sourceFile": "providers/openai/models/gpt-image-2.toml",
        "deprecated": false
      },
      "gpt-realtime-2.1": {
        "index": 44,
        "id": "gpt-realtime-2.1",
        "label": "GPT-Realtime-2.1",
        "group": "gpt",
        "sourceFile": "providers/openai/models/gpt-realtime-2.1.toml",
        "deprecated": false
      },
      "o1": {
        "index": 45,
        "id": "o1",
        "label": "o1",
        "group": "o",
        "sourceFile": "providers/openai/models/o1.toml",
        "deprecated": false
      },
      "o1-pro": {
        "index": 46,
        "id": "o1-pro",
        "label": "o1-pro",
        "group": "o-pro",
        "sourceFile": "providers/openai/models/o1-pro.toml",
        "deprecated": false
      },
      "o3": {
        "index": 47,
        "id": "o3",
        "label": "o3",
        "group": "o",
        "sourceFile": "providers/openai/models/o3.toml",
        "deprecated": false
      },
      "o3-deep-research": {
        "index": 48,
        "id": "o3-deep-research",
        "label": "o3-deep-research",
        "group": "o",
        "sourceFile": "providers/openai/models/o3-deep-research.toml",
        "deprecated": false
      },
      "o3-mini": {
        "index": 49,
        "id": "o3-mini",
        "label": "o3-mini",
        "group": "o-mini",
        "sourceFile": "providers/openai/models/o3-mini.toml",
        "deprecated": false
      },
      "o3-pro": {
        "index": 50,
        "id": "o3-pro",
        "label": "o3-pro",
        "group": "o-pro",
        "sourceFile": "providers/openai/models/o3-pro.toml",
        "deprecated": false
      },
      "o4-mini": {
        "index": 51,
        "id": "o4-mini",
        "label": "o4-mini",
        "group": "o-mini",
        "sourceFile": "providers/openai/models/o4-mini.toml",
        "deprecated": false
      },
      "o4-mini-deep-research": {
        "index": 52,
        "id": "o4-mini-deep-research",
        "label": "o4-mini-deep-research",
        "group": "o-mini",
        "sourceFile": "providers/openai/models/o4-mini-deep-research.toml",
        "deprecated": false
      },
      "text-embedding-3-large": {
        "index": 53,
        "id": "text-embedding-3-large",
        "label": "text-embedding-3-large",
        "group": "text-embedding",
        "sourceFile": "providers/openai/models/text-embedding-3-large.toml",
        "deprecated": false
      },
      "text-embedding-3-small": {
        "index": 54,
        "id": "text-embedding-3-small",
        "label": "text-embedding-3-small",
        "group": "text-embedding",
        "sourceFile": "providers/openai/models/text-embedding-3-small.toml",
        "deprecated": false
      },
      "text-embedding-ada-002": {
        "index": 55,
        "id": "text-embedding-ada-002",
        "label": "text-embedding-ada-002",
        "group": "text-embedding",
        "sourceFile": "providers/openai/models/text-embedding-ada-002.toml",
        "deprecated": false
      }
    },
    "anthropic": {
      "claude-fable-5": {
        "index": 0,
        "id": "claude-fable-5",
        "label": "Claude Fable 5",
        "group": "claude-fable",
        "sourceFile": "providers/anthropic/models/claude-fable-5.toml",
        "deprecated": false
      },
      "claude-haiku-4-5": {
        "index": 1,
        "id": "claude-haiku-4-5",
        "label": "Claude Haiku 4.5 (latest)",
        "group": "claude-haiku",
        "sourceFile": "providers/anthropic/models/claude-haiku-4-5.toml",
        "deprecated": false
      },
      "claude-haiku-4-5-20251001": {
        "index": 2,
        "id": "claude-haiku-4-5-20251001",
        "label": "Claude Haiku 4.5",
        "group": "claude-haiku",
        "sourceFile": "providers/anthropic/models/claude-haiku-4-5-20251001.toml",
        "deprecated": false
      },
      "claude-opus-4-1": {
        "index": 3,
        "id": "claude-opus-4-1",
        "label": "Claude Opus 4.1 (latest)",
        "group": "claude-opus",
        "sourceFile": "providers/anthropic/models/claude-opus-4-1.toml",
        "deprecated": true
      },
      "claude-opus-4-1-20250805": {
        "index": 4,
        "id": "claude-opus-4-1-20250805",
        "label": "Claude Opus 4.1",
        "group": "claude-opus",
        "sourceFile": "providers/anthropic/models/claude-opus-4-1-20250805.toml",
        "deprecated": true
      },
      "claude-opus-4-5": {
        "index": 5,
        "id": "claude-opus-4-5",
        "label": "Claude Opus 4.5 (latest)",
        "group": "claude-opus",
        "sourceFile": "providers/anthropic/models/claude-opus-4-5.toml",
        "deprecated": false
      },
      "claude-opus-4-5-20251101": {
        "index": 6,
        "id": "claude-opus-4-5-20251101",
        "label": "Claude Opus 4.5",
        "group": "claude-opus",
        "sourceFile": "providers/anthropic/models/claude-opus-4-5-20251101.toml",
        "deprecated": false
      },
      "claude-opus-4-6": {
        "index": 7,
        "id": "claude-opus-4-6",
        "label": "Claude Opus 4.6",
        "group": "claude-opus",
        "sourceFile": "providers/anthropic/models/claude-opus-4-6.toml",
        "deprecated": false
      },
      "claude-opus-4-7": {
        "index": 8,
        "id": "claude-opus-4-7",
        "label": "Claude Opus 4.7",
        "group": "claude-opus",
        "sourceFile": "providers/anthropic/models/claude-opus-4-7.toml",
        "deprecated": false
      },
      "claude-opus-4-8": {
        "index": 9,
        "id": "claude-opus-4-8",
        "label": "Claude Opus 4.8",
        "group": "claude-opus",
        "sourceFile": "providers/anthropic/models/claude-opus-4-8.toml",
        "deprecated": false
      },
      "claude-sonnet-4-5": {
        "index": 10,
        "id": "claude-sonnet-4-5",
        "label": "Claude Sonnet 4.5 (latest)",
        "group": "claude-sonnet",
        "sourceFile": "providers/anthropic/models/claude-sonnet-4-5.toml",
        "deprecated": false
      },
      "claude-sonnet-4-5-20250929": {
        "index": 11,
        "id": "claude-sonnet-4-5-20250929",
        "label": "Claude Sonnet 4.5",
        "group": "claude-sonnet",
        "sourceFile": "providers/anthropic/models/claude-sonnet-4-5-20250929.toml",
        "deprecated": false
      },
      "claude-sonnet-4-6": {
        "index": 12,
        "id": "claude-sonnet-4-6",
        "label": "Claude Sonnet 4.6",
        "group": "claude-sonnet",
        "sourceFile": "providers/anthropic/models/claude-sonnet-4-6.toml",
        "deprecated": false
      },
      "claude-sonnet-5": {
        "index": 13,
        "id": "claude-sonnet-5",
        "label": "Claude Sonnet 5",
        "group": "claude-sonnet",
        "sourceFile": "providers/anthropic/models/claude-sonnet-5.toml",
        "deprecated": false
      }
    },
    "gemini": {
      "gemini-2.0-flash": {
        "index": 0,
        "id": "gemini-2.0-flash",
        "label": "Gemini 2.0 Flash",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-2.0-flash.toml",
        "deprecated": true
      },
      "gemini-2.0-flash-lite": {
        "index": 1,
        "id": "gemini-2.0-flash-lite",
        "label": "Gemini 2.0 Flash-Lite",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/google/models/gemini-2.0-flash-lite.toml",
        "deprecated": true
      },
      "gemini-2.5-flash": {
        "index": 2,
        "id": "gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-2.5-flash.toml",
        "deprecated": false
      },
      "gemini-2.5-flash-image": {
        "index": 3,
        "id": "gemini-2.5-flash-image",
        "label": "Nano Banana",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-2.5-flash-image.toml",
        "deprecated": false
      },
      "gemini-2.5-flash-lite": {
        "index": 4,
        "id": "gemini-2.5-flash-lite",
        "label": "Gemini 2.5 Flash-Lite",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/google/models/gemini-2.5-flash-lite.toml",
        "deprecated": false
      },
      "gemini-2.5-flash-preview-tts": {
        "index": 5,
        "id": "gemini-2.5-flash-preview-tts",
        "label": "Gemini 2.5 Flash Preview TTS",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-2.5-flash-preview-tts.toml",
        "deprecated": false
      },
      "gemini-2.5-pro": {
        "index": 6,
        "id": "gemini-2.5-pro",
        "label": "Gemini 2.5 Pro",
        "group": "gemini-pro",
        "sourceFile": "providers/google/models/gemini-2.5-pro.toml",
        "deprecated": false
      },
      "gemini-2.5-pro-preview-tts": {
        "index": 7,
        "id": "gemini-2.5-pro-preview-tts",
        "label": "Gemini 2.5 Pro Preview TTS",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-2.5-pro-preview-tts.toml",
        "deprecated": false
      },
      "gemini-3-flash-preview": {
        "index": 8,
        "id": "gemini-3-flash-preview",
        "label": "Gemini 3 Flash Preview",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-3-flash-preview.toml",
        "deprecated": false
      },
      "gemini-3-pro-image-preview": {
        "index": 9,
        "id": "gemini-3-pro-image-preview",
        "label": "Nano Banana Pro",
        "group": "gemini-pro",
        "sourceFile": "providers/google/models/gemini-3-pro-image-preview.toml",
        "deprecated": false
      },
      "gemini-3-pro-preview": {
        "index": 10,
        "id": "gemini-3-pro-preview",
        "label": "Gemini 3 Pro Preview",
        "group": "gemini-pro",
        "sourceFile": "providers/google/models/gemini-3-pro-preview.toml",
        "deprecated": true
      },
      "gemini-3.1-flash-image-preview": {
        "index": 11,
        "id": "gemini-3.1-flash-image-preview",
        "label": "Nano Banana 2",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-3.1-flash-image-preview.toml",
        "deprecated": false
      },
      "gemini-3.1-flash-lite": {
        "index": 12,
        "id": "gemini-3.1-flash-lite",
        "label": "Gemini 3.1 Flash Lite",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/google/models/gemini-3.1-flash-lite.toml",
        "deprecated": false
      },
      "gemini-3.1-flash-lite-preview": {
        "index": 13,
        "id": "gemini-3.1-flash-lite-preview",
        "label": "Gemini 3.1 Flash Lite Preview",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/google/models/gemini-3.1-flash-lite-preview.toml",
        "deprecated": true
      },
      "gemini-3.1-pro-preview": {
        "index": 14,
        "id": "gemini-3.1-pro-preview",
        "label": "Gemini 3.1 Pro Preview",
        "group": "gemini-pro",
        "sourceFile": "providers/google/models/gemini-3.1-pro-preview.toml",
        "deprecated": false
      },
      "gemini-3.1-pro-preview-customtools": {
        "index": 15,
        "id": "gemini-3.1-pro-preview-customtools",
        "label": "Gemini 3.1 Pro Preview Custom Tools",
        "group": "gemini-pro",
        "sourceFile": "providers/google/models/gemini-3.1-pro-preview-customtools.toml",
        "deprecated": false
      },
      "gemini-3.5-flash": {
        "index": 16,
        "id": "gemini-3.5-flash",
        "label": "Gemini 3.5 Flash",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-3.5-flash.toml",
        "deprecated": false
      },
      "gemini-embedding-001": {
        "index": 17,
        "id": "gemini-embedding-001",
        "label": "Gemini Embedding 001",
        "group": "gemini",
        "sourceFile": "providers/google/models/gemini-embedding-001.toml",
        "deprecated": false
      },
      "gemini-flash-latest": {
        "index": 18,
        "id": "gemini-flash-latest",
        "label": "Gemini Flash Latest",
        "group": "gemini-flash",
        "sourceFile": "providers/google/models/gemini-flash-latest.toml",
        "deprecated": false
      },
      "gemini-flash-lite-latest": {
        "index": 19,
        "id": "gemini-flash-lite-latest",
        "label": "Gemini Flash-Lite Latest",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/google/models/gemini-flash-lite-latest.toml",
        "deprecated": false
      },
      "gemini-omni-flash-preview": {
        "index": 20,
        "id": "gemini-omni-flash-preview",
        "label": "Gemini Omni Flash Preview",
        "group": "gemini",
        "sourceFile": "providers/google/models/gemini-omni-flash-preview.toml",
        "deprecated": false
      },
      "gemma-4-26b-a4b-it": {
        "index": 21,
        "id": "gemma-4-26b-a4b-it",
        "label": "Gemma 4 26B A4B IT",
        "group": "gemma",
        "sourceFile": "providers/google/models/gemma-4-26b-a4b-it.toml",
        "deprecated": false
      },
      "gemma-4-31b-it": {
        "index": 22,
        "id": "gemma-4-31b-it",
        "label": "Gemma 4 31B IT",
        "group": "gemma",
        "sourceFile": "providers/google/models/gemma-4-31b-it.toml",
        "deprecated": false
      }
    },
    "moonshot": {
      "kimi-k2-0711-preview": {
        "index": 0,
        "id": "kimi-k2-0711-preview",
        "label": "Kimi K2 0711",
        "group": "kimi-k2",
        "sourceFile": "providers/moonshotai/models/kimi-k2-0711-preview.toml",
        "deprecated": false
      },
      "kimi-k2-0905-preview": {
        "index": 1,
        "id": "kimi-k2-0905-preview",
        "label": "Kimi K2 0905",
        "group": "kimi-k2",
        "sourceFile": "providers/moonshotai/models/kimi-k2-0905-preview.toml",
        "deprecated": false
      },
      "kimi-k2-thinking": {
        "index": 2,
        "id": "kimi-k2-thinking",
        "label": "Kimi K2 Thinking",
        "group": "kimi-thinking",
        "sourceFile": "providers/moonshotai/models/kimi-k2-thinking.toml",
        "deprecated": false
      },
      "kimi-k2-thinking-turbo": {
        "index": 3,
        "id": "kimi-k2-thinking-turbo",
        "label": "Kimi K2 Thinking Turbo",
        "group": "kimi-thinking",
        "sourceFile": "providers/moonshotai/models/kimi-k2-thinking-turbo.toml",
        "deprecated": false
      },
      "kimi-k2-turbo-preview": {
        "index": 4,
        "id": "kimi-k2-turbo-preview",
        "label": "Kimi K2 Turbo",
        "group": "kimi-k2",
        "sourceFile": "providers/moonshotai/models/kimi-k2-turbo-preview.toml",
        "deprecated": false
      },
      "kimi-k2.5": {
        "index": 5,
        "id": "kimi-k2.5",
        "label": "Kimi K2.5",
        "group": "kimi-k2",
        "sourceFile": "providers/moonshotai/models/kimi-k2.5.toml",
        "deprecated": false
      },
      "kimi-k2.6": {
        "index": 6,
        "id": "kimi-k2.6",
        "label": "Kimi K2.6",
        "group": "kimi-k2",
        "sourceFile": "providers/moonshotai/models/kimi-k2.6.toml",
        "deprecated": false
      },
      "kimi-k2.7-code": {
        "index": 7,
        "id": "kimi-k2.7-code",
        "label": "Kimi K2.7 Code",
        "group": "kimi-k2",
        "sourceFile": "providers/moonshotai/models/kimi-k2.7-code.toml",
        "deprecated": false
      },
      "kimi-k2.7-code-highspeed": {
        "index": 8,
        "id": "kimi-k2.7-code-highspeed",
        "label": "Kimi K2.7 Code HighSpeed",
        "group": "kimi-k2",
        "sourceFile": "providers/moonshotai/models/kimi-k2.7-code-highspeed.toml",
        "deprecated": false
      }
    },
    "grok": {
      "grok-4.20-0309-non-reasoning": {
        "index": 0,
        "id": "grok-4.20-0309-non-reasoning",
        "label": "Grok 4.20 (Non-Reasoning)",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-4.20-0309-non-reasoning.toml",
        "deprecated": false
      },
      "grok-4.20-0309-reasoning": {
        "index": 1,
        "id": "grok-4.20-0309-reasoning",
        "label": "Grok 4.20 (Reasoning)",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-4.20-0309-reasoning.toml",
        "deprecated": false
      },
      "grok-4.20-multi-agent-0309": {
        "index": 2,
        "id": "grok-4.20-multi-agent-0309",
        "label": "Grok 4.20 Multi-Agent",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-4.20-multi-agent-0309.toml",
        "deprecated": false
      },
      "grok-4.3": {
        "index": 3,
        "id": "grok-4.3",
        "label": "Grok 4.3",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-4.3.toml",
        "deprecated": false
      },
      "grok-4.5": {
        "index": 4,
        "id": "grok-4.5",
        "label": "Grok 4.5",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-4.5.toml",
        "deprecated": false
      },
      "grok-build-0.1": {
        "index": 5,
        "id": "grok-build-0.1",
        "label": "Grok Build 0.1",
        "group": "grok-build",
        "sourceFile": "providers/xai/models/grok-build-0.1.toml",
        "deprecated": false
      },
      "grok-imagine-image": {
        "index": 6,
        "id": "grok-imagine-image",
        "label": "Grok Imagine Image",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-imagine-image.toml",
        "deprecated": false
      },
      "grok-imagine-image-quality": {
        "index": 7,
        "id": "grok-imagine-image-quality",
        "label": "Grok Imagine Image Quality",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-imagine-image-quality.toml",
        "deprecated": false
      },
      "grok-imagine-video": {
        "index": 8,
        "id": "grok-imagine-video",
        "label": "Grok Imagine Video",
        "group": "grok",
        "sourceFile": "providers/xai/models/grok-imagine-video.toml",
        "deprecated": false
      }
    },
    "groq": {
      "canopylabs/orpheus-arabic-saudi": {
        "index": 0,
        "id": "canopylabs/orpheus-arabic-saudi",
        "label": "Canopy Labs Orpheus Arabic Saudi",
        "group": "canopylabs",
        "sourceFile": "providers/groq/models/canopylabs/orpheus-arabic-saudi.toml",
        "deprecated": false
      },
      "canopylabs/orpheus-v1-english": {
        "index": 1,
        "id": "canopylabs/orpheus-v1-english",
        "label": "Canopy Labs Orpheus V1 English",
        "group": "canopylabs",
        "sourceFile": "providers/groq/models/canopylabs/orpheus-v1-english.toml",
        "deprecated": false
      },
      "groq/compound": {
        "index": 2,
        "id": "groq/compound",
        "label": "Compound",
        "group": "groq",
        "sourceFile": "providers/groq/models/groq/compound.toml",
        "deprecated": false
      },
      "groq/compound-mini": {
        "index": 3,
        "id": "groq/compound-mini",
        "label": "Compound Mini",
        "group": "groq",
        "sourceFile": "providers/groq/models/groq/compound-mini.toml",
        "deprecated": false
      },
      "llama-3.1-8b-instant": {
        "index": 4,
        "id": "llama-3.1-8b-instant",
        "label": "Llama 3.1 8B",
        "group": "llama",
        "sourceFile": "providers/groq/models/llama-3.1-8b-instant.toml",
        "deprecated": false
      },
      "llama-3.3-70b-versatile": {
        "index": 5,
        "id": "llama-3.3-70b-versatile",
        "label": "Llama 3.3 70B",
        "group": "llama",
        "sourceFile": "providers/groq/models/llama-3.3-70b-versatile.toml",
        "deprecated": false
      },
      "meta-llama/llama-4-scout-17b-16e-instruct": {
        "index": 6,
        "id": "meta-llama/llama-4-scout-17b-16e-instruct",
        "label": "Llama 4 Scout 17B 16E",
        "group": "llama",
        "sourceFile": "providers/groq/models/meta-llama/llama-4-scout-17b-16e-instruct.toml",
        "deprecated": false
      },
      "meta-llama/llama-prompt-guard-2-22m": {
        "index": 7,
        "id": "meta-llama/llama-prompt-guard-2-22m",
        "label": "Llama Prompt Guard 2 22M",
        "group": "llama",
        "sourceFile": "providers/groq/models/meta-llama/llama-prompt-guard-2-22m.toml",
        "deprecated": false
      },
      "meta-llama/llama-prompt-guard-2-86m": {
        "index": 8,
        "id": "meta-llama/llama-prompt-guard-2-86m",
        "label": "Prompt Guard 2 86M",
        "group": "llama",
        "sourceFile": "providers/groq/models/meta-llama/llama-prompt-guard-2-86m.toml",
        "deprecated": false
      },
      "openai/gpt-oss-120b": {
        "index": 9,
        "id": "openai/gpt-oss-120b",
        "label": "GPT OSS 120B",
        "group": "gpt-oss",
        "sourceFile": "providers/groq/models/openai/gpt-oss-120b.toml",
        "deprecated": false
      },
      "openai/gpt-oss-20b": {
        "index": 10,
        "id": "openai/gpt-oss-20b",
        "label": "GPT OSS 20B",
        "group": "gpt-oss",
        "sourceFile": "providers/groq/models/openai/gpt-oss-20b.toml",
        "deprecated": false
      },
      "openai/gpt-oss-safeguard-20b": {
        "index": 11,
        "id": "openai/gpt-oss-safeguard-20b",
        "label": "Safety GPT OSS 20B",
        "group": "gpt-oss",
        "sourceFile": "providers/groq/models/openai/gpt-oss-safeguard-20b.toml",
        "deprecated": false
      },
      "qwen/qwen3-32b": {
        "index": 12,
        "id": "qwen/qwen3-32b",
        "label": "Qwen3-32B",
        "group": "qwen",
        "sourceFile": "providers/groq/models/qwen/qwen3-32b.toml",
        "deprecated": false
      },
      "whisper-large-v3": {
        "index": 13,
        "id": "whisper-large-v3",
        "label": "Whisper",
        "group": "whisper",
        "sourceFile": "providers/groq/models/whisper-large-v3.toml",
        "deprecated": false
      },
      "whisper-large-v3-turbo": {
        "index": 14,
        "id": "whisper-large-v3-turbo",
        "label": "Whisper Large V3 Turbo",
        "group": "whisper",
        "sourceFile": "providers/groq/models/whisper-large-v3-turbo.toml",
        "deprecated": false
      }
    },
    "mistral": {
      "codestral-latest": {
        "index": 0,
        "id": "codestral-latest",
        "label": "Codestral (latest)",
        "group": "codestral",
        "sourceFile": "providers/mistral/models/codestral-latest.toml",
        "deprecated": false
      },
      "devstral-2512": {
        "index": 1,
        "id": "devstral-2512",
        "label": "Devstral 2",
        "group": "devstral",
        "sourceFile": "providers/mistral/models/devstral-2512.toml",
        "deprecated": true
      },
      "devstral-latest": {
        "index": 2,
        "id": "devstral-latest",
        "label": "Devstral 2",
        "group": "devstral",
        "sourceFile": "providers/mistral/models/devstral-latest.toml",
        "deprecated": true
      },
      "devstral-medium-2507": {
        "index": 3,
        "id": "devstral-medium-2507",
        "label": "Devstral Medium",
        "group": "devstral",
        "sourceFile": "providers/mistral/models/devstral-medium-2507.toml",
        "deprecated": true
      },
      "devstral-medium-latest": {
        "index": 4,
        "id": "devstral-medium-latest",
        "label": "Devstral 2 (latest)",
        "group": "devstral",
        "sourceFile": "providers/mistral/models/devstral-medium-latest.toml",
        "deprecated": true
      },
      "devstral-small-2505": {
        "index": 5,
        "id": "devstral-small-2505",
        "label": "Devstral Small 2505",
        "group": "devstral",
        "sourceFile": "providers/mistral/models/devstral-small-2505.toml",
        "deprecated": true
      },
      "devstral-small-2507": {
        "index": 6,
        "id": "devstral-small-2507",
        "label": "Devstral Small",
        "group": "devstral",
        "sourceFile": "providers/mistral/models/devstral-small-2507.toml",
        "deprecated": true
      },
      "labs-devstral-small-2512": {
        "index": 7,
        "id": "labs-devstral-small-2512",
        "label": "Devstral Small 2",
        "group": "devstral",
        "sourceFile": "providers/mistral/models/labs-devstral-small-2512.toml",
        "deprecated": true
      },
      "magistral-medium-latest": {
        "index": 8,
        "id": "magistral-medium-latest",
        "label": "Magistral Medium (latest)",
        "group": "magistral-medium",
        "sourceFile": "providers/mistral/models/magistral-medium-latest.toml",
        "deprecated": false
      },
      "magistral-small": {
        "index": 9,
        "id": "magistral-small",
        "label": "Magistral Small",
        "group": "magistral-small",
        "sourceFile": "providers/mistral/models/magistral-small.toml",
        "deprecated": false
      },
      "ministral-3b-latest": {
        "index": 10,
        "id": "ministral-3b-latest",
        "label": "Ministral 3B (latest)",
        "group": "ministral",
        "sourceFile": "providers/mistral/models/ministral-3b-latest.toml",
        "deprecated": false
      },
      "ministral-8b-latest": {
        "index": 11,
        "id": "ministral-8b-latest",
        "label": "Ministral 8B (latest)",
        "group": "ministral",
        "sourceFile": "providers/mistral/models/ministral-8b-latest.toml",
        "deprecated": false
      },
      "mistral-embed": {
        "index": 12,
        "id": "mistral-embed",
        "label": "Mistral Embed",
        "group": "mistral-embed",
        "sourceFile": "providers/mistral/models/mistral-embed.toml",
        "deprecated": false
      },
      "mistral-large-2411": {
        "index": 13,
        "id": "mistral-large-2411",
        "label": "Mistral Large 2.1",
        "group": "mistral-large",
        "sourceFile": "providers/mistral/models/mistral-large-2411.toml",
        "deprecated": false
      },
      "mistral-large-2512": {
        "index": 14,
        "id": "mistral-large-2512",
        "label": "Mistral Large 3",
        "group": "mistral-large",
        "sourceFile": "providers/mistral/models/mistral-large-2512.toml",
        "deprecated": false
      },
      "mistral-large-latest": {
        "index": 15,
        "id": "mistral-large-latest",
        "label": "Mistral Large (latest)",
        "group": "mistral-large",
        "sourceFile": "providers/mistral/models/mistral-large-latest.toml",
        "deprecated": false
      },
      "mistral-medium-2505": {
        "index": 16,
        "id": "mistral-medium-2505",
        "label": "Mistral Medium 3",
        "group": "mistral-medium",
        "sourceFile": "providers/mistral/models/mistral-medium-2505.toml",
        "deprecated": false
      },
      "mistral-medium-2508": {
        "index": 17,
        "id": "mistral-medium-2508",
        "label": "Mistral Medium 3.1",
        "group": "mistral-medium",
        "sourceFile": "providers/mistral/models/mistral-medium-2508.toml",
        "deprecated": false
      },
      "mistral-medium-2604": {
        "index": 18,
        "id": "mistral-medium-2604",
        "label": "Mistral Medium 3.5",
        "group": "mistral-medium",
        "sourceFile": "providers/mistral/models/mistral-medium-2604.toml",
        "deprecated": false
      },
      "mistral-medium-latest": {
        "index": 19,
        "id": "mistral-medium-latest",
        "label": "Mistral Medium (latest)",
        "group": "mistral-medium",
        "sourceFile": "providers/mistral/models/mistral-medium-latest.toml",
        "deprecated": false
      },
      "mistral-nemo": {
        "index": 20,
        "id": "mistral-nemo",
        "label": "Mistral Nemo",
        "group": "mistral-nemo",
        "sourceFile": "providers/mistral/models/mistral-nemo.toml",
        "deprecated": false
      },
      "mistral-small-2506": {
        "index": 21,
        "id": "mistral-small-2506",
        "label": "Mistral Small 3.2",
        "group": "mistral-small",
        "sourceFile": "providers/mistral/models/mistral-small-2506.toml",
        "deprecated": false
      },
      "mistral-small-2603": {
        "index": 22,
        "id": "mistral-small-2603",
        "label": "Mistral Small 4",
        "group": "mistral-small",
        "sourceFile": "providers/mistral/models/mistral-small-2603.toml",
        "deprecated": false
      },
      "mistral-small-latest": {
        "index": 23,
        "id": "mistral-small-latest",
        "label": "Mistral Small (latest)",
        "group": "mistral-small",
        "sourceFile": "providers/mistral/models/mistral-small-latest.toml",
        "deprecated": false
      },
      "open-mistral-7b": {
        "index": 24,
        "id": "open-mistral-7b",
        "label": "Mistral 7B",
        "group": "mistral",
        "sourceFile": "providers/mistral/models/open-mistral-7b.toml",
        "deprecated": false
      },
      "open-mistral-nemo": {
        "index": 25,
        "id": "open-mistral-nemo",
        "label": "Open Mistral Nemo",
        "group": "mistral-nemo",
        "sourceFile": "providers/mistral/models/open-mistral-nemo.toml",
        "deprecated": true
      },
      "open-mixtral-8x22b": {
        "index": 26,
        "id": "open-mixtral-8x22b",
        "label": "Mixtral 8x22B",
        "group": "mixtral",
        "sourceFile": "providers/mistral/models/open-mixtral-8x22b.toml",
        "deprecated": false
      },
      "open-mixtral-8x7b": {
        "index": 27,
        "id": "open-mixtral-8x7b",
        "label": "Mixtral 8x7B",
        "group": "mixtral",
        "sourceFile": "providers/mistral/models/open-mixtral-8x7b.toml",
        "deprecated": false
      },
      "pixtral-12b": {
        "index": 28,
        "id": "pixtral-12b",
        "label": "Pixtral 12B",
        "group": "pixtral",
        "sourceFile": "providers/mistral/models/pixtral-12b.toml",
        "deprecated": false
      },
      "pixtral-large-latest": {
        "index": 29,
        "id": "pixtral-large-latest",
        "label": "Pixtral Large (latest)",
        "group": "pixtral",
        "sourceFile": "providers/mistral/models/pixtral-large-latest.toml",
        "deprecated": false
      }
    },
    "deepseek": {
      "deepseek-chat": {
        "index": 0,
        "id": "deepseek-chat",
        "label": "DeepSeek Chat",
        "group": "deepseek",
        "sourceFile": "providers/deepseek/models/deepseek-chat.toml",
        "deprecated": false
      },
      "deepseek-reasoner": {
        "index": 1,
        "id": "deepseek-reasoner",
        "label": "DeepSeek Reasoner",
        "group": "deepseek-thinking",
        "sourceFile": "providers/deepseek/models/deepseek-reasoner.toml",
        "deprecated": false
      },
      "deepseek-v4-flash": {
        "index": 2,
        "id": "deepseek-v4-flash",
        "label": "DeepSeek V4 Flash",
        "group": "deepseek-flash",
        "sourceFile": "providers/deepseek/models/deepseek-v4-flash.toml",
        "deprecated": false
      },
      "deepseek-v4-pro": {
        "index": 3,
        "id": "deepseek-v4-pro",
        "label": "DeepSeek V4 Pro",
        "group": "deepseek-thinking",
        "sourceFile": "providers/deepseek/models/deepseek-v4-pro.toml",
        "deprecated": false
      }
    },
    "perplexity": {
      "sonar": {
        "index": 0,
        "id": "sonar",
        "label": "Sonar",
        "group": "sonar",
        "sourceFile": "providers/perplexity/models/sonar.toml",
        "deprecated": false
      },
      "sonar-deep-research": {
        "index": 1,
        "id": "sonar-deep-research",
        "label": "Perplexity Sonar Deep Research",
        "group": "Other",
        "sourceFile": "providers/perplexity/models/sonar-deep-research.toml",
        "deprecated": false
      },
      "sonar-pro": {
        "index": 2,
        "id": "sonar-pro",
        "label": "Sonar Pro",
        "group": "sonar-pro",
        "sourceFile": "providers/perplexity/models/sonar-pro.toml",
        "deprecated": false
      },
      "sonar-reasoning-pro": {
        "index": 3,
        "id": "sonar-reasoning-pro",
        "label": "Sonar Reasoning Pro",
        "group": "sonar-reasoning",
        "sourceFile": "providers/perplexity/models/sonar-reasoning-pro.toml",
        "deprecated": false
      }
    },
    "openrouter": {
      "~anthropic/claude-fable-latest": {
        "index": 0,
        "id": "~anthropic/claude-fable-latest",
        "label": "Claude Fable Latest",
        "group": "claude-fable",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-fable-latest.toml",
        "deprecated": false
      },
      "~anthropic/claude-haiku-latest": {
        "index": 1,
        "id": "~anthropic/claude-haiku-latest",
        "label": "Anthropic Claude Haiku Latest",
        "group": "claude-haiku",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-haiku-latest.toml",
        "deprecated": false
      },
      "~anthropic/claude-opus-latest": {
        "index": 2,
        "id": "~anthropic/claude-opus-latest",
        "label": "Claude Opus Latest",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-opus-latest.toml",
        "deprecated": false
      },
      "~anthropic/claude-sonnet-latest": {
        "index": 3,
        "id": "~anthropic/claude-sonnet-latest",
        "label": "Anthropic Claude Sonnet Latest",
        "group": "claude-sonnet",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-sonnet-latest.toml",
        "deprecated": false
      },
      "~google/gemini-flash-latest": {
        "index": 4,
        "id": "~google/gemini-flash-latest",
        "label": "Google Gemini Flash Latest",
        "group": "gemini-flash",
        "sourceFile": "providers/openrouter/models/~google/gemini-flash-latest.toml",
        "deprecated": false
      },
      "~google/gemini-pro-latest": {
        "index": 5,
        "id": "~google/gemini-pro-latest",
        "label": "Google Gemini Pro Latest",
        "group": "gemini-pro",
        "sourceFile": "providers/openrouter/models/~google/gemini-pro-latest.toml",
        "deprecated": false
      },
      "~moonshotai/kimi-latest": {
        "index": 6,
        "id": "~moonshotai/kimi-latest",
        "label": "MoonshotAI Kimi Latest",
        "group": "kimi",
        "sourceFile": "providers/openrouter/models/~moonshotai/kimi-latest.toml",
        "deprecated": false
      },
      "~openai/gpt-latest": {
        "index": 7,
        "id": "~openai/gpt-latest",
        "label": "OpenAI GPT Latest",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/~openai/gpt-latest.toml",
        "deprecated": false
      },
      "~openai/gpt-mini-latest": {
        "index": 8,
        "id": "~openai/gpt-mini-latest",
        "label": "OpenAI GPT Mini Latest",
        "group": "gpt-mini",
        "sourceFile": "providers/openrouter/models/~openai/gpt-mini-latest.toml",
        "deprecated": false
      },
      "~x-ai/grok-latest": {
        "index": 9,
        "id": "~x-ai/grok-latest",
        "label": "Grok Latest",
        "group": "grok",
        "sourceFile": "providers/openrouter/models/~x-ai/grok-latest.toml",
        "deprecated": false
      },
      "ai21/jamba-large-1.7": {
        "index": 10,
        "id": "ai21/jamba-large-1.7",
        "label": "Jamba Large 1.7",
        "group": "jamba",
        "sourceFile": "providers/openrouter/models/ai21/jamba-large-1.7.toml",
        "deprecated": false
      },
      "aion-labs/aion-2.0": {
        "index": 11,
        "id": "aion-labs/aion-2.0",
        "label": "Aion-2.0",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-2.0.toml",
        "deprecated": false
      },
      "aion-labs/aion-3.0": {
        "index": 12,
        "id": "aion-labs/aion-3.0",
        "label": "Aion-3.0",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-3.0.toml",
        "deprecated": false
      },
      "aion-labs/aion-3.0-mini": {
        "index": 13,
        "id": "aion-labs/aion-3.0-mini",
        "label": "Aion-3.0-Mini",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-3.0-mini.toml",
        "deprecated": false
      },
      "aion-labs/aion-rp-llama-3.1-8b": {
        "index": 14,
        "id": "aion-labs/aion-rp-llama-3.1-8b",
        "label": "Aion-RP 1.0 (8B)",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-rp-llama-3.1-8b.toml",
        "deprecated": false
      },
      "allenai/olmo-3-32b-think": {
        "index": 15,
        "id": "allenai/olmo-3-32b-think",
        "label": "Olmo 3 32B Think",
        "group": "allenai",
        "sourceFile": "providers/openrouter/models/allenai/olmo-3-32b-think.toml",
        "deprecated": false
      },
      "amazon/nova-2-lite-v1": {
        "index": 16,
        "id": "amazon/nova-2-lite-v1",
        "label": "Nova 2 Lite",
        "group": "nova",
        "sourceFile": "providers/openrouter/models/amazon/nova-2-lite-v1.toml",
        "deprecated": false
      },
      "amazon/nova-lite-v1": {
        "index": 17,
        "id": "amazon/nova-lite-v1",
        "label": "Nova Lite 1.0",
        "group": "nova-lite",
        "sourceFile": "providers/openrouter/models/amazon/nova-lite-v1.toml",
        "deprecated": false
      },
      "amazon/nova-micro-v1": {
        "index": 18,
        "id": "amazon/nova-micro-v1",
        "label": "Nova Micro 1.0",
        "group": "nova-micro",
        "sourceFile": "providers/openrouter/models/amazon/nova-micro-v1.toml",
        "deprecated": false
      },
      "amazon/nova-premier-v1": {
        "index": 19,
        "id": "amazon/nova-premier-v1",
        "label": "Nova Premier 1.0",
        "group": "nova",
        "sourceFile": "providers/openrouter/models/amazon/nova-premier-v1.toml",
        "deprecated": false
      },
      "amazon/nova-pro-v1": {
        "index": 20,
        "id": "amazon/nova-pro-v1",
        "label": "Nova Pro 1.0",
        "group": "nova-pro",
        "sourceFile": "providers/openrouter/models/amazon/nova-pro-v1.toml",
        "deprecated": false
      },
      "anthracite-org/magnum-v4-72b": {
        "index": 21,
        "id": "anthracite-org/magnum-v4-72b",
        "label": "Magnum v4 72B",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/anthracite-org/magnum-v4-72b.toml",
        "deprecated": false
      },
      "anthropic/claude-3-haiku": {
        "index": 22,
        "id": "anthropic/claude-3-haiku",
        "label": "Claude 3 Haiku",
        "group": "claude",
        "sourceFile": "providers/openrouter/models/anthropic/claude-3-haiku.toml",
        "deprecated": false
      },
      "anthropic/claude-fable-5": {
        "index": 23,
        "id": "anthropic/claude-fable-5",
        "label": "Claude Fable 5",
        "group": "claude-fable",
        "sourceFile": "providers/openrouter/models/anthropic/claude-fable-5.toml",
        "deprecated": false
      },
      "anthropic/claude-haiku-4.5": {
        "index": 24,
        "id": "anthropic/claude-haiku-4.5",
        "label": "Claude Haiku 4.5 (latest)",
        "group": "claude-haiku",
        "sourceFile": "providers/openrouter/models/anthropic/claude-haiku-4.5.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4": {
        "index": 25,
        "id": "anthropic/claude-opus-4",
        "label": "Claude Opus 4",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4.1": {
        "index": 26,
        "id": "anthropic/claude-opus-4.1",
        "label": "Claude Opus 4.1 (latest)",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.1.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4.5": {
        "index": 27,
        "id": "anthropic/claude-opus-4.5",
        "label": "Claude Opus 4.5 (latest)",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.5.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4.6": {
        "index": 28,
        "id": "anthropic/claude-opus-4.6",
        "label": "Claude Opus 4.6",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.6.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4.7": {
        "index": 29,
        "id": "anthropic/claude-opus-4.7",
        "label": "Claude Opus 4.7",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.7.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4.7-fast": {
        "index": 30,
        "id": "anthropic/claude-opus-4.7-fast",
        "label": "Claude Opus 4.7 (Fast)",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.7-fast.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4.8": {
        "index": 31,
        "id": "anthropic/claude-opus-4.8",
        "label": "Claude Opus 4.8",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.8.toml",
        "deprecated": false
      },
      "anthropic/claude-opus-4.8-fast": {
        "index": 32,
        "id": "anthropic/claude-opus-4.8-fast",
        "label": "Claude Opus 4.8 (Fast)",
        "group": "claude-opus",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.8-fast.toml",
        "deprecated": false
      },
      "anthropic/claude-sonnet-4": {
        "index": 33,
        "id": "anthropic/claude-sonnet-4",
        "label": "Claude Sonnet 4",
        "group": "claude-sonnet",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-4.toml",
        "deprecated": false
      },
      "anthropic/claude-sonnet-4.5": {
        "index": 34,
        "id": "anthropic/claude-sonnet-4.5",
        "label": "Claude Sonnet 4.5 (latest)",
        "group": "claude-sonnet",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-4.5.toml",
        "deprecated": false
      },
      "anthropic/claude-sonnet-4.6": {
        "index": 35,
        "id": "anthropic/claude-sonnet-4.6",
        "label": "Claude Sonnet 4.6",
        "group": "claude-sonnet",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-4.6.toml",
        "deprecated": false
      },
      "anthropic/claude-sonnet-5": {
        "index": 36,
        "id": "anthropic/claude-sonnet-5",
        "label": "Claude Sonnet 5",
        "group": "claude-sonnet",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-5.toml",
        "deprecated": false
      },
      "arcee-ai/coder-large": {
        "index": 37,
        "id": "arcee-ai/coder-large",
        "label": "Coder Large",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/arcee-ai/coder-large.toml",
        "deprecated": false
      },
      "arcee-ai/trinity-large-thinking": {
        "index": 38,
        "id": "arcee-ai/trinity-large-thinking",
        "label": "Trinity Large Thinking",
        "group": "trinity",
        "sourceFile": "providers/openrouter/models/arcee-ai/trinity-large-thinking.toml",
        "deprecated": false
      },
      "arcee-ai/virtuoso-large": {
        "index": 39,
        "id": "arcee-ai/virtuoso-large",
        "label": "Virtuoso Large",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/arcee-ai/virtuoso-large.toml",
        "deprecated": false
      },
      "baidu/ernie-4.5-vl-424b-a47b": {
        "index": 40,
        "id": "baidu/ernie-4.5-vl-424b-a47b",
        "label": "ERNIE 4.5 VL 424B A47B",
        "group": "ernie",
        "sourceFile": "providers/openrouter/models/baidu/ernie-4.5-vl-424b-a47b.toml",
        "deprecated": false
      },
      "bytedance-seed/seed-1.6": {
        "index": 41,
        "id": "bytedance-seed/seed-1.6",
        "label": "Seed 1.6",
        "group": "seed",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-1.6.toml",
        "deprecated": false
      },
      "bytedance-seed/seed-1.6-flash": {
        "index": 42,
        "id": "bytedance-seed/seed-1.6-flash",
        "label": "Seed 1.6 Flash",
        "group": "seed",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-1.6-flash.toml",
        "deprecated": false
      },
      "bytedance-seed/seed-2.0-lite": {
        "index": 43,
        "id": "bytedance-seed/seed-2.0-lite",
        "label": "Seed-2.0-Lite",
        "group": "seed",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-2.0-lite.toml",
        "deprecated": false
      },
      "bytedance-seed/seed-2.0-mini": {
        "index": 44,
        "id": "bytedance-seed/seed-2.0-mini",
        "label": "Seed-2.0-Mini",
        "group": "seed",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-2.0-mini.toml",
        "deprecated": false
      },
      "bytedance/ui-tars-1.5-7b": {
        "index": 45,
        "id": "bytedance/ui-tars-1.5-7b",
        "label": "UI-TARS 7B",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/bytedance/ui-tars-1.5-7b.toml",
        "deprecated": false
      },
      "cognitivecomputations/dolphin-mistral-24b-venice-edition": {
        "index": 46,
        "id": "cognitivecomputations/dolphin-mistral-24b-venice-edition",
        "label": "Uncensored",
        "group": "mistral",
        "sourceFile": "providers/openrouter/models/cognitivecomputations/dolphin-mistral-24b-venice-edition.toml",
        "deprecated": false
      },
      "cognitivecomputations/dolphin-mistral-24b-venice-edition__58__free": {
        "index": 47,
        "id": "cognitivecomputations/dolphin-mistral-24b-venice-edition__58__free",
        "label": "Uncensored (free)",
        "group": "mistral",
        "sourceFile": "providers/openrouter/models/cognitivecomputations/dolphin-mistral-24b-venice-edition__58__free.toml",
        "deprecated": false
      },
      "cohere/command-a": {
        "index": 48,
        "id": "cohere/command-a",
        "label": "Command A",
        "group": "command-a",
        "sourceFile": "providers/openrouter/models/cohere/command-a.toml",
        "deprecated": false
      },
      "cohere/command-r-08-2024": {
        "index": 49,
        "id": "cohere/command-r-08-2024",
        "label": "Command R",
        "group": "command-r",
        "sourceFile": "providers/openrouter/models/cohere/command-r-08-2024.toml",
        "deprecated": false
      },
      "cohere/command-r-plus-08-2024": {
        "index": 50,
        "id": "cohere/command-r-plus-08-2024",
        "label": "Command R+",
        "group": "command-r",
        "sourceFile": "providers/openrouter/models/cohere/command-r-plus-08-2024.toml",
        "deprecated": false
      },
      "cohere/command-r7b-12-2024": {
        "index": 51,
        "id": "cohere/command-r7b-12-2024",
        "label": "Command R7B",
        "group": "command-r",
        "sourceFile": "providers/openrouter/models/cohere/command-r7b-12-2024.toml",
        "deprecated": false
      },
      "cohere/north-mini-code__58__free": {
        "index": 52,
        "id": "cohere/north-mini-code__58__free",
        "label": "North Mini Code (free)",
        "group": "north",
        "sourceFile": "providers/openrouter/models/cohere/north-mini-code__58__free.toml",
        "deprecated": false
      },
      "deepcogito/cogito-v2.1-671b": {
        "index": 53,
        "id": "deepcogito/cogito-v2.1-671b",
        "label": "Cogito v2.1 671B",
        "group": "cogito",
        "sourceFile": "providers/openrouter/models/deepcogito/cogito-v2.1-671b.toml",
        "deprecated": false
      },
      "deepseek/deepseek-chat": {
        "index": 54,
        "id": "deepseek/deepseek-chat",
        "label": "DeepSeek Chat",
        "group": "deepseek",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-chat.toml",
        "deprecated": false
      },
      "deepseek/deepseek-chat-v3-0324": {
        "index": 55,
        "id": "deepseek/deepseek-chat-v3-0324",
        "label": "DeepSeek V3 0324",
        "group": "deepseek",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-chat-v3-0324.toml",
        "deprecated": false
      },
      "deepseek/deepseek-chat-v3.1": {
        "index": 56,
        "id": "deepseek/deepseek-chat-v3.1",
        "label": "DeepSeek V3.1",
        "group": "deepseek",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-chat-v3.1.toml",
        "deprecated": false
      },
      "deepseek/deepseek-r1": {
        "index": 57,
        "id": "deepseek/deepseek-r1",
        "label": "DeepSeek-R1",
        "group": "deepseek-thinking",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-r1.toml",
        "deprecated": false
      },
      "deepseek/deepseek-r1-0528": {
        "index": 58,
        "id": "deepseek/deepseek-r1-0528",
        "label": "R1 0528",
        "group": "deepseek",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-r1-0528.toml",
        "deprecated": false
      },
      "deepseek/deepseek-r1-distill-llama-70b": {
        "index": 59,
        "id": "deepseek/deepseek-r1-distill-llama-70b",
        "label": "R1 Distill Llama 70B",
        "group": "deepseek-thinking",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-r1-distill-llama-70b.toml",
        "deprecated": false
      },
      "deepseek/deepseek-v3.1-terminus": {
        "index": 60,
        "id": "deepseek/deepseek-v3.1-terminus",
        "label": "DeepSeek V3.1 Terminus",
        "group": "deepseek",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v3.1-terminus.toml",
        "deprecated": false
      },
      "deepseek/deepseek-v3.2": {
        "index": 61,
        "id": "deepseek/deepseek-v3.2",
        "label": "DeepSeek V3.2",
        "group": "deepseek",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v3.2.toml",
        "deprecated": false
      },
      "deepseek/deepseek-v3.2-exp": {
        "index": 62,
        "id": "deepseek/deepseek-v3.2-exp",
        "label": "DeepSeek V3.2 Exp",
        "group": "deepseek",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v3.2-exp.toml",
        "deprecated": false
      },
      "deepseek/deepseek-v4-flash": {
        "index": 63,
        "id": "deepseek/deepseek-v4-flash",
        "label": "DeepSeek V4 Flash",
        "group": "deepseek-flash",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v4-flash.toml",
        "deprecated": false
      },
      "deepseek/deepseek-v4-pro": {
        "index": 64,
        "id": "deepseek/deepseek-v4-pro",
        "label": "DeepSeek V4 Pro",
        "group": "deepseek-thinking",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v4-pro.toml",
        "deprecated": false
      },
      "google/gemini-2.5-flash": {
        "index": 65,
        "id": "google/gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "group": "gemini-flash",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-flash.toml",
        "deprecated": false
      },
      "google/gemini-2.5-flash-image": {
        "index": 66,
        "id": "google/gemini-2.5-flash-image",
        "label": "Nano Banana",
        "group": "gemini-flash",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-flash-image.toml",
        "deprecated": false
      },
      "google/gemini-2.5-flash-lite": {
        "index": 67,
        "id": "google/gemini-2.5-flash-lite",
        "label": "Gemini 2.5 Flash-Lite",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-flash-lite.toml",
        "deprecated": false
      },
      "google/gemini-2.5-pro": {
        "index": 68,
        "id": "google/gemini-2.5-pro",
        "label": "Gemini 2.5 Pro",
        "group": "gemini-pro",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-pro.toml",
        "deprecated": false
      },
      "google/gemini-2.5-pro-preview": {
        "index": 69,
        "id": "google/gemini-2.5-pro-preview",
        "label": "Gemini 2.5 Pro Preview 06-05",
        "group": "gemini",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-pro-preview.toml",
        "deprecated": false
      },
      "google/gemini-2.5-pro-preview-05-06": {
        "index": 70,
        "id": "google/gemini-2.5-pro-preview-05-06",
        "label": "Gemini 2.5 Pro Preview 05-06",
        "group": "gemini-pro",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-pro-preview-05-06.toml",
        "deprecated": false
      },
      "google/gemini-3-flash-preview": {
        "index": 71,
        "id": "google/gemini-3-flash-preview",
        "label": "Gemini 3 Flash Preview",
        "group": "gemini-flash",
        "sourceFile": "providers/openrouter/models/google/gemini-3-flash-preview.toml",
        "deprecated": false
      },
      "google/gemini-3-pro-image": {
        "index": 72,
        "id": "google/gemini-3-pro-image",
        "label": "Nano Banana Pro",
        "group": "gemini-pro",
        "sourceFile": "providers/openrouter/models/google/gemini-3-pro-image.toml",
        "deprecated": false
      },
      "google/gemini-3-pro-image-preview": {
        "index": 73,
        "id": "google/gemini-3-pro-image-preview",
        "label": "Nano Banana Pro",
        "group": "gemini-pro",
        "sourceFile": "providers/openrouter/models/google/gemini-3-pro-image-preview.toml",
        "deprecated": false
      },
      "google/gemini-3.1-flash-image": {
        "index": 74,
        "id": "google/gemini-3.1-flash-image",
        "label": "Nano Banana 2",
        "group": "gemini-flash",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-image.toml",
        "deprecated": false
      },
      "google/gemini-3.1-flash-image-preview": {
        "index": 75,
        "id": "google/gemini-3.1-flash-image-preview",
        "label": "Nano Banana 2",
        "group": "gemini-flash",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-image-preview.toml",
        "deprecated": false
      },
      "google/gemini-3.1-flash-lite": {
        "index": 76,
        "id": "google/gemini-3.1-flash-lite",
        "label": "Gemini 3.1 Flash Lite",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-lite.toml",
        "deprecated": false
      },
      "google/gemini-3.1-flash-lite-image": {
        "index": 77,
        "id": "google/gemini-3.1-flash-lite-image",
        "label": "Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)",
        "group": "gemini",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-lite-image.toml",
        "deprecated": false
      },
      "google/gemini-3.1-flash-lite-preview": {
        "index": 78,
        "id": "google/gemini-3.1-flash-lite-preview",
        "label": "Gemini 3.1 Flash Lite Preview",
        "group": "gemini-flash-lite",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-lite-preview.toml",
        "deprecated": false
      },
      "google/gemini-3.1-pro-preview": {
        "index": 79,
        "id": "google/gemini-3.1-pro-preview",
        "label": "Gemini 3.1 Pro Preview",
        "group": "gemini-pro",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-pro-preview.toml",
        "deprecated": false
      },
      "google/gemini-3.1-pro-preview-customtools": {
        "index": 80,
        "id": "google/gemini-3.1-pro-preview-customtools",
        "label": "Gemini 3.1 Pro Preview Custom Tools",
        "group": "gemini-pro",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-pro-preview-customtools.toml",
        "deprecated": false
      },
      "google/gemini-3.5-flash": {
        "index": 81,
        "id": "google/gemini-3.5-flash",
        "label": "Gemini 3.5 Flash",
        "group": "gemini-flash",
        "sourceFile": "providers/openrouter/models/google/gemini-3.5-flash.toml",
        "deprecated": false
      },
      "google/gemma-2-27b-it": {
        "index": 82,
        "id": "google/gemma-2-27b-it",
        "label": "Gemma 2 27B",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-2-27b-it.toml",
        "deprecated": false
      },
      "google/gemma-3-12b-it": {
        "index": 83,
        "id": "google/gemma-3-12b-it",
        "label": "Gemma 3 12B",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-3-12b-it.toml",
        "deprecated": false
      },
      "google/gemma-3-27b-it": {
        "index": 84,
        "id": "google/gemma-3-27b-it",
        "label": "Gemma 3 27B",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-3-27b-it.toml",
        "deprecated": false
      },
      "google/gemma-3-4b-it": {
        "index": 85,
        "id": "google/gemma-3-4b-it",
        "label": "Gemma 3 4B",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-3-4b-it.toml",
        "deprecated": false
      },
      "google/gemma-3n-e4b-it": {
        "index": 86,
        "id": "google/gemma-3n-e4b-it",
        "label": "Gemma 3n 4B",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-3n-e4b-it.toml",
        "deprecated": false
      },
      "google/gemma-4-26b-a4b-it": {
        "index": 87,
        "id": "google/gemma-4-26b-a4b-it",
        "label": "Gemma 4 26B A4B IT",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-4-26b-a4b-it.toml",
        "deprecated": false
      },
      "google/gemma-4-26b-a4b-it__58__free": {
        "index": 88,
        "id": "google/gemma-4-26b-a4b-it__58__free",
        "label": "Gemma 4 26B A4B  (free)",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-4-26b-a4b-it__58__free.toml",
        "deprecated": false
      },
      "google/gemma-4-31b-it": {
        "index": 89,
        "id": "google/gemma-4-31b-it",
        "label": "Gemma 4 31B IT",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-4-31b-it.toml",
        "deprecated": false
      },
      "google/gemma-4-31b-it__58__free": {
        "index": 90,
        "id": "google/gemma-4-31b-it__58__free",
        "label": "Gemma 4 31B (free)",
        "group": "gemma",
        "sourceFile": "providers/openrouter/models/google/gemma-4-31b-it__58__free.toml",
        "deprecated": false
      },
      "google/lyria-3-clip-preview": {
        "index": 91,
        "id": "google/lyria-3-clip-preview",
        "label": "Lyria 3 Clip Preview",
        "group": "lyria",
        "sourceFile": "providers/openrouter/models/google/lyria-3-clip-preview.toml",
        "deprecated": false
      },
      "google/lyria-3-pro-preview": {
        "index": 92,
        "id": "google/lyria-3-pro-preview",
        "label": "Lyria 3 Pro Preview",
        "group": "lyria",
        "sourceFile": "providers/openrouter/models/google/lyria-3-pro-preview.toml",
        "deprecated": false
      },
      "gryphe/mythomax-l2-13b": {
        "index": 93,
        "id": "gryphe/mythomax-l2-13b",
        "label": "MythoMax 13B",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/gryphe/mythomax-l2-13b.toml",
        "deprecated": false
      },
      "ibm-granite/granite-4.0-h-micro": {
        "index": 94,
        "id": "ibm-granite/granite-4.0-h-micro",
        "label": "Granite 4.0 Micro",
        "group": "granite",
        "sourceFile": "providers/openrouter/models/ibm-granite/granite-4.0-h-micro.toml",
        "deprecated": false
      },
      "ibm-granite/granite-4.1-8b": {
        "index": 95,
        "id": "ibm-granite/granite-4.1-8b",
        "label": "Granite 4.1 8B",
        "group": "granite",
        "sourceFile": "providers/openrouter/models/ibm-granite/granite-4.1-8b.toml",
        "deprecated": false
      },
      "inception/mercury-2": {
        "index": 96,
        "id": "inception/mercury-2",
        "label": "Mercury 2",
        "group": "mercury",
        "sourceFile": "providers/openrouter/models/inception/mercury-2.toml",
        "deprecated": false
      },
      "inclusionai/ling-2.6-1t": {
        "index": 97,
        "id": "inclusionai/ling-2.6-1t",
        "label": "Ling-2.6-1T",
        "group": "ling",
        "sourceFile": "providers/openrouter/models/inclusionai/ling-2.6-1t.toml",
        "deprecated": false
      },
      "inclusionai/ling-2.6-flash": {
        "index": 98,
        "id": "inclusionai/ling-2.6-flash",
        "label": "Ling-2.6-flash",
        "group": "ling",
        "sourceFile": "providers/openrouter/models/inclusionai/ling-2.6-flash.toml",
        "deprecated": false
      },
      "inclusionai/ring-2.6-1t": {
        "index": 99,
        "id": "inclusionai/ring-2.6-1t",
        "label": "Ring-2.6-1T",
        "group": "ring",
        "sourceFile": "providers/openrouter/models/inclusionai/ring-2.6-1t.toml",
        "deprecated": false
      },
      "inflection/inflection-3-pi": {
        "index": 100,
        "id": "inflection/inflection-3-pi",
        "label": "Inflection 3 Pi",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/inflection/inflection-3-pi.toml",
        "deprecated": false
      },
      "inflection/inflection-3-productivity": {
        "index": 101,
        "id": "inflection/inflection-3-productivity",
        "label": "Inflection 3 Productivity",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/inflection/inflection-3-productivity.toml",
        "deprecated": false
      },
      "kwaipilot/kat-coder-pro-v2": {
        "index": 102,
        "id": "kwaipilot/kat-coder-pro-v2",
        "label": "KAT-Coder-Pro V2",
        "group": "kat-coder",
        "sourceFile": "providers/openrouter/models/kwaipilot/kat-coder-pro-v2.toml",
        "deprecated": false
      },
      "liquid/lfm-2.5-1.2b-instruct__58__free": {
        "index": 103,
        "id": "liquid/lfm-2.5-1.2b-instruct__58__free",
        "label": "LFM2.5-1.2B-Instruct (free)",
        "group": "liquid",
        "sourceFile": "providers/openrouter/models/liquid/lfm-2.5-1.2b-instruct__58__free.toml",
        "deprecated": false
      },
      "liquid/lfm-2.5-1.2b-thinking__58__free": {
        "index": 104,
        "id": "liquid/lfm-2.5-1.2b-thinking__58__free",
        "label": "LFM2.5-1.2B-Thinking (free)",
        "group": "liquid",
        "sourceFile": "providers/openrouter/models/liquid/lfm-2.5-1.2b-thinking__58__free.toml",
        "deprecated": false
      },
      "mancer/weaver": {
        "index": 105,
        "id": "mancer/weaver",
        "label": "Weaver (alpha)",
        "group": "alpha",
        "sourceFile": "providers/openrouter/models/mancer/weaver.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.1-70b-instruct": {
        "index": 106,
        "id": "meta-llama/llama-3.1-70b-instruct",
        "label": "Llama 3.1 70B Instruct",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.1-70b-instruct.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.1-8b-instruct": {
        "index": 107,
        "id": "meta-llama/llama-3.1-8b-instruct",
        "label": "Llama 3.1 8B Instruct",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.1-8b-instruct.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.2-11b-vision-instruct": {
        "index": 108,
        "id": "meta-llama/llama-3.2-11b-vision-instruct",
        "label": "Llama 3.2 11B Vision Instruct",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-11b-vision-instruct.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.2-1b-instruct": {
        "index": 109,
        "id": "meta-llama/llama-3.2-1b-instruct",
        "label": "Llama 3.2 1B Instruct",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-1b-instruct.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.2-3b-instruct": {
        "index": 110,
        "id": "meta-llama/llama-3.2-3b-instruct",
        "label": "Llama 3.2 3B Instruct",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-3b-instruct.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.2-3b-instruct__58__free": {
        "index": 111,
        "id": "meta-llama/llama-3.2-3b-instruct__58__free",
        "label": "Llama 3.2 3B Instruct (free)",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-3b-instruct__58__free.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.3-70b-instruct": {
        "index": 112,
        "id": "meta-llama/llama-3.3-70b-instruct",
        "label": "Llama-3.3-70B-Instruct",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.3-70b-instruct.toml",
        "deprecated": false
      },
      "meta-llama/llama-3.3-70b-instruct__58__free": {
        "index": 113,
        "id": "meta-llama/llama-3.3-70b-instruct__58__free",
        "label": "Llama 3.3 70B Instruct (free)",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.3-70b-instruct__58__free.toml",
        "deprecated": false
      },
      "meta-llama/llama-4-maverick": {
        "index": 114,
        "id": "meta-llama/llama-4-maverick",
        "label": "Llama 4 Maverick",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-4-maverick.toml",
        "deprecated": false
      },
      "meta-llama/llama-4-scout": {
        "index": 115,
        "id": "meta-llama/llama-4-scout",
        "label": "Llama 4 Scout",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-4-scout.toml",
        "deprecated": false
      },
      "meta-llama/llama-guard-4-12b": {
        "index": 116,
        "id": "meta-llama/llama-guard-4-12b",
        "label": "Llama Guard 4 12B",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-guard-4-12b.toml",
        "deprecated": false
      },
      "microsoft/phi-4": {
        "index": 117,
        "id": "microsoft/phi-4",
        "label": "Phi 4",
        "group": "phi",
        "sourceFile": "providers/openrouter/models/microsoft/phi-4.toml",
        "deprecated": false
      },
      "microsoft/wizardlm-2-8x22b": {
        "index": 118,
        "id": "microsoft/wizardlm-2-8x22b",
        "label": "WizardLM-2 8x22B",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/microsoft/wizardlm-2-8x22b.toml",
        "deprecated": false
      },
      "minimax/minimax-01": {
        "index": 119,
        "id": "minimax/minimax-01",
        "label": "MiniMax-01",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-01.toml",
        "deprecated": false
      },
      "minimax/minimax-m1": {
        "index": 120,
        "id": "minimax/minimax-m1",
        "label": "MiniMax M1",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m1.toml",
        "deprecated": false
      },
      "minimax/minimax-m2": {
        "index": 121,
        "id": "minimax/minimax-m2",
        "label": "MiniMax-M2",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.toml",
        "deprecated": false
      },
      "minimax/minimax-m2-her": {
        "index": 122,
        "id": "minimax/minimax-m2-her",
        "label": "MiniMax M2-her",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2-her.toml",
        "deprecated": false
      },
      "minimax/minimax-m2.1": {
        "index": 123,
        "id": "minimax/minimax-m2.1",
        "label": "MiniMax-M2.1",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.1.toml",
        "deprecated": false
      },
      "minimax/minimax-m2.5": {
        "index": 124,
        "id": "minimax/minimax-m2.5",
        "label": "MiniMax-M2.5",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.5.toml",
        "deprecated": false
      },
      "minimax/minimax-m2.7": {
        "index": 125,
        "id": "minimax/minimax-m2.7",
        "label": "MiniMax-M2.7",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.7.toml",
        "deprecated": false
      },
      "minimax/minimax-m3": {
        "index": 126,
        "id": "minimax/minimax-m3",
        "label": "MiniMax-M3",
        "group": "minimax",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m3.toml",
        "deprecated": false
      },
      "mistralai/codestral-2508": {
        "index": 127,
        "id": "mistralai/codestral-2508",
        "label": "Codestral 2508",
        "group": "codestral",
        "sourceFile": "providers/openrouter/models/mistralai/codestral-2508.toml",
        "deprecated": false
      },
      "mistralai/devstral-2512": {
        "index": 128,
        "id": "mistralai/devstral-2512",
        "label": "Devstral 2",
        "group": "devstral",
        "sourceFile": "providers/openrouter/models/mistralai/devstral-2512.toml",
        "deprecated": true
      },
      "mistralai/ministral-14b-2512": {
        "index": 129,
        "id": "mistralai/ministral-14b-2512",
        "label": "Ministral 3 14B 2512",
        "group": "ministral",
        "sourceFile": "providers/openrouter/models/mistralai/ministral-14b-2512.toml",
        "deprecated": false
      },
      "mistralai/ministral-3b-2512": {
        "index": 130,
        "id": "mistralai/ministral-3b-2512",
        "label": "Ministral 3 3B 2512",
        "group": "ministral",
        "sourceFile": "providers/openrouter/models/mistralai/ministral-3b-2512.toml",
        "deprecated": false
      },
      "mistralai/ministral-8b-2512": {
        "index": 131,
        "id": "mistralai/ministral-8b-2512",
        "label": "Ministral 3 8B 2512",
        "group": "ministral",
        "sourceFile": "providers/openrouter/models/mistralai/ministral-8b-2512.toml",
        "deprecated": false
      },
      "mistralai/mistral-large": {
        "index": 132,
        "id": "mistralai/mistral-large",
        "label": "Mistral Large",
        "group": "mistral-large",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-large.toml",
        "deprecated": false
      },
      "mistralai/mistral-large-2407": {
        "index": 133,
        "id": "mistralai/mistral-large-2407",
        "label": "Mistral Large 2407",
        "group": "mistral-large",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-large-2407.toml",
        "deprecated": false
      },
      "mistralai/mistral-large-2512": {
        "index": 134,
        "id": "mistralai/mistral-large-2512",
        "label": "Mistral Large 3",
        "group": "mistral-large",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-large-2512.toml",
        "deprecated": false
      },
      "mistralai/mistral-medium-3": {
        "index": 135,
        "id": "mistralai/mistral-medium-3",
        "label": "Mistral Medium 3",
        "group": "mistral-medium",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-medium-3.toml",
        "deprecated": false
      },
      "mistralai/mistral-medium-3-5": {
        "index": 136,
        "id": "mistralai/mistral-medium-3-5",
        "label": "Mistral Medium 3.5",
        "group": "mistral-medium",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-medium-3-5.toml",
        "deprecated": false
      },
      "mistralai/mistral-medium-3.1": {
        "index": 137,
        "id": "mistralai/mistral-medium-3.1",
        "label": "Mistral Medium 3.1",
        "group": "mistral-medium",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-medium-3.1.toml",
        "deprecated": false
      },
      "mistralai/mistral-nemo": {
        "index": 138,
        "id": "mistralai/mistral-nemo",
        "label": "Mistral Nemo",
        "group": "mistral-nemo",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-nemo.toml",
        "deprecated": false
      },
      "mistralai/mistral-saba": {
        "index": 139,
        "id": "mistralai/mistral-saba",
        "label": "Saba",
        "group": "mistral",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-saba.toml",
        "deprecated": false
      },
      "mistralai/mistral-small-24b-instruct-2501": {
        "index": 140,
        "id": "mistralai/mistral-small-24b-instruct-2501",
        "label": "Mistral Small 3",
        "group": "mistral-small",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-24b-instruct-2501.toml",
        "deprecated": false
      },
      "mistralai/mistral-small-2603": {
        "index": 141,
        "id": "mistralai/mistral-small-2603",
        "label": "Mistral Small 4",
        "group": "mistral-small",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-2603.toml",
        "deprecated": false
      },
      "mistralai/mistral-small-3.1-24b-instruct": {
        "index": 142,
        "id": "mistralai/mistral-small-3.1-24b-instruct",
        "label": "Mistral Small 3.1 24B",
        "group": "mistral-small",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-3.1-24b-instruct.toml",
        "deprecated": false
      },
      "mistralai/mistral-small-3.2-24b-instruct": {
        "index": 143,
        "id": "mistralai/mistral-small-3.2-24b-instruct",
        "label": "Mistral Small 3.2 24B",
        "group": "mistral-small",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-3.2-24b-instruct.toml",
        "deprecated": false
      },
      "mistralai/mixtral-8x22b-instruct": {
        "index": 144,
        "id": "mistralai/mixtral-8x22b-instruct",
        "label": "Mixtral 8x22B Instruct",
        "group": "mistral",
        "sourceFile": "providers/openrouter/models/mistralai/mixtral-8x22b-instruct.toml",
        "deprecated": false
      },
      "mistralai/voxtral-small-24b-2507": {
        "index": 145,
        "id": "mistralai/voxtral-small-24b-2507",
        "label": "Voxtral Small 24B 2507",
        "group": "mistral",
        "sourceFile": "providers/openrouter/models/mistralai/voxtral-small-24b-2507.toml",
        "deprecated": false
      },
      "moonshotai/kimi-k2": {
        "index": 146,
        "id": "moonshotai/kimi-k2",
        "label": "Kimi K2 0711",
        "group": "kimi-k2",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.toml",
        "deprecated": false
      },
      "moonshotai/kimi-k2-0905": {
        "index": 147,
        "id": "moonshotai/kimi-k2-0905",
        "label": "Kimi K2 0905",
        "group": "kimi-k2",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2-0905.toml",
        "deprecated": false
      },
      "moonshotai/kimi-k2-thinking": {
        "index": 148,
        "id": "moonshotai/kimi-k2-thinking",
        "label": "Kimi K2 Thinking",
        "group": "kimi-thinking",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2-thinking.toml",
        "deprecated": false
      },
      "moonshotai/kimi-k2.5": {
        "index": 149,
        "id": "moonshotai/kimi-k2.5",
        "label": "Kimi K2.5",
        "group": "kimi-k2",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.5.toml",
        "deprecated": false
      },
      "moonshotai/kimi-k2.6": {
        "index": 150,
        "id": "moonshotai/kimi-k2.6",
        "label": "Kimi K2.6",
        "group": "kimi-k2",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.6.toml",
        "deprecated": false
      },
      "moonshotai/kimi-k2.7-code": {
        "index": 151,
        "id": "moonshotai/kimi-k2.7-code",
        "label": "Kimi K2.7 Code",
        "group": "kimi-k2",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.7-code.toml",
        "deprecated": false
      },
      "morph/morph-v3-fast": {
        "index": 152,
        "id": "morph/morph-v3-fast",
        "label": "Morph V3 Fast",
        "group": "morph",
        "sourceFile": "providers/openrouter/models/morph/morph-v3-fast.toml",
        "deprecated": false
      },
      "morph/morph-v3-large": {
        "index": 153,
        "id": "morph/morph-v3-large",
        "label": "Morph V3 Large",
        "group": "morph",
        "sourceFile": "providers/openrouter/models/morph/morph-v3-large.toml",
        "deprecated": false
      },
      "nex-agi/nex-n2-mini": {
        "index": 154,
        "id": "nex-agi/nex-n2-mini",
        "label": "Nex-N2-Mini",
        "group": "agi",
        "sourceFile": "providers/openrouter/models/nex-agi/nex-n2-mini.toml",
        "deprecated": false
      },
      "nex-agi/nex-n2-pro": {
        "index": 155,
        "id": "nex-agi/nex-n2-pro",
        "label": "Nex-N2-Pro",
        "group": "agi",
        "sourceFile": "providers/openrouter/models/nex-agi/nex-n2-pro.toml",
        "deprecated": false
      },
      "nousresearch/hermes-3-llama-3.1-405b": {
        "index": 156,
        "id": "nousresearch/hermes-3-llama-3.1-405b",
        "label": "Hermes 3 405B Instruct",
        "group": "nousresearch",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-3-llama-3.1-405b.toml",
        "deprecated": false
      },
      "nousresearch/hermes-3-llama-3.1-405b__58__free": {
        "index": 157,
        "id": "nousresearch/hermes-3-llama-3.1-405b__58__free",
        "label": "Hermes 3 405B Instruct (free)",
        "group": "hermes",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-3-llama-3.1-405b__58__free.toml",
        "deprecated": false
      },
      "nousresearch/hermes-3-llama-3.1-70b": {
        "index": 158,
        "id": "nousresearch/hermes-3-llama-3.1-70b",
        "label": "Hermes 3 70B Instruct",
        "group": "nousresearch",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-3-llama-3.1-70b.toml",
        "deprecated": false
      },
      "nousresearch/hermes-4-405b": {
        "index": 159,
        "id": "nousresearch/hermes-4-405b",
        "label": "Hermes 4 405B",
        "group": "hermes",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-4-405b.toml",
        "deprecated": false
      },
      "nousresearch/hermes-4-70b": {
        "index": 160,
        "id": "nousresearch/hermes-4-70b",
        "label": "Hermes 4 70B",
        "group": "hermes",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-4-70b.toml",
        "deprecated": false
      },
      "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
        "index": 161,
        "id": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        "label": "Llama 3.3 Nemotron Super 49B v1.5",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/llama-3.3-nemotron-super-49b-v1.5.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3-nano-30b-a3b": {
        "index": 162,
        "id": "nvidia/nemotron-3-nano-30b-a3b",
        "label": "Nemotron 3 Nano 30B A3B",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-nano-30b-a3b.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3-nano-30b-a3b__58__free": {
        "index": 163,
        "id": "nvidia/nemotron-3-nano-30b-a3b__58__free",
        "label": "Nemotron 3 Nano 30B A3B (free)",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-nano-30b-a3b__58__free.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning__58__free": {
        "index": 164,
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning__58__free",
        "label": "Nemotron 3 Nano Omni (free)",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning__58__free.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3-super-120b-a12b": {
        "index": 165,
        "id": "nvidia/nemotron-3-super-120b-a12b",
        "label": "Nemotron 3 Super 120B A12B",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-super-120b-a12b.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3-super-120b-a12b__58__free": {
        "index": 166,
        "id": "nvidia/nemotron-3-super-120b-a12b__58__free",
        "label": "Nemotron 3 Super (free)",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-super-120b-a12b__58__free.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3-ultra-550b-a55b": {
        "index": 167,
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "label": "Nemotron 3 Ultra 550B A55B",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-ultra-550b-a55b.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3-ultra-550b-a55b__58__free": {
        "index": 168,
        "id": "nvidia/nemotron-3-ultra-550b-a55b__58__free",
        "label": "Nemotron 3 Ultra (free)",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-ultra-550b-a55b__58__free.toml",
        "deprecated": false
      },
      "nvidia/nemotron-3.5-content-safety__58__free": {
        "index": 169,
        "id": "nvidia/nemotron-3.5-content-safety__58__free",
        "label": "Nemotron 3.5 Content Safety (free)",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3.5-content-safety__58__free.toml",
        "deprecated": false
      },
      "nvidia/nemotron-nano-12b-v2-vl__58__free": {
        "index": 170,
        "id": "nvidia/nemotron-nano-12b-v2-vl__58__free",
        "label": "Nemotron Nano 12B 2 VL (free)",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-nano-12b-v2-vl__58__free.toml",
        "deprecated": false
      },
      "nvidia/nemotron-nano-9b-v2__58__free": {
        "index": 171,
        "id": "nvidia/nemotron-nano-9b-v2__58__free",
        "label": "Nemotron Nano 9B V2 (free)",
        "group": "nemotron",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-nano-9b-v2__58__free.toml",
        "deprecated": false
      },
      "openai/gpt-3.5-turbo": {
        "index": 172,
        "id": "openai/gpt-3.5-turbo",
        "label": "GPT-3.5-turbo",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo.toml",
        "deprecated": false
      },
      "openai/gpt-3.5-turbo-0613": {
        "index": 173,
        "id": "openai/gpt-3.5-turbo-0613",
        "label": "GPT-3.5 Turbo (older v0613)",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo-0613.toml",
        "deprecated": false
      },
      "openai/gpt-3.5-turbo-16k": {
        "index": 174,
        "id": "openai/gpt-3.5-turbo-16k",
        "label": "GPT-3.5 Turbo 16k",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo-16k.toml",
        "deprecated": false
      },
      "openai/gpt-3.5-turbo-instruct": {
        "index": 175,
        "id": "openai/gpt-3.5-turbo-instruct",
        "label": "GPT-3.5 Turbo Instruct",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo-instruct.toml",
        "deprecated": false
      },
      "openai/gpt-4": {
        "index": 176,
        "id": "openai/gpt-4",
        "label": "GPT-4",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.toml",
        "deprecated": false
      },
      "openai/gpt-4-turbo": {
        "index": 177,
        "id": "openai/gpt-4-turbo",
        "label": "GPT-4 Turbo",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4-turbo.toml",
        "deprecated": false
      },
      "openai/gpt-4-turbo-preview": {
        "index": 178,
        "id": "openai/gpt-4-turbo-preview",
        "label": "GPT-4 Turbo Preview",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4-turbo-preview.toml",
        "deprecated": false
      },
      "openai/gpt-4.1": {
        "index": 179,
        "id": "openai/gpt-4.1",
        "label": "GPT-4.1",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.1.toml",
        "deprecated": false
      },
      "openai/gpt-4.1-mini": {
        "index": 180,
        "id": "openai/gpt-4.1-mini",
        "label": "GPT-4.1 mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.1-mini.toml",
        "deprecated": false
      },
      "openai/gpt-4.1-nano": {
        "index": 181,
        "id": "openai/gpt-4.1-nano",
        "label": "GPT-4.1 nano",
        "group": "gpt-nano",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.1-nano.toml",
        "deprecated": false
      },
      "openai/gpt-4o": {
        "index": 182,
        "id": "openai/gpt-4o",
        "label": "GPT-4o",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o.toml",
        "deprecated": false
      },
      "openai/gpt-4o-2024-05-13": {
        "index": 183,
        "id": "openai/gpt-4o-2024-05-13",
        "label": "GPT-4o (2024-05-13)",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-2024-05-13.toml",
        "deprecated": false
      },
      "openai/gpt-4o-2024-08-06": {
        "index": 184,
        "id": "openai/gpt-4o-2024-08-06",
        "label": "GPT-4o (2024-08-06)",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-2024-08-06.toml",
        "deprecated": false
      },
      "openai/gpt-4o-2024-11-20": {
        "index": 185,
        "id": "openai/gpt-4o-2024-11-20",
        "label": "GPT-4o (2024-11-20)",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-2024-11-20.toml",
        "deprecated": false
      },
      "openai/gpt-4o-mini": {
        "index": 186,
        "id": "openai/gpt-4o-mini",
        "label": "GPT-4o mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-mini.toml",
        "deprecated": false
      },
      "openai/gpt-4o-mini-2024-07-18": {
        "index": 187,
        "id": "openai/gpt-4o-mini-2024-07-18",
        "label": "GPT-4o-mini (2024-07-18)",
        "group": "o-mini",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-mini-2024-07-18.toml",
        "deprecated": false
      },
      "openai/gpt-4o-mini-search-preview": {
        "index": 188,
        "id": "openai/gpt-4o-mini-search-preview",
        "label": "GPT-4o-mini Search Preview",
        "group": "o-mini",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-mini-search-preview.toml",
        "deprecated": false
      },
      "openai/gpt-4o-search-preview": {
        "index": 189,
        "id": "openai/gpt-4o-search-preview",
        "label": "GPT-4o Search Preview",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-search-preview.toml",
        "deprecated": false
      },
      "openai/gpt-5": {
        "index": 190,
        "id": "openai/gpt-5",
        "label": "GPT-5",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.toml",
        "deprecated": false
      },
      "openai/gpt-5-chat": {
        "index": 191,
        "id": "openai/gpt-5-chat",
        "label": "GPT-5 Chat",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-chat.toml",
        "deprecated": false
      },
      "openai/gpt-5-codex": {
        "index": 192,
        "id": "openai/gpt-5-codex",
        "label": "GPT-5-Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-codex.toml",
        "deprecated": false
      },
      "openai/gpt-5-image": {
        "index": 193,
        "id": "openai/gpt-5-image",
        "label": "GPT-5 Image",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-image.toml",
        "deprecated": false
      },
      "openai/gpt-5-image-mini": {
        "index": 194,
        "id": "openai/gpt-5-image-mini",
        "label": "GPT-5 Image Mini",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-image-mini.toml",
        "deprecated": false
      },
      "openai/gpt-5-mini": {
        "index": 195,
        "id": "openai/gpt-5-mini",
        "label": "GPT-5 Mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-mini.toml",
        "deprecated": false
      },
      "openai/gpt-5-nano": {
        "index": 196,
        "id": "openai/gpt-5-nano",
        "label": "GPT-5 Nano",
        "group": "gpt-nano",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-nano.toml",
        "deprecated": false
      },
      "openai/gpt-5-pro": {
        "index": 197,
        "id": "openai/gpt-5-pro",
        "label": "GPT-5 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-pro.toml",
        "deprecated": false
      },
      "openai/gpt-5.1": {
        "index": 198,
        "id": "openai/gpt-5.1",
        "label": "GPT-5.1",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1.toml",
        "deprecated": false
      },
      "openai/gpt-5.1-chat": {
        "index": 199,
        "id": "openai/gpt-5.1-chat",
        "label": "GPT-5.1 Chat",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-chat.toml",
        "deprecated": false
      },
      "openai/gpt-5.1-codex": {
        "index": 200,
        "id": "openai/gpt-5.1-codex",
        "label": "GPT-5.1 Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-codex.toml",
        "deprecated": false
      },
      "openai/gpt-5.1-codex-max": {
        "index": 201,
        "id": "openai/gpt-5.1-codex-max",
        "label": "GPT-5.1 Codex Max",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-codex-max.toml",
        "deprecated": false
      },
      "openai/gpt-5.1-codex-mini": {
        "index": 202,
        "id": "openai/gpt-5.1-codex-mini",
        "label": "GPT-5.1 Codex mini",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-codex-mini.toml",
        "deprecated": false
      },
      "openai/gpt-5.2": {
        "index": 203,
        "id": "openai/gpt-5.2",
        "label": "GPT-5.2",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2.toml",
        "deprecated": false
      },
      "openai/gpt-5.2-chat": {
        "index": 204,
        "id": "openai/gpt-5.2-chat",
        "label": "GPT-5.2 Chat",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2-chat.toml",
        "deprecated": false
      },
      "openai/gpt-5.2-codex": {
        "index": 205,
        "id": "openai/gpt-5.2-codex",
        "label": "GPT-5.2 Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2-codex.toml",
        "deprecated": false
      },
      "openai/gpt-5.2-pro": {
        "index": 206,
        "id": "openai/gpt-5.2-pro",
        "label": "GPT-5.2 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2-pro.toml",
        "deprecated": false
      },
      "openai/gpt-5.3-chat": {
        "index": 207,
        "id": "openai/gpt-5.3-chat",
        "label": "GPT-5.3 Chat",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.3-chat.toml",
        "deprecated": false
      },
      "openai/gpt-5.3-codex": {
        "index": 208,
        "id": "openai/gpt-5.3-codex",
        "label": "GPT-5.3 Codex",
        "group": "gpt-codex",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.3-codex.toml",
        "deprecated": false
      },
      "openai/gpt-5.4": {
        "index": 209,
        "id": "openai/gpt-5.4",
        "label": "GPT-5.4",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4.toml",
        "deprecated": false
      },
      "openai/gpt-5.4-image-2": {
        "index": 210,
        "id": "openai/gpt-5.4-image-2",
        "label": "GPT-5.4 Image 2",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-image-2.toml",
        "deprecated": false
      },
      "openai/gpt-5.4-mini": {
        "index": 211,
        "id": "openai/gpt-5.4-mini",
        "label": "GPT-5.4 mini",
        "group": "gpt-mini",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-mini.toml",
        "deprecated": false
      },
      "openai/gpt-5.4-nano": {
        "index": 212,
        "id": "openai/gpt-5.4-nano",
        "label": "GPT-5.4 nano",
        "group": "gpt-nano",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-nano.toml",
        "deprecated": false
      },
      "openai/gpt-5.4-pro": {
        "index": 213,
        "id": "openai/gpt-5.4-pro",
        "label": "GPT-5.4 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-pro.toml",
        "deprecated": false
      },
      "openai/gpt-5.5": {
        "index": 214,
        "id": "openai/gpt-5.5",
        "label": "GPT-5.5",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.5.toml",
        "deprecated": false
      },
      "openai/gpt-5.5-pro": {
        "index": 215,
        "id": "openai/gpt-5.5-pro",
        "label": "GPT-5.5 Pro",
        "group": "gpt-pro",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.5-pro.toml",
        "deprecated": false
      },
      "openai/gpt-5.6-luna": {
        "index": 216,
        "id": "openai/gpt-5.6-luna",
        "label": "GPT-5.6 Luna",
        "group": "gpt-luna",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-luna.toml",
        "deprecated": false
      },
      "openai/gpt-5.6-luna-pro": {
        "index": 217,
        "id": "openai/gpt-5.6-luna-pro",
        "label": "GPT-5.6 Luna Pro",
        "group": "gpt-luna",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-luna-pro.toml",
        "deprecated": false
      },
      "openai/gpt-5.6-sol": {
        "index": 218,
        "id": "openai/gpt-5.6-sol",
        "label": "GPT-5.6 Sol",
        "group": "gpt-sol",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-sol.toml",
        "deprecated": false
      },
      "openai/gpt-5.6-sol-pro": {
        "index": 219,
        "id": "openai/gpt-5.6-sol-pro",
        "label": "GPT-5.6 Sol Pro",
        "group": "gpt-sol",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-sol-pro.toml",
        "deprecated": false
      },
      "openai/gpt-5.6-terra": {
        "index": 220,
        "id": "openai/gpt-5.6-terra",
        "label": "GPT-5.6 Terra",
        "group": "gpt-terra",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-terra.toml",
        "deprecated": false
      },
      "openai/gpt-5.6-terra-pro": {
        "index": 221,
        "id": "openai/gpt-5.6-terra-pro",
        "label": "GPT-5.6 Terra Pro",
        "group": "gpt-terra",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-terra-pro.toml",
        "deprecated": false
      },
      "openai/gpt-audio": {
        "index": 222,
        "id": "openai/gpt-audio",
        "label": "GPT Audio",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-audio.toml",
        "deprecated": false
      },
      "openai/gpt-audio-mini": {
        "index": 223,
        "id": "openai/gpt-audio-mini",
        "label": "GPT Audio Mini",
        "group": "o-mini",
        "sourceFile": "providers/openrouter/models/openai/gpt-audio-mini.toml",
        "deprecated": false
      },
      "openai/gpt-chat-latest": {
        "index": 224,
        "id": "openai/gpt-chat-latest",
        "label": "GPT Chat Latest",
        "group": "gpt",
        "sourceFile": "providers/openrouter/models/openai/gpt-chat-latest.toml",
        "deprecated": false
      },
      "openai/gpt-oss-120b": {
        "index": 225,
        "id": "openai/gpt-oss-120b",
        "label": "GPT OSS 120B",
        "group": "gpt-oss",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-120b.toml",
        "deprecated": false
      },
      "openai/gpt-oss-120b__58__free": {
        "index": 226,
        "id": "openai/gpt-oss-120b__58__free",
        "label": "gpt-oss-120b (free)",
        "group": "gpt-oss",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-120b__58__free.toml",
        "deprecated": false
      },
      "openai/gpt-oss-20b": {
        "index": 227,
        "id": "openai/gpt-oss-20b",
        "label": "GPT OSS 20B",
        "group": "gpt-oss",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-20b.toml",
        "deprecated": false
      },
      "openai/gpt-oss-20b__58__free": {
        "index": 228,
        "id": "openai/gpt-oss-20b__58__free",
        "label": "gpt-oss-20b (free)",
        "group": "gpt-oss",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-20b__58__free.toml",
        "deprecated": false
      },
      "openai/gpt-oss-safeguard-20b": {
        "index": 229,
        "id": "openai/gpt-oss-safeguard-20b",
        "label": "gpt-oss-safeguard-20b",
        "group": "gpt-oss",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-safeguard-20b.toml",
        "deprecated": false
      },
      "openai/o1": {
        "index": 230,
        "id": "openai/o1",
        "label": "o1",
        "group": "o",
        "sourceFile": "providers/openrouter/models/openai/o1.toml",
        "deprecated": false
      },
      "openai/o1-pro": {
        "index": 231,
        "id": "openai/o1-pro",
        "label": "o1-pro",
        "group": "o-pro",
        "sourceFile": "providers/openrouter/models/openai/o1-pro.toml",
        "deprecated": false
      },
      "openai/o3": {
        "index": 232,
        "id": "openai/o3",
        "label": "o3",
        "group": "o",
        "sourceFile": "providers/openrouter/models/openai/o3.toml",
        "deprecated": false
      },
      "openai/o3-deep-research": {
        "index": 233,
        "id": "openai/o3-deep-research",
        "label": "o3-deep-research",
        "group": "o",
        "sourceFile": "providers/openrouter/models/openai/o3-deep-research.toml",
        "deprecated": false
      },
      "openai/o3-mini": {
        "index": 234,
        "id": "openai/o3-mini",
        "label": "o3-mini",
        "group": "o-mini",
        "sourceFile": "providers/openrouter/models/openai/o3-mini.toml",
        "deprecated": false
      },
      "openai/o3-mini-high": {
        "index": 235,
        "id": "openai/o3-mini-high",
        "label": "o3 Mini High",
        "group": "o",
        "sourceFile": "providers/openrouter/models/openai/o3-mini-high.toml",
        "deprecated": false
      },
      "openai/o3-pro": {
        "index": 236,
        "id": "openai/o3-pro",
        "label": "o3-pro",
        "group": "o-pro",
        "sourceFile": "providers/openrouter/models/openai/o3-pro.toml",
        "deprecated": false
      },
      "openai/o4-mini": {
        "index": 237,
        "id": "openai/o4-mini",
        "label": "o4-mini",
        "group": "o-mini",
        "sourceFile": "providers/openrouter/models/openai/o4-mini.toml",
        "deprecated": false
      },
      "openai/o4-mini-deep-research": {
        "index": 238,
        "id": "openai/o4-mini-deep-research",
        "label": "o4-mini-deep-research",
        "group": "o-mini",
        "sourceFile": "providers/openrouter/models/openai/o4-mini-deep-research.toml",
        "deprecated": false
      },
      "openai/o4-mini-high": {
        "index": 239,
        "id": "openai/o4-mini-high",
        "label": "o4 Mini High",
        "group": "o",
        "sourceFile": "providers/openrouter/models/openai/o4-mini-high.toml",
        "deprecated": false
      },
      "openrouter/auto": {
        "index": 240,
        "id": "openrouter/auto",
        "label": "Auto Router",
        "group": "auto",
        "sourceFile": "providers/openrouter/models/openrouter/auto.toml",
        "deprecated": false
      },
      "openrouter/bodybuilder": {
        "index": 241,
        "id": "openrouter/bodybuilder",
        "label": "Body Builder (beta)",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/openrouter/bodybuilder.toml",
        "deprecated": false
      },
      "openrouter/free": {
        "index": 242,
        "id": "openrouter/free",
        "label": "Free Models Router",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/openrouter/free.toml",
        "deprecated": false
      },
      "openrouter/fusion": {
        "index": 243,
        "id": "openrouter/fusion",
        "label": "Fusion",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/openrouter/fusion.toml",
        "deprecated": false
      },
      "openrouter/pareto-code": {
        "index": 244,
        "id": "openrouter/pareto-code",
        "label": "Pareto Code Router",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/openrouter/pareto-code.toml",
        "deprecated": false
      },
      "perceptron/perceptron-mk1": {
        "index": 245,
        "id": "perceptron/perceptron-mk1",
        "label": "Perceptron Mk1",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/perceptron/perceptron-mk1.toml",
        "deprecated": false
      },
      "perplexity/sonar": {
        "index": 246,
        "id": "perplexity/sonar",
        "label": "Sonar",
        "group": "sonar",
        "sourceFile": "providers/openrouter/models/perplexity/sonar.toml",
        "deprecated": false
      },
      "perplexity/sonar-deep-research": {
        "index": 247,
        "id": "perplexity/sonar-deep-research",
        "label": "Sonar Deep Research",
        "group": "sonar-deep-research",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-deep-research.toml",
        "deprecated": false
      },
      "perplexity/sonar-pro": {
        "index": 248,
        "id": "perplexity/sonar-pro",
        "label": "Sonar Pro",
        "group": "sonar-pro",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-pro.toml",
        "deprecated": false
      },
      "perplexity/sonar-pro-search": {
        "index": 249,
        "id": "perplexity/sonar-pro-search",
        "label": "Sonar Pro Search",
        "group": "sonar-pro",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-pro-search.toml",
        "deprecated": false
      },
      "perplexity/sonar-reasoning-pro": {
        "index": 250,
        "id": "perplexity/sonar-reasoning-pro",
        "label": "Sonar Reasoning Pro",
        "group": "sonar-reasoning",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-reasoning-pro.toml",
        "deprecated": false
      },
      "poolside/laguna-m.1": {
        "index": 251,
        "id": "poolside/laguna-m.1",
        "label": "Laguna M.1",
        "group": "laguna",
        "sourceFile": "providers/openrouter/models/poolside/laguna-m.1.toml",
        "deprecated": false
      },
      "poolside/laguna-m.1__58__free": {
        "index": 252,
        "id": "poolside/laguna-m.1__58__free",
        "label": "Laguna M.1 (free)",
        "group": "laguna",
        "sourceFile": "providers/openrouter/models/poolside/laguna-m.1__58__free.toml",
        "deprecated": false
      },
      "poolside/laguna-xs-2.1": {
        "index": 253,
        "id": "poolside/laguna-xs-2.1",
        "label": "Laguna XS 2.1",
        "group": "laguna",
        "sourceFile": "providers/openrouter/models/poolside/laguna-xs-2.1.toml",
        "deprecated": false
      },
      "poolside/laguna-xs-2.1__58__free": {
        "index": 254,
        "id": "poolside/laguna-xs-2.1__58__free",
        "label": "Laguna XS 2.1 (free)",
        "group": "laguna",
        "sourceFile": "providers/openrouter/models/poolside/laguna-xs-2.1__58__free.toml",
        "deprecated": false
      },
      "qwen/qwen-2.5-72b-instruct": {
        "index": 255,
        "id": "qwen/qwen-2.5-72b-instruct",
        "label": "Qwen2.5 72B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen-2.5-72b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen-2.5-7b-instruct": {
        "index": 256,
        "id": "qwen/qwen-2.5-7b-instruct",
        "label": "Qwen2.5 7B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen-2.5-7b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen-2.5-coder-32b-instruct": {
        "index": 257,
        "id": "qwen/qwen-2.5-coder-32b-instruct",
        "label": "Qwen2.5 Coder 32B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen-2.5-coder-32b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen-plus": {
        "index": 258,
        "id": "qwen/qwen-plus",
        "label": "Qwen Plus",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen-plus.toml",
        "deprecated": false
      },
      "qwen/qwen-plus-2025-07-28": {
        "index": 259,
        "id": "qwen/qwen-plus-2025-07-28",
        "label": "Qwen Plus 0728",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen-plus-2025-07-28.toml",
        "deprecated": false
      },
      "qwen/qwen-plus-2025-07-28__58__thinking": {
        "index": 260,
        "id": "qwen/qwen-plus-2025-07-28__58__thinking",
        "label": "Qwen Plus 0728 (thinking)",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen-plus-2025-07-28__58__thinking.toml",
        "deprecated": false
      },
      "qwen/qwen2.5-vl-72b-instruct": {
        "index": 261,
        "id": "qwen/qwen2.5-vl-72b-instruct",
        "label": "Qwen2.5 VL 72B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen2.5-vl-72b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen3-14b": {
        "index": 262,
        "id": "qwen/qwen3-14b",
        "label": "Qwen3 14B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-14b.toml",
        "deprecated": false
      },
      "qwen/qwen3-235b-a22b": {
        "index": 263,
        "id": "qwen/qwen3-235b-a22b",
        "label": "Qwen3 235B-A22B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-235b-a22b.toml",
        "deprecated": false
      },
      "qwen/qwen3-235b-a22b-2507": {
        "index": 264,
        "id": "qwen/qwen3-235b-a22b-2507",
        "label": "Qwen3 235B A22B Instruct 2507",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-235b-a22b-2507.toml",
        "deprecated": false
      },
      "qwen/qwen3-235b-a22b-thinking-2507": {
        "index": 265,
        "id": "qwen/qwen3-235b-a22b-thinking-2507",
        "label": "Qwen3 235B A22B Thinking 2507",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-235b-a22b-thinking-2507.toml",
        "deprecated": false
      },
      "qwen/qwen3-30b-a3b": {
        "index": 266,
        "id": "qwen/qwen3-30b-a3b",
        "label": "Qwen3 30B A3B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-30b-a3b.toml",
        "deprecated": false
      },
      "qwen/qwen3-30b-a3b-instruct-2507": {
        "index": 267,
        "id": "qwen/qwen3-30b-a3b-instruct-2507",
        "label": "Qwen3 30B A3B Instruct 2507",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-30b-a3b-instruct-2507.toml",
        "deprecated": false
      },
      "qwen/qwen3-30b-a3b-thinking-2507": {
        "index": 268,
        "id": "qwen/qwen3-30b-a3b-thinking-2507",
        "label": "Qwen3 30B A3B Thinking 2507",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-30b-a3b-thinking-2507.toml",
        "deprecated": false
      },
      "qwen/qwen3-32b": {
        "index": 269,
        "id": "qwen/qwen3-32b",
        "label": "Qwen3 32B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-32b.toml",
        "deprecated": false
      },
      "qwen/qwen3-8b": {
        "index": 270,
        "id": "qwen/qwen3-8b",
        "label": "Qwen3 8B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-8b.toml",
        "deprecated": false
      },
      "qwen/qwen3-coder": {
        "index": 271,
        "id": "qwen/qwen3-coder",
        "label": "Qwen3 Coder 480B A35B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder.toml",
        "deprecated": false
      },
      "qwen/qwen3-coder__58__free": {
        "index": 272,
        "id": "qwen/qwen3-coder__58__free",
        "label": "Qwen3 Coder 480B A35B (free)",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder__58__free.toml",
        "deprecated": false
      },
      "qwen/qwen3-coder-30b-a3b-instruct": {
        "index": 273,
        "id": "qwen/qwen3-coder-30b-a3b-instruct",
        "label": "Qwen3-Coder 30B-A3B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-30b-a3b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen3-coder-flash": {
        "index": 274,
        "id": "qwen/qwen3-coder-flash",
        "label": "Qwen3 Coder Flash",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-flash.toml",
        "deprecated": false
      },
      "qwen/qwen3-coder-next": {
        "index": 275,
        "id": "qwen/qwen3-coder-next",
        "label": "Qwen3 Coder Next",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-next.toml",
        "deprecated": false
      },
      "qwen/qwen3-coder-plus": {
        "index": 276,
        "id": "qwen/qwen3-coder-plus",
        "label": "Qwen3 Coder Plus",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-plus.toml",
        "deprecated": false
      },
      "qwen/qwen3-max": {
        "index": 277,
        "id": "qwen/qwen3-max",
        "label": "Qwen3 Max",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-max.toml",
        "deprecated": false
      },
      "qwen/qwen3-max-thinking": {
        "index": 278,
        "id": "qwen/qwen3-max-thinking",
        "label": "Qwen3 Max Thinking",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-max-thinking.toml",
        "deprecated": false
      },
      "qwen/qwen3-next-80b-a3b-instruct": {
        "index": 279,
        "id": "qwen/qwen3-next-80b-a3b-instruct",
        "label": "Qwen3-Next 80B-A3B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-next-80b-a3b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen3-next-80b-a3b-instruct__58__free": {
        "index": 280,
        "id": "qwen/qwen3-next-80b-a3b-instruct__58__free",
        "label": "Qwen3 Next 80B A3B Instruct (free)",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-next-80b-a3b-instruct__58__free.toml",
        "deprecated": false
      },
      "qwen/qwen3-next-80b-a3b-thinking": {
        "index": 281,
        "id": "qwen/qwen3-next-80b-a3b-thinking",
        "label": "Qwen3-Next 80B-A3B (Thinking)",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-next-80b-a3b-thinking.toml",
        "deprecated": false
      },
      "qwen/qwen3-vl-235b-a22b-instruct": {
        "index": 282,
        "id": "qwen/qwen3-vl-235b-a22b-instruct",
        "label": "Qwen3 VL 235B A22B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-235b-a22b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen3-vl-235b-a22b-thinking": {
        "index": 283,
        "id": "qwen/qwen3-vl-235b-a22b-thinking",
        "label": "Qwen3 VL 235B A22B Thinking",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-235b-a22b-thinking.toml",
        "deprecated": false
      },
      "qwen/qwen3-vl-30b-a3b-instruct": {
        "index": 284,
        "id": "qwen/qwen3-vl-30b-a3b-instruct",
        "label": "Qwen3 VL 30B A3B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-30b-a3b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen3-vl-30b-a3b-thinking": {
        "index": 285,
        "id": "qwen/qwen3-vl-30b-a3b-thinking",
        "label": "Qwen3 VL 30B A3B Thinking",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-30b-a3b-thinking.toml",
        "deprecated": false
      },
      "qwen/qwen3-vl-32b-instruct": {
        "index": 286,
        "id": "qwen/qwen3-vl-32b-instruct",
        "label": "Qwen3 VL 32B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-32b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen3-vl-8b-instruct": {
        "index": 287,
        "id": "qwen/qwen3-vl-8b-instruct",
        "label": "Qwen3 VL 8B Instruct",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-8b-instruct.toml",
        "deprecated": false
      },
      "qwen/qwen3-vl-8b-thinking": {
        "index": 288,
        "id": "qwen/qwen3-vl-8b-thinking",
        "label": "Qwen3 VL 8B Thinking",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-8b-thinking.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-122b-a10b": {
        "index": 289,
        "id": "qwen/qwen3.5-122b-a10b",
        "label": "Qwen3.5 122B-A10B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-122b-a10b.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-27b": {
        "index": 290,
        "id": "qwen/qwen3.5-27b",
        "label": "Qwen3.5 27B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-27b.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-35b-a3b": {
        "index": 291,
        "id": "qwen/qwen3.5-35b-a3b",
        "label": "Qwen3.5 35B-A3B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-35b-a3b.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-397b-a17b": {
        "index": 292,
        "id": "qwen/qwen3.5-397b-a17b",
        "label": "Qwen3.5 397B-A17B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-397b-a17b.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-9b": {
        "index": 293,
        "id": "qwen/qwen3.5-9b",
        "label": "Qwen3.5 9B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-9b.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-flash-02-23": {
        "index": 294,
        "id": "qwen/qwen3.5-flash-02-23",
        "label": "Qwen3.5-Flash",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-flash-02-23.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-plus-02-15": {
        "index": 295,
        "id": "qwen/qwen3.5-plus-02-15",
        "label": "Qwen3.5 Plus 2026-02-15",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-plus-02-15.toml",
        "deprecated": false
      },
      "qwen/qwen3.5-plus-20260420": {
        "index": 296,
        "id": "qwen/qwen3.5-plus-20260420",
        "label": "Qwen3.5 Plus 2026-04-20",
        "group": "qwen3.5",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-plus-20260420.toml",
        "deprecated": false
      },
      "qwen/qwen3.6-27b": {
        "index": 297,
        "id": "qwen/qwen3.6-27b",
        "label": "Qwen3.6 27B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-27b.toml",
        "deprecated": false
      },
      "qwen/qwen3.6-35b-a3b": {
        "index": 298,
        "id": "qwen/qwen3.6-35b-a3b",
        "label": "Qwen3.6 35B-A3B",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-35b-a3b.toml",
        "deprecated": false
      },
      "qwen/qwen3.6-flash": {
        "index": 299,
        "id": "qwen/qwen3.6-flash",
        "label": "Qwen3.6 Flash",
        "group": "qwen3.6",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-flash.toml",
        "deprecated": false
      },
      "qwen/qwen3.6-max-preview": {
        "index": 300,
        "id": "qwen/qwen3.6-max-preview",
        "label": "Qwen3.6 Max Preview",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-max-preview.toml",
        "deprecated": false
      },
      "qwen/qwen3.6-plus": {
        "index": 301,
        "id": "qwen/qwen3.6-plus",
        "label": "Qwen3.6 Plus",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-plus.toml",
        "deprecated": false
      },
      "qwen/qwen3.7-max": {
        "index": 302,
        "id": "qwen/qwen3.7-max",
        "label": "Qwen3.7 Max",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.7-max.toml",
        "deprecated": false
      },
      "qwen/qwen3.7-plus": {
        "index": 303,
        "id": "qwen/qwen3.7-plus",
        "label": "Qwen3.7 Plus",
        "group": "qwen",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.7-plus.toml",
        "deprecated": false
      },
      "rekaai/reka-edge": {
        "index": 304,
        "id": "rekaai/reka-edge",
        "label": "Reka Edge",
        "group": "reka",
        "sourceFile": "providers/openrouter/models/rekaai/reka-edge.toml",
        "deprecated": false
      },
      "rekaai/reka-flash-3": {
        "index": 305,
        "id": "rekaai/reka-flash-3",
        "label": "Reka Flash 3",
        "group": "reka",
        "sourceFile": "providers/openrouter/models/rekaai/reka-flash-3.toml",
        "deprecated": false
      },
      "relace/relace-apply-3": {
        "index": 306,
        "id": "relace/relace-apply-3",
        "label": "Relace Apply 3",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/relace/relace-apply-3.toml",
        "deprecated": false
      },
      "relace/relace-search": {
        "index": 307,
        "id": "relace/relace-search",
        "label": "Relace Search",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/relace/relace-search.toml",
        "deprecated": false
      },
      "sakana/fugu-ultra": {
        "index": 308,
        "id": "sakana/fugu-ultra",
        "label": "Fugu Ultra",
        "group": "fugu",
        "sourceFile": "providers/openrouter/models/sakana/fugu-ultra.toml",
        "deprecated": false
      },
      "sao10k/l3-lunaris-8b": {
        "index": 309,
        "id": "sao10k/l3-lunaris-8b",
        "label": "Llama 3 8B Lunaris",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/sao10k/l3-lunaris-8b.toml",
        "deprecated": false
      },
      "sao10k/l3.1-70b-hanami-x1": {
        "index": 310,
        "id": "sao10k/l3.1-70b-hanami-x1",
        "label": "Llama 3.1 70B Hanami x1",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/sao10k/l3.1-70b-hanami-x1.toml",
        "deprecated": false
      },
      "sao10k/l3.1-euryale-70b": {
        "index": 311,
        "id": "sao10k/l3.1-euryale-70b",
        "label": "Llama 3.1 Euryale 70B v2.2",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/sao10k/l3.1-euryale-70b.toml",
        "deprecated": false
      },
      "sao10k/l3.3-euryale-70b": {
        "index": 312,
        "id": "sao10k/l3.3-euryale-70b",
        "label": "Llama 3.3 Euryale 70B",
        "group": "llama",
        "sourceFile": "providers/openrouter/models/sao10k/l3.3-euryale-70b.toml",
        "deprecated": false
      },
      "stepfun/step-3.5-flash": {
        "index": 313,
        "id": "stepfun/step-3.5-flash",
        "label": "Step 3.5 Flash",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/stepfun/step-3.5-flash.toml",
        "deprecated": false
      },
      "stepfun/step-3.7-flash": {
        "index": 314,
        "id": "stepfun/step-3.7-flash",
        "label": "Step 3.7 Flash",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/stepfun/step-3.7-flash.toml",
        "deprecated": false
      },
      "tencent/hunyuan-a13b-instruct": {
        "index": 315,
        "id": "tencent/hunyuan-a13b-instruct",
        "label": "Hunyuan A13B Instruct",
        "group": "hunyuan",
        "sourceFile": "providers/openrouter/models/tencent/hunyuan-a13b-instruct.toml",
        "deprecated": false
      },
      "tencent/hy3": {
        "index": 316,
        "id": "tencent/hy3",
        "label": "Hy3",
        "group": "hy3",
        "sourceFile": "providers/openrouter/models/tencent/hy3.toml",
        "deprecated": false
      },
      "tencent/hy3__58__free": {
        "index": 317,
        "id": "tencent/hy3__58__free",
        "label": "Hy3 (free)",
        "group": "hy3",
        "sourceFile": "providers/openrouter/models/tencent/hy3__58__free.toml",
        "deprecated": false
      },
      "tencent/hy3-preview": {
        "index": 318,
        "id": "tencent/hy3-preview",
        "label": "Hy3 preview",
        "group": "Hy",
        "sourceFile": "providers/openrouter/models/tencent/hy3-preview.toml",
        "deprecated": false
      },
      "thedrummer/cydonia-24b-v4.1": {
        "index": 319,
        "id": "thedrummer/cydonia-24b-v4.1",
        "label": "Cydonia 24B V4.1",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/thedrummer/cydonia-24b-v4.1.toml",
        "deprecated": false
      },
      "thedrummer/rocinante-12b": {
        "index": 320,
        "id": "thedrummer/rocinante-12b",
        "label": "Rocinante 12B",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/thedrummer/rocinante-12b.toml",
        "deprecated": false
      },
      "thedrummer/skyfall-36b-v2": {
        "index": 321,
        "id": "thedrummer/skyfall-36b-v2",
        "label": "Skyfall 36B V2",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/thedrummer/skyfall-36b-v2.toml",
        "deprecated": false
      },
      "thedrummer/unslopnemo-12b": {
        "index": 322,
        "id": "thedrummer/unslopnemo-12b",
        "label": "UnslopNemo 12B",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/thedrummer/unslopnemo-12b.toml",
        "deprecated": false
      },
      "undi95/remm-slerp-l2-13b": {
        "index": 323,
        "id": "undi95/remm-slerp-l2-13b",
        "label": "ReMM SLERP 13B",
        "group": "Other",
        "sourceFile": "providers/openrouter/models/undi95/remm-slerp-l2-13b.toml",
        "deprecated": false
      },
      "upstage/solar-pro-3": {
        "index": 324,
        "id": "upstage/solar-pro-3",
        "label": "Solar Pro 3",
        "group": "solar-pro",
        "sourceFile": "providers/openrouter/models/upstage/solar-pro-3.toml",
        "deprecated": false
      },
      "writer/palmyra-x5": {
        "index": 325,
        "id": "writer/palmyra-x5",
        "label": "Palmyra X5",
        "group": "palmyra",
        "sourceFile": "providers/openrouter/models/writer/palmyra-x5.toml",
        "deprecated": false
      },
      "x-ai/grok-4.20": {
        "index": 326,
        "id": "x-ai/grok-4.20",
        "label": "Grok 4.20",
        "group": "grok",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.20.toml",
        "deprecated": false
      },
      "x-ai/grok-4.20-multi-agent": {
        "index": 327,
        "id": "x-ai/grok-4.20-multi-agent",
        "label": "Grok 4.20 Multi-Agent",
        "group": "grok",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.20-multi-agent.toml",
        "deprecated": false
      },
      "x-ai/grok-4.3": {
        "index": 328,
        "id": "x-ai/grok-4.3",
        "label": "Grok 4.3",
        "group": "grok",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.3.toml",
        "deprecated": false
      },
      "x-ai/grok-4.5": {
        "index": 329,
        "id": "x-ai/grok-4.5",
        "label": "Grok 4.5",
        "group": "grok",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.5.toml",
        "deprecated": false
      },
      "x-ai/grok-build-0.1": {
        "index": 330,
        "id": "x-ai/grok-build-0.1",
        "label": "Grok Build 0.1",
        "group": "grok-build",
        "sourceFile": "providers/openrouter/models/x-ai/grok-build-0.1.toml",
        "deprecated": false
      },
      "xiaomi/mimo-v2.5": {
        "index": 331,
        "id": "xiaomi/mimo-v2.5",
        "label": "MiMo-V2.5",
        "group": "mimo",
        "sourceFile": "providers/openrouter/models/xiaomi/mimo-v2.5.toml",
        "deprecated": false
      },
      "xiaomi/mimo-v2.5-pro": {
        "index": 332,
        "id": "xiaomi/mimo-v2.5-pro",
        "label": "MiMo-V2.5-Pro",
        "group": "mimo",
        "sourceFile": "providers/openrouter/models/xiaomi/mimo-v2.5-pro.toml",
        "deprecated": false
      },
      "z-ai/glm-4.5": {
        "index": 333,
        "id": "z-ai/glm-4.5",
        "label": "GLM-4.5",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.5.toml",
        "deprecated": false
      },
      "z-ai/glm-4.5-air": {
        "index": 334,
        "id": "z-ai/glm-4.5-air",
        "label": "GLM-4.5-Air",
        "group": "glm-air",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.5-air.toml",
        "deprecated": false
      },
      "z-ai/glm-4.5v": {
        "index": 335,
        "id": "z-ai/glm-4.5v",
        "label": "GLM-4.5V",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.5v.toml",
        "deprecated": false
      },
      "z-ai/glm-4.6": {
        "index": 336,
        "id": "z-ai/glm-4.6",
        "label": "GLM-4.6",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.6.toml",
        "deprecated": false
      },
      "z-ai/glm-4.6v": {
        "index": 337,
        "id": "z-ai/glm-4.6v",
        "label": "GLM-4.6V",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.6v.toml",
        "deprecated": false
      },
      "z-ai/glm-4.7": {
        "index": 338,
        "id": "z-ai/glm-4.7",
        "label": "GLM-4.7",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.7.toml",
        "deprecated": false
      },
      "z-ai/glm-4.7-flash": {
        "index": 339,
        "id": "z-ai/glm-4.7-flash",
        "label": "GLM-4.7-Flash",
        "group": "glm-flash",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.7-flash.toml",
        "deprecated": false
      },
      "z-ai/glm-5": {
        "index": 340,
        "id": "z-ai/glm-5",
        "label": "GLM-5",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5.toml",
        "deprecated": false
      },
      "z-ai/glm-5-turbo": {
        "index": 341,
        "id": "z-ai/glm-5-turbo",
        "label": "GLM-5-Turbo",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5-turbo.toml",
        "deprecated": false
      },
      "z-ai/glm-5.1": {
        "index": 342,
        "id": "z-ai/glm-5.1",
        "label": "GLM-5.1",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5.1.toml",
        "deprecated": false
      },
      "z-ai/glm-5.2": {
        "index": 343,
        "id": "z-ai/glm-5.2",
        "label": "GLM-5.2",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5.2.toml",
        "deprecated": false
      },
      "z-ai/glm-5v-turbo": {
        "index": 344,
        "id": "z-ai/glm-5v-turbo",
        "label": "GLM-5V-Turbo",
        "group": "glm",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5v-turbo.toml",
        "deprecated": false
      }
    }
  }
}
