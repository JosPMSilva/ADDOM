# Contributing

Contributions should keep behavior, documentation, and test coverage aligned in the same change cycle.

Please report security vulnerabilities through the private process described in
[SECURITY.md](./SECURITY.md), not through a public issue.

## Prerequisites

- Node.js
- npm
- platform-native build prerequisites required by Electron and native modules such as `better-sqlite3`

Native module rebuilds are part of normal development in this repo.

## Local Development

```powershell
npm install
npm run dev
```

`npm run dev` starts the Vite renderer and the Electron app together after preparing the Electron-native runtime.

## Tests and Checks

```powershell
npm run test:integration
npm run check:docs-links
npm run check:max-lines
```

Run the relevant focused tests for the area you changed, then run the broader integration suite before closing the work.

`npm run check:max-lines` is the default 800-line source guard. It scans `src`, excludes generated assets, and caps documented legacy source hotspots at their current line counts so they cannot grow. Run `$env:STRICT_MAX_LINES='1'; npm run check:max-lines` to fail on every source file still above 800 lines, including grandfathered entries. Run `$env:CHECK_TESTS_AND_SCRIPTS='1'; npm run check:max-lines` when you also want to include `tests` and `scripts` in the inventory pass.

## Native Runtime Workflow

Plain Node integration tests and Electron development do not share the same native `better-sqlite3` binary. The repo scripts handle that switch for you:

- `npm run dev` prepares the Electron-native runtime
- `npm run test:integration` prepares the Node-native runtime, runs tests, then restores the Electron-native runtime

Avoid manually rebuilding native modules unless you are debugging the runtime switch itself.

## Change Expectations

- Update docs when behavior or workflows change.
- Keep or add tests for feature changes and regressions.
- Avoid growing already-large files without a strong reason.
- Prefer small, boundary-respecting changes; stricter SRP and file-size reduction work is planned separately.

## Architecture Boundaries

- Keep renderer-only logic in `src/renderer`.
- Keep Electron, filesystem, process, and IPC implementation details in `src/main`.
- Use `src/preload` for the renderer bridge instead of direct Electron access from the UI.
- Put logic in `src/common` only when it is genuinely shared across processes.
