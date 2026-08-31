export const GENERATED_MODEL_CATALOG_PROVENANCE_MAP = {
  "providersById": {
    "openai": {
      "source": "models.dev",
      "sourceUrl": "https://platform.openai.com/docs/models",
      "sourceFile": "providers/openai/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "anthropic": {
      "source": "models.dev",
      "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
      "sourceFile": "providers/anthropic/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "gemini": {
      "source": "models.dev",
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
      "sourceFile": "providers/google/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "moonshot": {
      "source": "models.dev",
      "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
      "sourceFile": "providers/moonshotai/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "grok": {
      "source": "models.dev",
      "sourceUrl": "https://docs.x.ai/docs/models",
      "sourceFile": "providers/xai/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "groq": {
      "source": "models.dev",
      "sourceUrl": "https://console.groq.com/docs/models",
      "sourceFile": "providers/groq/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "mistral": {
      "source": "models.dev",
      "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
      "sourceFile": "providers/mistral/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "deepseek": {
      "source": "models.dev",
      "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
      "sourceFile": "providers/deepseek/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "perplexity": {
      "source": "models.dev",
      "sourceUrl": "https://docs.perplexity.ai",
      "sourceFile": "providers/perplexity/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    },
    "openrouter": {
      "source": "models.dev",
      "sourceUrl": "https://openrouter.ai/models",
      "sourceFile": "providers/openrouter/provider.toml",
      "verifiedAt": null,
      "trustLevel": "estimated",
      "fields": {
        "defaultModel": {
          "fieldPath": "provider.defaultModel",
          "state": "placeholder",
          "trustLevel": "unknown",
          "requiresOverride": true,
          "reason": "curated_default_model_required"
        }
      }
    }
  },
  "modelsByProviderId": {
    "openai": {
      "chatgpt-image-latest": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/chatgpt-image-latest.toml",
        "verifiedAt": "2025-12-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-3.5-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-3.5-turbo.toml",
        "verifiedAt": "2023-11-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4.toml",
        "verifiedAt": "2024-04-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4-turbo.toml",
        "verifiedAt": "2024-04-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4.1": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4.1.toml",
        "verifiedAt": "2025-04-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4.1-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4.1-mini.toml",
        "verifiedAt": "2025-04-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4.1-nano": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4.1-nano.toml",
        "verifiedAt": "2025-04-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4o": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4o.toml",
        "verifiedAt": "2024-08-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4o-2024-05-13": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4o-2024-05-13.toml",
        "verifiedAt": "2024-05-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4o-2024-08-06": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4o-2024-08-06.toml",
        "verifiedAt": "2024-08-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4o-2024-11-20": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4o-2024-11-20.toml",
        "verifiedAt": "2024-11-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-4o-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-4o-mini.toml",
        "verifiedAt": "2024-07-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5-chat-latest": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5-chat-latest.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5-codex": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5-codex.toml",
        "verifiedAt": "2025-09-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5-mini.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5-nano": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5-nano.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5-pro": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5-pro.toml",
        "verifiedAt": "2025-10-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.1": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.1.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.1-chat-latest": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.1-chat-latest.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.1-codex": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.1-codex.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.1-codex-max": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.1-codex-max.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.1-codex-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.1-codex-mini.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.2": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.2.toml",
        "verifiedAt": "2025-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.2-chat-latest": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.2-chat-latest.toml",
        "verifiedAt": "2025-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.2-codex": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.2-codex.toml",
        "verifiedAt": "2025-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.2-pro": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.2-pro.toml",
        "verifiedAt": "2025-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.3-chat-latest": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.3-chat-latest.toml",
        "verifiedAt": "2026-03-03",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.3-codex": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.3-codex.toml",
        "verifiedAt": "2026-02-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.3-codex-spark": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.3-codex-spark.toml",
        "verifiedAt": "2026-02-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.4": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.4.toml",
        "verifiedAt": "2026-03-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.4-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.4-mini.toml",
        "verifiedAt": "2026-03-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.4-nano": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.4-nano.toml",
        "verifiedAt": "2026-03-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.4-pro": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.4-pro.toml",
        "verifiedAt": "2026-03-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.5": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.5.toml",
        "verifiedAt": "2026-04-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.5-pro": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.5-pro.toml",
        "verifiedAt": "2026-04-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.6": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.6.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.6-luna": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.6-luna.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.6-sol": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.6-sol.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-5.6-terra": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-5.6-terra.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-image-1": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-image-1.toml",
        "verifiedAt": "2025-04-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-image-1-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-image-1-mini.toml",
        "verifiedAt": "2025-09-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-image-1.5": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-image-1.5.toml",
        "verifiedAt": "2025-11-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-image-2": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-image-2.toml",
        "verifiedAt": "2026-04-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gpt-realtime-2.1": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/gpt-realtime-2.1.toml",
        "verifiedAt": "2026-07-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o1": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o1.toml",
        "verifiedAt": "2024-12-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o1-pro": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o1-pro.toml",
        "verifiedAt": "2025-03-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o3": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o3.toml",
        "verifiedAt": "2025-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o3-deep-research": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o3-deep-research.toml",
        "verifiedAt": "2024-06-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o3-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o3-mini.toml",
        "verifiedAt": "2025-01-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o3-pro": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o3-pro.toml",
        "verifiedAt": "2025-06-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o4-mini": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o4-mini.toml",
        "verifiedAt": "2025-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "o4-mini-deep-research": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/o4-mini-deep-research.toml",
        "verifiedAt": "2024-06-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "text-embedding-3-large": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/text-embedding-3-large.toml",
        "verifiedAt": "2024-01-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "text-embedding-3-small": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/text-embedding-3-small.toml",
        "verifiedAt": "2024-01-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "text-embedding-ada-002": {
        "source": "models.dev",
        "sourceUrl": "https://platform.openai.com/docs/models",
        "sourceFile": "providers/openai/models/text-embedding-ada-002.toml",
        "verifiedAt": "2022-12-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "anthropic": {
      "claude-fable-5": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-fable-5.toml",
        "verifiedAt": "2026-06-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-haiku-4-5": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-haiku-4-5.toml",
        "verifiedAt": "2025-10-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-haiku-4-5-20251001": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-haiku-4-5-20251001.toml",
        "verifiedAt": "2025-10-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-opus-4-1": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-opus-4-1.toml",
        "verifiedAt": "2025-08-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-opus-4-1-20250805": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-opus-4-1-20250805.toml",
        "verifiedAt": "2025-08-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-opus-4-5": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-opus-4-5.toml",
        "verifiedAt": "2025-11-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-opus-4-5-20251101": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-opus-4-5-20251101.toml",
        "verifiedAt": "2025-11-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-opus-4-6": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-opus-4-6.toml",
        "verifiedAt": "2026-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-opus-4-7": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-opus-4-7.toml",
        "verifiedAt": "2026-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-opus-4-8": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-opus-4-8.toml",
        "verifiedAt": "2026-05-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-sonnet-4-5": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-sonnet-4-5.toml",
        "verifiedAt": "2025-09-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-sonnet-4-5-20250929": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-sonnet-4-5-20250929.toml",
        "verifiedAt": "2025-09-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-sonnet-4-6": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-sonnet-4-6.toml",
        "verifiedAt": "2026-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "claude-sonnet-5": {
        "source": "models.dev",
        "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/models",
        "sourceFile": "providers/anthropic/models/claude-sonnet-5.toml",
        "verifiedAt": "2026-06-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "gemini": {
      "gemini-2.0-flash": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.0-flash.toml",
        "verifiedAt": "2024-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-2.0-flash-lite": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.0-flash-lite.toml",
        "verifiedAt": "2024-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-2.5-flash": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.5-flash.toml",
        "verifiedAt": "2025-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-2.5-flash-image": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.5-flash-image.toml",
        "verifiedAt": "2025-08-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-2.5-flash-lite": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.5-flash-lite.toml",
        "verifiedAt": "2025-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-2.5-flash-preview-tts": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.5-flash-preview-tts.toml",
        "verifiedAt": "2025-05-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-2.5-pro": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.5-pro.toml",
        "verifiedAt": "2025-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-2.5-pro-preview-tts": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-2.5-pro-preview-tts.toml",
        "verifiedAt": "2025-05-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3-flash-preview": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3-flash-preview.toml",
        "verifiedAt": "2025-12-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3-pro-image-preview": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3-pro-image-preview.toml",
        "verifiedAt": "2025-11-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3-pro-preview": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3-pro-preview.toml",
        "verifiedAt": "2025-11-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3.1-flash-image-preview": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3.1-flash-image-preview.toml",
        "verifiedAt": "2026-02-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3.1-flash-lite": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3.1-flash-lite.toml",
        "verifiedAt": "2026-05-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3.1-flash-lite-preview": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3.1-flash-lite-preview.toml",
        "verifiedAt": "2026-03-03",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3.1-pro-preview": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3.1-pro-preview.toml",
        "verifiedAt": "2026-02-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3.1-pro-preview-customtools": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3.1-pro-preview-customtools.toml",
        "verifiedAt": "2026-02-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-3.5-flash": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-3.5-flash.toml",
        "verifiedAt": "2026-05-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-embedding-001": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-embedding-001.toml",
        "verifiedAt": "2025-05-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-flash-latest": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-flash-latest.toml",
        "verifiedAt": "2025-09-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-flash-lite-latest": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-flash-lite-latest.toml",
        "verifiedAt": "2025-09-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemini-omni-flash-preview": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemini-omni-flash-preview.toml",
        "verifiedAt": "2026-06-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemma-4-26b-a4b-it": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemma-4-26b-a4b-it.toml",
        "verifiedAt": "2026-04-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gemma-4-31b-it": {
        "source": "models.dev",
        "sourceUrl": "https://ai.google.dev/gemini-api/docs/models",
        "sourceFile": "providers/google/models/gemma-4-31b-it.toml",
        "verifiedAt": "2026-04-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "moonshot": {
      "kimi-k2-0711-preview": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2-0711-preview.toml",
        "verifiedAt": "2025-07-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2-0905-preview": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2-0905-preview.toml",
        "verifiedAt": "2025-09-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2-thinking.toml",
        "verifiedAt": "2025-11-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2-thinking-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2-thinking-turbo.toml",
        "verifiedAt": "2025-11-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2-turbo-preview": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2-turbo-preview.toml",
        "verifiedAt": "2025-09-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2.5": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2.5.toml",
        "verifiedAt": "2026-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2.6": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2.6.toml",
        "verifiedAt": "2026-04-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2.7-code": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2.7-code.toml",
        "verifiedAt": "2026-06-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kimi-k2.7-code-highspeed": {
        "source": "models.dev",
        "sourceUrl": "https://platform.moonshot.ai/docs/api/chat",
        "sourceFile": "providers/moonshotai/models/kimi-k2.7-code-highspeed.toml",
        "verifiedAt": "2026-06-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "grok": {
      "grok-4.20-0309-non-reasoning": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-4.20-0309-non-reasoning.toml",
        "verifiedAt": "2026-03-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-4.20-0309-reasoning": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-4.20-0309-reasoning.toml",
        "verifiedAt": "2026-03-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-4.20-multi-agent-0309": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-4.20-multi-agent-0309.toml",
        "verifiedAt": "2026-03-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-4.3": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-4.3.toml",
        "verifiedAt": "2026-04-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-4.5": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-4.5.toml",
        "verifiedAt": "2026-07-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-build-0.1": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-build-0.1.toml",
        "verifiedAt": "2026-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-imagine-image": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-imagine-image.toml",
        "verifiedAt": "2026-01-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-imagine-image-quality": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-imagine-image-quality.toml",
        "verifiedAt": "2026-04-03",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "grok-imagine-video": {
        "source": "models.dev",
        "sourceUrl": "https://docs.x.ai/docs/models",
        "sourceFile": "providers/xai/models/grok-imagine-video.toml",
        "verifiedAt": "2026-01-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "groq": {
      "canopylabs/orpheus-arabic-saudi": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/canopylabs/orpheus-arabic-saudi.toml",
        "verifiedAt": "2025-12-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "canopylabs/orpheus-v1-english": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/canopylabs/orpheus-v1-english.toml",
        "verifiedAt": "2025-12-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "groq/compound": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/groq/compound.toml",
        "verifiedAt": "2025-09-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "groq/compound-mini": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/groq/compound-mini.toml",
        "verifiedAt": "2025-09-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "llama-3.1-8b-instant": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/llama-3.1-8b-instant.toml",
        "verifiedAt": "2024-07-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "llama-3.3-70b-versatile": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/llama-3.3-70b-versatile.toml",
        "verifiedAt": "2024-12-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-4-scout-17b-16e-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/meta-llama/llama-4-scout-17b-16e-instruct.toml",
        "verifiedAt": "2025-04-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-prompt-guard-2-22m": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/meta-llama/llama-prompt-guard-2-22m.toml",
        "verifiedAt": "2025-05-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-prompt-guard-2-86m": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/meta-llama/llama-prompt-guard-2-86m.toml",
        "verifiedAt": "2025-05-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-120b": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/openai/gpt-oss-120b.toml",
        "verifiedAt": "2025-10-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-20b": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/openai/gpt-oss-20b.toml",
        "verifiedAt": "2025-09-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-safeguard-20b": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/openai/gpt-oss-safeguard-20b.toml",
        "verifiedAt": "2026-06-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-32b": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/qwen/qwen3-32b.toml",
        "verifiedAt": "2025-06-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "whisper-large-v3": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/whisper-large-v3.toml",
        "verifiedAt": "2025-09-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "whisper-large-v3-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://console.groq.com/docs/models",
        "sourceFile": "providers/groq/models/whisper-large-v3-turbo.toml",
        "verifiedAt": "2024-10-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "mistral": {
      "codestral-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/codestral-latest.toml",
        "verifiedAt": "2025-01-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "devstral-2512": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/devstral-2512.toml",
        "verifiedAt": "2025-12-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "devstral-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/devstral-latest.toml",
        "verifiedAt": "2025-12-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "devstral-medium-2507": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/devstral-medium-2507.toml",
        "verifiedAt": "2025-07-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "devstral-medium-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/devstral-medium-latest.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "devstral-small-2505": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/devstral-small-2505.toml",
        "verifiedAt": "2025-05-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "devstral-small-2507": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/devstral-small-2507.toml",
        "verifiedAt": "2025-07-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "labs-devstral-small-2512": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/labs-devstral-small-2512.toml",
        "verifiedAt": "2025-12-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "magistral-medium-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/magistral-medium-latest.toml",
        "verifiedAt": "2025-03-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "magistral-small": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/magistral-small.toml",
        "verifiedAt": "2025-03-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "ministral-3b-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/ministral-3b-latest.toml",
        "verifiedAt": "2024-10-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "ministral-8b-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/ministral-8b-latest.toml",
        "verifiedAt": "2024-10-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-embed": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-embed.toml",
        "verifiedAt": "2023-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-large-2411": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-large-2411.toml",
        "verifiedAt": "2024-11-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-large-2512": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-large-2512.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-large-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-large-latest.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-medium-2505": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-medium-2505.toml",
        "verifiedAt": "2025-05-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-medium-2508": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-medium-2508.toml",
        "verifiedAt": "2025-08-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-medium-2604": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-medium-2604.toml",
        "verifiedAt": "2026-04-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-medium-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-medium-latest.toml",
        "verifiedAt": "2026-04-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-nemo": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-nemo.toml",
        "verifiedAt": "2024-07-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-small-2506": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-small-2506.toml",
        "verifiedAt": "2025-06-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-small-2603": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-small-2603.toml",
        "verifiedAt": "2026-03-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistral-small-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/mistral-small-latest.toml",
        "verifiedAt": "2026-03-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "open-mistral-7b": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/open-mistral-7b.toml",
        "verifiedAt": "2023-09-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "open-mistral-nemo": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/open-mistral-nemo.toml",
        "verifiedAt": "2024-07-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "open-mixtral-8x22b": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/open-mixtral-8x22b.toml",
        "verifiedAt": "2024-04-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "open-mixtral-8x7b": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/open-mixtral-8x7b.toml",
        "verifiedAt": "2023-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "pixtral-12b": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/pixtral-12b.toml",
        "verifiedAt": "2024-09-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "pixtral-large-latest": {
        "source": "models.dev",
        "sourceUrl": "https://docs.mistral.ai/getting-started/models/",
        "sourceFile": "providers/mistral/models/pixtral-large-latest.toml",
        "verifiedAt": "2024-11-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "deepseek": {
      "deepseek-chat": {
        "source": "models.dev",
        "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
        "sourceFile": "providers/deepseek/models/deepseek-chat.toml",
        "verifiedAt": "2026-02-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek-reasoner": {
        "source": "models.dev",
        "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
        "sourceFile": "providers/deepseek/models/deepseek-reasoner.toml",
        "verifiedAt": "2026-02-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek-v4-flash": {
        "source": "models.dev",
        "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
        "sourceFile": "providers/deepseek/models/deepseek-v4-flash.toml",
        "verifiedAt": "2026-04-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek-v4-pro": {
        "source": "models.dev",
        "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
        "sourceFile": "providers/deepseek/models/deepseek-v4-pro.toml",
        "verifiedAt": "2026-04-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "perplexity": {
      "sonar": {
        "source": "models.dev",
        "sourceUrl": "https://docs.perplexity.ai",
        "sourceFile": "providers/perplexity/models/sonar.toml",
        "verifiedAt": "2025-09-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sonar-deep-research": {
        "source": "models.dev",
        "sourceUrl": "https://docs.perplexity.ai",
        "sourceFile": "providers/perplexity/models/sonar-deep-research.toml",
        "verifiedAt": "2025-09-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sonar-pro": {
        "source": "models.dev",
        "sourceUrl": "https://docs.perplexity.ai",
        "sourceFile": "providers/perplexity/models/sonar-pro.toml",
        "verifiedAt": "2025-09-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sonar-reasoning-pro": {
        "source": "models.dev",
        "sourceUrl": "https://docs.perplexity.ai",
        "sourceFile": "providers/perplexity/models/sonar-reasoning-pro.toml",
        "verifiedAt": "2025-09-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    },
    "openrouter": {
      "~anthropic/claude-fable-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-fable-latest.toml",
        "verifiedAt": "2026-06-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~anthropic/claude-haiku-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-haiku-latest.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~anthropic/claude-opus-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-opus-latest.toml",
        "verifiedAt": "2026-04-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~anthropic/claude-sonnet-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~anthropic/claude-sonnet-latest.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~google/gemini-flash-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~google/gemini-flash-latest.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~google/gemini-pro-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~google/gemini-pro-latest.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~moonshotai/kimi-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~moonshotai/kimi-latest.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~openai/gpt-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~openai/gpt-latest.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~openai/gpt-mini-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~openai/gpt-mini-latest.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "~x-ai/grok-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/~x-ai/grok-latest.toml",
        "verifiedAt": "2026-07-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "ai21/jamba-large-1.7": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/ai21/jamba-large-1.7.toml",
        "verifiedAt": "2025-08-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "aion-labs/aion-2.0": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-2.0.toml",
        "verifiedAt": "2026-02-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "aion-labs/aion-3.0": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-3.0.toml",
        "verifiedAt": "2026-07-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "aion-labs/aion-3.0-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-3.0-mini.toml",
        "verifiedAt": "2026-07-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "aion-labs/aion-rp-llama-3.1-8b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/aion-labs/aion-rp-llama-3.1-8b.toml",
        "verifiedAt": "2025-02-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "allenai/olmo-3-32b-think": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/allenai/olmo-3-32b-think.toml",
        "verifiedAt": "2025-11-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "amazon/nova-2-lite-v1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/amazon/nova-2-lite-v1.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "amazon/nova-lite-v1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/amazon/nova-lite-v1.toml",
        "verifiedAt": "2024-12-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "amazon/nova-micro-v1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/amazon/nova-micro-v1.toml",
        "verifiedAt": "2024-12-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "amazon/nova-premier-v1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/amazon/nova-premier-v1.toml",
        "verifiedAt": "2025-10-31",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "amazon/nova-pro-v1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/amazon/nova-pro-v1.toml",
        "verifiedAt": "2024-12-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthracite-org/magnum-v4-72b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthracite-org/magnum-v4-72b.toml",
        "verifiedAt": "2024-10-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-3-haiku": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-3-haiku.toml",
        "verifiedAt": "2024-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-fable-5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-fable-5.toml",
        "verifiedAt": "2026-06-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-haiku-4.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-haiku-4.5.toml",
        "verifiedAt": "2025-10-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.toml",
        "verifiedAt": "2025-05-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.1.toml",
        "verifiedAt": "2025-08-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.5.toml",
        "verifiedAt": "2025-11-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4.6": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.6.toml",
        "verifiedAt": "2026-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4.7": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.7.toml",
        "verifiedAt": "2026-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4.7-fast": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.7-fast.toml",
        "verifiedAt": "2026-05-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4.8": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.8.toml",
        "verifiedAt": "2026-05-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-opus-4.8-fast": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-opus-4.8-fast.toml",
        "verifiedAt": "2026-05-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-sonnet-4": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-4.toml",
        "verifiedAt": "2025-05-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-sonnet-4.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-4.5.toml",
        "verifiedAt": "2025-09-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-sonnet-4.6": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-4.6.toml",
        "verifiedAt": "2026-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "anthropic/claude-sonnet-5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/anthropic/claude-sonnet-5.toml",
        "verifiedAt": "2026-06-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "arcee-ai/coder-large": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/arcee-ai/coder-large.toml",
        "verifiedAt": "2025-05-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "arcee-ai/trinity-large-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/arcee-ai/trinity-large-thinking.toml",
        "verifiedAt": "2026-04-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "arcee-ai/virtuoso-large": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/arcee-ai/virtuoso-large.toml",
        "verifiedAt": "2025-05-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "baidu/ernie-4.5-vl-424b-a47b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/baidu/ernie-4.5-vl-424b-a47b.toml",
        "verifiedAt": "2025-06-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "bytedance-seed/seed-1.6": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-1.6.toml",
        "verifiedAt": "2025-12-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "bytedance-seed/seed-1.6-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-1.6-flash.toml",
        "verifiedAt": "2025-12-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "bytedance-seed/seed-2.0-lite": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-2.0-lite.toml",
        "verifiedAt": "2026-03-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "bytedance-seed/seed-2.0-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/bytedance-seed/seed-2.0-mini.toml",
        "verifiedAt": "2026-02-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "bytedance/ui-tars-1.5-7b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/bytedance/ui-tars-1.5-7b.toml",
        "verifiedAt": "2025-07-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "cognitivecomputations/dolphin-mistral-24b-venice-edition": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/cognitivecomputations/dolphin-mistral-24b-venice-edition.toml",
        "verifiedAt": "2025-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "cognitivecomputations/dolphin-mistral-24b-venice-edition__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/cognitivecomputations/dolphin-mistral-24b-venice-edition__58__free.toml",
        "verifiedAt": "2025-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "cohere/command-a": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/cohere/command-a.toml",
        "verifiedAt": "2025-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "cohere/command-r-08-2024": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/cohere/command-r-08-2024.toml",
        "verifiedAt": "2024-08-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "cohere/command-r-plus-08-2024": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/cohere/command-r-plus-08-2024.toml",
        "verifiedAt": "2024-08-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "cohere/command-r7b-12-2024": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/cohere/command-r7b-12-2024.toml",
        "verifiedAt": "2024-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "cohere/north-mini-code__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/cohere/north-mini-code__58__free.toml",
        "verifiedAt": "2026-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepcogito/cogito-v2.1-671b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepcogito/cogito-v2.1-671b.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-chat": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-chat.toml",
        "verifiedAt": "2026-02-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-chat-v3-0324": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-chat-v3-0324.toml",
        "verifiedAt": "2025-03-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-chat-v3.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-chat-v3.1.toml",
        "verifiedAt": "2025-08-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-r1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-r1.toml",
        "verifiedAt": "2025-05-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-r1-0528": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-r1-0528.toml",
        "verifiedAt": "2025-05-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-r1-distill-llama-70b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-r1-distill-llama-70b.toml",
        "verifiedAt": "2025-01-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-v3.1-terminus": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v3.1-terminus.toml",
        "verifiedAt": "2025-09-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-v3.2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v3.2.toml",
        "verifiedAt": "2025-12-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-v3.2-exp": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v3.2-exp.toml",
        "verifiedAt": "2025-09-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-v4-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v4-flash.toml",
        "verifiedAt": "2026-04-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "deepseek/deepseek-v4-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/deepseek/deepseek-v4-pro.toml",
        "verifiedAt": "2026-04-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-2.5-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-flash.toml",
        "verifiedAt": "2025-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-2.5-flash-image": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-flash-image.toml",
        "verifiedAt": "2025-08-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-2.5-flash-lite": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-flash-lite.toml",
        "verifiedAt": "2025-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-2.5-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-pro.toml",
        "verifiedAt": "2025-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-2.5-pro-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-pro-preview.toml",
        "verifiedAt": "2025-06-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-2.5-pro-preview-05-06": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-2.5-pro-preview-05-06.toml",
        "verifiedAt": "2025-05-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3-flash-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3-flash-preview.toml",
        "verifiedAt": "2025-12-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3-pro-image": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3-pro-image.toml",
        "verifiedAt": "2026-05-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3-pro-image-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3-pro-image-preview.toml",
        "verifiedAt": "2025-11-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.1-flash-image": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-image.toml",
        "verifiedAt": "2026-05-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.1-flash-image-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-image-preview.toml",
        "verifiedAt": "2026-02-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.1-flash-lite": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-lite.toml",
        "verifiedAt": "2026-05-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.1-flash-lite-image": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-lite-image.toml",
        "verifiedAt": "2026-06-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.1-flash-lite-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-flash-lite-preview.toml",
        "verifiedAt": "2026-03-03",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.1-pro-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-pro-preview.toml",
        "verifiedAt": "2026-02-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.1-pro-preview-customtools": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.1-pro-preview-customtools.toml",
        "verifiedAt": "2026-02-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemini-3.5-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemini-3.5-flash.toml",
        "verifiedAt": "2026-05-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-2-27b-it": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-2-27b-it.toml",
        "verifiedAt": "2024-07-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-3-12b-it": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-3-12b-it.toml",
        "verifiedAt": "2025-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-3-27b-it": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-3-27b-it.toml",
        "verifiedAt": "2025-03-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-3-4b-it": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-3-4b-it.toml",
        "verifiedAt": "2025-03-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-3n-e4b-it": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-3n-e4b-it.toml",
        "verifiedAt": "2025-05-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-4-26b-a4b-it": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-4-26b-a4b-it.toml",
        "verifiedAt": "2026-04-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-4-26b-a4b-it__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-4-26b-a4b-it__58__free.toml",
        "verifiedAt": "2026-04-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-4-31b-it": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-4-31b-it.toml",
        "verifiedAt": "2026-04-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/gemma-4-31b-it__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/gemma-4-31b-it__58__free.toml",
        "verifiedAt": "2026-04-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/lyria-3-clip-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/lyria-3-clip-preview.toml",
        "verifiedAt": "2026-03-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "google/lyria-3-pro-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/google/lyria-3-pro-preview.toml",
        "verifiedAt": "2026-03-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "gryphe/mythomax-l2-13b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/gryphe/mythomax-l2-13b.toml",
        "verifiedAt": "2023-07-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "ibm-granite/granite-4.0-h-micro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/ibm-granite/granite-4.0-h-micro.toml",
        "verifiedAt": "2025-10-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "ibm-granite/granite-4.1-8b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/ibm-granite/granite-4.1-8b.toml",
        "verifiedAt": "2026-04-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "inception/mercury-2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/inception/mercury-2.toml",
        "verifiedAt": "2026-03-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "inclusionai/ling-2.6-1t": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/inclusionai/ling-2.6-1t.toml",
        "verifiedAt": "2026-04-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "inclusionai/ling-2.6-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/inclusionai/ling-2.6-flash.toml",
        "verifiedAt": "2026-04-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "inclusionai/ring-2.6-1t": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/inclusionai/ring-2.6-1t.toml",
        "verifiedAt": "2026-05-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "inflection/inflection-3-pi": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/inflection/inflection-3-pi.toml",
        "verifiedAt": "2024-10-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "inflection/inflection-3-productivity": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/inflection/inflection-3-productivity.toml",
        "verifiedAt": "2024-10-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "kwaipilot/kat-coder-pro-v2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/kwaipilot/kat-coder-pro-v2.toml",
        "verifiedAt": "2026-03-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "liquid/lfm-2.5-1.2b-instruct__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/liquid/lfm-2.5-1.2b-instruct__58__free.toml",
        "verifiedAt": "2026-01-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "liquid/lfm-2.5-1.2b-thinking__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/liquid/lfm-2.5-1.2b-thinking__58__free.toml",
        "verifiedAt": "2026-01-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mancer/weaver": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mancer/weaver.toml",
        "verifiedAt": "2023-08-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.1-70b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.1-70b-instruct.toml",
        "verifiedAt": "2024-07-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.1-8b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.1-8b-instruct.toml",
        "verifiedAt": "2024-07-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.2-11b-vision-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-11b-vision-instruct.toml",
        "verifiedAt": "2024-09-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.2-1b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-1b-instruct.toml",
        "verifiedAt": "2024-09-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.2-3b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-3b-instruct.toml",
        "verifiedAt": "2024-09-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.2-3b-instruct__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.2-3b-instruct__58__free.toml",
        "verifiedAt": "2024-09-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.3-70b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.3-70b-instruct.toml",
        "verifiedAt": "2024-12-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-3.3-70b-instruct__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-3.3-70b-instruct__58__free.toml",
        "verifiedAt": "2024-12-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-4-maverick": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-4-maverick.toml",
        "verifiedAt": "2025-04-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-4-scout": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-4-scout.toml",
        "verifiedAt": "2025-04-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "meta-llama/llama-guard-4-12b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/meta-llama/llama-guard-4-12b.toml",
        "verifiedAt": "2025-04-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "microsoft/phi-4": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/microsoft/phi-4.toml",
        "verifiedAt": "2025-01-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "microsoft/wizardlm-2-8x22b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/microsoft/wizardlm-2-8x22b.toml",
        "verifiedAt": "2024-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-01": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-01.toml",
        "verifiedAt": "2025-01-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-m1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m1.toml",
        "verifiedAt": "2025-06-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-m2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.toml",
        "verifiedAt": "2025-10-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-m2-her": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2-her.toml",
        "verifiedAt": "2026-01-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-m2.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.1.toml",
        "verifiedAt": "2025-12-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-m2.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.5.toml",
        "verifiedAt": "2026-02-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-m2.7": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m2.7.toml",
        "verifiedAt": "2026-03-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "minimax/minimax-m3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/minimax/minimax-m3.toml",
        "verifiedAt": "2026-06-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/codestral-2508": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/codestral-2508.toml",
        "verifiedAt": "2025-08-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/devstral-2512": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/devstral-2512.toml",
        "verifiedAt": "2025-12-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/ministral-14b-2512": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/ministral-14b-2512.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/ministral-3b-2512": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/ministral-3b-2512.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/ministral-8b-2512": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/ministral-8b-2512.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-large": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-large.toml",
        "verifiedAt": "2024-02-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-large-2407": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-large-2407.toml",
        "verifiedAt": "2024-11-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-large-2512": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-large-2512.toml",
        "verifiedAt": "2025-12-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-medium-3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-medium-3.toml",
        "verifiedAt": "2025-05-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-medium-3-5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-medium-3-5.toml",
        "verifiedAt": "2026-04-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-medium-3.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-medium-3.1.toml",
        "verifiedAt": "2025-08-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-nemo": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-nemo.toml",
        "verifiedAt": "2024-07-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-saba": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-saba.toml",
        "verifiedAt": "2025-02-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-small-24b-instruct-2501": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-24b-instruct-2501.toml",
        "verifiedAt": "2025-01-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-small-2603": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-2603.toml",
        "verifiedAt": "2026-03-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-small-3.1-24b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-3.1-24b-instruct.toml",
        "verifiedAt": "2025-03-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mistral-small-3.2-24b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mistral-small-3.2-24b-instruct.toml",
        "verifiedAt": "2025-06-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/mixtral-8x22b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/mixtral-8x22b-instruct.toml",
        "verifiedAt": "2024-04-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "mistralai/voxtral-small-24b-2507": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/mistralai/voxtral-small-24b-2507.toml",
        "verifiedAt": "2025-10-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "moonshotai/kimi-k2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.toml",
        "verifiedAt": "2025-07-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "moonshotai/kimi-k2-0905": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2-0905.toml",
        "verifiedAt": "2025-09-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "moonshotai/kimi-k2-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2-thinking.toml",
        "verifiedAt": "2025-11-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "moonshotai/kimi-k2.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.5.toml",
        "verifiedAt": "2026-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "moonshotai/kimi-k2.6": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.6.toml",
        "verifiedAt": "2026-04-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "moonshotai/kimi-k2.7-code": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/moonshotai/kimi-k2.7-code.toml",
        "verifiedAt": "2026-06-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "morph/morph-v3-fast": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/morph/morph-v3-fast.toml",
        "verifiedAt": "2025-07-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "morph/morph-v3-large": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/morph/morph-v3-large.toml",
        "verifiedAt": "2025-07-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nex-agi/nex-n2-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nex-agi/nex-n2-mini.toml",
        "verifiedAt": "2026-06-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nex-agi/nex-n2-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nex-agi/nex-n2-pro.toml",
        "verifiedAt": "2026-06-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nousresearch/hermes-3-llama-3.1-405b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-3-llama-3.1-405b.toml",
        "verifiedAt": "2024-08-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nousresearch/hermes-3-llama-3.1-405b__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-3-llama-3.1-405b__58__free.toml",
        "verifiedAt": "2024-08-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nousresearch/hermes-3-llama-3.1-70b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-3-llama-3.1-70b.toml",
        "verifiedAt": "2024-08-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nousresearch/hermes-4-405b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-4-405b.toml",
        "verifiedAt": "2025-08-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nousresearch/hermes-4-70b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nousresearch/hermes-4-70b.toml",
        "verifiedAt": "2025-08-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/llama-3.3-nemotron-super-49b-v1.5.toml",
        "verifiedAt": "2025-07-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3-nano-30b-a3b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-nano-30b-a3b.toml",
        "verifiedAt": "2025-12-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3-nano-30b-a3b__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-nano-30b-a3b__58__free.toml",
        "verifiedAt": "2025-12-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning__58__free.toml",
        "verifiedAt": "2026-04-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3-super-120b-a12b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-super-120b-a12b.toml",
        "verifiedAt": "2026-03-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3-super-120b-a12b__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-super-120b-a12b__58__free.toml",
        "verifiedAt": "2026-03-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3-ultra-550b-a55b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-ultra-550b-a55b.toml",
        "verifiedAt": "2026-06-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3-ultra-550b-a55b__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3-ultra-550b-a55b__58__free.toml",
        "verifiedAt": "2026-06-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-3.5-content-safety__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-3.5-content-safety__58__free.toml",
        "verifiedAt": "2026-06-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-nano-12b-v2-vl__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-nano-12b-v2-vl__58__free.toml",
        "verifiedAt": "2025-10-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "nvidia/nemotron-nano-9b-v2__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/nvidia/nemotron-nano-9b-v2__58__free.toml",
        "verifiedAt": "2025-08-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-3.5-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo.toml",
        "verifiedAt": "2023-11-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-3.5-turbo-0613": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo-0613.toml",
        "verifiedAt": "2024-01-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-3.5-turbo-16k": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo-16k.toml",
        "verifiedAt": "2023-08-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-3.5-turbo-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-3.5-turbo-instruct.toml",
        "verifiedAt": "2023-09-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.toml",
        "verifiedAt": "2024-04-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4-turbo.toml",
        "verifiedAt": "2024-04-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4-turbo-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4-turbo-preview.toml",
        "verifiedAt": "2024-01-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.1.toml",
        "verifiedAt": "2025-04-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4.1-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.1-mini.toml",
        "verifiedAt": "2025-04-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4.1-nano": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4.1-nano.toml",
        "verifiedAt": "2025-04-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o.toml",
        "verifiedAt": "2024-08-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o-2024-05-13": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-2024-05-13.toml",
        "verifiedAt": "2024-05-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o-2024-08-06": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-2024-08-06.toml",
        "verifiedAt": "2024-08-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o-2024-11-20": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-2024-11-20.toml",
        "verifiedAt": "2024-11-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-mini.toml",
        "verifiedAt": "2024-07-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o-mini-2024-07-18": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-mini-2024-07-18.toml",
        "verifiedAt": "2024-07-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o-mini-search-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-mini-search-preview.toml",
        "verifiedAt": "2025-03-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-4o-search-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-4o-search-preview.toml",
        "verifiedAt": "2025-03-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5-chat": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-chat.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5-codex": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-codex.toml",
        "verifiedAt": "2025-09-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5-image": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-image.toml",
        "verifiedAt": "2025-10-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5-image-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-image-mini.toml",
        "verifiedAt": "2025-10-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-mini.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5-nano": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-nano.toml",
        "verifiedAt": "2025-08-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5-pro.toml",
        "verifiedAt": "2025-10-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.1-chat": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-chat.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.1-codex": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-codex.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.1-codex-max": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-codex-max.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.1-codex-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.1-codex-mini.toml",
        "verifiedAt": "2025-11-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2.toml",
        "verifiedAt": "2025-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.2-chat": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2-chat.toml",
        "verifiedAt": "2025-12-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.2-codex": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2-codex.toml",
        "verifiedAt": "2025-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.2-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.2-pro.toml",
        "verifiedAt": "2025-12-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.3-chat": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.3-chat.toml",
        "verifiedAt": "2026-03-03",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.3-codex": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.3-codex.toml",
        "verifiedAt": "2026-02-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.4": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4.toml",
        "verifiedAt": "2026-03-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.4-image-2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-image-2.toml",
        "verifiedAt": "2026-04-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.4-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-mini.toml",
        "verifiedAt": "2026-03-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.4-nano": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-nano.toml",
        "verifiedAt": "2026-03-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.4-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.4-pro.toml",
        "verifiedAt": "2026-03-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.5.toml",
        "verifiedAt": "2026-04-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.5-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.5-pro.toml",
        "verifiedAt": "2026-04-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.6-luna": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-luna.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.6-luna-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-luna-pro.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.6-sol": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-sol.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.6-sol-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-sol-pro.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.6-terra": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-terra.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-5.6-terra-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-5.6-terra-pro.toml",
        "verifiedAt": "2026-07-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-audio": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-audio.toml",
        "verifiedAt": "2026-01-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-audio-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-audio-mini.toml",
        "verifiedAt": "2026-01-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-chat-latest": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-chat-latest.toml",
        "verifiedAt": "2026-05-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-120b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-120b.toml",
        "verifiedAt": "2025-08-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-120b__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-120b__58__free.toml",
        "verifiedAt": "2025-08-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-20b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-20b.toml",
        "verifiedAt": "2025-08-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-20b__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-20b__58__free.toml",
        "verifiedAt": "2025-08-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/gpt-oss-safeguard-20b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/gpt-oss-safeguard-20b.toml",
        "verifiedAt": "2025-10-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o1.toml",
        "verifiedAt": "2024-12-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o1-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o1-pro.toml",
        "verifiedAt": "2025-03-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o3.toml",
        "verifiedAt": "2025-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o3-deep-research": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o3-deep-research.toml",
        "verifiedAt": "2024-06-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o3-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o3-mini.toml",
        "verifiedAt": "2025-01-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o3-mini-high": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o3-mini-high.toml",
        "verifiedAt": "2025-02-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o3-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o3-pro.toml",
        "verifiedAt": "2025-06-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o4-mini": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o4-mini.toml",
        "verifiedAt": "2025-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o4-mini-deep-research": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o4-mini-deep-research.toml",
        "verifiedAt": "2024-06-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openai/o4-mini-high": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openai/o4-mini-high.toml",
        "verifiedAt": "2025-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openrouter/auto": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openrouter/auto.toml",
        "verifiedAt": "2023-11-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openrouter/bodybuilder": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openrouter/bodybuilder.toml",
        "verifiedAt": "2025-12-05",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openrouter/free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openrouter/free.toml",
        "verifiedAt": "2026-02-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openrouter/fusion": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openrouter/fusion.toml",
        "verifiedAt": "2026-06-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "openrouter/pareto-code": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/openrouter/pareto-code.toml",
        "verifiedAt": "2026-04-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "missing",
            "trustLevel": "unknown",
            "requiresOverride": false,
            "reason": "missing_generated_value"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "perceptron/perceptron-mk1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/perceptron/perceptron-mk1.toml",
        "verifiedAt": "2026-05-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "perplexity/sonar": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/perplexity/sonar.toml",
        "verifiedAt": "2025-01-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "perplexity/sonar-deep-research": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-deep-research.toml",
        "verifiedAt": "2025-03-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "perplexity/sonar-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-pro.toml",
        "verifiedAt": "2025-03-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "perplexity/sonar-pro-search": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-pro-search.toml",
        "verifiedAt": "2025-10-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "perplexity/sonar-reasoning-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/perplexity/sonar-reasoning-pro.toml",
        "verifiedAt": "2025-03-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "poolside/laguna-m.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/poolside/laguna-m.1.toml",
        "verifiedAt": "2026-06-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "poolside/laguna-m.1__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/poolside/laguna-m.1__58__free.toml",
        "verifiedAt": "2026-06-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "poolside/laguna-xs-2.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/poolside/laguna-xs-2.1.toml",
        "verifiedAt": "2026-07-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "poolside/laguna-xs-2.1__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/poolside/laguna-xs-2.1__58__free.toml",
        "verifiedAt": "2026-07-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen-2.5-72b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen-2.5-72b-instruct.toml",
        "verifiedAt": "2024-09-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen-2.5-7b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen-2.5-7b-instruct.toml",
        "verifiedAt": "2024-10-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen-2.5-coder-32b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen-2.5-coder-32b-instruct.toml",
        "verifiedAt": "2024-11-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen-plus": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen-plus.toml",
        "verifiedAt": "2025-09-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen-plus-2025-07-28": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen-plus-2025-07-28.toml",
        "verifiedAt": "2025-09-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen-plus-2025-07-28__58__thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen-plus-2025-07-28__58__thinking.toml",
        "verifiedAt": "2025-09-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen2.5-vl-72b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen2.5-vl-72b-instruct.toml",
        "verifiedAt": "2025-02-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-14b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-14b.toml",
        "verifiedAt": "2025-04-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-235b-a22b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-235b-a22b.toml",
        "verifiedAt": "2025-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-235b-a22b-2507": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-235b-a22b-2507.toml",
        "verifiedAt": "2025-07-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-235b-a22b-thinking-2507": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-235b-a22b-thinking-2507.toml",
        "verifiedAt": "2025-07-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-30b-a3b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-30b-a3b.toml",
        "verifiedAt": "2025-04-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-30b-a3b-instruct-2507": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-30b-a3b-instruct-2507.toml",
        "verifiedAt": "2025-07-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-30b-a3b-thinking-2507": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-30b-a3b-thinking-2507.toml",
        "verifiedAt": "2025-08-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-32b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-32b.toml",
        "verifiedAt": "2025-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-8b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-8b.toml",
        "verifiedAt": "2025-04-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-coder": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder.toml",
        "verifiedAt": "2025-07-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-coder__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder__58__free.toml",
        "verifiedAt": "2025-07-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-coder-30b-a3b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-30b-a3b-instruct.toml",
        "verifiedAt": "2025-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-coder-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-flash.toml",
        "verifiedAt": "2025-07-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-coder-next": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-next.toml",
        "verifiedAt": "2026-02-04",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-coder-plus": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-coder-plus.toml",
        "verifiedAt": "2025-07-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-max": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-max.toml",
        "verifiedAt": "2025-09-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-max-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-max-thinking.toml",
        "verifiedAt": "2026-02-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-next-80b-a3b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-next-80b-a3b-instruct.toml",
        "verifiedAt": "2025-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-next-80b-a3b-instruct__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-next-80b-a3b-instruct__58__free.toml",
        "verifiedAt": "2025-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-next-80b-a3b-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-next-80b-a3b-thinking.toml",
        "verifiedAt": "2025-09",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-vl-235b-a22b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-235b-a22b-instruct.toml",
        "verifiedAt": "2025-09-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-vl-235b-a22b-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-235b-a22b-thinking.toml",
        "verifiedAt": "2025-09-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-vl-30b-a3b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-30b-a3b-instruct.toml",
        "verifiedAt": "2025-10-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-vl-30b-a3b-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-30b-a3b-thinking.toml",
        "verifiedAt": "2025-10-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-vl-32b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-32b-instruct.toml",
        "verifiedAt": "2025-10-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-vl-8b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-8b-instruct.toml",
        "verifiedAt": "2025-10-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3-vl-8b-thinking": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3-vl-8b-thinking.toml",
        "verifiedAt": "2025-10-14",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-122b-a10b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-122b-a10b.toml",
        "verifiedAt": "2026-02-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-27b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-27b.toml",
        "verifiedAt": "2026-02-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-35b-a3b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-35b-a3b.toml",
        "verifiedAt": "2026-02-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-397b-a17b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-397b-a17b.toml",
        "verifiedAt": "2026-02-15",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-9b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-9b.toml",
        "verifiedAt": "2026-02-23",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-flash-02-23": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-flash-02-23.toml",
        "verifiedAt": "2026-02-25",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-plus-02-15": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-plus-02-15.toml",
        "verifiedAt": "2026-02-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.5-plus-20260420": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.5-plus-20260420.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.6-27b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-27b.toml",
        "verifiedAt": "2026-04-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.6-35b-a3b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-35b-a3b.toml",
        "verifiedAt": "2026-04-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.6-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-flash.toml",
        "verifiedAt": "2026-04-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.6-max-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-max-preview.toml",
        "verifiedAt": "2026-04-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.6-plus": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.6-plus.toml",
        "verifiedAt": "2026-04-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.7-max": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.7-max.toml",
        "verifiedAt": "2026-05-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "qwen/qwen3.7-plus": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/qwen/qwen3.7-plus.toml",
        "verifiedAt": "2026-06-02",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "rekaai/reka-edge": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/rekaai/reka-edge.toml",
        "verifiedAt": "2026-03-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "rekaai/reka-flash-3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/rekaai/reka-flash-3.toml",
        "verifiedAt": "2025-03-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "relace/relace-apply-3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/relace/relace-apply-3.toml",
        "verifiedAt": "2025-09-26",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "relace/relace-search": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/relace/relace-search.toml",
        "verifiedAt": "2025-12-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sakana/fugu-ultra": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/sakana/fugu-ultra.toml",
        "verifiedAt": "2026-06-24",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sao10k/l3-lunaris-8b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/sao10k/l3-lunaris-8b.toml",
        "verifiedAt": "2024-08-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sao10k/l3.1-70b-hanami-x1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/sao10k/l3.1-70b-hanami-x1.toml",
        "verifiedAt": "2025-01-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sao10k/l3.1-euryale-70b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/sao10k/l3.1-euryale-70b.toml",
        "verifiedAt": "2024-08-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "sao10k/l3.3-euryale-70b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/sao10k/l3.3-euryale-70b.toml",
        "verifiedAt": "2024-12-18",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "stepfun/step-3.5-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/stepfun/step-3.5-flash.toml",
        "verifiedAt": "2026-02-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "stepfun/step-3.7-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/stepfun/step-3.7-flash.toml",
        "verifiedAt": "2026-05-29",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "tencent/hunyuan-a13b-instruct": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/tencent/hunyuan-a13b-instruct.toml",
        "verifiedAt": "2025-07-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "tencent/hy3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/tencent/hy3.toml",
        "verifiedAt": "2026-07-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "tencent/hy3__58__free": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/tencent/hy3__58__free.toml",
        "verifiedAt": "2026-07-06",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "tencent/hy3-preview": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/tencent/hy3-preview.toml",
        "verifiedAt": "2026-04-20",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "thedrummer/cydonia-24b-v4.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/thedrummer/cydonia-24b-v4.1.toml",
        "verifiedAt": "2025-09-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "thedrummer/rocinante-12b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/thedrummer/rocinante-12b.toml",
        "verifiedAt": "2024-09-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "thedrummer/skyfall-36b-v2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/thedrummer/skyfall-36b-v2.toml",
        "verifiedAt": "2025-03-10",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "thedrummer/unslopnemo-12b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/thedrummer/unslopnemo-12b.toml",
        "verifiedAt": "2024-11-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "undi95/remm-slerp-l2-13b": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/undi95/remm-slerp-l2-13b.toml",
        "verifiedAt": "2023-07-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "upstage/solar-pro-3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/upstage/solar-pro-3.toml",
        "verifiedAt": "2026-01-27",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "writer/palmyra-x5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/writer/palmyra-x5.toml",
        "verifiedAt": "2026-01-21",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "x-ai/grok-4.20": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.20.toml",
        "verifiedAt": "2026-03-31",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "x-ai/grok-4.20-multi-agent": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.20-multi-agent.toml",
        "verifiedAt": "2026-03-31",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "x-ai/grok-4.3": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.3.toml",
        "verifiedAt": "2026-04-17",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "x-ai/grok-4.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/x-ai/grok-4.5.toml",
        "verifiedAt": "2026-07-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "x-ai/grok-build-0.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/x-ai/grok-build-0.1.toml",
        "verifiedAt": "2026-04-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "xiaomi/mimo-v2.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/xiaomi/mimo-v2.5.toml",
        "verifiedAt": "2026-04-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "xiaomi/mimo-v2.5-pro": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/xiaomi/mimo-v2.5-pro.toml",
        "verifiedAt": "2026-04-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-4.5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.5.toml",
        "verifiedAt": "2025-07-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-4.5-air": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.5-air.toml",
        "verifiedAt": "2025-07-28",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-4.5v": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.5v.toml",
        "verifiedAt": "2025-08-11",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-4.6": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.6.toml",
        "verifiedAt": "2025-09-30",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-4.6v": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.6v.toml",
        "verifiedAt": "2025-12-08",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-4.7": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.7.toml",
        "verifiedAt": "2025-12-22",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-4.7-flash": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-4.7-flash.toml",
        "verifiedAt": "2026-01-19",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-5": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5.toml",
        "verifiedAt": "2026-02-12",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-5-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5-turbo.toml",
        "verifiedAt": "2026-03-16",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-5.1": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5.1.toml",
        "verifiedAt": "2026-04-07",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-5.2": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5.2.toml",
        "verifiedAt": "2026-06-13",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      },
      "z-ai/glm-5v-turbo": {
        "source": "models.dev",
        "sourceUrl": "https://openrouter.ai/models",
        "sourceFile": "providers/openrouter/models/z-ai/glm-5v-turbo.toml",
        "verifiedAt": "2026-04-01",
        "trustLevel": "estimated",
        "fields": {
          "pricing": {
            "fieldPath": "model.pricing",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "limits": {
            "fieldPath": "model.limits",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "reasoning": {
            "fieldPath": "model.capabilities.reasoning",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "toolCall": {
            "fieldPath": "model.capabilities.toolCall",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "attachment": {
            "fieldPath": "model.capabilities.attachment",
            "state": "generated",
            "trustLevel": "estimated",
            "requiresOverride": false,
            "reason": "generated_from_models_dev"
          },
          "availability": {
            "fieldPath": "model.availability",
            "state": "placeholder",
            "trustLevel": "unknown",
            "requiresOverride": true,
            "reason": "availability_must_be_resolved_locally"
          }
        }
      }
    }
  }
}
