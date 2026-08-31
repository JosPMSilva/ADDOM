import { ipcMain } from 'electron'
import {
  listBackgroundCommands,
  stopBackgroundCommand,
  stopAllBackgroundCommands,
} from '../tools/fs-tools.mjs'
import {
  listOpenAIBackgroundJobs,
  stopAllOpenAIBackgroundJobs,
  stopOpenAIBackgroundJob,
} from '../api-clients/openai-background-jobs.mjs'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'

export function registerProcessHandlers() {
  handleVersioned(ipcMain, 'processes:list-background', (_event, { project } = {}) => {
    return {
      jobs: [
        ...listBackgroundCommands({ projectRoot: project || '' }).map((job) => ({
          ...job,
          kind: 'command',
        })),
        ...listOpenAIBackgroundJobs({ projectRoot: project || '' }),
      ].sort((a, b) => (Number(b.startedAt || 0) || 0) - (Number(a.startedAt || 0) || 0)),
      serverTime: Date.now(),
    }
  })

  handleVersioned(ipcMain, 'processes:stop-background', async (_event, { id } = {}) => {
    const normalizedId = String(id || '').trim()
    if (normalizedId.startsWith('oaibg-')) {
      return stopOpenAIBackgroundJob(normalizedId, {
        reason: 'Stopped by user from background jobs modal.',
      })
    }
    return stopBackgroundCommand(normalizedId, { reason: 'Stopped by user from background jobs modal.' })
  })

  handleVersioned(ipcMain, 'processes:stop-all-background', async (_event, { project } = {}) => {
    const commandResult = await stopAllBackgroundCommands({
      projectRoot: project || '',
      reason: 'Stopped by user from background jobs modal.',
    })
    const openAIResult = await stopAllOpenAIBackgroundJobs({
      projectRoot: project || '',
      reason: 'Stopped by user from background jobs modal.',
    })
    return {
      requested: Number(commandResult?.requested || 0) + Number(openAIResult?.requested || 0),
      stopped: Number(commandResult?.stopped || 0) + Number(openAIResult?.stopped || 0),
    }
  })
}
