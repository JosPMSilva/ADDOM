# Model Catalog Maintenance

ADDOM treats models.dev as upstream evidence, not as a build-time dependency.
The application and CI generate runtime catalog artifacts from the reviewed,
tracked snapshot in `catalog-source/models-dev.normalized.json`. Its lock file
binds that snapshot to an upstream repository, commit, tree, content digest,
and expected provider/model counts.

## Normal builds and CI

`npm run catalog:generate` regenerates runtime artifacts from the tracked
snapshot without network access.

`npm run catalog:check:generated` performs the same generation in a temporary
directory and compares it byte-for-byte with the committed runtime artifacts.
It deliberately ignores machine-local models.dev caches.

## Reviewing an upstream update

1. Run `npm run catalog:sync:windows` to update the local bare mirror, create a
   portable export, and write a candidate under
   `.cache/model-catalog-review`.
2. Review `.cache/model-catalog-review/refresh-report.md`. Pay particular
   attention to removals and changes to pricing, limits, or capabilities.
3. Run `npm run catalog:accept:refresh` only after the candidate is acceptable.
4. Inspect the Git diff and run `npm run catalog:check:generated`.

Refresh and acceptance are intentionally separate. Fetching upstream data
never changes ADDOM's tracked last-known-good catalog by itself. Removals and
capability changes therefore remain visible review decisions instead of
silently changing the product.
