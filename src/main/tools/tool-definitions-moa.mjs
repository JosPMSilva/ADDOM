/** Provider-neutral model-facing delegation tool schemas. */

export const MOA_DELEGATION_TOOLS = [
  {
    name: 'delegate_tasks',
    description: `Delegate bounded task briefs to configured agents. ADDOM compiles the execution plan from the current user request, task meaning, and its live provider-neutral agent catalog.
ADDOM enforces user-requested role and count constraints, assigns the best available specialists, and prevents accidental role reuse. Do not choose or repeat roles in this payload; describe each distinct assignment once.
Access defaults to read_only; staged_write is granted only when both the selected role and ADDOM policy allow staged writes.`,
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'Optional stable task identifier.' },
              kind: {
                type: 'string',
                enum: ['auto', 'research', 'review', 'implementation'],
                description: 'Optional semantic routing hint; auto lets ADDOM infer the specialty.',
              },
              specialty: { type: 'string', description: 'Optional free-form specialty routing hint.' },
              task_type: { type: 'string', description: 'Optional task-shape routing hint.' },
              goal: { type: 'string', description: 'Optional concise outcome.' },
              instruction: { type: 'string', description: 'Specific bounded assignment.' },
              context: { type: 'string', description: 'Concise self-sufficient context or exact snippets.' },
              paths: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
                description: 'Relevant workspace paths the agent may inspect with its allowed tools.',
              },
              constraints: { type: 'array', items: { type: 'string' } },
              access: {
                type: 'string',
                enum: ['read_only', 'staged_write'],
                description: 'Requested access; runtime policy remains authoritative. Defaults to read_only.',
              },
              expected_output_format: { type: 'string', description: 'Optional result format.' },
            },
            required: ['instruction'],
            anyOf: [
              { required: ['context'] },
              { required: ['paths'] },
            ],
          },
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'agent_catalog',
    description: 'Return ADDOM\'s current provider-neutral agent catalog as JSON, including stable role keys, readiness, specialty metadata, and effective read-only or staged-write access. This tool never returns credentials or full role prompts.',
    parameters: {
      type: 'object',
      properties: {
        include_unavailable: {
          type: 'boolean',
          description: 'Include configured roles that are not currently ready. Defaults to true.',
        },
      },
    },
  },
  {
    name: 'apply_artifact_revision',
    description: 'Apply a staged artifact revision to disk after review. Use this to accept an agent-staged change by revision ID.',
    parameters: {
      type: 'object',
      properties: {
        revision_id: {
          type: 'string',
          description: 'Artifact revision identifier to apply to disk.',
        },
        reason: {
          type: 'string',
          description: 'Optional short reason for why this staged revision is being applied.',
        },
      },
      required: ['revision_id'],
    },
  },
]
