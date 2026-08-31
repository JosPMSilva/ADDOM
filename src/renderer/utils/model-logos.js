// Vite will bundle these SVGs into assets
const LOGO_ASSETS = import.meta.glob('../../common/api-clients/generated/provider-logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})
const APP_PROVIDER_LOGO_ASSETS = import.meta.glob('../assets/provider-logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})
const ALL_LOGO_ASSETS = { ...LOGO_ASSETS, ...APP_PROVIDER_LOGO_ASSETS }

export const getLogoUrl = (logoPath) => {
  if (!logoPath) return null
  const normalizedPath = logoPath.replace(/\\/g, '/')
  const key = Object.keys(ALL_LOGO_ASSETS).find(k => k.endsWith(normalizedPath))
  return key ? ALL_LOGO_ASSETS[key] : null
}
