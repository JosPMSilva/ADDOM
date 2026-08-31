const path = require('path')
const pkg = require('./package.json')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const config = clone(pkg.build || {})
const updateBaseUrl = String(process.env.ADDOM_UPDATE_BASE_URL || '').trim()

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
