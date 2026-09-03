import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PRIMARY_PACKAGE_EXTENSIONS = Object.freeze({
  darwin: ['.dmg'],
  linux: ['.AppImage'],
  win32: ['.exe'],
})

const UPDATE_METADATA_FILE_NAMES = Object.freeze({
  darwin: 'latest-mac.yml',
  linux: 'latest-linux.yml',
  win32: 'latest.yml',
})

export function findPrimaryPackageOutputs({
  directory,
  platform = process.platform,
} = {}) {
  const extensions = PRIMARY_PACKAGE_EXTENSIONS[platform]
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

function main() {
  const outputs = findPrimaryPackageOutputs({
    directory: process.argv[2],
  })
  if (outputs.length === 0) {
    throw new Error(`No primary ${process.platform} package output was produced.`)
  }
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
