const path = require('path')
const pkg = require('./package.json')

const OFFICIAL_GITHUB_UPDATE_PROVIDER = Object.freeze({
  provider: 'github',
  owner: 'JosPMSilva',
  repo: 'ADDOM',
})

const MICROSOFT_STORE_DISTRIBUTION_CHANNEL = 'microsoft-store'
const MICROSOFT_STORE_APPX = Object.freeze({
  applicationId: 'ADDOM',
  artifactName: 'ADDOM-Store-${version}-${arch}.${ext}',
  backgroundColor: '#0b0c0c',
  capabilities: ['runFullTrust'],
  displayName: 'ADDOM',
  identityName: 'JosPMSilva.Addom',
  publisher: 'CN=931991DE-381E-4CC4-92BD-C38FE9044DA5',
  publisherDisplayName: 'JosPMSilva',
  setBuildNumber: false,
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const config = clone(pkg.build || {})
const updateProvider = String(process.env.ADDOM_UPDATE_PROVIDER || '').trim().toLowerCase()
const distributionChannel = String(process.env.ADDOM_DISTRIBUTION_CHANNEL || '').trim().toLowerCase()
const packageArchitecture = String(process.env.ADDOM_PACKAGE_ARCH || '').trim()

if (updateProvider && updateProvider !== OFFICIAL_GITHUB_UPDATE_PROVIDER.provider) {
  throw new Error(`Unsupported ADDOM update provider: ${updateProvider}`)
}

if (distributionChannel && distributionChannel !== MICROSOFT_STORE_DISTRIBUTION_CHANNEL) {
  throw new Error(`Unsupported ADDOM distribution channel: ${distributionChannel}`)
}

if (distributionChannel === MICROSOFT_STORE_DISTRIBUTION_CHANNEL && updateProvider) {
  throw new Error('Microsoft Store builds cannot embed a GitHub update provider.')
}

if (packageArchitecture) {
  if (!['x64', 'arm64'].includes(packageArchitecture)) {
    throw new Error(`Unsupported ADDOM package architecture: ${packageArchitecture}`)
  }

  config.mac.target = config.mac.target.map((target) => ({
    ...target,
    arch: [packageArchitecture],
  }))
}

if (distributionChannel === MICROSOFT_STORE_DISTRIBUTION_CHANNEL) {
  config.win.target = [{ target: 'appx', arch: ['x64'] }]
  config.directories.output = 'dist-electron/store'
  config.extraMetadata = {
    ...(config.extraMetadata || {}),
    addomDistributionChannel: MICROSOFT_STORE_DISTRIBUTION_CHANNEL,
  }
  config.appx = clone(MICROSOFT_STORE_APPX)
  config.appxManifestCreated = path.join(__dirname, 'scripts', 'prepare-microsoft-store-manifest.cjs')
  config.publish = []
} else if (updateProvider === OFFICIAL_GITHUB_UPDATE_PROVIDER.provider) {
  config.publish = [clone(OFFICIAL_GITHUB_UPDATE_PROVIDER)]
} else {
  config.publish = []
}

config.afterPack = path.join(__dirname, 'scripts', 'after-pack.cjs')

module.exports = config
