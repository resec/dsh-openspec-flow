/**
 * Requirement-description length preflight.
 *
 * The bundled CLI accepts a MODIFIED requirement with a description over 500
 * characters during change validation; the main spec rejects it only after
 * archive. This module classifies the delta against the current main spec so
 * the draft review can report the official handling before apply starts.
 *
 * It is pure: `lib/tools/review.js` reads the CLI's `show` projections and
 * passes the delta requirements and main-spec requirements here.
 *
 * @module dsh-openspec-flow/review/length
 */

import { renameMaps, requirementName, resolveRequirement } from './requirements.js'

/** The CLI's requirement-description limit. */
export const MAX_REQUIREMENT_DESCRIPTION = 500

/** The official handling for an overlong requirement. */
export const OFFICIAL_LENGTH_HANDLING = [
  'Do not compress, trim or rewrite existing text just to meet the limit.',
  'Keep one behavior per requirement; move examples and edge cases into scenarios, and split a multi-behavior requirement into separate requirements.',
  'For a MODIFIED requirement that grows, keep the existing behavior in the original requirement and add the new behavior as an ADDED requirement. Split an existing long requirement only in a user-requested dedicated change: keep its header and every scenario, reduce the description to one behavior without changing its meaning, and add each removed behavior as its own ADDED requirement with its own scenarios.',
]

/**
 * Read a requirement's description length.
 * @param requirement - CLI requirement projection.
 * @returns the length, or undefined when the projection has no text.
 */
function textLength(requirement) {
  return typeof requirement?.text === 'string' ? requirement.text.length : undefined
}

/**
 * Classify one delta requirement set against the main specs.
 * @param deltas - raw `show <change> --json` deltas.
 * @param mainSpecs - spec id to raw `show <spec> --json` requirement arrays.
 * @returns `{ limit, blocking, issues, legacy }`.
 */
export function classifyRequirementLength(deltas, mainSpecs) {
  const issues = []
  const legacy = []
  const renames = renameMaps(deltas)
  const specs = mainSpecs instanceof Map ? mainSpecs : new Map()
  for (const delta of Array.isArray(deltas) ? deltas : []) {
    const spec = typeof delta?.spec === 'string' ? delta.spec : ''
    const operation = typeof delta?.operation === 'string' ? delta.operation : ''
    if (spec === '' || (operation !== 'ADDED' && operation !== 'MODIFIED')) continue
    const path = `specs/${spec}/spec.md`
    for (const requirement of Array.isArray(delta.requirements) ? delta.requirements : []) {
      const name = requirementName(requirement)
      const length = textLength(requirement)
      if (name === '' || length === undefined) continue
      if (operation === 'ADDED') {
        if (length > MAX_REQUIREMENT_DESCRIPTION) {
          issues.push({ kind: 'added-overlong', spec, path, requirement: name, operation, length })
        }
        continue
      }
      const baseline = resolveRequirement(spec, name, specs, renames)
      const baselineLength = textLength(baseline)
      if (baselineLength === undefined) continue
      if (length > MAX_REQUIREMENT_DESCRIPTION && length > baselineLength) {
        issues.push({ kind: 'modified-growth', spec, path, requirement: name, operation, length, baseline: baselineLength })
      } else if (length > MAX_REQUIREMENT_DESCRIPTION) {
        legacy.push({ kind: 'legacy-overlong', spec, path, requirement: name, operation, length, baseline: baselineLength })
      }
    }
  }
  return { limit: MAX_REQUIREMENT_DESCRIPTION, blocking: issues.length > 0, issues, legacy }
}

/**
 * Render the official handling as bullet lines.
 * @returns Markdown lines.
 */
function handlingLines() {
  return OFFICIAL_LENGTH_HANDLING.map((line) => `- ${line}`)
}

/**
 * Render the draft brief section.
 * @param report - classification report.
 * @param nextAction - the action that clears a blocking result.
 * @returns Markdown, or an empty string when there is nothing to report.
 */
export function renderRequirementLengthSection(report, nextAction = 'openspec_review action=resume review=draft') {
  if (report === undefined || report === null) return ''
  const issues = Array.isArray(report.issues) ? report.issues : []
  const legacy = Array.isArray(report.legacy) ? report.legacy : []
  if (issues.length === 0 && legacy.length === 0) return ''
  const lines = [
    '## Requirement length',
    '',
    `The host checked each requirement description (the text between \`### Requirement:\` and its first scenario) against the ${String(report.limit)}-character limit.`,
    '',
    '| finding | path | requirement | operation | length | baseline |',
    '| --- | --- | --- | --- | --- | --- |',
    ...issues.map((issue) => `| blocking | ${issue.path} | ${issue.requirement} | ${issue.operation} | ${String(issue.length)} | ${issue.baseline === undefined ? 'n/a' : String(issue.baseline)} |`),
    ...legacy.map((entry) => `| legacy | ${entry.path} | ${entry.requirement} | ${entry.operation} | ${String(entry.length)} | ${String(entry.baseline)} |`),
    '',
    ...(issues.length > 0
      ? [
          'The blocking entries prevent apply until the artifacts change. The legacy entries are pre-existing and do not block this change.',
          '',
        ]
      : ['The legacy entries are pre-existing and do not block this change.', '']),
    ...(issues.length > 0
      ? [
          'Official handling:',
          '',
          ...handlingLines(),
          '',
          'Report a blocking length finding. Do not suggest compressing the text.',
          '',
          `Next: edit the artifacts, then ${nextAction}.`,
          '',
        ]
      : []),
  ]
  return `${lines.join('\n')}\n`
}

/**
 * Build the error message for a blocking report.
 * @param report - classification report.
 * @param change - change name.
 * @param label - review entry label.
 * @param nextAction - the action that clears a blocking result.
 * @returns the message, or undefined when the report does not block.
 */
export function lengthGateMessage(report, change, label = 'draft review', nextAction = 'openspec_review action=resume review=draft') {
  if (report?.blocking !== true) return undefined
  const details = (Array.isArray(report.issues) ? report.issues : [])
    .map((issue) => `- ${issue.path}: ${issue.operation} "${issue.requirement}" is ${String(issue.length)} characters (baseline ${issue.baseline === undefined ? 'n/a' : String(issue.baseline)})`)
    .join('\n')
  return [
    `${label} refuses change '${change}' because an archive merge would exceed the requirement description limit:`,
    details,
    '',
    'Official handling:',
    ...handlingLines(),
    '',
    `Next: edit the artifacts, then ${nextAction}.`,
  ].join('\n')
}
