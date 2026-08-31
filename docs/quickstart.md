# Quickstart

This guide takes a fresh ADDOM checkout from launch to a first safe project task.

## Prerequisites

- A local project folder.
- One usable provider connection: an API key, a supported account connection, or an available local provider.
- Internet access when using a remote provider.

## 1. Start ADDOM

From the repository root:

```powershell
npm ci
npm run dev
```

ADDOM opens directly into its normal shell. There is no separate setup wizard, and Settings is available before a project is opened.

## 2. Configure A Provider

1. Open **Settings**.
2. Select **Providers**.
3. Configure an API key, connect a supported account, or confirm that a local provider is available.
4. For OpenRouter, use **Manage visibility** to choose which catalog routes appear in the model selector.

OpenAI Project Knowledge is a separate hosted feature. It currently requires OpenAI API-key authentication; normal local attachments do not become hosted knowledge unless you explicitly add them.

## 3. Open A Project And Thread

1. Select **Projects > Open folder**.
2. Choose the project ADDOM may inspect or modify.
3. Create or select a thread.
4. Choose a provider and model from the composer controls.

## 4. Choose Execution Boundaries

Select a chat mode and permission mode in the composer:

- **Plan** develops an approach without applying project changes.
- **Execute** allows tools within the selected permission policy.
- **Ask** requests approval for guarded actions and is the recommended starting permission.
- **Autonomy** reduces routine interruptions inside the active project.
- **Full Access** permits the broadest supported tool scope but does not bypass hard-deny policy.

Review the active controls under **Settings > Safety**. Child agents inherit the root task's permission ceiling and cannot widen it.

## 5. Send A Scoped Request

Start with a concrete task, for example:

> Read `src/main/index.mjs` and explain how startup errors are handled. Do not change files.

For an editing task, name the expected outcome and any important constraints. ADDOM shows tool activity in the timeline and surfaces approvals when the selected policy requires them.

## 6. Review The Result

1. Inspect the runbook and tool results in the timeline.
2. Review **Files changed** and any generated artifacts.
3. Open the integrated editor to inspect or refine files.
4. If agents were delegated, open the **Agents** panel to inspect role assignment, progress, and results returned to the root assistant.

## Common Problems

- **No model can run:** confirm the provider connection in **Settings > Providers**, then reselect the provider and model.
- **The assistant only plans:** switch the composer from **Plan** to **Execute**.
- **A guarded action is waiting:** approve it, deny it, or ask for a safer alternative.
- **Project tools are unavailable:** open a project and make sure a thread is selected.
- **A model is hidden:** review provider availability or the OpenRouter visibility manager.

## Related Guides

- [Chat Guide](./chat-guide.md)
- [Tools and Approvals](./tools-and-approvals.md)
- [Workspace and Threads](./workspace-threads-guide.md)
- [Settings Reference](./settings-reference.md)
- [Agents Guide](./agents-guide.md)
