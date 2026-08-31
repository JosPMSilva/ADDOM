# Renderer CSP Threat Model

## Scope
- Applies to the renderer window CSP injected in `src/main/index.mjs` (`installCSPHeader`).
- Covers production runtime only. Dev mode intentionally skips CSP header injection for Vite HMR.

## Renderer model
- Monaco is bundled as local ESM with dedicated local workers.
- The packaged renderer does not require `unsafe-eval` or remote script origins.

## Compensating Controls
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` in BrowserWindow.
- `default-src 'self'`.
- `script-src` restricted to `'self'` (no remote script origins, `unsafe-inline`, or `unsafe-eval`).
- `connect-src 'self'` only.
- `img-src 'self' data: blob: addom-attachment:` only.
- `worker-src blob:` for Monaco workers.
- `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'`.
- `base-uri 'self'`, `form-action 'self'`.

## Residual Risk
- A renderer script-execution flaw could invoke the exposed preload API, so the main process must continue to validate every privileged IPC request.
- Data exfiltration blast radius is constrained by `connect-src 'self'` and no remote script sources.

## Verification
- Invariant regression test: `tests/integration/security-csp-invariants.test.mjs`.
- Sandbox regression test: `tests/integration/security-sandbox-config.test.mjs`.
