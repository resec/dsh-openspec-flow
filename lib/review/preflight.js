/**
 * Draft execution preflight.
 *
 * The draft review checks the plan against the repository before apply starts:
 * every MODIFIED, REMOVED or RENAMED requirement anchor resolves in the main
 * spec, and every backticked test or script path in `tasks.md` is executable.
 * The module is pure: `lib/tools/review.js` reads the CLI projections and the
 * task file and supplies a path-existence function.
 *
 * @module dsh-openspec-flow/review/preflight
 */

import { renameMaps, requirementName, resolveRequirement } from './requirements.js'

/** Backticked repo-relative test and script paths. */
const PATH_PATTERN = /`((?:test|scripts)\/[A-Za-z0-9._@/-]+\.(?:mjs|js|json|sh|md|yml|yaml))`/gu

/** Creation, deletion, rename and move verbs, English and Chinese. */
const DECLARATION_PATTERN = /\b(?:add|create|write|introduce|new|delete|remove|rename|move|retire|drop|generate)\b|新增|添加|创建|写入|删除|移除|重命名|移动|生成/iu

/** A clause boundary in a task line. */
const CLAUSE_PATTERN = /[;；。]|\.(?=\s)/u

/**
 * Whether a matched path is safe to check.
 * @param path - repo-relative path.
 * @returns true when the path has no glob, placeholder or escaping segment.
 */
function usablePath(path) {
  if (path.startsWith('/') || path.includes('\\')) return false
  const segments = path.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  return !/[*?[\]{}<>$]/u.test(path)
}

/**
 * Read the task id at the start of a checkbox line.
 * @param line - tasks.md line.
 * @returns the task id, or undefined.
 */
function taskId(line) {
  const match = /^\s*-\s*\[[ xX]\]\s*(\S+)/u.exec(line)
  return match?.[1]
}

/**
 * Find the clause of a line that contains a path.
 * @param line - tasks.md line.
 * @param path - the path to locate.
 * @returns the containing clause, or the whole line.
 */
function clauseOf(line, path) {
  const clauses = line.split(CLAUSE_PATTERN)
  return clauses.find((clause) => clause.includes(path)) ?? line
}

/**
 * Classify the requirement anchors of one change.
 * @param deltas - CLI delta projections.
 * @param mainSpecs - spec id to requirement projections, or null for a missing main spec.
 * @returns anchor issues.
 */
function anchorIssues(deltas, mainSpecs) {
  const issues = []
  const specs = mainSpecs instanceof Map ? mainSpecs : new Map()
  const renames = renameMaps(deltas)
  for (const delta of Array.isArray(deltas) ? deltas : []) {
    const spec = typeof delta?.spec === 'string' ? delta.spec : ''
    const operation = typeof delta?.operation === 'string' ? delta.operation : ''
    if (spec === '' || (operation !== 'MODIFIED' && operation !== 'REMOVED' && operation !== 'RENAMED')) continue
    const path = `specs/${spec}/spec.md`
    const main = specs.get(spec)
    if (!Array.isArray(main)) {
      const names = operation === 'RENAMED'
        ? [delta.rename?.from]
        : (Array.isArray(delta.requirements) ? delta.requirements : []).map(requirementName)
      for (const name of names) {
        if (typeof name !== 'string' || name === '') continue
        issues.push({ kind: 'anchor', reason: 'missing-main-spec', spec, path, operation, requirement: name })
      }
      continue
    }
    if (operation === 'RENAMED') {
      const from = delta.rename?.from
      if (typeof from === 'string' && from !== '' && resolveRequirement(spec, from, specs, renames) === undefined) {
        issues.push({ kind: 'anchor', reason: 'missing-rename-source', spec, path, operation, requirement: from })
      }
      continue
    }
    for (const requirement of Array.isArray(delta.requirements) ? delta.requirements : []) {
      const name = requirementName(requirement)
      if (name === '') continue
      if (resolveRequirement(spec, name, specs, renames) === undefined) {
        issues.push({ kind: 'anchor', reason: 'missing-requirement', spec, path, operation, requirement: name })
      }
    }
  }
  return issues
}

/**
 * Classify the test and script paths named by tasks.md.
 * @param tasksText - tasks.md text.
 * @param pathExists - `(path) => boolean` against the project root.
 * @returns path issues.
 */
function pathIssues(tasksText, pathExists) {
  if (typeof tasksText !== 'string' || tasksText === '') return []
  const occurrences = new Map()
  const lines = tasksText.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.includes('`')) continue
    for (const match of line.matchAll(PATH_PATTERN)) {
      const path = match[1]
      if (!usablePath(path)) continue
      const declared = DECLARATION_PATTERN.test(clauseOf(line, path))
      const entry = occurrences.get(path) ?? {
        path,
        line: index + 1,
        ...(taskId(line) === undefined ? {} : { task: taskId(line) }),
        declared: false,
      }
      if (declared) entry.declared = true
      occurrences.set(path, entry)
    }
  }
  const issues = []
  for (const entry of occurrences.values()) {
    if (entry.declared) continue
    if (pathExists(entry.path) === true) continue
    issues.push({
      kind: 'path',
      reason: 'missing-path',
      path: entry.path,
      line: entry.line,
      ...(entry.task === undefined ? {} : { task: entry.task }),
    })
  }
  return issues
}

/**
 * Classify the draft execution preflight.
 * @param options - deltas, main specs, tasks text and a path-existence function.
 * @returns `{ blocking, issues }`.
 */
export function classifyExecutionPreflight({
  deltas = [],
  mainSpecs = new Map(),
  tasksText = '',
  pathExists = () => false,
} = {}) {
  const issues = [
    ...anchorIssues(deltas, mainSpecs),
    ...pathIssues(tasksText, pathExists),
  ]
  return { blocking: issues.length > 0, issues }
}

/**
 * Render one issue as a brief or refusal line.
 * @param issue - preflight issue.
 * @returns Markdown or text line.
 */
function issueLine(issue) {
  if (issue.kind === 'path') {
    const task = issue.task === undefined ? '' : `${issue.task}: `
    return `- ${task}\`${issue.path}\` at line ${String(issue.line)}: the file does not exist and the task does not declare creating, deleting, renaming or moving it`
  }
  if (issue.reason === 'missing-main-spec') {
    return `- ${issue.path}: ${String(issue.operation)} "${String(issue.requirement)}" anchors to a missing main spec`
  }
  if (issue.reason === 'missing-rename-source') {
    return `- ${issue.path}: RENAMED FROM "${String(issue.requirement)}" has no main-spec baseline`
  }
  return `- ${issue.path}: ${String(issue.operation)} "${String(issue.requirement)}" has no main-spec baseline`
}

/**
 * Render the draft brief section.
 * @param report - preflight report.
 * @param nextAction - the action that clears a blocking result.
 * @returns Markdown, or an empty string when there is nothing to report.
 */
export function renderExecutionPreflightSection(report, nextAction = 'openspec_review action=resume review=draft') {
  if (report === undefined || report === null) return ''
  const issues = Array.isArray(report.issues) ? report.issues : []
  if (issues.length === 0) return ''
  return `${[
    '## Execution preflight',
    '',
    'The host checked every MODIFIED, REMOVED and RENAMED requirement name against the current main spec, and every backticked `test/` or `scripts/` path in tasks.md against the project tree.',
    '',
    ...issues.map(issueLine),
    '',
    'A blocking entry keeps the draft review not ready.',
    '',
    `Fix the artifacts, then run ${nextAction}. If another unarchived change supplies a missing requirement, wait for that change to archive and then run ${nextAction}.`,
    '',
  ].join('\n')}\n`
}

/**
 * Build the error message for a blocking report.
 * @param report - preflight report.
 * @param change - change name.
 * @param label - review entry label.
 * @param nextAction - the action that clears a blocking result.
 * @returns the message, or undefined when the report does not block.
 */
export function executionGateMessage(report, change, label = 'draft review', nextAction = 'openspec_review action=resume review=draft') {
  if (report?.blocking !== true) return undefined
  return [
    `${label} refuses change '${change}' because the draft execution preflight failed:`,
    ...(Array.isArray(report.issues) ? report.issues : []).map(issueLine),
    '',
    `Fix the artifacts, then run ${nextAction}. If another unarchived change supplies a missing requirement, wait for that change to archive and then run ${nextAction}.`,
  ].join('\n')
}
