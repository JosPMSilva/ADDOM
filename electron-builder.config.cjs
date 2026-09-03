const path = require('path')
const pkg = require('./package.json')

const OFFICIAL_GITHUB_UPDATE_PROVIDER = Object.freeze({
  provider: 'github',
  owner: 'JosPMSilva',
  repo: 'ADDOM',
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const config = clone(pkg.build || {})
const updateProvider = String(process.env.ADDOM_UPDATE_PROVIDER || '').trim().toLowerCase()
const packageArchitecture = String(process.env.ADDOM_PACKAGE_ARCH || '').trim()

if (updateProvider && updateProvider !== OFFICIAL_GITHUB_UPDATE_PROVIDER.provider) {
  throw new Error(`Unsupported ADDOM update provider: ${updateProvider}`)
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

if (updateProvider === OFFICIAL_GITHUB_UPDATE_PROVIDER.provider) {
  config.publish = [clone(OFFICIAL_GITHUB_UPDATE_PROVIDER)]
} else {
  config.publish = []
}

config.afterPack = path.join(__dirname, 'scripts', 'after-pack.cjs')

module.exports = config
