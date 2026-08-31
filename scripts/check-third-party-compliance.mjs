import { validateComplianceArtifacts } from './lib/third-party-compliance.mjs'

const { failures, artifacts } = validateComplianceArtifacts(process.cwd())

if (failures.length > 0) {
  console.error('Third-party compliance check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(
  `Third-party compliance check passed for ${artifacts.fullInventory.length} full inventory item(s) and ${artifacts.shippedInventory.length} shipped item(s).`,
)
