import { shutdownManagedAgentRuntimeIfActive } from './agents/managed-agent-runtime-singleton.mjs'
import { getCursorAgentAuthService } from './cursor-agent/cursor-agent-auth-service.mjs'
import { killAllTrackedCursorAgentProcesses } from './cursor-agent/cursor-agent-process.mjs'

export function prepareAppRuntimeShutdown(chatRunRegistry = null) {
  return Promise.allSettled([
    chatRunRegistry?.interruptAndWait({}, { reason: 'Application quit.' }),
    getCursorAgentAuthService().shutdown(),
    killAllTrackedCursorAgentProcesses(),
    shutdownManagedAgentRuntimeIfActive('application_quit'),
  ])
}
