/**
 * Review briefs.
 *
 * The brief is the model-facing review prompt. It names the object hash, the
 * artifact paths and hashes, the review axes, the report contract and the
 * related main specs. It carries paths instead of artifact bodies so the
 * reviewer reads the files itself.
 *
 * @module dsh-openspec-flow/review/brief
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  AXES as REPORT_AXES,
  SEVERITIES,
  VERDICTS,
  VERIFICATION_STATUSES,
  findingIdPrefix,
} from './report.js'
import { renderRequirementLengthSection } from './length.js'
import { renderExecutionPreflightSection } from './preflight.js'
import { parseRoundToken } from './record.js'

/** Draft review axes and their minimum checks. */
const DRAFT_AXES = [
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
 * Require the round a brief describes.
 * @param round - current review round token.
 * @param builder - caller name used in the refusal.
 * @returns the round token.
 * @throws when the round is missing or unsupported.
 */
function requireRound(round, builder) {
  const parsed = parseRoundToken(round)
  if (parsed === undefined) {
    throw new Error(`${builder} requires a positive integer round or an E<n> token`)
  }
  return parsed.token
}

/**
 * Render the report contract both briefs carry.
 *
 * The contract owns the whole `## Report` block: the field list, the JSON
 * template, the enums, the finding-id rule, the verification rule, the
 * post-submit note and the verdict rule. A first round renders an empty
 * `verifications` array; a later round names a recorded finding that is
 * `open` or `fixed` as the example.
 *
 * @param options - current round, findings recorded before the round and the
 *   kind-specific location hint.
 * @returns Markdown text for the `## Report` block.
 */
export function renderReportContract(options) {
  const { round, priorFindings = [], locationHint } = options
  requireRound(round, 'renderReportContract')
  if (typeof locationHint !== 'string' || locationHint.trim() === '') {
    throw new Error('renderReportContract requires a location hint')
  }
  const prefix = findingIdPrefix(round)
  const example = `${prefix}-01`
  const eligible = priorFindings.find(
    (finding) => finding.status === 'open' || finding.status === 'fixed',
  )
  const verificationLines = priorFindings.length === 0
    ? [
        'This round starts with no recorded findings, so render `"verifications": []` and do not name a verification id.',
      ]
    : eligible === undefined
      ? [
          'No recorded finding is `open` or `fixed`, so render `"verifications": []`; a `verified-fixed` entry needs a finding the changer disposed `fixed`.',
        ]
      : [
          `Verifications name only findings recorded before this round: use an earlier id such as \`${eligible.id}\` (an \`open\` or \`fixed\` finding) and never a finding you report for the first time.`,
        ]
  const verificationExample = eligible === undefined
    ? '"verifications": [],'
    : `"verifications": [{ "id": "${eligible.id}", "status": "verified-fixed | still-open | regressed", "evidence": "what you checked" }],`
  return [
    '## Report',
    '',
    'Write one JSON object with `verdict`, `summary`, `findings`, `verifications`, `outOfScope` and `residualRisks`. A finding carries `id`, `severity`, `axis`, `location` (' + locationHint + '), `title`, `problem`, `evidence` and `suggestion`; `impact`, `rule` and `failure` are required only for `critical` and `major` findings.',
    '',
    `- \`verdict\`: ${VERDICTS.join(', ')}.`,
    `- \`severity\`: ${SEVERITIES.join(', ')}.`,
    `- \`axis\`: ${REPORT_AXES.join(', ')}. The brief's \`## Axes\` headings are review prompts, not report values; pick the closest enum value.`,
    `- a finding \`id\` must match \`${typeof round === 'string' ? prefix : 'R<round>'}-NN\`; for this round use \`${example}\`.`,
    `- a verification \`status\`: ${VERIFICATION_STATUSES.join(', ')}.`,
    '',
    ...verificationLines,
    '',
    '```json',
    '{',
    `  "verdict": "${VERDICTS.join(' | ')}",`,
    '  "summary": "one sentence",',
    '  "findings": [',
    '    {',
    `      "id": "${example}",`,
    `      "severity": "${SEVERITIES.join(' | ')}",`,
    `      "axis": "${REPORT_AXES.join(' | ')}",`,
    '      "location": "path/to/file:12",',
    '      "title": "short title",',
    '      "problem": "what is wrong",',
    '      "evidence": "quoted rule or artifact text and the concrete failure",',
    '      "impact": "critical/major only: who breaks and how badly",',
    '      "rule": "critical/major only: the violated rule or spec text",',
    '      "failure": "critical/major only: the concrete failure path",',
    '      "suggestion": "how to fix it"',
    '    }',
    '  ],',
    `  ${verificationExample}`,
    '  "outOfScope": [],',
    '  "residualRisks": []',
    '}',
    '```',
    '',
    'After you submit, write no review summary and do not restate findings, evidence, risks, scope or disposition notes; the plugin card reports the round. Write one short note only for information the report cannot express and the user must know.',
    '',
    'A `pass` verdict cannot introduce a critical or major finding. `changes-requested` needs at least one open critical or major finding. `blocked` means the review could not be performed.',
  ].join('\n')
}

/**
 * Build the apply review brief.
 *
 * The object is a committed tree, so the brief names the commit, the tree, the
 * base tree and the generated diff. The axes are conformance, spec conflict,
 * quality and archive readiness.
 * @param options - change, commit, tree, base, baseline, diff path, changed
 *   files, the host validation report, the current round and the recorded
 *   findings.
 * @returns Markdown text.
 */
export function buildApplyBrief(options) {
  const round = requireRound(options.round, 'buildApplyBrief')
  const baseline = options.baseline ?? 'draft'
  const issueCount = options.validation === undefined
    ? 0
    : options.validation.issues.filter((issue) => issue.level !== 'INFO').length
  const baseSourceLine = options.baseSource === 'seal'
    ? 'The base is the seal commit recorded by the first `openspec_apply_next`.'
    : options.baseSource === 'explicit'
      ? 'The base is the explicit base passed to this review.'
      : 'The base is `git merge-base HEAD origin/main`; no seal commit was recorded for this change.'
  return [
    '# Apply review brief',
    '',
    'You are reviewing the committed implementation before archive. Read the diff and the change artifacts. The commit and tree below bind the version you are reviewing; a dirty working tree is not reviewable.',
    ...(baseline === 'none'
      ? ['This review has no draft baseline: the committed change artifacts and the implementation are reviewed as one object.']
      : []),
    '',
    `- change: ${options.change}`,
    `- baseline: ${baseline}`,
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
    '- Another change\'s directory under `openspec/changes/` is outside this review even when it appears in the reviewed tree or workspace. A finding that requires it to change is refused. Record such a concern in `outOfScope`.',
    '- If the diff cannot be read or the scope cannot be determined, return `blocked`.',
    '',
    renderReportContract({
      round,
      priorFindings: options.findings ?? [],
      locationHint: 'repository-relative path and line',
    }),
    '',
  ].join('\n')
}

/**
 * Build the draft review brief.
 *
 * @param options - change, object hash, artifact files, intent hash, roots,
 *   the requirement-length report, the execution preflight report, the current
 *   round and the recorded findings.
 * @returns Markdown text.
 */
export function buildDraftBrief(options) {
  const round = requireRound(options.round, 'buildDraftBrief')
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
  const executionSection = renderExecutionPreflightSection(options.execution)
  if (executionSection !== '') lines.push(executionSection.trimEnd(), '')
  lines.push(
    '## Axes',
    '',
    ...DRAFT_AXES.map(([name, check]) => `- **${name}**: ${check}`),
    '',
    '## Rules',
    '',
    '- The draft object is the change artifacts and the intent; it is not a commit or a git tree.',
    '- Review only the change artifacts. Main specs are reference material, not the object.',
    '- Report only a problem introduced or made worse by this change. Do not invent requirements.',
    '- Another change\'s directory under `openspec/changes/` is outside this review even when it appears in the reviewed tree or workspace. A finding that requires it to change is refused. Record such a concern in `outOfScope`.',
    '- Every finding needs a location, a problem, evidence and a suggestion. A critical or major finding also needs impact, the violated rule or spec text, and a concrete failure path.',
    '- A critical or major finding is a blocker. It must be fixed and verified in a later round, or waived by the user.',
    '- If the artifacts cannot be read or the scope cannot be determined, return `blocked` and state what is missing.',
    '',
    renderReportContract({
      round,
      priorFindings: options.findings ?? [],
      locationHint: 'relative path:line or artifact section',
    }),
    '',
  )
  return lines.join('\n')
}
