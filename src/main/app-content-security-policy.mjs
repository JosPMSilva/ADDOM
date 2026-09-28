export function installContentSecurityPolicy({
  isDev = false,
  defaultSession,
  attachmentPreviewScheme = 'addom-attachment',
} = {}) {
  if (isDev) {
    // Vite injects an inline HMR bootstrap. This warning is development-only and
    // does not apply to the strict policy used by packaged builds.
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
    return
  }

  const PROD_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${attachmentPreviewScheme}:`,
    "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PROD_CSP],
      },
    })
  })
}
