/**
 * pipeline-definitions.mjs
 *
 * Built-in pipeline definitions and schema validation.
 * Each pipeline specifies a sequence of agent steps that
 * chain outputs from one to the next.
 */

function cleanString(value) {
    return String(value ?? '').trim()
}

/**
 * Normalize a pipeline definition to a safe, consistent shape.
 *
 * @param {object} raw
 * @returns {object}
 */
export function normalizePipeline(raw = {}) {
    const input = raw && typeof raw === 'object' ? raw : {}
    return {
        id: cleanString(input.id) || `pipe_${Date.now()}`,
        name: cleanString(input.name) || 'Unnamed Pipeline',
        description: cleanString(input.description),
        steps: Array.isArray(input.steps)
            ? input.steps.map((step, i) => normalizeStep(step, i)).filter(Boolean).slice(0, 8)
            : [],
        source: cleanString(input.source) || 'custom',
    }
}

function normalizeStep(raw = {}, index = 0) {
    const step = raw && typeof raw === 'object' ? raw : {}
    const roleName = cleanString(step.roleName || step.agent_role)
    const roleId = cleanString(step.roleId || step.agent_role_id)
    if (!roleName && !roleId) return null
    return {
        stepId: cleanString(step.stepId) || `step_${index + 1}`,
        roleName,
        roleId,
        agent_role: roleName,
        agent_role_id: roleId,
        instruction: cleanString(step.instruction),
        injected_context: cleanString(step.injected_context),
        expected_output_format: cleanString(step.expected_output_format) || 'Concise, actionable output with file references.',
        injectPreviousOutput: step.injectPreviousOutput !== false,
    }
}

/* ------------------------------------------------------------------ */
/*  Built-in pipelines                                                 */
/* ------------------------------------------------------------------ */

export const BUILTIN_PIPELINES = [
    {
        id: 'review-fix-test',
        name: 'Review → Fix → Test',
        description: 'Multi-pass code quality: security/correctness review, apply fixes, then write tests for the changes.',
        source: 'addom/built-in',
        steps: [
            {
                stepId: 'review',
                roleName: 'Security Reviewer',
                instruction: 'Review the code for security vulnerabilities, correctness issues, and potential bugs. Provide a prioritized list of findings with file:line references and severity ratings. Focus on the most critical issues first.',
                injectPreviousOutput: false,
                expected_output_format: 'Numbered list of findings with severity (Critical/High/Medium/Low), file:line, and description.',
            },
            {
                stepId: 'fix',
                roleName: 'Refactoring Agent',
                instruction: 'Apply fixes for the issues found in the previous review. For each fix: explain what was changed and why. Prioritize Critical and High severity issues. If write_file is available, stage the fixes.',
                injectPreviousOutput: true,
                expected_output_format: 'List of fixes applied with before/after code and rationale.',
            },
            {
                stepId: 'test',
                roleName: 'Test Coverage Analyst',
                instruction: 'Write tests covering the fixes applied in the previous step. Focus on regression tests that verify the bugs are actually fixed. Include edge cases and negative tests.',
                injectPreviousOutput: true,
                expected_output_format: 'Test code with setup, assertions, and comments explaining what each test verifies.',
            },
        ],
    },
    {
        id: 'analyze-document',
        name: 'Analyze → Document',
        description: 'Deep code analysis followed by documentation generation based on the findings.',
        source: 'addom/built-in',
        steps: [
            {
                stepId: 'analyze',
                roleName: 'Architecture Reviewer',
                instruction: 'Analyze the code architecture: module structure, dependency patterns, coupling, cohesion, and design patterns used. Identify strengths and areas for improvement.',
                injectPreviousOutput: false,
                expected_output_format: 'Architecture analysis with module map, dependency diagram, and improvement recommendations.',
            },
            {
                stepId: 'document',
                roleName: 'Documentation Writer',
                instruction: 'Based on the architecture analysis from the previous step, generate updated documentation: README sections, module descriptions, and API reference for the key interfaces identified.',
                injectPreviousOutput: true,
                expected_output_format: 'Markdown documentation with sections for overview, architecture, modules, and API reference.',
            },
        ],
    },
    {
        id: 'debug-fix',
        name: 'Debug → Fix',
        description: 'Systematic debugging to identify root cause, followed by targeted fix implementation.',
        source: 'addom/built-in',
        steps: [
            {
                stepId: 'debug',
                roleName: 'Systematic Debugger',
                instruction: 'Investigate the reported issue using the 5-phase debugging protocol: reproduce, isolate, hypothesize, verify, and recommend. Identify the exact root cause with file:line reference.',
                injectPreviousOutput: false,
                expected_output_format: 'Root cause analysis with exact file:line, hypothesis ranking, and recommended fix.',
            },
            {
                stepId: 'fix',
                roleName: 'Refactoring Agent',
                instruction: 'Implement the fix recommended by the debugger in the previous step. Apply the changes using write_file if available. Explain the fix and verify it addresses the root cause.',
                injectPreviousOutput: true,
                expected_output_format: 'Fix implementation with before/after code, explanation, and verification notes.',
            },
        ],
    },
    {
        id: 'comprehensive-code-review',
        name: 'Comprehensive Code Review',
        description: 'Three-pass code review covering structural quality, security, and performance. Each pass builds on previous findings to avoid duplicates.',
        source: 'addom/built-in',
        steps: [
            {
                stepId: 'structural',
                roleName: 'Architecture Reviewer',
                instruction: 'Perform a structural code review focused on: architecture patterns, code organization, naming conventions, coupling/cohesion, SOLID principles, and DRY violations. Use your tools to read the codebase first. Provide a prioritized list of findings with file:line references and severity ratings (Critical/High/Medium/Low).',
                injectPreviousOutput: false,
                expected_output_format: 'Numbered findings list with: severity, file:line, category (architecture/naming/coupling/DRY), description, and suggested fix.',
            },
            {
                stepId: 'security',
                roleName: 'Security Reviewer',
                instruction: 'Perform a security-focused code review covering OWASP Top 10, input validation, auth flows, data exposure, dependency vulnerabilities, and injection points. The structural review below has already been completed — focus only on SECURITY issues and avoid duplicating structural findings.\n\nUse your tools to read the actual source code before producing findings.',
                injectPreviousOutput: true,
                expected_output_format: 'Numbered security findings with: severity, file:line, OWASP category, description, and remediation steps.',
            },
            {
                stepId: 'performance',
                roleName: 'Refactoring Agent',
                instruction: 'Perform a performance-focused code review covering: algorithmic complexity, memory usage, unnecessary re-renders (if UI), N+1 queries, I/O bottlenecks, bundle size, and caching opportunities. Structural and security reviews have already been completed — focus only on PERFORMANCE issues and avoid duplicating previous findings.\n\nUse your tools to read the actual source code before producing findings.',
                injectPreviousOutput: true,
                expected_output_format: 'Numbered performance findings with: severity, file:line, category (complexity/memory/IO/rendering), description, and optimization suggestion.',
            },
        ],
    },
]

/**
 * List all available pipeline definitions (built-in + custom from settings).
 *
 * @param {{ customPipelines?: Array }} options
 * @returns {Array<object>}
 */
export function listPipelines({ customPipelines = [] } = {}) {
    const byId = new Map()
    for (const pipe of BUILTIN_PIPELINES) {
        byId.set(pipe.id, normalizePipeline(pipe))
    }
    if (Array.isArray(customPipelines)) {
        for (const pipe of customPipelines) {
            const normalized = normalizePipeline(pipe)
            if (normalized.steps.length > 0) {
                byId.set(normalized.id, normalized)
            }
        }
    }
    return Array.from(byId.values())
}

/**
 * Get a pipeline by ID.
 *
 * @param {string} pipelineId
 * @param {{ customPipelines?: Array }} options
 * @returns {object|null}
 */
export function getPipelineById(pipelineId, options = {}) {
    const id = cleanString(pipelineId).toLowerCase()
    if (!id) return null
    return listPipelines(options).find((p) => p.id.toLowerCase() === id) || null
}

