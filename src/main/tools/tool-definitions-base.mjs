/** Base ADDOM tool schemas. */

import { WORKSPACE_TOOLS } from './tool-definitions-workspace.mjs'
import { MOA_DELEGATION_TOOLS } from './tool-definitions-moa.mjs'
import { WEB_AND_COMMAND_TOOLS } from './tool-definitions-web.mjs'

export const BASE_TOOLS = [
  ...WORKSPACE_TOOLS,
  ...MOA_DELEGATION_TOOLS,
  ...WEB_AND_COMMAND_TOOLS,
]
