const fs = require('node:fs/promises')
const path = require('node:path')

const WINDOWS_VERSION_FIELD_MAX = 65535

function validateMicrosoftStorePackageVersion(value) {
  const raw = String(value || '').trim()
  const fields = raw.split('.')
  if (fields.length !== 4 || fields.some((field) => !/^\d+$/.test(field))) {
    throw new Error('Microsoft Store package version must contain four numeric fields.')
  }

  const numbers = fields.map(Number)
  if (numbers.some((field) => field < 0 || field > WINDOWS_VERSION_FIELD_MAX)) {
    throw new Error(`Microsoft Store package version fields must be between 0 and ${WINDOWS_VERSION_FIELD_MAX}.`)
  }
  if (numbers[0] === 0) {
    throw new Error('Microsoft Store package version first field must be greater than zero.')
  }
  if (numbers[3] !== 0) {
    throw new Error('Microsoft Store package version fourth field must be zero.')
  }
  return numbers.join('.')
}

function resolveMicrosoftStorePackageVersion(appVersion) {
  const coreVersion = String(appVersion || '').trim().split('-')[0]
  const fields = coreVersion.split('.')
  if (fields.length !== 3 || fields.some((field) => !/^\d+$/.test(field))) {
    throw new Error(`Cannot derive Microsoft Store package version from app version: ${appVersion}`)
  }
  const [major, minor, patch] = fields.map(Number)
  return validateMicrosoftStorePackageVersion(`${major + 1}.${minor}.${patch}.0`)
}

async function prepareMicrosoftStoreManifest(manifestPath, options = {}) {
  const packageJson = require(path.join(__dirname, '..', 'package.json'))
  const appVersion = String(options.appVersion || packageJson.version || '').trim()
  const packageVersion = validateMicrosoftStorePackageVersion(
    options.packageVersion
      || process.env.ADDOM_STORE_PACKAGE_VERSION
      || resolveMicrosoftStorePackageVersion(appVersion),
  )
  const source = await fs.readFile(manifestPath, 'utf8')
  const identityVersionPattern = /(<Identity\b[^>]*\bVersion=")[^"]*(")/i
  if (!identityVersionPattern.test(source)) {
    throw new Error('Microsoft Store manifest is missing the package identity version.')
  }
  await fs.writeFile(
    manifestPath,
    source.replace(identityVersionPattern, `$1${packageVersion}$2`),
    'utf8',
  )
}

module.exports = prepareMicrosoftStoreManifest
module.exports.resolveMicrosoftStorePackageVersion = resolveMicrosoftStorePackageVersion
module.exports.validateMicrosoftStorePackageVersion = validateMicrosoftStorePackageVersion
