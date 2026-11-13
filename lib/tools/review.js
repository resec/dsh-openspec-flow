/**
 * Draft review tool and the apply gate.
 *
 * The tool is deterministic: it reads change artifacts, writes briefs and
 * reports, validates the report shape and computes readiness. It never calls a
 * model and never edits implementation files.
 *
 * @module dsh-openspec-flow/tools/review
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { runOpenSpec, throwIfOnlyStatus, withStore } from '../openspec.js'
import { assertBuiltinSchema } from '../schema.js'
import { projectValidate } from '../state.js'
import { buildApplyBrief, buildDraftBrief } from '../review/brief.js'
import { draftObject } from '../review/object.js'
import {
  ensureApplyPolicy,
  ensurePolicy,
  policyApply,
  policyDraft,
  readPolicy,
} from '../review/policy.js'
import {
  gitCommit,
  gitDiff,
  gitMergeBase,
  gitStatus,
  gitTree,
  isGitRepository,
  readJson,
  readText,
  reviewDirectory,
  sha256,
  withReviewLock,
  writeJsonAtomic,
  writeTextAtomic,
} from '../review/store.js'
import {
  applyVerificationsTo,
  assertReport,
  disposeFinding,
  recordFinding,
  summarizeFindings,
} from '../review/report.js'
import { draftReadiness } from '../review/readiness.js'
import { optionalStore, renderJson, requireChange, sessionCwd } from './shared.js'

const REVIEW_FILE = 'review.json'
const APPLY_REVIEW_FILE = 'apply-review.json'
const INTENT_FILE = 'intent.md'

const REVIEW_ACTIONS = ['start', 'status', 'self-report', 'report', 'dispose', 'waive', 'extend', 'abandon']

const FINDING_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'open', 'fixed', 'verified', 'deferred', 'rejected', 'waived', 'blocking'],
  properties: {
    total: { type: 'number' },
    open: { type: 'number' },
    fixed: { type: 'number' },
    verified: { type: 'number' },
    deferred: { type: 'number' },
    rejected: { type: 'number' },
    waived: { type: 'number' },
    blocking: { type: 'number' },
  },
}

const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['change', 'review', 'state', 'ready', 'reasons'],
  properties: {
    change: { type: 'string' },
    review: { type: 'string', enum: ['draft', 'apply'] },
    state: { type: 'string', enum: ['not-started', 'in-review', 'passed', 'abandoned'] },
    mode: { type: 'string', enum: ['self'] },
    independent: { type: 'boolean' },
    reviewId: { type: 'string' },
    round: { type: 'number' },
    objectHash: { type: 'string' },
    commitSha: { type: 'string' },
    treeSha: { type: 'string' },
    baseTreeSha: { type: 'string' },
    currentObjectHash: { type: 'string' },
    brief: { type: 'string', description: 'The draft brief the changer should read before writing the report.' },
    report: { type: 'object', additionalProperties: true, description: 'The stored report for the requested round.' },
    findings: FINDING_SUMMARY_SCHEMA,
    ready: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
    nextAction: { type: 'string' },
  },
}

/**
 * Resolve the change, its root and its absolute change directory.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns `{ rootPath, changeRoot, status }`.
 */
async function loadChangeContext(ctx, settings, cwd, change, store, signal) {
  const { json } = await runOpenSpec(
    ctx,
    settings,
    cwd,
    withStore(['status', '--change', change, '--json'], store),
    signal,
  )
  throwIfOnlyStatus(json, ['changeName'])
  const rootPath = typeof json.root?.path === 'string' ? json.root.path : json.planningHome?.root
  if (typeof rootPath !== 'string' || rootPath === '') throw new Error('OpenSpec status returned no root path')
  if (typeof json.changeRoot !== 'string' || json.changeRoot === '') {
    throw new Error(`OpenSpec status returned no change root for '${change}'`)
  }
  assertBuiltinSchema(json.schemaName, rootPath, change)
  return { rootPath, changeRoot: json.changeRoot, status: json }
}

/**
 * Run the bundled validator for one change.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns nothing; throws with the findings when invalid.
 */
async function validateChange(ctx, settings, cwd, change, store, signal) {
  const { json } = await runOpenSpec(
    ctx,
    settings,
    cwd,
    withStore(['validate', change, '--json'], store),
    signal,
  )
  const report = projectValidate(json, change)
  if (!report.valid) {
    const details = report.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
    throw new Error(`draft review refuses an invalid change:\n${details}`)
  }
}

/**
 * Read the review record.
 * @param directory - review directory.
 * @returns the record, or undefined.
 */
function reviewFile(kind) {
  return kind === 'apply' ? APPLY_REVIEW_FILE : REVIEW_FILE
}

/**
 * Read one review record.
 * @param directory - review directory.
 * @param kind - `draft` or `apply`.
 * @returns the record, or undefined.
 */
function readReview(directory, kind = 'draft') {
  return readJson(join(directory, reviewFile(kind)))
}

/**
 * Save the review record.
 * @param directory - review directory.
 * @param record - record to write.
 * @returns nothing.
 */
function saveReview(directory, record, kind = 'draft') {
  record.updatedAt = new Date().toISOString()
  writeJsonAtomic(join(directory, reviewFile(kind)), record)
}

/**
 * Read the intent text.
 * @param directory - review directory.
 * @returns the text, or undefined.
 */
function readIntent(directory) {
  return readText(join(directory, INTENT_FILE))
}

/**
 * The latest round.
 * @param record - review record.
 * @returns the last round, or undefined.
 */
function latestRound(record) {
  return Array.isArray(record?.rounds) ? record.rounds.at(-1) : undefined
}

/**
 * Find one recorded finding.
 * @param record - review record.
 * @param id - finding id.
 * @returns the finding.
 */
function requireFinding(record, id) {
  const finding = (record.findings ?? []).find((candidate) => candidate.id === id)
  if (finding === undefined) throw new Error(`finding '${id}' is not recorded`)
  return finding
}

/**
 * Build the model-facing result for a review record.
 * @param record - review record or undefined.
 * @param currentObjectHash - current artifact hash.
 * @param extra - fields for this action.
 * @returns the output value.
 */
function projectReview(record, currentObjectHash, extra = {}) {
  const round = latestRound(record)
  const readiness = record === undefined
    ? { ready: false, reasons: ['the draft review has not started'], nextAction: 'openspec_review action=start' }
    : draftReadiness(record, currentObjectHash)
  return {
    change: record?.change ?? extra.change,
    review: record?.review ?? extra.review ?? 'draft',
    state: record?.state ?? 'not-started',
    mode: 'self',
    independent: false,
    ...(record?.id === undefined ? {} : { reviewId: record.id }),
    ...(round === undefined ? {} : { round: round.round }),
    ...(record?.objectHash === undefined ? {} : { objectHash: record.objectHash }),
    ...(currentObjectHash === undefined ? {} : { currentObjectHash }),
    ...(extra.brief === undefined ? {} : { brief: extra.brief }),
    ...(extra.report === undefined ? {} : { report: extra.report }),
    ...(record?.commitSha === undefined ? {} : { commitSha: record.commitSha }),
    ...(record?.treeSha === undefined ? {} : { treeSha: record.treeSha }),
    ...(record?.baseTreeSha === undefined ? {} : { baseTreeSha: record.baseTreeSha }),
    findings: summarizeFindings(record?.findings ?? []),
    ready: readiness.ready,
    reasons: readiness.reasons,
    nextAction: extra.nextAction ?? readiness.nextAction,
  }
}

/**
 * Require an intent string for a draft start.
 * @param args - tool arguments.
 * @returns the trimmed intent.
 */
function requireIntent(args) {
  const value = args?.intent
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('draft review start needs intent: the user goal and acceptance conditions')
  }
  return value.trim()
}

/**
 * Require a positive integer round when supplied.
 * @param args - tool arguments.
 * @returns the round, or undefined.
 */
function optionalRound(args) {
  const value = args?.round
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1) throw new Error('round must be a positive integer')
  return value
}

/**
 * Read the requested review kind.
 * @param args - tool arguments.
 * @returns `draft` or `apply`.
 */
function reviewKind(args) {
  const kind = args?.review ?? 'draft'
  if (kind !== 'draft' && kind !== 'apply') throw new Error('review must be draft or apply')
  return kind
}

/**
 * The directory prefix for one kind's round artifacts.
 * @param kind - review kind.
 * @returns `round` or `apply-round`.
 */
function roundPrefix(kind) {
  return kind === 'apply' ? 'apply-round' : 'round'
}

/**
 * Require a git tree for the current commit.
 * @param root - project root.
 * @returns the tree SHA.
 */
function requireGitTree(root) {
  if (!isGitRepository(root)) throw new Error('apply review is unavailable: this project has no git repository')
  const tree = gitTree(root, 'HEAD')
  if (tree === undefined) throw new Error('apply review needs a commit; HEAD could not be resolved')
  return tree
}

/**
 * Start or resume a draft review.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function startReview(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const review = args?.review ?? 'draft'
  if (review !== 'draft') throw new Error('only the draft review is available in this change')
  const store = optionalStore(args)
  const requestedRound = optionalRound(args)
  const intent = requireIntent(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  await validateChange(ctx, settings, cwd, change, store, signal)
  const locked = ensurePolicy({
    projectRoot: context.rootPath,
    change,
    store,
    settings,
    gitEnabled: isGitRepository(context.rootPath),
    lockedBy: 'first-review',
  })
  const policy = policyDraft(locked.policy)
  if (!policy.enabled) throw new Error('draft review is disabled for this change')
  if (policy.reviewers !== 0) {
    throw new Error('independent reviewers are not available in this change; set reviews.draft.reviewers to 0')
  }
  const object = draftObject(context.changeRoot, intent)

  return withReviewLock(locked.directory, 'start', () => {
    writeTextAtomic(join(locked.directory, INTENT_FILE), intent)
    let record = readReview(locked.directory)
    let round
    let brief
    if (record === undefined) {
      const id = `draft-${randomUUID()}`
      record = {
        schemaVersion: 1,
        id,
        change,
        store: store ?? null,
        review: 'draft',
        state: 'in-review',
        mode: 'self',
        independent: false,
        policyHash: sha256(JSON.stringify(locked.policy)),
        objectKind: 'change',
        objectHash: object.objectHash,
        artifactHash: object.artifactHash,
        artifactFiles: object.files,
        intent: { path: INTENT_FILE, sha256: object.intentHash },
        limits: { maxRounds: policy.maxRounds, waitMinutes: policy.waitMinutes },
        rounds: [],
        findings: [],
        createdAt: new Date().toISOString(),
      }
    } else if (record.state === 'abandoned') {
      throw new Error('the draft review was abandoned; start a new change or remove its review record')
    } else if (record.state === 'passed' && record.objectHash === object.objectHash) {
      return projectReview(record, object.objectHash, { brief: readText(join(locked.directory, latestRound(record).brief.path)) })
    }
    const last = latestRound(record)
    if (last !== undefined && last.report === undefined) {
      round = last.round
      last.objectHash = object.objectHash
      last.artifactHash = object.artifactHash
      last.artifactFiles = object.files
      last.startedAt = new Date().toISOString()
    } else {
      const max = record.limits?.maxRounds
      const next = (record.rounds?.length ?? 0) + 1
      if (Number.isInteger(max) && next > max) {
        throw new Error(`the draft review reached its ${String(max)}-round cap; extend it or ask the user`)
      }
      round = next
      record.rounds = Array.isArray(record.rounds) ? record.rounds : []
      record.rounds.push({
        round,
        objectHash: object.objectHash,
        artifactHash: object.artifactHash,
        artifactFiles: object.files,
        startedAt: new Date().toISOString(),
      })
    }
    record.objectHash = object.objectHash
    record.artifactHash = object.artifactHash
    record.artifactFiles = object.files
    record.intent = { path: INTENT_FILE, sha256: object.intentHash }
    if (requestedRound !== undefined && requestedRound !== round) {
      throw new Error(`the next draft review round is ${String(round)}, not ${String(requestedRound)}`)
    }
    record.state = 'in-review'
    const currentRound = record.rounds.find((entry) => entry.round === round)
    const briefText = buildDraftBrief({
      change,
      objectHash: object.objectHash,
      intentHash: object.intentHash,
      files: object.files,
      projectRoot: context.rootPath,
    })
    const briefPath = `round-${String(round)}/brief.md`
    const briefFile = join(locked.directory, briefPath)
    mkdirSync(join(locked.directory, `round-${String(round)}`), { recursive: true })
    writeTextAtomic(briefFile, briefText)
    currentRound.brief = {
      path: briefPath,
      sha256: sha256(briefText),
      bytes: Buffer.byteLength(briefText),
    }
    saveReview(locked.directory, record)
    return projectReview(record, object.objectHash, { brief: briefText, nextAction: 'openspec_review action=self-report' })
  })
}

/**
 * Start or resume an apply review.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function startApplyReview(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const store = optionalStore(args)
  const requestedRound = optionalRound(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  if (!isGitRepository(context.rootPath)) {
    throw new Error('apply review is unavailable: this project has no git repository')
  }
  const status = gitStatus(context.rootPath)
  if (status === undefined) throw new Error('apply review could not read the working tree status')
  if (status.trim() !== '') {
    throw new Error(`apply review needs a clean working tree; commit or stash these changes first:\n${status.trim()}`)
  }
  const commitSha = gitCommit(context.rootPath)
  if (commitSha === undefined) throw new Error('apply review needs a commit; HEAD could not be resolved')
  const treeSha = gitTree(context.rootPath, commitSha)
  if (treeSha === undefined) throw new Error('apply review could not resolve the commit tree')
  await validateChange(ctx, settings, cwd, change, store, signal)

  const locked = ensurePolicy({
    projectRoot: context.rootPath,
    change,
    store,
    settings,
    gitEnabled: true,
    lockedBy: 'first-review',
  })
  const policy = ensureApplyPolicy(locked.directory, locked.policy, settings)
  const apply = policyApply(policy)
  if (!apply.enabled) throw new Error('apply review is disabled for this change')
  if (apply.reviewers !== 0) {
    throw new Error('independent reviewers are not available in this change; set reviews.apply.reviewers to 0')
  }

  const draftRecord = readReview(locked.directory, 'draft')
  let intent
  if (policyDraft(policy).enabled) {
    if (draftRecord === undefined) throw new Error('apply review needs a completed draft review for this change')
    intent = readIntent(locked.directory)
    if (intent === undefined) throw new Error('the draft review intent file is missing')
    const draftArtifacts = draftObject(context.changeRoot, intent)
    if (draftArtifacts.objectHash !== draftRecord.objectHash) {
      throw new Error('the change artifacts differ from the reviewed draft; rerun draft review or correct the commit')
    }
  }
  const explicitBase = typeof args?.base === 'string' && args.base.trim() !== '' ? args.base.trim() : undefined
  const baseCommit = explicitBase
    ?? draftRecord?.applyBaseCommit
    ?? gitMergeBase(context.rootPath, 'HEAD', 'origin/main')
  if (baseCommit === undefined) {
    throw new Error('apply review could not determine a base commit; pass base=<commit>')
  }
  const baseTreeSha = gitTree(context.rootPath, baseCommit)
  if (baseTreeSha === undefined) throw new Error(`apply review could not resolve base '${baseCommit}'`)
  const diffText = gitDiff(context.rootPath, baseTreeSha, treeSha)
  if (diffText === undefined) throw new Error('apply review could not generate the tree diff')

  return withReviewLock(locked.directory, 'start-apply', () => {
    let record = readReview(locked.directory, 'apply')
    let round
    if (record === undefined) {
      record = {
        schemaVersion: 1,
        id: `apply-${randomUUID()}`,
        change,
        store: store ?? null,
        review: 'apply',
        state: 'in-review',
        mode: 'self',
        independent: false,
        policyHash: sha256(JSON.stringify(policy)),
        objectKind: 'tree',
        objectHash: treeSha,
        commitSha,
        treeSha,
        baseCommit,
        baseTreeSha,
        ...(intent === undefined ? {} : { intent: { path: INTENT_FILE, sha256: sha256(intent) } }),
        limits: { maxRounds: apply.maxRounds, waitMinutes: apply.waitMinutes },
        rounds: [],
        findings: [],
        createdAt: new Date().toISOString(),
      }
    } else if (record.state === 'abandoned') {
      throw new Error('the apply review was abandoned; start a new change or remove its review record')
    } else if (record.state === 'passed' && record.treeSha === treeSha) {
      return projectReview(record, treeSha, { review: 'apply' })
    }
    const last = latestRound(record)
    if (last !== undefined && last.report === undefined) {
      round = last.round
      last.objectHash = treeSha
      last.commitSha = commitSha
      last.treeSha = treeSha
      last.baseTreeSha = baseTreeSha
      last.startedAt = new Date().toISOString()
    } else {
      const max = record.limits?.maxRounds
      const next = (record.rounds?.length ?? 0) + 1
      if (Number.isInteger(max) && next > max) {
        throw new Error(`the apply review reached its ${String(max)}-round cap; extend it or ask the user`)
      }
      round = next
      record.rounds = Array.isArray(record.rounds) ? record.rounds : []
      record.rounds.push({
        round,
        objectHash: treeSha,
        commitSha,
        treeSha,
        baseTreeSha,
        startedAt: new Date().toISOString(),
      })
    }
    if (requestedRound !== undefined && requestedRound !== round) {
      throw new Error(`the next apply review round is ${String(round)}, not ${String(requestedRound)}`)
    }
    record.objectHash = treeSha
    record.commitSha = commitSha
    record.treeSha = treeSha
    record.baseCommit = baseCommit
    record.baseTreeSha = baseTreeSha
    record.state = 'in-review'
    const prefix = roundPrefix('apply')
    const roundDirectory = join(locked.directory, `${prefix}-${String(round)}`)
    mkdirSync(roundDirectory, { recursive: true })
    const diffPath = `${prefix}-${String(round)}/diff.patch`
    writeTextAtomic(join(locked.directory, diffPath), diffText)
    const changedPaths = diffText.split('\n')
      .filter((line) => line.startsWith('+++ b/'))
      .map((line) => line.slice('+++ b/'.length))
    const briefText = buildApplyBrief({
      change,
      commitSha,
      treeSha,
      baseTreeSha,
      diffPath,
      changedPaths,
    })
    const briefPath = `${prefix}-${String(round)}/brief.md`
    writeTextAtomic(join(locked.directory, briefPath), briefText)
    const currentRound = record.rounds.find((entry) => entry.round === round)
    currentRound.brief = {
      path: briefPath,
      sha256: sha256(briefText),
      bytes: Buffer.byteLength(briefText),
    }
    currentRound.diff = {
      path: diffPath,
      sha256: sha256(diffText),
      bytes: Buffer.byteLength(diffText),
    }
    saveReview(locked.directory, record, 'apply')
    return projectReview(record, treeSha, {
      review: 'apply',
      brief: briefText,
      nextAction: 'openspec_review action=self-report review=apply',
    })
  })
}

/**
 * Submit the self-review report.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function submitSelfReport(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const round = optionalRound(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const existing = readReview(directory, kind)
  if (existing === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  const policy = readPolicy(directory)
  const section = policy === undefined
    ? undefined
    : kind === 'apply' ? policyApply(policy) : policyDraft(policy)
  if (section === undefined || !section.enabled) throw new Error(`${kind} review is disabled for this change`)
  if (section.reviewers !== 0) throw new Error(`independent reviewers are not available for ${kind} review`)
  let currentHash
  if (kind === 'apply') {
    currentHash = requireGitTree(context.rootPath)
  } else {
    const intent = readIntent(directory)
    if (intent === undefined) throw new Error('the review intent file is missing')
    currentHash = draftObject(context.changeRoot, intent).objectHash
  }
  return withReviewLock(directory, `${kind}-self-report`, () => {
    const record = readReview(directory, kind)
    if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    if (record.state === 'abandoned') throw new Error(`the ${kind} review was abandoned`)
    const current = latestRound(record)
    if (current === undefined) throw new Error(`the ${kind} review has no round`)
    if (round !== undefined && round !== current.round) {
      throw new Error(`the current ${kind} round is ${String(current.round)}, not ${String(round)}`)
    }
    if (current.report !== undefined) throw new Error('this round already has a report')
    if (currentHash !== current.objectHash) {
      throw new Error(`the ${kind} object changed since this round started; start a new round`)
    }
    const report = args?.report
    assertReport(report, { round: current.round, findings: record.findings ?? [] })
    const findings = applyVerificationsTo(
      (record.findings ?? []).map((finding) => ({ ...finding })),
      report.verifications ?? [],
      current.round,
    )
    for (const finding of report.findings) findings.push(recordFinding(finding, current.round))
    record.findings = findings
    const prefix = roundPrefix(kind)
    const reportPath = `${prefix}-${String(current.round)}/report.json`
    const reportText = `${JSON.stringify(report, null, 2)}\n`
    writeTextAtomic(join(directory, reportPath), reportText)
    current.report = {
      path: reportPath,
      sha256: sha256(reportText),
      bytes: Buffer.byteLength(reportText),
      verdict: report.verdict,
      recordedAt: new Date().toISOString(),
    }
    current.verdict = report.verdict
    const readiness = draftReadiness(record, currentHash)
    record.state = readiness.ready ? 'passed' : 'in-review'
    saveReview(directory, record, kind)
    return projectReview(record, currentHash, { review: kind, nextAction: readiness.nextAction })
  })
}

/**
 * Read a review's current status.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function reviewStatus(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const record = readReview(directory, kind)
  if (kind === 'apply' && !isGitRepository(context.rootPath)) {
    throw new Error('apply review is unavailable: this project has no git repository')
  }
  if (record === undefined) {
    return projectReview(undefined, undefined, {
      change,
      review: kind,
      nextAction: `openspec_review action=start review=${kind}`,
    })
  }
  let currentObjectHash
  if (kind === 'apply') {
    currentObjectHash = gitTree(context.rootPath, 'HEAD')
  } else {
    const intent = readIntent(directory)
    if (intent !== undefined) currentObjectHash = draftObject(context.changeRoot, intent).objectHash
  }
  return projectReview(record, currentObjectHash, { change, review: kind })
}

/**
 * Read the stored report.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review with `report`.
 */
async function readReport(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const record = readReview(directory, kind)
  if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  const round = optionalRound(args) ?? latestRound(record)?.round
  const entry = (record.rounds ?? []).find((candidate) => candidate.round === round)
  if (entry?.report === undefined) throw new Error(`round ${String(round)} has no report`)
  const report = readJson(join(directory, entry.report.path))
  return projectReview(record, record.objectHash, { report, review: kind })
}

/**
 * Dispose or waive one finding.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param waived - whether the action is `waive`.
 * @returns the projected review.
 */
async function disposeReviewFinding(ctx, settings, cwd, args, signal, waived) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  return withReviewLock(directory, `${kind}-${waived ? 'waive' : 'dispose'}`, () => {
    const record = readReview(directory, kind)
    if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    const id = typeof args?.id === 'string' ? args.id.trim() : ''
    if (id === '') throw new Error('a finding id is required')
    const finding = requireFinding(record, id)
    const status = waived === true ? 'waived' : args?.status
    disposeFinding(finding, {
      status,
      note: args?.note,
      issue: args?.issue,
      waiver: args?.waiver,
      approvedBy: args?.approvedBy,
    })
    const intent = kind === 'apply' ? undefined : readIntent(directory)
    const currentHash = kind === 'apply'
      ? (gitTree(context.rootPath, 'HEAD') ?? record.objectHash)
      : (intent === undefined ? record.objectHash : draftObject(context.changeRoot, intent).objectHash)
    const readiness = draftReadiness(record, currentHash)
    record.state = readiness.ready ? 'passed' : 'in-review'
    saveReview(directory, record, kind)
    return projectReview(record, currentHash, { review: kind, nextAction: readiness.nextAction })
  })
}

/**
 * Extend limits with user approval.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function extendReview(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  return withReviewLock(directory, `${kind}-extend`, () => {
    const record = readReview(directory, kind)
    if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    if (args?.approvedBy !== 'user') throw new Error('extend needs approvedBy user')
    const reason = typeof args?.reason === 'string' ? args.reason.trim() : ''
    if (reason === '') throw new Error('extend needs a reason')
    const minutes = args?.minutes
    const maxRounds = args?.maxRounds
    if (minutes === undefined && maxRounds === undefined) throw new Error('extend needs minutes or maxRounds')
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 15)) {
      throw new Error('minutes must be an integer between 1 and 15')
    }
    if (maxRounds !== undefined && maxRounds !== 'unlimited'
      && (!Number.isInteger(maxRounds) || maxRounds < 1)) {
      throw new Error('maxRounds must be a positive integer or unlimited')
    }
    record.extensions = Array.isArray(record.extensions) ? record.extensions : []
    record.extensions.push({
      at: new Date().toISOString(),
      ...(minutes === undefined ? {} : { minutes }),
      ...(maxRounds === undefined ? {} : { maxRounds }),
      reason,
      approvedBy: 'user',
    })
    record.limits = typeof record.limits === 'object' && record.limits !== null ? record.limits : {}
    if (minutes !== undefined) record.limits.waitMinutes = (record.limits.waitMinutes ?? 15) + minutes
    if (maxRounds !== undefined) record.limits.maxRounds = maxRounds === 'unlimited' ? null : maxRounds
    saveReview(directory, record, kind)
    const intent = kind === 'apply' ? undefined : readIntent(directory)
    const currentHash = kind === 'apply'
      ? (gitTree(context.rootPath, 'HEAD') ?? record.objectHash)
      : (intent === undefined ? record.objectHash : draftObject(context.changeRoot, intent).objectHash)
    return projectReview(record, currentHash, { review: kind })
  })
}

/**
 * Abandon a review.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function abandonReview(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  return withReviewLock(directory, `${kind}-abandon`, () => {
    const record = readReview(directory, kind)
    if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    record.state = 'abandoned'
    record.abandonedAt = new Date().toISOString()
    record.abandonReason = typeof args?.reason === 'string' ? args.reason.trim() : null
    saveReview(directory, record, kind)
    return projectReview(record, record.objectHash, { review: kind, nextAction: 'openspec_review action=start' })
  })
}

/**
 * Refuse apply while an enabled draft review is not ready and record its base.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns nothing; throws when the gate refuses.
 */
export async function assertDraftReviewReady(ctx, settings, cwd, change, store, signal) {
  if (settings?.reviews?.draft?.enabled !== true) return
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const policy = readPolicy(directory)
  if (policy === undefined) return
  if (!policyDraft(policy).enabled) return
  const record = readReview(directory)
  if (record === undefined) {
    throw new Error('the draft review has not started; run openspec_review action=start review=draft')
  }
  const intent = readIntent(directory)
  if (intent === undefined) throw new Error('the review intent file is missing; start the draft review again')
  const object = draftObject(context.changeRoot, intent)
  const readiness = draftReadiness(record, object.objectHash)
  if (!readiness.ready) {
    throw new Error(
      `the draft review is not ready: ${readiness.reasons.join('; ')}. `
      + 'Run openspec_review action=status, dispose findings, or start the next round.',
    )
  }
  if (isGitRepository(context.rootPath) && record.applyBaseCommit === undefined) {
    const head = gitCommit(context.rootPath)
    if (head === undefined) throw new Error('the draft review is ready, but HEAD could not be resolved')
    record.applyBaseCommit = head
    saveReview(directory, record)
  }
}

/**
 * Refuse archive while an enabled apply review is not ready.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns nothing; throws when the gate refuses.
 */
export async function assertApplyReviewReady(ctx, settings, cwd, change, store, signal) {
  if (settings?.reviews?.apply?.enabled !== true) return
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  if (!isGitRepository(context.rootPath)) return
  const directory = reviewDirectory(context.rootPath, store, change)
  const policy = readPolicy(directory)
  if (policy === undefined || !policyApply(policy).enabled) return
  const record = readReview(directory, 'apply')
  if (record === undefined) {
    throw new Error('the apply review has not started; run openspec_review action=start review=apply')
  }
  const tree = gitTree(context.rootPath, 'HEAD')
  if (tree === undefined || tree !== record.treeSha) {
    throw new Error('the apply review tree no longer matches HEAD; rerun the apply review on the current commit')
  }
  const status = gitStatus(context.rootPath)
  if (status === undefined) throw new Error('the apply review could not read the working tree status')
  if (status.trim() !== '') {
    throw new Error(`the apply review needs a clean working tree before archive:\n${status.trim()}`)
  }
  const readiness = draftReadiness(record, tree)
  if (!readiness.ready) {
    throw new Error(
      `the apply review is not ready: ${readiness.reasons.join('; ')}. `
      + 'Run openspec_review action=status review=apply, dispose findings, or start the next round.',
    )
  }
}

/**
 * Register `openspec_review`.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @returns nothing.
 */
export function registerReviewTool(ctx, settings) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_review',
    description: 'Run the draft review for a change: start a round, read the brief, submit the self-review report, dispose findings, extend limits, or inspect readiness. It refuses apply while the review is not ready.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'change'],
      properties: {
        action: {
          type: 'string',
          enum: REVIEW_ACTIONS,
          description: 'Review step to perform: start, status, self-report, report, dispose, waive, extend or abandon.',
        },
        change: {
          type: 'string',
          description: 'Change name, exactly as the list action reports it.',
        },
        review: {
          type: 'string',
          enum: ['draft', 'apply'],
          description: 'Review kind: draft or apply.',
        },
        store: {
          type: 'string',
          description: 'Registered store id.',
        },
        intent: {
          type: 'string',
          description: 'The user goal and acceptance conditions for a draft start.',
        },
        round: {
          type: 'number',
          description: 'Round number when the action needs one.',
        },
        report: {
          type: 'object',
          additionalProperties: true,
          description: 'The report described in the draft brief.',
        },
        id: {
          type: 'string',
          description: 'Finding id for a disposition.',
        },
        status: {
          type: 'string',
          enum: ['fixed', 'deferred', 'rejected', 'waived'],
          description: 'Disposition for a finding.',
        },
        note: { type: 'string', description: 'Disposition note.' },
        issue: { type: 'string', description: 'Follow-up issue for a deferred finding.' },
        waiver: { type: 'string', description: 'The user waiver text.' },
        approvedBy: { type: 'string', enum: ['user'], description: 'The approver for a waiver or extension.' },
        minutes: { type: 'number', description: 'Minutes to add to the current wait limit.' },
        maxRounds: {
          oneOf: [
            { type: 'number' },
            { type: 'string', enum: ['unlimited'] },
          ],
          description: 'New round cap, or unlimited.',
        },
        reason: { type: 'string', description: 'Reason for an extension or abandon.' },
      },
    },
    output: {
      schema: REVIEW_OUTPUT_SCHEMA,
      render: renderJson,
    },
    async execute(args, exec) {
      const action = args?.action
      if (!REVIEW_ACTIONS.includes(action)) {
        throw new Error(`Unsupported review action '${String(action)}'; use ${REVIEW_ACTIONS.join(', ')}.`)
      }
      const cwd = await sessionCwd(ctx, exec)
      if (action === 'start') {
        return reviewKind(args) === 'apply'
          ? await startApplyReview(ctx, settings, cwd, args, exec.signal)
          : await startReview(ctx, settings, cwd, args, exec.signal)
      }
      if (action === 'status') return await reviewStatus(ctx, settings, cwd, args, exec.signal)
      if (action === 'self-report') return await submitSelfReport(ctx, settings, cwd, args, exec.signal)
      if (action === 'report') return await readReport(ctx, settings, cwd, args, exec.signal)
      if (action === 'dispose') return await disposeReviewFinding(ctx, settings, cwd, args, exec.signal, false)
      if (action === 'waive') return await disposeReviewFinding(ctx, settings, cwd, args, exec.signal, true)
      if (action === 'extend') return await extendReview(ctx, settings, cwd, args, exec.signal)
      return await abandonReview(ctx, settings, cwd, args, exec.signal)
    },
  }))
}
