# ADDOM Design System Workflow

ADDOM now keeps a repo-level design contract in [../DESIGN.md](../DESIGN.md).

This file is based on:

- the live renderer token layer in [../src/renderer/styles/globals-foundation.css](../src/renderer/styles/globals-foundation.css)
- the production components and design tokens under `src/renderer`
- the upstream `design.md` format from Google Labs Code: [github.com/google-labs-code/design.md](https://github.com/google-labs-code/design.md)

## Purpose

`DESIGN.md` is the source of truth for visual intent, not a replacement for implementation files.

Use it to keep frontend work consistent across:

- live renderer surfaces
- sandbox redesign experiments
- agent-authored UI changes
- future refactors of prompt, approval, and chat surfaces

## Current Direction

The active direction is:

- local-first coding cockpit, not generic SaaS
- restrained dark shell with one default accent
- flatter inline prompt surfaces
- decision content above decorative chrome
- typography and spacing doing more work than nested cards

## Workflow

1. Update `DESIGN.md` when a visual rule or component family changes.
2. Validate it with `npm run design:lint`.
3. Build or refine the smallest production component that can demonstrate the interaction.
4. Move polished patterns into the live renderer once the sandbox direction is stable.
5. Keep `globals-foundation.css` and component usage aligned with the design contract.

## Commands

```powershell
npm run design:lint
npm run check:docs-links
```

`design:lint` records that the design contract is Markdown and therefore has no
separate source linter. `check:docs-links` validates its local references and every
other public documentation link.

## Scope

`DESIGN.md` should describe:

- palette
- typography
- spacing and radii
- component intent
- compositional rules
- explicit do/don't guidance

It should not become a duplicate of every CSS rule in the app.

## For Agent Work

When an agent edits frontend code:

- read `DESIGN.md` first
- preserve the existing product language
- avoid inventing a parallel style system
- prefer sandbox convergence over one-off local styling
