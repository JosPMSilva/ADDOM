import { applyOwnerOnlyFilePermissions } from '../utils/private-file-permissions.mjs'

export function hardenDatabaseFiles(dbPath) {
  for (const candidatePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    applyOwnerOnlyFilePermissions(candidatePath)
  }
}
