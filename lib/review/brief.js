/**
 * Draft review brief.
 *
 * The brief is the model-facing review prompt. It names the object hash, the
 * artifact paths and hashes, the two review axes, the report contract and the
 * related main specs. It carries paths instead of artifact bodies so the
 * reviewer reads the files itself.
 *
 * @module dsh-openspec-flow/review/brief
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { renderRequirementLengthSection } from './length.js'

/** Draft review axes and their minimum checks. */
const AXES = [
  ['Coherence', 'proposal, delta specs, design and tasks agree with each other; every delta requirement has a task; no dangling reference, placeholder or contradictory requirement.'],
  ['Intent fit', "the user's goal and acceptance conditions appear in the proposal; out-of-scope work is stated; no unstated assumption; the success criteria are verifiable."],
  ['Spec conflict', 'ADDED does not duplicate or contradict a main requirement; MODIFIED keeps the intent of untouched requirements; REMOVED does not break another requirement; RENAMED updates every reference.'],
  ['Standards', 'the delta structure, Requirement/Scenario/WHEN-THEN form, repository AGENTS.md and documentation rules are respected.'],
  ['Feasibility', 'tasks can be verified one at a time, their order and dependencies are sound, and no decision is left to implementation.'],
  ['Scope and risk', 'the change does not add unnecessary capability; migration, compatibility and rollback are stated; the Impact list covers the changed surface.'],
]

/**
 * Main spec paths related to the delta capabilities.
 * @param projectRoot - project root.
 * @param files - draft artifact files.
 * @returns relative main spec paths that exist.
 */
function relatedSpecs(projectRoot, files) {
  const out = []
  for (const file of files) {
    if (!file.path.startsWith('specs/')) continue
    const capability = file.path.slice('specs/'.length).split('/')[0]
    const candidate = `openspec/specs/${capability}/spec.md`
    if (existsSync(join(projectRoot, candidate))) out.push(candidate)
  }
  return [...new Set(out)].sort()
}

/**
 * Build the apply review brief.
 *
 * The object is a committed tree, so the brief names the commit, the tree, the
 * base tree and the generated diff. The axes are conformance, spec conflict,
 * quality and archive readiness.
 * @param options - change, commit, tree, base, diff path, changed files and the
 *   host validation report.
 * @returns Markdown text.
 */
export function buildApplyBrief(options) {
  const issueCount = options.validation === undefined
    ? 0
    : options.validation.issues.filter((issue) => issue.level !== 'INFO').length
  const baseSourceLine = options.baseSource === 'seal'
    ? 'The base is the seal commit recorded by the first `openspec_apply_next`.'
    : options.baseSource === 'explicit'
      ? 'The base is the explicit base passed to this round.'
      : 'The base is `git merge-base HEAD origin/main`; no seal commit was recorded for this change.'
  return [
    '# Apply review brief',
    '',
    'You are reviewing the committed implementation before archive. Read the diff and the change artifacts. The commit and tree below bind the version you are reviewing; a dirty working tree is not reviewable.',
    '',
    `- change: ${options.change}`,
    `- commit: ${options.commitSha}`,
    `- tree: ${options.treeSha}`,
    `- base: ${options.baseCommit}`,
    `- base tree: ${options.baseTreeSha}`,
    `- diff: ${options.diffPath}`,
    ...(options.intentPath === undefined
      ? []
      : [`- intent: ${options.intentPath}`, `- intent hash: ${options.intentHash}`]),
    ...(options.validation === undefined
      ? ['- validation: not recorded']
      : [`- validation: host ${options.validation.strict === true ? 'strict' : 'non-strict'} pass (${String(issueCount)} issue${issueCount === 1 ? '' : 's'})`]),
    '',
    '## Base and diff',
    '',
    `- ${baseSourceLine}`,
    '- The diff starts at the base tree and covers only what differs between the base tree and the committed current tree; content committed before the base is not part of the diff.',
    '- The whole committed tree (the tree named in the brief) is the review object; the diff is a view of what changed, not the review scope.',
    '- An empty diff means the committed tree equals the base tree, not that the change needs no implementation.',
    '- Check every task and delta requirement against the tree and report what is missing.',
    '',
    '## Changed paths',
    '',
    ...(options.changedPaths.length === 0 ? ['- (none)'] : options.changedPaths.map((path) => `- ${path}`)),
    '',
    ...(options.planDrift === undefined
      ? []
      : [
          '## Plan changes since the draft',
          '',
          `The draft review passed on ${options.planDrift.draftObjectHash}.`,
          ...(options.planDrift.files.length === 0
            ? ['- (no per-file list was recorded for this draft)']
            : options.planDrift.files.map((file) => `- ${file.status}: ${file.path}`)),
          '',
        ]),
    ...(options.planWaiver === undefined
      ? []
      : [
          '## Plan change waiver',
          '',
          `- approved by: ${options.planWaiver.approvedBy}`,
          `- recorded at: ${options.planWaiver.recordedAt}`,
          `- text: ${options.planWaiver.text}`,
          `- files: ${options.planWaiver.files.join(', ')}`,
          '',
        ]),
    '## Axes',
    '',
    '- **Conformance**: every delta requirement and scenario has an implementation and a test; tasks are truly complete; design decisions are realized; deviations are recorded.',
    '- **Spec conflict**: every untouched main requirement still holds; no undeclared behavior was added; archive cannot create a contradiction.',
    '- **Quality**: error paths, boundaries, concurrency and cleanup; tests fail on the expected regression; documentation is updated; no scope creep.',
    '- **Archive readiness**: every task is complete; the host validated the committed change with strict validation; no TODO or debug residue remains; delta specs can merge cleanly.',
    '- **Plan coherence**: the changed artifacts agree with each other, with the untouched artifacts and with the intent.',
    '- **Intent fit**: the changed plan still covers the user goal and acceptance conditions; no unstated scope change.',
    '- **Scope control**: no requirement was weakened or removed to match the implementation.',
    '',
    '## Rules',
    '',
    '- The apply object is the committed git tree. Do not treat uncommitted worktree bytes as the object.',
    '- The host validated the committed change with strict validation at round start; do not run validation yourself.',
    '- Review the diff and the whole committed tree; see `## Base and diff` for the scope. Review any plan change in the diff on the plan axes and report a requirement that was weakened or removed.',
    '- Every finding needs a location, a problem, evidence and a suggestion. A critical or major finding also needs impact, the violated rule or spec text, and a concrete failure path.',
    '- Report only a problem introduced or made worse by this implementation. Do not invent requirements.',
    '- If the diff cannot be read or the scope cannot be determined, return `blocked`.',
    '',
    '## Report',
    '',
    'Write one JSON object with `verdict`, `summary`, `findings`, `verifications`, `outOfScope` and `residualRisks`. Use the same finding fields as draft review; `location` is a repository-relative path and line.',

    'After you submit, write no review summary and do not restate findings, evidence, risks, scope or disposition notes; the plugin card reports the round. Write one short note only for information the report cannot express and the user must know.',
    '',
    'A `pass` verdict cannot introduce a critical or major finding. `changes-requested` needs at least one open critical or major finding. `blocked` means the review could not be performed.',
    '',
  ].join('\n')
}

/**
 * Build the draft review brief.
 * @param options - change, object hash, artifact files, intent hash, roots and
 *   the requirement-length report.
 * @returns Markdown text.
 */
export function buildDraftBrief(options) {
  const lines = [
    '# Draft review brief',
    '',
    'You are reviewing a change before implementation starts. Review this planning material adversarially. Do not assume the proposal is correct. Read the artifacts yourself; the hashes below bind the version you are reviewing.',
    '',
    `- change: ${options.change}`,
    `- object: change artifacts plus intent`,
    `- object hash: ${options.objectHash}`,
    `- intent hash: ${options.intentHash}`,
    '',
    '## Artifacts',
    '',
    '| path | sha256 |',
    '| --- | --- |',
    ...options.files.map((file) => `| ${file.path} | ${file.sha256} |`),
    '',
  ]
  const specs = relatedSpecs(options.projectRoot, options.files)
  if (specs.length > 0) {
    lines.push('## Related main specs', '', ...specs.map((path) => `- ${path}`), '')
  }
  const lengthSection = renderRequirementLengthSection(options.requirementLength)
  if (lengthSection !== '') lines.push(lengthSection.trimEnd(), '')
  lines.push(
    '## Axes',
    '',
    ...AXES.map(([name, check]) => `- **${name}**: ${check}`),
    '',
    '## Rules',
    '',
    '- The draft object is the change artifacts and the intent; it is not a commit or a git tree.',
    '- Review only the change artifacts. Main specs are reference material, not the object.',
    '- Report only a problem introduced or made worse by this change. Do not invent requirements.',
    '- Every finding needs a location, a problem, evidence and a suggestion. A critical or major finding also needs impact, the violated rule or spec text, and a concrete failure path.',
    '- A critical or major finding is a blocker. It must be fixed and verified in a later round, or waived by the user.',
    '- If the artifacts cannot be read or the scope cannot be determined, return `blocked` and state what is missing.',
    '',
    '## Report',
    '',
    'Write one JSON object with `verdict`, `summary`, `findings`, `verifications`, `outOfScope` and `residualRisks`.',

    'After you submit, write no review summary and do not restate findings, evidence, risks, scope or disposition notes; the plugin card reports the round. Write one short note only for information the report cannot express and the user must know.',
    '',
    '```json',
    '{',
    '  "verdict": "pass | changes-requested | blocked",',
    '  "summary": "one sentence",',
    '  "findings": [',
    '    {',
    '      "id": "R1-01",',
    '      "severity": "critical | major | minor | nit",',
    '      "axis": "intent | coherence | spec-conflict | standards | feasibility | quality",',
    '      "location": "relative path:line or artifact section",',
    '      "title": "short title",',
    '      "problem": "what is wrong",',
    '      "evidence": "quoted rule or artifact text and the concrete failure",',
    '      "impact": "who breaks and how badly",',
    '      "rule": "the violated rule or spec text",',
    '      "failure": "the concrete failure path",',
    '      "suggestion": "how to fix it"',
    '    }',
    '  ],',
    '  "verifications": [',
    '    { "id": "R1-01", "status": "verified-fixed | still-open | regressed", "evidence": "what you checked" }',
    '  ],',
    '  "outOfScope": [],',
    '  "residualRisks": []',
    '}',
    '```',
    '',
    'A `pass` verdict cannot introduce a critical or major finding. `changes-requested` needs at least one open critical or major finding. `blocked` means the review could not be performed.',
    '',
  )
  return lines.join('\n')
}
