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
 * Read a requirement's name.
 * @param requirement - CLI requirement projection.
 * @returns the name, or an empty string.
 */
function requirementName(requirement) {
  return typeof requirement?.name === 'string' ? requirement.name : ''
}

/**
 * Index one main-spec requirement list by exact name.
 * @param requirements - CLI requirement projections.
 * @returns name to requirement.
 */
function indexByName(requirements) {
  const byName = new Map()
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const name = requirementName(requirement)
    if (name !== '' && !byName.has(name)) byName.set(name, requirement)
  }
  return byName
}

/**
 * Build the `to -> from` rename map for each spec.
 * @param deltas - CLI delta projections.
 * @returns spec id to rename map.
 */
function renameMaps(deltas) {
  const maps = new Map()
  for (const delta of Array.isArray(deltas) ? deltas : []) {
    if (delta?.operation !== 'RENAMED' || delta.rename === undefined) continue
    const spec = typeof delta.spec === 'string' ? delta.spec : ''
    const from = typeof delta.rename.from === 'string' ? delta.rename.from : ''
    const to = typeof delta.rename.to === 'string' ? delta.rename.to : ''
    if (spec === '' || from === '' || to === '') continue
    const map = maps.get(spec) ?? new Map()
    map.set(to, from)
    maps.set(spec, map)
  }
  return maps
}

/**
 * Find the main-spec baseline for a MODIFIED requirement.
 * @param spec - capability id.
 * @param name - MODIFIED requirement name.
 * @param mainSpecs - spec id to requirement projections.
 * @param renames - spec id to `to -> from` map.
 * @returns the baseline requirement, or undefined.
 */
function findBaseline(spec, name, mainSpecs, renames) {
  const byName = indexByName(mainSpecs.get(spec))
  const rename = renames.get(spec) ?? new Map()
  const visited = new Set()
  let current = name
  while (current !== '' && !visited.has(current)) {
    const baseline = byName.get(current)
    if (baseline !== undefined) return baseline
    visited.add(current)
    current = rename.get(current) ?? ''
  }
  return undefined
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
      const baseline = findBaseline(spec, name, specs, renames)
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
