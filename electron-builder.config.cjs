const path = require('path')
const pkg = require('./package.json')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const config = clone(pkg.build || {})
const updateBaseUrl = String(process.env.ADDOM_UPDATE_BASE_URL || '').trim()
const packageArchitecture = String(process.env.ADDOM_PACKAGE_ARCH || '').trim()

if (packageArchitecture) {
  if (!['x64', 'arm64'].includes(packageArchitecture)) {
    throw new Error(`Unsupported ADDOM package architecture: ${packageArchitecture}`)
  }

  config.mac.target = config.mac.target.map((target) => ({
    ...target,
    arch: [packageArchitecture],
  }))
}

if (updateBaseUrl) {
  config.publish = [
    {
      provider: 'generic',
      url: updateBaseUrl,
    },
  ]
} else {
  config.publish = []
}

config.afterPack = path.join(__dirname, 'scripts', 'after-pack.cjs')

module.exports = config
