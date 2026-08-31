# Troubleshooting

## Who This Is For
- Users diagnosing runtime, model, tool, or workflow issues.

## Prerequisites
- Access to Chat runbook, Settings, and relevant panel for affected feature.

## What This Feature Does
Provides practical diagnosis and recovery steps for common ADDOM issues.

## Step-by-Step Tasks

### 1. Provider/Model Errors
Symptoms:
- Stream fails early.
- No assistant output.
- Capability mismatch.

Actions:
1. Verify provider key in settings.
2. Confirm selected model exists for provider.
3. Retry in `Execute` mode with simpler prompt.
4. Review runbook error reason and hint fields.

### 2. Tool Approval or Command Safety Blocks
Symptoms:
- Tool requests repeatedly denied or blocked.
- Commands require explicit host access path.

Actions:
1. Inspect approval overlay details.
2. Confirm `Permission mode` and whether the step is hitting a risky-action approval or a hard guardrail.
3. Re-check whether the action is hitting first-risky-use approval, install sandbox routing, or explicit host elevation.
4. Re-run with safer or narrower command.

### 3. Attachment Failures
Symptoms:
- File/image attach blocked after model switch.
- Runtime missing for fallback extraction.

Actions:
1. Remove unsupported pending attachments.
2. Switch to model with native modality support.
3. If using fallback extraction:
   - install MarkItDown runtime
   - confirm the advanced profile enables extraction and restart ADDOM so runtime readiness is reprobed
4. Re-send prompt.

### 4. Editor and File Sync Issues
Symptoms:
- External change warning.
- Expected auto-refresh missing for some folders.

Actions:
1. Use reload-from-disk option when safe.
2. Save local edits first to avoid losing work.
3. If watcher cap warning appears, refresh/open files manually and reduce folder sprawl if possible.

### 5. Memory and Continuity Issues
Symptoms:
- Missing expected historical context.
- Search results poor or noisy.

Actions:
1. Check include-global and include-archived toggles.
2. Pin key nodes and clean stale notes.
3. Verify compression settings are not over-aggressive.
4. Review continuity policy profile.

### 6. Agent Delegation Problems
Symptoms:
- Preflight failure.
- Agent missing key or not found.
- Partial completion with errors.
- Delegated agent ends as `stale`.

Actions:
1. Inspect the compact root-stream reference, then select the child in the Agents panel
   for its full conversation and error.
2. Validate role provider/model and key readiness.
3. Review the capacity profile, hard-limit fields, and provider concurrency cap in
   `Settings > Agents`.
4. Reduce task count or scope and retry the failed child when that provider supports it.
5. If status is `stale`, distinguish it from `timeout`:
   - `timeout` means the hard delegation budget was exhausted
   - `stale` means the stream stopped producing progress for too long
6. For local providers such as Ollama/LM Studio, expect coarser or burstier streaming than richer hosted runtimes.

### 7. Local Model or Provider Capability Warnings
Symptoms:
- Execution stream shows a warning such as `model_no_tool_support`.
- The assistant responds normally but tools do not run.

Actions:
1. Check the runtime diagnostics block in the execution stream.
2. Confirm whether the selected provider/model path actually supports the requested tool surface.
3. If using a local/OpenAI-compatible model, expect plain text or coarse reasoning streaming rather than richer tool-aware progress events.
4. Switch to a tool-capable model/provider if the task requires file edits, commands, or delegated execution.

### 8. Inline Completion Issues
Symptoms:
- No ghost-text suggestions appearing.
- Suggestions are wrong or irrelevant.
- Completions stop working after model switch.

Actions:
1. Verify `inlineCompletionEnabled` is on in settings.
2. Confirm provider API key is valid for the selected inline model.
3. Open inline completion telemetry in settings to check error/empty rates.
4. If error rate is high, try a different provider or model.
5. Clear telemetry counters and retry to isolate transient failures.

## Common Pitfalls
### What Can Go Wrong
- Debugging from assistant text only, skipping runbook evidence.
  - Fix: always inspect timeline/runbook events first.
- Changing multiple settings at once and losing causal signal.
  - Fix: change one variable, retest, then proceed.
- Treating staged outputs as applied outputs.
  - Fix: confirm apply/rollback state in artifacts.

## Related Settings
- `permissionMode`
- `riskyActionPolicy`
- `commandSafety`
- `attachmentTextExtraction`
- `memoryCompression*`
- `continuityPolicy`
- `agentSettings`
- `moaRoles`

## Related References
- [Events and Runbook](./reference/events-and-runbook.md)
- [Settings Catalog](./reference/settings-catalog.md)
- [window.addom API](./reference/window-addom-api.md)
