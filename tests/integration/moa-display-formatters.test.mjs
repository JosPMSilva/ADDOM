import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMoaAgentReportMarkdown,
  formatMoaDelegationLabel,
  formatMoaDispatchLabel,
  formatMoaEstimateConfidenceLabel,
  formatMoaRoleLabel,
  parseMoaStructuredOutput,
  summarizeMoaRoleLabels,
} from '../../src/common/moa/moa-display-formatters.mjs'

test('formatMoaRoleLabel prefers role names and compacts generated role ids', () => {
  assert.equal(
    formatMoaRoleLabel({ role: 'API Security Reviewer', roleId: 'role_1773349342119_86b6a51f' }),
    'API Security Reviewer',
  )
  assert.equal(
    formatMoaRoleLabel({ roleId: 'role_1773349342119_86b6a51f' }),
    'Agent 86b6a51f',
  )
  assert.equal(
    formatMoaRoleLabel({ roleId: 'role_ui_reviewer' }),
    'UI Reviewer',
  )
})

test('summarizeMoaRoleLabels deduplicates and truncates long agent lists', () => {
  assert.equal(
    summarizeMoaRoleLabels([
      { role: 'API Security Reviewer' },
      { role: 'Architecture Reviewer' },
      { roleId: 'role_1773349342119_86b6a51f' },
      { role: 'API Security Reviewer' },
    ], { maxVisible: 2 }),
    'API Security Reviewer, Architecture Reviewer +1 more',
  )
})

test('MoA compact labels keep the stable suffix instead of the raw internal id', () => {
  assert.equal(
    formatMoaDelegationLabel('del_1773349438876_e07325e1'),
    '#e07325e1',
  )
  assert.equal(
    formatMoaDispatchLabel('del_1773349438876_e07325e1'),
    'Run #e07325e1',
  )
  assert.equal(
    formatMoaEstimateConfidenceLabel('token_only'),
    'Token-only estimate',
  )
})

test('parseMoaStructuredOutput returns object for valid JSON object payloads', () => {
  const parsed = parseMoaStructuredOutput('{"summary":"ok","findings":[]}')
  assert.deepEqual(parsed, {
    summary: 'ok',
    findings: [],
  })
})

test('parseMoaStructuredOutput salvages a complete trailing contract after provider commentary', () => {
  const parsed = parseMoaStructuredOutput(
    'Quick layout check, then the result.{"summary":"Security Reviewer is ALIVE.","findings":[]}',
  )
  assert.deepEqual(parsed, {
    summary: 'Security Reviewer is ALIVE.',
    findings: [],
  })
})

test('buildMoaAgentReportMarkdown converts findings contract JSON into readable markdown', () => {
  const markdown = buildMoaAgentReportMarkdown({
    rawOutput: JSON.stringify({
      summary: 'No critical issues found.',
      findings: [
        {
          severity: 'info',
          file: 'src/app.jsx',
          issue: 'Review scope was limited to a greeting flow.',
          evidence: 'The task only requested a repeated hello message.',
          suggestion: 'Hello\nHello\nHello',
        },
      ],
    }),
    outputContractType: 'findings',
  })

  assert.doesNotMatch(markdown, /## Summary/)
  assert.ok(markdown.startsWith('No critical issues found.'))
  assert.match(markdown, /No critical issues found\./)
  assert.match(markdown, /## Findings/)
  assert.match(markdown, /\*\*Info\*\*: Review scope was limited to a greeting flow\./)
  assert.match(markdown, /File: `src\/app\.jsx`/)
  assert.match(markdown, /```text/)
  assert.match(markdown, /Hello/)
})

test('buildMoaAgentReportMarkdown preserves plain text outputs', () => {
  const markdown = buildMoaAgentReportMarkdown({
    rawOutput: 'Inspected the file and found no issues.',
    outputContractType: 'findings',
  })

  assert.equal(markdown, 'Inspected the file and found no issues.')
})

test('buildMoaAgentReportMarkdown normalizes JSON mistakenly stored in reportMarkdown', () => {
  const markdown = buildMoaAgentReportMarkdown({
    reportMarkdown: JSON.stringify({
      summary: 'Consolidated schema.',
      findings: [
        {
          severity: 'info',
          file: 'schema.sql',
          issue: 'DDL was consolidated into one file.',
          suggestion: '```sql\nCREATE TABLE shops (id uuid primary key);\n```',
        },
      ],
    }),
    outputContractType: 'findings',
  })

  assert.doesNotMatch(markdown, /## Summary/)
  assert.ok(markdown.startsWith('Consolidated schema.'))
  assert.match(markdown, /Consolidated schema\./)
  assert.match(markdown, /## Findings/)
  assert.match(markdown, /DDL was consolidated into one file\./)
})

test('buildMoaAgentReportMarkdown salvages pretty-printed findings contracts that are not valid JSON', () => {
  const markdown = buildMoaAgentReportMarkdown({
    rawOutput: `{
  "summary": "Consolidated schema.",
  "findings": [
    {
      "severity": "info",
      "file": "schema.sql",
      "issue": "Unified PostgreSQL schema was proposed.",
      "evidence": "Schema content provided below.",
      "suggestion": "Save the following as schema.sql and run it.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";"
    }
  ]
}`,
    outputContractType: 'findings',
  })

  assert.doesNotMatch(markdown, /## Summary/)
  assert.ok(markdown.startsWith('Consolidated schema.'))
  assert.match(markdown, /Consolidated schema\./)
  assert.match(markdown, /## Findings/)
  assert.match(markdown, /Unified PostgreSQL schema was proposed\./)
  assert.match(markdown, /File: `schema\.sql`/)
  assert.match(markdown, /CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/)
})

test('buildMoaAgentReportMarkdown turns mixed provider prose plus JSON into a clean final message', () => {
  const markdown = buildMoaAgentReportMarkdown({
    rawOutput: 'Quick layout check, then the result.{"summary":"Security Reviewer is ALIVE.","findings":[]}',
    outputContractType: 'findings',
  })

  assert.equal(markdown, 'Security Reviewer is ALIVE.')
})
