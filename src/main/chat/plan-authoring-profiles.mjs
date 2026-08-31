import crypto from 'node:crypto'

const MAX_RECOMMENDATION_RATIONALE_LENGTH = 180
const MAX_ANSWERED_QUESTION_IDS = 5

function normalizeText(value = '', maxLength = 0) {
  const normalized = String(value || '').trim()
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized
}

function contentHash(value = '') {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')
}

const ADDOM_PROFILE_PROVENANCE = Object.freeze({
  kind: 'first_party_equivalent',
  license: 'MIT',
  redistribution: 'open_source',
  modifiedAt: '2026-08-11',
  sources: Object.freeze([
    Object.freeze({
      id: 'addom-create-implementation-plan',
      location: 'src/main/chat/plan-authoring-profiles.mjs',
      license: 'MIT',
      use: 'Bundled repository-grounding and verification structure.',
    }),
    Object.freeze({
      id: 'superpowers-writing-plans',
      location: 'superpowers/skills/writing-plans/SKILL.md',
      license: 'MIT',
      use: 'Design inspiration only; wording is original to ADDOM.',
    }),
  ]),
})

function freezeProfile(definition, provenance = ADDOM_PROFILE_PROVENANCE) {
  const instructions = normalizeText(definition.instructions)
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    version: definition.version,
    instructions,
    contentHash: contentHash(instructions),
    provenance,
  })
}

const HISTORICAL_PROVENANCE = Object.freeze({
  kind: 'first_party',
  license: 'MIT',
  redistribution: 'open_source',
  modifiedAt: '2026-08-11',
  sources: Object.freeze([]),
})

const HISTORICAL_PROFILES = Object.freeze([
  freezeProfile({
    id: 'implementation', label: 'Implementation plan', version: '1.0.0',
    instructions: `Create a repository-grounded implementation plan.
Inspect the relevant code and tests before proposing changes. Name the concrete files or ownership boundaries, describe ordered implementation steps, include focused verification, and call out meaningful risks. Keep the plan decisive and executable without writing code.`,
  }, HISTORICAL_PROVENANCE),
  freezeProfile({
    id: 'technical_design', label: 'Technical design', version: '1.0.0',
    instructions: `Create a technical design for the accepted direction.
Explain the proposed architecture, ownership boundaries, data or API contracts, alternatives, and tradeoffs. Use repository evidence where available. End with decisions and verification criteria; do not turn this into a code-change checklist unless implementation detail is necessary to explain a boundary.`,
  }, HISTORICAL_PROVENANCE),
  freezeProfile({
    id: 'investigation', label: 'Investigation plan', version: '1.0.0',
    instructions: `Create an investigation plan for the accepted direction.
State the unanswered questions, evidence to collect, safe research methods, decision criteria, and the expected conclusion. Separate observations from assumptions and avoid claiming an implementation decision before the evidence supports it.`,
  }, HISTORICAL_PROVENANCE),
  freezeProfile({
    id: 'deep_implementation', label: 'Deep implementation plan', version: '1.0.0',
    instructions: `Create a detailed repository-grounded implementation plan.
Include the implementation-plan essentials plus dependency ordering, migrations or data compatibility, rollout or recovery concerns, cross-boundary contracts, test layers, and explicit verification commands or observations. Use this depth only when the accepted scope genuinely needs coordinated change or elevated delivery risk.`,
  }, HISTORICAL_PROVENANCE),
])

const CURRENT_PROFILES = Object.freeze([
  freezeProfile({
    id: 'implementation', label: 'Implementation plan', version: '2.0.0',
    instructions: `Create a repository-grounded implementation plan for the accepted direction. The deliverable must be ready for another capable engineer to execute without rediscovering the architecture or guessing at product intent.

Begin by inspecting the repository evidence that controls the requested behavior: current implementation paths, data flow, ownership boundaries, nearby tests, persistence or IPC contracts, and relevant local instructions. Distinguish facts verified in code from assumptions. Resolve discoverable ambiguity from the repository; identify only decisions that genuinely require user or product input.

Write the plan in ordered phases that produce complete, reviewable outcomes. For every phase, name the concrete files, modules, or ownership boundaries likely to change and explain the intended behavior—not merely that a file will be edited. Describe how data and control move through the system, what obsolete path is replaced or removed, and how existing user data remains safe. Keep steps dependency-aware and small enough to verify, while avoiding artificial one-file or one-commit granularity.

Include contracts and edge cases that could otherwise cause implementation drift: validation, failure behavior, concurrency, cancellation, stale state, migrations, accessibility, localization, and privileged-process boundaries when applicable. Do not invent abstractions, compatibility layers, or configuration unless the accepted direction requires them.

End each phase with observable verification. Prefer focused regression tests first, then broader syntax, lint, build, integration, or live UI checks proportional to risk. State any residual risks and explicit non-goals. The final Markdown should be decisive, concise enough to review, and detailed enough to implement. Do not write production code in the plan.`,
  }),
  freezeProfile({
    id: 'technical_design', label: 'Technical design', version: '2.0.0',
    instructions: `Create a repository-grounded technical design for the accepted direction. The document must define a coherent production architecture rather than list prospective edits.

Inspect the current system before designing. Identify the components that own state, policy, persistence, transport, rendering, and user interaction. Explain the existing behavior and the specific pressure that requires a design change. Cite concrete modules or contracts so reviewers can validate the analysis.

Define the proposed boundaries and invariants. Describe the authoritative source of truth, lifecycle or state machine, data model, API or IPC shapes, validation rules, error semantics, security boundaries, and concurrency behavior. Show how callers and downstream consumers interact with the new design. When replacing an existing path, state what becomes obsolete and how durable data is migrated or preserved.

Evaluate the meaningful alternatives considered. For each, explain the tradeoff in correctness, complexity, operability, performance, and user experience. Record the chosen decision and why it best satisfies the accepted direction. Avoid generic architecture language that is not tied to repository evidence.

Cover operational and delivery concerns: versioning, compatibility, rollout or recovery, observability without violating local-first constraints, accessibility, localization, and failure isolation where relevant. Finish with acceptance criteria and a verification strategy that proves the design at unit, integration, and visible-behavior boundaries. Include a compact implementation sequence only when it clarifies dependencies; keep the center of gravity on decisions and contracts.`,
  }),
  freezeProfile({
    id: 'investigation', label: 'Investigation plan', version: '2.0.0',
    instructions: `Create an evidence-driven investigation plan for the accepted direction. Its purpose is to reach a reliable decision or root cause without prematurely committing to an implementation.

Start with the observed symptom, current evidence, and the precise questions still unanswered. Separate verified observations, plausible hypotheses, and unknowns. Inspect the repository paths, tests, persistence, runtime boundaries, and provider or platform contracts that can confirm or falsify each hypothesis.

Order the investigation from cheapest and safest evidence to more invasive diagnostics. For every step, state what will be inspected or measured, the expected signals, how those signals distinguish competing explanations, and the stop condition. Prefer deterministic reproductions, focused instrumentation, logs already in scope, and read-only checks. Do not suggest collecting remote telemetry or exposing local data unless the accepted direction explicitly authorizes it.

Define the decision table: what conclusion follows from each result, what evidence is sufficient, and when escalation or user input is required. Account for misleading caches, stale state, race conditions, environment differences, provider behavior, and false positives. If a temporary diagnostic change is necessary, constrain it, describe removal, and protect production behavior.

Finish with the expected investigation artifact, the criteria for declaring a root cause confirmed, and the verification needed before any later fix is accepted. Include likely remediation directions only as conditional follow-ups tied to evidence. Keep observations and inferences visibly distinct throughout.`,
  }),
  freezeProfile({
    id: 'deep_implementation', label: 'Deep implementation plan', version: '2.0.0',
    instructions: `Create a comprehensive repository-grounded implementation plan for the accepted direction. Use this depth for coordinated work spanning multiple ownership boundaries, durable state, migrations, elevated delivery risk, or a complex user-visible lifecycle.

Establish the current architecture and the target invariant first. Inspect the exact main-process, preload, renderer, shared-contract, persistence, and test paths involved. Trace the end-to-end control and data flow. Record verified constraints, user-data obligations, permission boundaries, and obsolete behavior that must be removed.

Break delivery into dependency-ordered phases with explicit entry and exit conditions. Within each phase, name concrete files or focused modules and describe the required behavior, contracts, state transitions, failure handling, cancellation, concurrency, and stale-update protections. Include schema or API evolution, one-time migration and idempotency, downgrade or recovery behavior, and packaged-runtime concerns where applicable. Avoid parallel authorities and compatibility shims unless a durable external contract requires them.

Cover the complete product surface: model/runtime policy, secure filesystem or process boundaries, renderer state, accessibility, keyboard and pointer interaction, localization, performance, and minimal UI chrome. Explain how intermediate states appear to the user and how the system recovers from interruption or restart.

Specify verification at every layer. Require focused failing regression tests before deterministic fixes, contract tests across boundaries, persistence/restart tests, broader syntax/lint/build checks, and live Electron validation for visible behavior. Include fixtures or scenarios for edge cases and migrations. State rollout sequencing, monitoring that respects ADDOM's local-first policy, rollback or recovery options, non-goals, and residual risks.

The final Markdown must be an authoritative execution handoff: decisive, internally consistent, traceable to repository evidence, and detailed enough that implementation does not reopen settled product decisions. Do not write production code in the plan.`,
  }),
])

const ALL_PROFILES = Object.freeze([...HISTORICAL_PROFILES, ...CURRENT_PROFILES])
const PROFILE_BY_VERSION = new Map(ALL_PROFILES.map((profile) => [`${profile.id}@${profile.version}`, profile]))
const CURRENT_PROFILE_BY_ID = new Map(CURRENT_PROFILES.map((profile) => [profile.id, profile]))

function profileMetadata(profile) {
  return Object.freeze({
    id: profile.id, label: profile.label, version: profile.version,
    contentHash: profile.contentHash, provenance: profile.provenance,
  })
}

function validateProfileIntegrity(profile) {
  if (!profile || contentHash(profile.instructions) !== profile.contentHash) {
    throw new Error('Bundled plan-authoring profile integrity check failed.')
  }
}

export function listPlanAuthoringProfiles() {
  return Object.freeze(CURRENT_PROFILES.map(profileMetadata))
}

export function getPlanAuthoringProfile(profileId = '', { version = '' } = {}) {
  const normalizedId = normalizeText(profileId, 80).toLowerCase()
  const normalizedVersion = normalizeText(version, 32)
  const profile = normalizedVersion
    ? PROFILE_BY_VERSION.get(`${normalizedId}@${normalizedVersion}`)
    : CURRENT_PROFILE_BY_ID.get(normalizedId)
  if (!profile) {
    const suffix = normalizedVersion ? ` at version ${normalizedVersion}` : ''
    throw new Error(`Unknown plan-authoring profile: ${normalizedId || 'missing'}${suffix}.`)
  }
  validateProfileIntegrity(profile)
  return profile
}

export function validateRecommendedPlanProfile(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const profile = normalizeText(source.recommendedPlanProfile || source.profile, 80).toLowerCase()
  const rationale = normalizeText(source.rationale, MAX_RECOMMENDATION_RATIONALE_LENGTH)
  if (!profile || !rationale || String(source.rationale || '').trim().length > MAX_RECOMMENDATION_RATIONALE_LENGTH) return null
  if (!CURRENT_PROFILE_BY_ID.has(profile)) return null
  return Object.freeze({ profile, rationale })
}

function normalizeDirection(direction = {}) {
  const source = direction && typeof direction === 'object' ? direction : {}
  return Object.freeze({
    revision: Math.max(0, Number(source.revision || 0) || 0),
    summary: normalizeText(source.summary),
    answeredQuestionIds: Object.freeze(
      [...new Set((Array.isArray(source.answeredQuestionIds) ? source.answeredQuestionIds : [])
        .map((value) => normalizeText(value, 128)).filter(Boolean))]
        .slice(0, MAX_ANSWERED_QUESTION_IDS),
    ),
  })
}

export function resolvePlanAuthoringProfile({
  selectedProfile = '', selectedVersion = '', recommendation = null, direction = {},
} = {}) {
  const profile = getPlanAuthoringProfile(selectedProfile, { version: selectedVersion })
  return Object.freeze({
    selectedProfile: profileMetadata(profile),
    instructions: profile.instructions,
    recommendation: validateRecommendedPlanProfile(recommendation),
    direction: normalizeDirection(direction),
  })
}

export async function planningSkillRead(_projectRoot = '', input = {}) {
  void _projectRoot
  const profile = getPlanAuthoringProfile(input?.profile_id || input?.profileId, {
    version: input?.version,
  })
  return { profile: profileMetadata(profile), instructions: profile.instructions }
}
