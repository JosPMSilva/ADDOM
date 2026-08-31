import { writeComplianceArtifacts } from './lib/third-party-compliance.mjs'

const { shippedInventory, fullInventory } = writeComplianceArtifacts(process.cwd())

console.log(`Generated compliance artifacts: ${fullInventory.length} full inventory item(s), ${shippedInventory.length} shipped item(s).`)
