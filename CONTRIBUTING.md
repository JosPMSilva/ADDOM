# Contributing

Thank you for helping improve ADDOM. Keep implementation, tests, user-visible copy, and documentation aligned in the same change.

Report security vulnerabilities through the private process in [SECURITY.md](./SECURITY.md), not through a public issue.

## Prerequisites

- Node.js 24
- npm
- Git
- platform build prerequisites required by Electron and its native dependencies

## Local Development

```powershell
git clone https://github.com/JosPMSilva/ADDOM.git
cd ADDOM
npm ci
npm run dev
```

`npm ci` runs the repository's installation checks, downloads Electron, installs the local Git hooks, and validates the portable Electron-native assets. `npm run dev` starts Vite and Electron together.

## Change Workflow

1. Inspect the relevant process boundary and nearby tests before editing.
2. Add or update focused regression coverage for deterministic behavior changes.
3. Keep privileged filesystem, process, credential, and provider operations in the main process.
4. Expose renderer capabilities only through explicit preload contracts.
5. Update every supported locale when user-visible copy changes.
6. Run focused checks first, then the broader checks appropriate to the changed surface.

Avoid mixing unrelated cleanup into a contribution. Remove obsolete paths made unnecessary by the change instead of preserving duplicate implementations.

## Tests And Checks

Useful focused and repository-wide commands include:

```powershell
npm run check:node-syntax
npm run check:renderer-syntax
npm run check:eslint
npm run i18n:check
npm run check:docs-links
npm run check:max-lines
npm run test:integration
npm run build:renderer
```

Use `npm run check:syntax` to run every syntax check. Run `npm run check:renderer` for the renderer contract group, and run the relevant focused `node --test ...` command while iterating on a regression.

`npm run check:max-lines` is the 800-line source guard. It scans `src`, excludes generated assets, and prevents documented legacy hotspots from growing. In PowerShell, use `$env:STRICT_MAX_LINES='1'; npm run check:max-lines` to include all existing source hotspots, or `$env:CHECK_TESTS_AND_SCRIPTS='1'; npm run check:max-lines` to include tests and scripts in the inventory pass.

## Native Dependencies

ADDOM uses prepared native assets for Electron development, plain Node tests, and packaging. The repository scripts select and validate the required asset without rewriting the installed dependency tree. Use the documented `npm run dev`, `npm run test:integration`, and build commands instead of manually rebuilding native modules.

## Packaging

```powershell
npm run build:win
npm run build:mac
npm run build:linux
```

Build each platform target on its native host. The default configuration does not publish artifacts and does not provide signing credentials; signing and release publication must be configured by the maintainer.

## Architecture Boundaries

- `src/main`: Electron main-process logic, provider adapters, tools, persistence, credentials, agents, and platform integration.
- `src/preload`: the narrow renderer bridge.
- `src/renderer`: React UI, state projection, editor, and settings flows.
- `src/common`: contracts and logic genuinely shared across processes.

Keep pull requests reviewable, explain user-visible behavior changes, and include the verification commands you ran.
