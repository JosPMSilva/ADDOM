# ADDOM

Local-first AI coding assistant with real filesystem tool use.

## What It Is

ADDOM is an Electron desktop app for AI-assisted coding with:

- multi-provider chat
- real project file tools
- a built-in Monaco editor
- local memory and artifact history
- MoA orchestration for delegated workflows

## Quick Start

```powershell
npm install
npm run dev
npm run test:integration
```

Build targets:

```powershell
npm run build:win
npm run build:mac
npm run build:linux
```

## Native Module Runtime Note

This repo switches `better-sqlite3` between Node and Electron runtimes automatically:

- `npm run dev` prepares the Electron-native build before launching the app
- `npm run test:integration` switches to the Node-native build, runs tests, and restores the Electron-native build afterward

## Documentation

- Full docs index: [docs/README.md](./docs/README.md)
- Contributor workflow: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Security reporting: [SECURITY.md](./SECURITY.md)
- Ongoing release notes: [CHANGELOG.md](./CHANGELOG.md)

## Architecture At A Glance

- `src/main` contains Electron main-process logic, IPC handlers, tools, persistence, and platform integrations.
- `src/renderer` contains the React UI, state stores, editor surfaces, and settings flows.
- `src/preload` exposes the versioned `window.addom` bridge to the renderer.
- `src/common` holds truly shared cross-process logic such as model registry and compliance policy helpers.

## License

MIT. See [LICENSE](./LICENSE).
