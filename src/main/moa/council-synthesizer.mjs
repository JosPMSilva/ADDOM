/**
 * council-synthesizer.mjs
 *
 * Synthesis prompt builder for the LLM Council.
 * Takes N agent outputs from different models and produces
 * a synthesis prompt that merges them into a consensus result.
 */

/**
 * Build the synthesis prompt for merging council outputs.
 *
 * @param {Array<{ roleName: string, modelLabel: string, output: string }>} agentOutputs
 * @param {{ originalTask: string }} context
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildSynthesisPrompts(agentOutputs, { originalTask = '' } = {}) {
    const outputs = Array.isArray(agentOutputs) ? agentOutputs : []

    const formattedOutputs = outputs.map((wo, i) => {
        const label = wo.modelLabel || wo.roleName || `Model ${i + 1}`
        const output = String(wo.output || '').trim() || '(no output)'
        return `### ${label}\n${output}`
    }).join('\n\n---\n\n')

    const systemPrompt = `You are a synthesis engine for a multi-model council review.
You have received outputs from ${outputs.length} independent AI models that were each given the same task.
Your job is to produce a single, unified consensus report.

Rules:
1. Identify AGREEMENTS — findings that multiple models mention (these are high-confidence)
2. Identify UNIQUE INSIGHTS — findings only one model mentions (flag as "single-source")
3. Identify DISAGREEMENTS — contradictory findings (present both sides)
4. Rank all findings by confidence: All agree > Majority agree > Single source
5. Include attribution: which model(s) identified each finding
6. Produce a clear, actionable summary

Output format:
## Consensus Report

### High-Confidence Findings (multiple models agree)
- [finding] — Sources: [model names]

### Unique Insights (single model)
- [finding] — Source: [model name]

### Disagreements
- [topic]: [Model A] says X, [Model B] says Y

### Overall Assessment
[1-2 paragraph synthesis]

Always respond in the same language as the original task.`

    const userPrompt = `Original task: ${originalTask || '(not provided)'}

Here are the independent outputs from ${outputs.length} models:

${formattedOutputs}

Synthesize these into a single consensus report.`

    return { systemPrompt, userPrompt }
}

