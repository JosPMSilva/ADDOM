## `DEFAULT_SETTINGS` snapshot

These rows summarize the normalized settings surface that drives active runtime behavior or preserves explicit rollout metadata.

## Core Settings (`DEFAULT_SETTINGS`)

| Key | Default | Effect |
|---|---|---|
| `permissionMode` | `ask` | Primary execution-mode setting used by chat and Settings surfaces. |
| `riskyActionPolicy` | `prompt_first_risky_use` | First-risky-use approval policy for network fetches and project installs. |
| `inlineCompletionEnabled` | `true` | Enables inline ghost-text completion in editor. |
| `commandSafety` | command safety defaults | Advanced guardrail tuning and diagnostics only. |
| `chatMode` | `execute` | Default mode when starting chat turns. |
| `uiLocale` | `en` | Saved app-language setting for renderer UI surfaces. Persists canonical locale codes such as `system`, `en`, `es`, or `pt-BR`. Backend behavior, assistant replies, commands, and technical/support-critical tokens stay canonical English. |
| `memoryCompressionEnabled` | `true` | Enables auto-compression of eligible memory logs. |
| `memoryCompressionThreshold` | `50` | Compression threshold (normalized/clamped). |
| `memoryCompressionCooldownMs` | `120000` | Cooldown between compression runs. |
| `memoryCompressionMaxPerHour` | `4` | Upper bound for compression frequency per hour. |
| `memoryCompressionMinNewLogs` | `12` | Minimum new logs required before compression. |
| `includeGlobalMemoryInContext` | `false` | Includes global memory nodes in context injection. |
| `agentSettings` | balanced Agents defaults | Canonical user-facing delegation enablement, capacity, bounded limits, required write isolation, and provider concurrency caps. |
| `systemPromptAppendix` | `""` | User-appended system instruction suffix. |
| `moaRoles` | `[]` | Configured agent role definitions. |
| `moaPolicy` | engine policy defaults | Internal managed-agent execution guardrails. Not a renderer-facing selectable runtime. |
| `moaBudgetPolicy` | engine budget defaults | Internal cost estimation and confirmation behavior. Not a renderer-facing policy editor. |
| `continuityPolicy` | continuity defaults | Continuity packet and retrieval behavior. |
| `complianceMode` | `warn_only` | Compliance warnings/confirmation behavior. |
| `providerTermsAcknowledgements` | `{}` | Provider terms acknowledgement ledger by provider/version. |
| `attachmentTextExtraction` | fallback defaults | Local MarkItDown fallback extraction controls. |
| `editorLanguageServicePlatform` | `{ enabled: true, rolloutChannel: "pilot" }` | Explicit rollout metadata for the editor language-service platform. The unified editor-service path is already active; this setting tracks rollout intent rather than switching back to a legacy path. |

## Command Safety (`DEFAULT_COMMAND_SAFETY`)

| Key | Default | Effect |
|---|---|---|
| `showDeveloperOptions` | `false` | UI visibility for advanced safety controls. |
| `installSandboxEnabled` | `false` | Enables install sandbox path when supported. |
| `installSandboxIgnoreScriptsFirstPass` | `false` | First-pass install strategy behavior. |
| `preferredBackend` | `auto` | Preferred sandbox backend (`auto/docker/wsl/none`). |
| `sandboxNetworkEnforcementMode` | `strict` | Network enforcement posture (`best_effort/strict`). |
| `registryAllowlist` | `[]` | Optional registry allowlist controls. |
| `cacheDirs` | `[]` | Optional cache directory controls. |

## Compliance Modes
- `warn_only` (default)
- `strict`
- `off`

## Attachment Text Extraction Defaults
- `enabled: false`
- `engine: markitdown_local`
- `mode: fallback_only`
- `maxCharsPerAttachment: 12000`
- `maxCharsPerTurn: 60000`
- `maxAttachmentsPerTurn: 4`
- `timeoutMs: 20000`
- `includeImages: false`

## Canonical Agents Settings

`agentSettings` defaults to:

- `enabled: true`
- `defaultProfile: balanced`
- `fanoutConfirmationThreshold: 5`
- `writeIsolation: required`
- `providerConcurrencyCaps: {}`
- editable balanced limits:
  - `maxLiveAgents: 8`
  - `maxDepth: 4`
  - `maxDescendants: 64`
  - `maxTotalTokens: 400000`
  - `maxCostUsd: 75`
  - `maxDurationMs: 1800000`

Available profiles are `conservative`, `balanced`, `high`, and `ultra`. Saved overrides
are clamped to hard ceilings in the main process. Provider capability hints may further
narrow effective depth or concurrency.

## Internal Managed-Agent Policy Defaults

These retained engine fields support the managed adapter. They do not create a second
Agent Run store or an alternate renderer path.
- `maxTasksPerDelegation: 6`
- `maxAgentRounds: 8`
- `maxConsecutiveIdenticalToolRounds: 3`
- `maxConsecutiveNearDuplicateExplorationRounds: 4`
- `maxLoopRecoveryAttempts: 1`
- `maxDelegationDurationMs: 600000`
- `agentStreamIdleTimeoutMs: 30000`
- `localAgentStreamIdleTimeoutMs: 180000`
- `maxTotalTokensPerDelegation: 120000`
- `maxAgentOutputChars: 12000`
- `requireConfiguredApiKey: true`
- `agentWriteAccessEnabled: false`
- `agentWriteMode: staged`

## Agent Timeout Semantics
- `maxDelegationDurationMs` is the hard upper bound for the whole delegation.
- `agentStreamIdleTimeoutMs` is the default per-agent silence budget before ADDOM marks the stream as stale.
- `localAgentStreamIdleTimeoutMs` is the more lenient silence budget used for local providers such as Ollama and LM Studio.

## Agent Loop Guard Semantics
- `maxConsecutiveIdenticalToolRounds` stops exact same-batch tool loops.
- `maxConsecutiveNearDuplicateExplorationRounds` stops repeated file/query/range exploration loops.
- `maxLoopRecoveryAttempts` allows one visible narrowed-scope recovery retry before ADDOM fails the worker normally.

## See Also
- [window.addom API](./window-addom-api.md)
- [Events and Runbook](./events-and-runbook.md)
