# Cross-Provider Final-Answer Fixture Runbook

This corpus is read-only and deterministic.

Use it to normalize final answers from long-answer captures, repo-authored markdown fixtures, and synthetic provider streams.

Extraction rules:

- Long-answer canonical parts contain final-document text only.
- Provider streams keep raw arrival-order `events` plus normalized `canonicalEvents`.
- `reloadEventsFile` is forbidden; use inline `reloadEvents` when needed.
- Stable fixture IDs are the source of truth for `threadId`, `turnId`, `messageId`, and part/event IDs.

Read-only query template:

```sql
-- Replace the placeholders below with fixture-specific IDs.
SELECT *
FROM events
WHERE thread_id = :thread_id
ORDER BY sequence ASC;
```

Validate the rewritten corpus with `node scripts/validate-cross-provider-final-answer-fixtures.mjs`.
