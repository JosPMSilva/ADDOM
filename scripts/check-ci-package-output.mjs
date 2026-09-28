import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PRIMARY_PACKAGE_EXTENSIONS = Object.freeze({
  darwin: ['.dmg'],
  linux: ['.AppImage'],
  win32: ['.exe'],
})

const DISTRIBUTION_PACKAGE_EXTENSIONS = Object.freeze({
  'microsoft-store': Object.freeze({
    win32: ['.appx'],
  }),
})

const UPDATE_METADATA_FILE_NAMES = Object.freeze({
  darwin: 'latest-mac.yml',
  linux: 'latest-linux.yml',
  win32: 'latest.yml',
})

export function findPrimaryPackageOutputs({
  directory,
  distributionChannel = '',
  platform = process.platform,
} = {}) {
  const normalizedDistributionChannel = String(distributionChannel || '').trim()
  const distributionExtensions = DISTRIBUTION_PACKAGE_EXTENSIONS[normalizedDistributionChannel]
  const extensions = distributionExtensions?.[platform] || PRIMARY_PACKAGE_EXTENSIONS[platform]
  if (!extensions) {
    throw new Error(`Unsupported package platform: ${platform}`)
  }

  const packageDirectory = path.resolve(directory || 'dist-electron')
  if (!fs.existsSync(packageDirectory)) {
    return []
  }

  return fs.readdirSync(packageDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => path.join(packageDirectory, entry.name))
    .sort()
}

export function findUpdateMetadataOutput({
  directory,
  platform = process.platform,
} = {}) {
  const fileName = UPDATE_METADATA_FILE_NAMES[platform]
  if (!fileName) {
    throw new Error(`Unsupported package platform: ${platform}`)
  }

  const outputPath = path.join(path.resolve(directory || 'dist-electron'), fileName)
  return fs.existsSync(outputPath) && fs.statSync(outputPath).isFile() ? outputPath : ''
}

export function assertPrimaryPackageOutputVersions({ expectedVersion, outputs } = {}) {
  const normalizedExpectedVersion = String(expectedVersion || '').trim()
  if (!normalizedExpectedVersion) {
    throw new Error('Expected package version is required.')
  }

  const mismatches = (Array.isArray(outputs) ? outputs : [])
    .filter((output) => !path.basename(output).includes(normalizedExpectedVersion))
  if (mismatches.length > 0) {
    throw new Error(`Stale or mixed-version package output detected: ${mismatches.map((output) => path.basename(output)).join(', ')}`)
  }
}

function main() {
  const outputs = findPrimaryPackageOutputs({
    directory: process.argv[2],
    distributionChannel: process.env.ADDOM_DISTRIBUTION_CHANNEL,
  })
  if (outputs.length === 0) {
    throw new Error(`No primary ${process.platform} package output was produced.`)
  }
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assertPrimaryPackageOutputVersions({
    expectedVersion: packageJson.version,
    outputs,
  })
  console.log(`Verified ${outputs.length} primary package output(s):`)
  for (const output of outputs) {
    console.log(`- ${output}`)
  }

  if (String(process.env.ADDOM_UPDATE_PROVIDER || '').trim()) {
    const updateMetadata = findUpdateMetadataOutput({
      directory: process.argv[2],
    })
    if (!updateMetadata) {
      throw new Error(`No ${process.platform} update metadata was produced.`)
    }
    console.log(`Verified update metadata: ${updateMetadata}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
}
