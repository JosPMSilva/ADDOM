# OpenRouter Setup And Compatibility

OpenRouter is an explicit ADDOM provider for using reviewed and custom routes through one saved provider connection.

## Setup

1. Open **Settings > Providers**.
2. Save an OpenRouter API key.
3. Use **Manage visibility** to choose the namespaces and routes shown in the model selector.
4. Return to Chat, select **OpenRouter**, and choose a visible route.

## Catalog Behavior

- The focused catalog manager supports search, namespace browsing, route-level visibility, capability rules, and reset actions.
- Reviewed routes appear in the ordinary model list when visible.
- Custom OpenRouter route IDs remain available through explicit route selection.
- A custom or unreviewed route uses a conservative generic adapter profile until its capabilities are verified.

## Current Runtime Boundaries

- OpenRouter is explicit-only; another provider does not silently fall back to it.
- An OpenRouter route does not inherit provider-native account or runtime capabilities from the model's original vendor.
- OpenAI background and websocket flows, Moonshot Formula, and Perplexity-owned search or research runtimes remain native-provider capabilities.
- File, PDF, vision, reasoning, and tool capabilities are exposed only when the route metadata and ADDOM adapter both support them.
- Delegated Agent roles may use OpenRouter routes, but ADDOM still owns the role catalog, permission ceiling, scheduling, and Agent Run record.

## Troubleshooting

- If a route is missing, review visibility rules and refresh provider data.
- If tools are unavailable, select a reviewed tool-capable route or use a native provider connection.
- If a custom route behaves differently from its vendor-native equivalent, treat the OpenRouter route as a separate provider path.

## Related References

- [OpenRouter Compatibility Matrix](./reference/openrouter-compatibility-matrix.md)
- [Settings Reference](./settings-reference.md)
- [Agents Guide](./agents-guide.md)
