export function registerPrivilegedSchemes({
  protocol,
  rendererAppScheme,
  attachmentPreviewScheme,
} = {}) {
  if (typeof protocol?.registerSchemesAsPrivileged !== 'function') return
  protocol.registerSchemesAsPrivileged([
    {
      scheme: rendererAppScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: attachmentPreviewScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}
