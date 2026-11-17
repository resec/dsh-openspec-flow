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
import { isAbsolute, join, relative, sep } from 'node:path'

import { runOpenSpec, throwIfOnlyStatus, withStore } from '../openspec.js'
import { assertBuiltinSchema } from '../schema.js'
import { projectValidate } from '../state.js'
import { buildApplyBrief, buildDraftBrief } from '../review/brief.js'
import { readRoundReport, writeCard } from '../review/cards.js'
import { diffArtifactFiles, draftObject } from '../review/object.js'
import {
  assertReviewerModelAvailable,
  modelResolver,
  reviewerAgentOptions,
} from '../review/model.js'
import {
  ensureApplyPolicy,
  ensurePolicy,
  ensureReviewerModel,
  policyApply,
  policyDraft,
  readPolicy,
} from '../review/policy.js'
import {
  gitCommit,
  gitCommitPaths,
  gitDiff,
  gitMergeBase,
  gitStatus,
  gitTree,
  isChangePath,
  isGitRepository,
  filterUnrelatedChangeStatus,
  readJson,
  readText,
  reviewDirectory,
  reviewKey,
  sha256,
  withReviewLock,
  writeJsonAtomic,
  writeTextAtomic,
} from '../review/store.js'
import {
  acquireApplyLocks,
  applyLockBlocker,
  applyLockBlockedError,
  gitWorktreeRoot,
  inspectApplyLocks,
  releaseApplyLocks,
} from '../review/apply-lock.js'
import { disposeFinding, summarizeFindings } from '../review/report.js'
import { draftReadiness } from '../review/readiness.js'
import { submitReport } from '../review/submit.js'
import { withReviewLockAsync } from '../review/store.js'
import { latestRound, readReview, roundPrefix, saveReview } from '../review/record.js'
import { clearDeadline, deadlineText, registerDeadline, sendWakeup, wakeTargets } from '../review/wakeup.js'
import { optionalStore, renderJson, requireChange, sessionCwd } from './shared.js'

const REVIEW_FILE = 'review.json'
const APPLY_REVIEW_FILE = 'apply-review.json'
const INTENT_FILE = 'intent.md'
const PLAN_CHANGE_WAIVER_FILE = 'plan-change-waiver.json'

const REVIEW_ACTIONS = ['start', 'resume', 'wait', 'status', 'self-report', 'report', 'dispose', 'waive', 'retry', 'replace', 'waive-reviewer', 'extend', 'abandon']

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
    mode: { type: 'string', enum: ['self', 'reviewer'] },
    independent: { type: 'boolean' },
    policy: { type: 'boolean', description: 'Whether the change policy carries an apply section.' },
    enabled: { type: 'boolean', description: 'Whether the change policy enables apply review.' },
    available: { type: 'boolean', description: 'Whether apply review can run in this project.' },
    coverageGap: { type: 'boolean' },
    reviewId: { type: 'string' },
    round: { type: 'number' },
    objectHash: { type: 'string' },
    commitSha: { type: 'string' },
    treeSha: { type: 'string' },
    baseTreeSha: { type: 'string' },
    currentObjectHash: { type: 'string' },
    brief: { type: 'string', description: 'The draft brief the changer should read before writing the report.' },
    report: { type: 'object', additionalProperties: true, description: 'The stored report for the requested round.' },
    planChangeWaiver: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'approvedBy', 'files', 'recordedAt'],
      properties: {
        text: { type: 'string' },
        approvedBy: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        recordedAt: { type: 'string' },
        draftObjectHash: { type: 'string' },
        currentObjectHash: { type: 'string' },
      },
    },
    findings: FINDING_SUMMARY_SCHEMA,
    dispositions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['fixed', 'deferred', 'rejected', 'waived'] },
        },
      },
    },
    ready: { type: 'boolean' },
    waitState: { type: 'string', enum: ['waiting', 'ready', 'overdue'] },
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
 * @param options - `strict` turns warnings into failures; `label` names the
 *   refusing entry in the error.
 * @returns the projected validation report.
 */
async function validateChange(ctx, settings, cwd, change, store, signal, options = {}) {
  const strict = options.strict === true
  const label = options.label ?? (strict ? 'apply review' : 'draft review')
  const flags = strict ? ['--strict'] : []
  const { json } = await runOpenSpec(
    ctx,
    settings,
    cwd,
    withStore(['validate', change, '--json', ...flags], store),
    signal,
  )
  const report = projectValidate(json, change)
  if (!report.valid) {
    const details = report.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
    const refusal = strict
      ? `${label} refuses change '${change}' that does not pass strict validation`
      : `${label} refuses an invalid change`
    throw new Error(`${refusal}:\n${details}`)
  }
  return { ...report, strict }
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
 * Read the recorded plan-change waiver.
 * @param directory - review directory.
 * @returns the waiver, or undefined.
 */
function readPlanChangeWaiver(directory) {
  return readJson(join(directory, PLAN_CHANGE_WAIVER_FILE))
}

/**
 * Write one review card for a recorded round.
 * @param options - context, directory, kind, record, round, phase, readiness,
 *   current hash and Session.
 * @returns true when the card was committed.
 */
function writeRoundCard(options) {
  const roundEntry = (options.record.rounds ?? []).find((entry) => entry.round === options.round)
  return writeCard({
    directory: options.directory,
    kind: options.kind,
    phase: options.phase,
    record: options.record,
    round: options.round,
    report: readRoundReport(options.directory, roundEntry),
    waiver: readPlanChangeWaiver(options.directory),
    readiness: options.readiness,
    currentHash: options.currentHash,
    session: options.session,
    logger: options.ctx?.logger,
  })
}

/**
 * Whether apply has started for this change.
 *
 * The first apply records an apply base commit on the draft record; an apply
 * review start records its own review record. Either fact freezes the draft.
 * @param directory - review directory.
 * @param record - draft review record.
 * @returns true when apply started.
 */
function applyStarted(directory, record) {
  return record?.applyBaseCommit !== undefined || readReview(directory, 'apply') !== undefined
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
    : draftReadiness(record, currentObjectHash, record.review, extra.readinessOptions ?? {})
  return {
    change: record?.change ?? extra.change,
    review: record?.review ?? extra.review ?? 'draft',
    state: record?.state ?? 'not-started',
    mode: record?.mode ?? 'self',
    independent: record?.independent === true,
    ...(extra.policy === undefined ? {} : { policy: extra.policy }),
    ...(extra.enabled === undefined ? {} : { enabled: extra.enabled }),
    ...(extra.available === undefined ? {} : { available: extra.available }),
    ...(record?.coverageGap === true ? { coverageGap: true } : {}),
    ...(record?.id === undefined ? {} : { reviewId: record.id }),
    ...(round === undefined ? {} : { round: round.round }),
    ...(record?.objectHash === undefined ? {} : { objectHash: record.objectHash }),
    ...(currentObjectHash === undefined ? {} : { currentObjectHash }),
    ...(extra.brief === undefined ? {} : { brief: extra.brief }),
    ...(extra.report === undefined ? {} : { report: extra.report }),
    ...(extra.planChangeWaiver === undefined ? {} : { planChangeWaiver: extra.planChangeWaiver }),
    ...(record?.commitSha === undefined ? {} : { commitSha: record.commitSha }),
    ...(record?.treeSha === undefined ? {} : { treeSha: record.treeSha }),
    ...(record?.baseTreeSha === undefined ? {} : { baseTreeSha: record.baseTreeSha }),
    findings: summarizeFindings(record?.findings ?? []),
    ...(extra.dispositions === undefined ? {} : { dispositions: extra.dispositions }),
    ready: readiness.ready,
    ...(extra.waitState === undefined ? {} : { waitState: extra.waitState }),
    reasons: extra.reasons ?? readiness.reasons,
    nextAction: extra.nextAction ?? readiness.nextAction,
  }
}

/**
 * Refuse a review whose record already exists.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns nothing; throws when a record exists.
 */
function assertNoReviewRecord(directory, kind) {
  if (readReview(directory, kind) === undefined) return
  throw new Error(`the ${kind} review already started; run openspec_review action=resume review=${kind} for later rounds`)
}

/**
 * Read the record of a review that already started.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns the record.
 */
function requireReviewRecord(directory, kind) {
  const record = readReview(directory, kind)
  if (record === undefined) {
    throw new Error(`the ${kind} review has not started; run openspec_review action=start review=${kind}`)
  }
  return record
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
 * Refuse a dispositions argument on start or resume.
 * @param args - tool arguments.
 * @param action - `start` or `resume`.
 * @returns nothing; throws when dispositions is present.
 */
function assertNoDispositions(args, action) {
  if (args?.dispositions === undefined) return
  if (action === 'start') {
    throw new Error('start does not accept dispositions; use openspec_review action=dispose after a report records findings')
  }
  throw new Error('resume does not accept dispositions; dispose findings with openspec_review action=dispose (or waive one with action=waive) before resuming')
}

/**
 * Qualify a next action with the review kind when the action is ambiguous.
 * @param kind - `draft` or `apply`.
 * @param nextAction - readiness next action.
 * @returns the kind-qualified action.
 */
function nextActionFor(kind, nextAction) {
  if (kind === 'apply' && nextAction === 'openspec_review action=dispose') {
    return 'openspec_review action=dispose review=apply'
  }
  return nextAction
}

/**
 * Build the next step for a not-ready gate.
 * @param record - review record.
 * @param kind - `draft` or `apply`.
 * @param readiness - readiness result.
 * @returns the next command.
 */
function gateAdvice(record, kind, readiness) {
  if (record.state === 'abandoned') return 'openspec_new_change'
  const latest = latestRound(record)
  if (latest === undefined || latest.report === undefined) {
    const action = record.mode === 'reviewer' ? 'wait' : 'self-report'
    return `openspec_review action=${action}${kind === 'apply' ? ' review=apply' : ''}`
  }
  return nextActionFor(kind, readiness.nextAction)
}

/**
 * Refuse a new round while a recorded finding is still open.
 * @param record - review record.
 * @param kind - `draft` or `apply`.
 * @returns nothing; throws when a finding is open.
 */
function assertNoOpenFindings(record, kind) {
  const open = (Array.isArray(record.findings) ? record.findings : [])
    .filter((finding) => finding.status === 'open')
  if (open.length === 0) return
  throw new Error(`resume needs every finding disposed; still open: ${open.map((finding) => finding.id).join(', ')}. Run ${nextActionFor(kind, 'openspec_review action=dispose')} first.`)
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

/** Reviewer preset id. */
export const REVIEWER_PRESET = 'openspec-reviewer'

/** Spawn provider used for reviewer activations. */
const REVIEWER_PROVIDER = 'spawn'

/**
 * Build the reviewer prompt.
 * @param change - change name.
 * @param kind - review kind.
 * @param slot - slot number.
 * @returns the prompt text.
 */
function reviewerPrompt(change, kind, slot) {
  return [
    'You are the independent read-only reviewer for this OpenSpec change.',
    '',
    `Call openspec_reviewer with action="read", target="brief", change="${change}", review="${kind}", slot=${String(slot)} to read the brief.`,
    `Read the artifacts and the workspace. Do not edit files, do not delegate, and do not run commands that write the worktree.`,
    `When finished, call openspec_reviewer with action="submit", change="${change}", review="${kind}", slot=${String(slot)} and one report object.`,
    'If the review cannot be performed, submit verdict "blocked" and state what is missing.',
  ].join('\n')
}

/**
 * Start one reviewer activation.
 * @param ctx - host context.
 * @param parent - the changer agent.
 * @param cwd - project root.
 * @param change - change name.
 * @param kind - review kind.
 * @param slot - slot number.
 * @param signal - cancellation.
 * @param reviewerModel - the policy's locked model record.
 * @returns the child session id.
 */
async function startReviewerActivation(ctx, parent, cwd, change, kind, slot, signal, reviewerModel) {
  const subagents = ctx.get?.('subagents') ?? ctx.subagents
  if (subagents === undefined || typeof subagents.startActivation !== 'function') {
    throw new Error('the reviewer service is unavailable')
  }
  if (parent === undefined || parent === null) throw new Error('the reviewer needs the changer agent')
  const provider = typeof subagents.getProvider === 'function'
    ? subagents.getProvider(REVIEWER_PROVIDER)
    : undefined
  if (provider !== undefined && provider?.capabilities?.agentPreset !== true) {
    throw new Error(`provider '${REVIEWER_PROVIDER}' does not support an independent reviewer preset`)
  }
  if (provider !== undefined && provider?.capabilities?.agentOptions !== true) {
    throw new Error(`provider '${REVIEWER_PROVIDER}' does not support a reviewer model`)
  }
  const agentOptions = reviewerAgentOptions(reviewerModel)
  const llm = ctx.get?.('llm') ?? ctx.llm
  await assertReviewerModelAvailable(llm, agentOptions)
  const activation = await subagents.startActivation({
    provider: REVIEWER_PROVIDER,
    label: `openspec-review:${kind}:${change}:s${String(slot)}`,
    delivery: 'caller',
    parent,
    cwd,
    prompt: [{ type: 'text', text: reviewerPrompt(change, kind, slot) }],
    agentPreset: REVIEWER_PRESET,
    agentOptions,
    signal,
  })
  const childId = activation?.childId
  if (typeof childId !== 'string' || childId === '') throw new Error('the reviewer activation returned no child id')
  return childId
}

/**
 * Wake the recorded reviewer for a new review round.
 * @param ctx - host context.
 * @param parent - the changer agent.
 * @param change - change name.
 * @param kind - review kind.
 * @param round - new round number.
 * @param agentId - recorded reviewer child id.
 * @param signal - cancellation.
 * @returns nothing.
 */
async function messageReviewer(ctx, parent, change, kind, round, agentId, signal) {
  const subagents = ctx.get?.('subagents') ?? ctx.subagents
  if (subagents === undefined || typeof subagents.sendMessage !== 'function') {
    throw new Error('the reviewer service is unavailable')
  }
  if (parent === undefined || parent === null) throw new Error('the reviewer needs the changer agent')
  await subagents.sendMessage(parent, agentId, [{
    type: 'text',
    text: `A new ${kind} review round ${String(round)} is ready for change ${change}. Call openspec_reviewer with action="read", target="brief", change="${change}", review="${kind}" and submit your report.`,
  }], { signal })
}

/**
 * Start the first round of a draft review.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - the changer agent.
 * @returns the projected review.
 */
async function startReview(ctx, settings, cwd, args, signal, parent) {
  return draftReviewEntry(ctx, settings, cwd, args, signal, parent, 'start')
}

/**
 * Resume a recorded draft review.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - the changer agent.
 * @returns the projected review.
 */
async function resumeDraftReview(ctx, settings, cwd, args, signal, parent) {
  return draftReviewEntry(ctx, settings, cwd, args, signal, parent, 'resume')
}

/**
 * Enter a draft review: create the record or advance the recorded one.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - the changer agent.
 * @param mode - `start` for the first round, `resume` for a later one.
 * @returns the projected review.
 */
async function draftReviewEntry(ctx, settings, cwd, args, signal, parent, mode) {
  const first = mode === 'start'
  assertNoDispositions(args, first ? 'start' : 'resume')
  const change = requireChange(args)
  const review = args?.review ?? 'draft'
  if (review !== 'draft') throw new Error('only the draft review is available in this change')
  const store = optionalStore(args)
  const requestedRound = optionalRound(args)
  if (!first && typeof args?.intent === 'string' && args.intent.trim() !== '') {
    throw new Error('resume takes no intent; pass the user goal and acceptance conditions to openspec_review action=start review=draft')
  }
  const intentArgument = first ? requireIntent(args) : undefined
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  if (first) {
    assertNoReviewRecord(directory, 'draft')
  } else {
    const existing = requireReviewRecord(directory, 'draft')
    if (applyStarted(directory, existing)) {
      throw new Error('the draft review cannot be resumed once apply started; review a plan change with openspec_review action=start review=apply and a recorded user waiver')
    }
  }
  await validateChange(ctx, settings, cwd, change, store, signal)
  const resolveModel = modelResolver({ ctx, agent: parent })
  let lockedPolicy
  if (first) {
    const locked = ensurePolicy({
      projectRoot: context.rootPath,
      change,
      store,
      settings,
      gitEnabled: isGitRepository(context.rootPath),
      lockedBy: 'first-review',
      resolveModel,
    })
    lockedPolicy = ensureReviewerModel(locked.directory, locked.policy, { settings, resolveModel })
  } else {
    const existingPolicy = readPolicy(directory)
    if (existingPolicy === undefined) {
      throw new Error('the draft review policy is missing; remove the review record before running openspec_review action=start review=draft again')
    }
    lockedPolicy = ensureReviewerModel(directory, existingPolicy, { settings, resolveModel })
  }
  const policy = policyDraft(lockedPolicy)
  if (!policy.enabled) throw new Error('draft review is disabled for this change')
  let intent
  if (first) {
    intent = intentArgument
  } else {
    intent = readIntent(directory)
    if (intent === undefined) {
      throw new Error('the review intent file is missing; remove the review record before running openspec_review action=start review=draft again')
    }
    const recorded = readReview(directory)
    if (recorded?.intent?.sha256 !== undefined && recorded.intent.sha256 !== sha256(intent)) {
      throw new Error('the review intent file changed after the review started; remove the review record before running openspec_review action=start review=draft again')
    }
  }
  const object = draftObject(context.changeRoot, intent)

  return withReviewLockAsync(directory, mode, async () => {
    let round
    let isNewRound = false
    let record
    if (first) {
      assertNoReviewRecord(directory, 'draft')
      writeTextAtomic(join(directory, INTENT_FILE), intent)
      const id = `draft-${randomUUID()}`
      record = {
        schemaVersion: 1,
        id,
        change,
        store: store ?? null,
        review: 'draft',
        state: 'in-review',
        mode: policy.reviewers === 1 ? 'reviewer' : 'self',
        independent: policy.reviewers === 1,
        changeRoot: context.changeRoot,
        reviewers: { count: policy.reviewers, slots: [] },
        policyHash: sha256(JSON.stringify(lockedPolicy)),
        objectKind: 'change',
        objectHash: object.objectHash,
        artifactHash: object.artifactHash,
        artifactFiles: object.files,
        intent: { path: INTENT_FILE, sha256: object.intentHash },
        limits: { waitMinutes: policy.waitMinutes },
        rounds: [],
        findings: [],
        createdAt: new Date().toISOString(),
      }
    } else {
      record = requireReviewRecord(directory, 'draft')
      if (record.state === 'abandoned') {
        throw new Error('the draft review was abandoned; start a new change or remove its review record')
      }
      if (record.state === 'passed' && record.objectHash === object.objectHash) {
        return projectReview(record, object.objectHash, { brief: readText(join(directory, latestRound(record).brief.path)) })
      }
    }
    const last = latestRound(record)
    if (last !== undefined && last.report !== undefined) assertNoOpenFindings(record, 'draft')
    if (last !== undefined && last.report === undefined) {
      round = last.round
      last.objectHash = object.objectHash
      last.artifactHash = object.artifactHash
      last.artifactFiles = object.files
      last.startedAt = new Date().toISOString()
    } else {
      const next = (record.rounds?.length ?? 0) + 1
      round = next
      record.rounds = Array.isArray(record.rounds) ? record.rounds : []
      record.rounds.push({
        round,
        objectHash: object.objectHash,
        artifactHash: object.artifactHash,
        artifactFiles: object.files,
        startedAt: new Date().toISOString(),
      })
      isNewRound = true
    }
    record.objectHash = object.objectHash
    record.artifactHash = object.artifactHash
    record.artifactFiles = object.files
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
    const briefFile = join(directory, briefPath)
    mkdirSync(join(directory, `round-${String(round)}`), { recursive: true })
    writeTextAtomic(briefFile, briefText)
    currentRound.brief = {
      path: briefPath,
      sha256: sha256(briefText),
      bytes: Buffer.byteLength(briefText),
    }
    if (policy.reviewers === 1) {
      const slot = record.reviewers?.slots?.[0]
      if (slot === undefined) {
        const childId = await startReviewerActivation(
          ctx,
          parent,
          context.rootPath,
          change,
          'draft',
          1,
          signal,
          policy.reviewerModel,
        )
        record.reviewers = {
          count: 1,
          slots: [{ slot: 1, agentId: childId, state: 'pending', startedAt: new Date().toISOString(), round }],
        }
      } else if (isNewRound) {
        await messageReviewer(ctx, parent, change, 'draft', round, slot.agentId, signal)
        slot.state = 'pending'
        slot.round = round
        slot.lastWokenAt = new Date().toISOString()
      }
    }
    clearDeadline(directory, 'draft')
    if (typeof parent?.id === 'string' && parent.id !== '') record.changerSessionId = parent.id
    saveReview(directory, record)
    if (isNewRound && last?.report !== undefined && (record.findings?.length ?? 0) > 0) {
      const cardReadiness = draftReadiness(record, object.objectHash, 'draft')
      writeRoundCard({
        ctx,
        directory,
        kind: 'draft',
        record,
        round: last.round,
        phase: 'resolution',
        readiness: cardReadiness,
        currentHash: object.objectHash,
        session: parent?.session,
      })
    }
    return projectReview(record, object.objectHash, {
      brief: briefText,
      nextAction: policy.reviewers === 1 ? 'openspec_review action=wait' : 'openspec_review action=self-report',
    })
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
async function startApplyReview(ctx, settings, cwd, args, signal, parent) {
  return applyReviewEntry(ctx, settings, cwd, args, signal, parent, 'start')
}

/**
 * Resume a recorded apply review.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - the changer agent.
 * @returns the projected review.
 */
async function resumeApplyReview(ctx, settings, cwd, args, signal, parent) {
  return applyReviewEntry(ctx, settings, cwd, args, signal, parent, 'resume')
}

/**
 * Enter an apply review: create the record or advance the recorded one.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - the changer agent.
 * @param mode - `start` for the first round, `resume` for a later one.
 * @returns the projected review.
 */
async function applyReviewEntry(ctx, settings, cwd, args, signal, parent, mode) {
  const first = mode === 'start'
  assertNoDispositions(args, first ? 'start' : 'resume')
  const change = requireChange(args)
  const store = optionalStore(args)
  const requestedRound = optionalRound(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  if (!isGitRepository(context.rootPath)) {
    throw new Error('apply review is unavailable: this project has no git repository')
  }
  const worktreeRoot = gitWorktreeRoot(context.rootPath) ?? context.rootPath
  const changePath = worktreeRelative(context.rootPath, context.changeRoot) ?? ''
  const status = gitStatus(worktreeRoot)
  if (status === undefined) throw new Error('apply review could not read the working tree status')
  const remaining = filterUnrelatedChangeStatus(status, changePath)
  if (remaining.length > 0) {
    throw new Error(`apply review needs a clean working tree; commit or stash these changes first:\n${remaining.join('\n')}`)
  }
  const commitSha = gitCommit(context.rootPath)
  if (commitSha === undefined) throw new Error('apply review needs a commit; HEAD could not be resolved')
  const treeSha = gitTree(context.rootPath, commitSha)
  if (treeSha === undefined) throw new Error('apply review could not resolve the commit tree')
  const directory = reviewDirectory(context.rootPath, store, change)
  let existingRecord
  if (first) {
    assertNoReviewRecord(directory, 'apply')
  } else {
    existingRecord = requireReviewRecord(directory, 'apply')
  }
  const existingPolicy = readPolicy(directory)
  if (existingRecord?.state === 'abandoned') {
    throw new Error('the apply review was abandoned; start a new change or remove its review record')
  }
  if (existingPolicy?.reviews?.apply !== undefined && existingPolicy.reviews.apply.enabled === false) {
    throw new Error('apply review is disabled for this change')
  }
  if (!first && existingPolicy === undefined) {
    throw new Error('the apply review policy is missing; remove the review record before running openspec_review action=start review=apply again')
  }
  const validation = await validateChange(ctx, settings, cwd, change, store, signal, { strict: true })

  const resolveModel = modelResolver({ ctx, agent: parent })
  let policy
  if (first) {
    const locked = ensurePolicy({
      projectRoot: context.rootPath,
      change,
      store,
      settings,
      gitEnabled: true,
      lockedBy: 'first-review',
      resolveModel,
    })
    policy = ensureReviewerModel(locked.directory, ensureApplyPolicy(locked.directory, locked.policy, settings), {
      settings,
      resolveModel,
    })
  } else {
    policy = ensureReviewerModel(directory, ensureApplyPolicy(directory, existingPolicy, settings), {
      settings,
      resolveModel,
    })
  }
  const apply = policyApply(policy)
  if (!apply.enabled) throw new Error('apply review is disabled for this change')

  const draftRecord = readReview(directory, 'draft')
  let intent
  let planDrift
  let planWaiver
  if (policyDraft(policy).enabled) {
    if (draftRecord === undefined) throw new Error('apply review needs a completed draft review for this change')
    intent = readIntent(directory)
    if (intent === undefined) throw new Error('the draft review intent file is missing')
    const draftArtifacts = draftObject(context.changeRoot, intent)
    if (draftArtifacts.objectHash !== draftRecord.objectHash) {
      planDrift = {
        draftObjectHash: draftRecord.objectHash,
        currentObjectHash: draftArtifacts.objectHash,
        files: Array.isArray(draftRecord.artifactFiles)
          ? diffArtifactFiles(draftRecord.artifactFiles, draftArtifacts.files)
          : [],
      }
      planWaiver = readPlanChangeWaiver(directory)
      if (planDrift.files.length > 0) {
        const covered = new Set(Array.isArray(planWaiver?.files) ? planWaiver.files : [])
        const unwaived = planDrift.files.filter((file) => !covered.has(file.path)).map((file) => file.path)
        if (unwaived.length > 0) {
          throw new Error(`the apply review needs a user waiver for the changed plan files: ${unwaived.join(', ')}. Run openspec_review action=waive scope=plan-change with the approved files.`)
        }
      }
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

  const acquired = acquireApplyLocks({
    cwd,
    resolvedRoot: context.rootPath,
    store,
    change,
    changeRoot: context.changeRoot,
  })
  try {
    return await withReviewLockAsync(directory, first ? 'start-apply' : 'resume-apply', async () => {
    let isNewRound = false
    let round
    let record
    if (first) {
      assertNoReviewRecord(directory, 'apply')
      record = {
        schemaVersion: 1,
        id: `apply-${randomUUID()}`,
        change,
        store: store ?? null,
        review: 'apply',
        state: 'in-review',
        mode: apply.reviewers === 1 ? 'reviewer' : 'self',
        independent: apply.reviewers === 1,
        changeRoot: context.changeRoot,
        reviewers: { count: apply.reviewers, slots: [] },
        policyHash: sha256(JSON.stringify(policy)),
        objectKind: 'tree',
        objectHash: treeSha,
        commitSha,
        treeSha,
        baseCommit,
        baseTreeSha,
        ...(intent === undefined ? {} : { intent: { path: INTENT_FILE, sha256: sha256(intent) } }),
        ...(planDrift === undefined ? {} : { draftDrift: planDrift }),
        limits: { waitMinutes: apply.waitMinutes },
        rounds: [],
        findings: [],
        createdAt: new Date().toISOString(),
      }
    } else {
      record = requireReviewRecord(directory, 'apply')
      if (record.state === 'abandoned') {
        throw new Error('the apply review was abandoned; start a new change or remove its review record')
      }
      if (record.state === 'passed' && record.treeSha === treeSha) {
        return projectReview(record, treeSha, {
          review: 'apply',
          brief: readText(join(directory, latestRound(record).brief.path)),
        })
      }
    }
    const last = latestRound(record)
    if (last !== undefined && last.report !== undefined) assertNoOpenFindings(record, 'apply')
    if (last !== undefined && last.report === undefined) {
      round = last.round
      last.objectHash = treeSha
      last.commitSha = commitSha
      last.treeSha = treeSha
      last.baseTreeSha = baseTreeSha
      last.startedAt = new Date().toISOString()
    } else {
      const next = (record.rounds?.length ?? 0) + 1
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
      isNewRound = true
    }
    if (requestedRound !== undefined && requestedRound !== round) {
      throw new Error(`the next apply review round is ${String(round)}, not ${String(requestedRound)}`)
    }
    record.objectHash = treeSha
    record.commitSha = commitSha
    record.treeSha = treeSha
    record.baseCommit = baseCommit
    record.baseTreeSha = baseTreeSha
    if (planDrift === undefined) delete record.draftDrift
    else record.draftDrift = planDrift
    record.state = 'in-review'
    const prefix = roundPrefix('apply')
    const roundDirectory = join(directory, `${prefix}-${String(round)}`)
    mkdirSync(roundDirectory, { recursive: true })
    const diffPath = `${prefix}-${String(round)}/diff.patch`
    writeTextAtomic(join(directory, diffPath), diffText)
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
      validation,
      planDrift,
      planWaiver,
      intentPath: intent === undefined ? undefined : `openspec/.review/${reviewKey(store, change)}/${INTENT_FILE}`,
      intentHash: intent === undefined ? undefined : sha256(intent),
    })
    const briefPath = `${prefix}-${String(round)}/brief.md`
    writeTextAtomic(join(directory, briefPath), briefText)
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
    if (apply.reviewers === 1) {
      const slot = record.reviewers?.slots?.[0]
      if (slot === undefined) {
        const childId = await startReviewerActivation(
          ctx,
          parent,
          context.rootPath,
          change,
          'apply',
          1,
          signal,
          apply.reviewerModel,
        )
        record.reviewers = {
          count: 1,
          slots: [{ slot: 1, agentId: childId, state: 'pending', startedAt: new Date().toISOString(), round }],
        }
      } else if (isNewRound) {
        await messageReviewer(ctx, parent, change, 'apply', round, slot.agentId, signal)
        slot.state = 'pending'
        slot.round = round
        slot.lastWokenAt = new Date().toISOString()
      }
    }
    clearDeadline(directory, 'apply')
    if (typeof parent?.id === 'string' && parent.id !== '') record.changerSessionId = parent.id
    saveReview(directory, record, 'apply')
    if (isNewRound && last?.report !== undefined && (record.findings?.length ?? 0) > 0) {
      const cardReadiness = draftReadiness(record, treeSha, 'apply')
      writeRoundCard({
        ctx,
        directory,
        kind: 'apply',
        record,
        round: last.round,
        phase: 'resolution',
        readiness: cardReadiness,
        currentHash: treeSha,
        session: parent?.session,
      })
    }
    return projectReview(record, treeSha, {
      review: 'apply',
      brief: briefText,
      nextAction: apply.reviewers === 1 ? 'openspec_review action=wait review=apply' : 'openspec_review action=self-report review=apply',
    })
    })
  } catch (error) {
    releaseApplyLocks(acquired.created)
    throw error
  }
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
async function submitSelfReport(ctx, settings, cwd, args, signal, agent) {
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
  if (section.reviewers !== 0) throw new Error(`independent reviewers use openspec_reviewer, not self-report`)
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
    if (currentHash !== current.objectHash) {
      throw new Error(`the ${kind} object changed since this round started; run openspec_review action=resume review=${kind} to open the next round`)
    }
    const result = submitReport({
      directory,
      kind,
      record,
      report: args?.report,
      currentHash,
    })
    const latest = latestRound(result.record)
    if (latest !== undefined) {
      writeRoundCard({
        ctx,
        directory,
        kind,
        record: result.record,
        round: latest.round,
        phase: 'review',
        readiness: result.readiness,
        currentHash,
        session: agent?.session,
      })
    }
    return projectReview(result.record, currentHash, { review: kind, nextAction: result.readiness.nextAction })
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
  if (kind === 'apply') {
    const policy = readPolicy(directory)
    const hasApplyPolicy = policy?.reviews?.apply !== undefined
    const enabled = hasApplyPolicy && policyApply(policy).enabled
    const available = isGitRepository(context.rootPath)
    if (!available) {
      return projectReview(record, undefined, {
        change,
        review: kind,
        policy: hasApplyPolicy,
        enabled,
        available: false,
        reasons: ['apply review is unavailable: this project has no git repository'],
        nextAction: 'openspec_archive',
      })
    }
    if (!hasApplyPolicy) {
      return projectReview(record, undefined, {
        change,
        review: kind,
        policy: false,
        enabled: false,
        available: true,
        reasons: ['no apply review policy is locked; the first start locks or migrates one'],
        nextAction: 'openspec_review action=start review=apply',
      })
    }
    if (!enabled) {
      return projectReview(record, undefined, {
        change,
        review: kind,
        policy: true,
        enabled: false,
        available: true,
        reasons: ['apply review is disabled for this change'],
        nextAction: 'openspec_archive',
      })
    }
    if (record === undefined) {
      return projectReview(undefined, undefined, {
        change,
        review: kind,
        policy: true,
        enabled: true,
        available: true,
        reasons: ['the apply review has not started'],
        nextAction: 'openspec_review action=start review=apply',
      })
    }
    return projectReview(record, gitTree(context.rootPath, 'HEAD'), {
      change,
      review: kind,
      policy: true,
      enabled: true,
      available: true,
    })
  }
  if (record === undefined) {
    return projectReview(undefined, undefined, {
      change,
      review: kind,
      nextAction: `openspec_review action=start review=${kind}`,
    })
  }
  const intent = readIntent(directory)
  const currentObjectHash = intent === undefined ? undefined : draftObject(context.changeRoot, intent).objectHash
  const started = applyStarted(directory, record)
  return projectReview(record, currentObjectHash, {
    change,
    review: kind,
    readinessOptions: started
      ? { ignoreStale: true, readyAction: 'openspec_review action=status review=apply' }
      : undefined,
  })
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
async function readReport(ctx, settings, cwd, args, signal, agent) {
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
  const latest = latestRound(record)
  if (latest?.round === round && latest.report !== undefined) {
    try {
      withReviewLock(directory, `${kind}-card`, () => {
        const current = readReview(directory, kind)
        const latestNow = latestRound(current)
        if (current === undefined || latestNow?.round !== round || latestNow.report === undefined) return
        const currentHash = current.objectHash
        const readiness = draftReadiness(current, currentHash, kind)
        writeRoundCard({
          ctx,
          directory,
          kind,
          record: current,
          round,
          phase: 'review',
          readiness,
          currentHash,
          session: agent?.session,
        })
      })
    } catch (error) {
      ctx.logger?.warn?.(
        `openspec-flow: the main-session review card could not be written: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return projectReview(record, record.objectHash, { report, review: kind })
}

/**
 * Normalize finding disposition arguments into entries for the batch path.
 * @param args - tool arguments.
 * @param waived - whether the action is `waive`.
 * @returns the entries, each with id, status and disposition fields.
 * @throws when the forms are mixed, the batch is malformed or an id repeats.
 */
function dispositionEntries(args, waived) {
  if (args?.issue !== undefined) {
    throw new Error('issue was removed; record the follow-up reference in note')
  }
  const batch = args?.dispositions !== undefined
  const hasId = typeof args?.id === 'string' && args.id.trim() !== ''
  if (batch && hasId) throw new Error('pass either id or dispositions, not both')
  if (!batch && !hasId) throw new Error('a finding id is required')
  if (!batch) {
    return [{
      id: args.id.trim(),
      status: waived ? 'waived' : args.status,
      note: args.note,
      waiver: args.waiver,
      approvedBy: args.approvedBy,
    }]
  }
  if (args?.status !== undefined || args?.note !== undefined) {
    throw new Error('a dispositions batch does not accept top-level status or note')
  }
  if (!Array.isArray(args.dispositions) || args.dispositions.length === 0) {
    throw new Error('dispositions must be a non-empty array')
  }
  const allowed = new Set(['id', 'status', 'note', 'waiver', 'approvedBy'])
  const seen = new Set()
  return args.dispositions.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`dispositions[${index}] is not an object`)
    }
    if (Object.hasOwn(entry, 'issue')) {
      throw new Error(`dispositions[${index}] uses the removed issue field; record the follow-up reference in note`)
    }
    for (const key of Object.keys(entry)) {
      if (!allowed.has(key)) throw new Error(`dispositions[${index}] has an unknown field '${key}'`)
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (id === '') throw new Error(`dispositions[${index}] needs a finding id`)
    if (seen.has(id)) throw new Error(`finding '${id}' appears more than once in dispositions`)
    seen.add(id)
    if (waived && entry.status !== undefined && entry.status !== 'waived') {
      throw new Error(`dispositions[${index}] ${id}: a waive entry cannot set status`)
    }
    return {
      id,
      status: waived ? 'waived' : entry.status,
      note: entry.note,
      waiver: entry.waiver ?? args?.waiver,
      approvedBy: entry.approvedBy ?? args?.approvedBy,
    }
  })
}

/**
 * Dispose or waive one or more findings.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param waived - whether the action is `waive`.
 * @returns the projected review.
 */
async function disposeReviewFinding(ctx, settings, cwd, args, signal, waived, agent) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const entries = dispositionEntries(args, waived)
  const batch = args?.dispositions !== undefined
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  return withReviewLock(directory, `${kind}-${waived ? 'waive' : 'dispose'}`, () => {
    const record = readReview(directory, kind)
    if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    record.findings = Array.isArray(record.findings) ? record.findings : []
    const byId = new Map(record.findings.map((finding) => [finding.id, finding]))
    const changes = []
    for (const [index, entry] of entries.entries()) {
      const original = byId.get(entry.id)
      if (original === undefined) {
        throw new Error(batch
          ? `dispositions[${index}] finding '${entry.id}' is not recorded`
          : `finding '${entry.id}' is not recorded`)
      }
      const finding = { ...original }
      try {
        disposeFinding(finding, entry)
      } catch (error) {
        throw new Error(batch
          ? `dispositions[${index}] ${entry.id}: ${error.message}`
          : error.message)
      }
      changes.push({ id: entry.id, finding })
    }
    for (const item of changes) {
      const position = record.findings.findIndex((finding) => finding.id === item.id)
      record.findings[position] = item.finding
    }
    const intent = kind === 'apply' ? undefined : readIntent(directory)
    const currentHash = kind === 'apply'
      ? (gitTree(context.rootPath, 'HEAD') ?? record.objectHash)
      : (intent === undefined ? record.objectHash : draftObject(context.changeRoot, intent).objectHash)
    const readiness = draftReadiness(record, currentHash, kind)
    record.state = readiness.ready ? 'passed' : 'in-review'
    saveReview(directory, record, kind)
    if (readiness.ready) {
      const latest = latestRound(record)
      if (latest !== undefined) {
        writeRoundCard({
          ctx,
          directory,
          kind,
          record,
          round: latest.round,
          phase: 'resolution',
          readiness,
          currentHash,
          session: agent?.session,
        })
      }
    }
    return projectReview(record, currentHash, {
      review: kind,
      nextAction: readiness.nextAction,
      dispositions: changes.map((item) => ({ id: item.id, status: item.finding.status })),
    })
  })
}

/**
 * Record a user waiver for a plan change made during apply.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected draft review with the waiver.
 */
async function waivePlanChange(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  if (args?.dispositions !== undefined) {
    throw new Error('a plan-change waiver does not accept dispositions')
  }
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  if (args?.approvedBy !== 'user') throw new Error('a plan-change waiver needs approvedBy user')
  const waiver = typeof args?.waiver === 'string' ? args.waiver.trim() : ''
  if (waiver === '') throw new Error('a plan-change waiver needs the waiver text')
  const files = Array.isArray(args?.files)
    ? [...new Set(args.files
      .map((file) => (typeof file === 'string' ? file.trim() : ''))
      .filter((file) => file !== ''))].sort()
    : []
  if (files.length === 0) throw new Error('a plan-change waiver needs the changed files')
  return withReviewLock(directory, 'plan-change-waiver', () => {
    const draft = readReview(directory)
    const apply = readReview(directory, 'apply')
    if (draft?.applyBaseCommit === undefined && apply === undefined) {
      throw new Error('a plan-change waiver needs a started apply; resume the draft review for a plan change before apply started')
    }
    const existing = readPlanChangeWaiver(directory)
    const merged = [...new Set([...(Array.isArray(existing?.files) ? existing.files : []), ...files])].sort()
    const record = {
      text: waiver,
      approvedBy: 'user',
      files: merged,
      recordedAt: new Date().toISOString(),
      ...(draft?.objectHash === undefined ? {} : { draftObjectHash: draft.objectHash }),
      ...(apply?.draftDrift?.currentObjectHash === undefined
        ? {}
        : { currentObjectHash: apply.draftDrift.currentObjectHash }),
    }
    writeJsonAtomic(join(directory, PLAN_CHANGE_WAIVER_FILE), record)
    return projectReview(draft, draft?.objectHash, {
      change,
      review: 'draft',
      nextAction: apply === undefined
        ? 'openspec_review action=start review=apply'
        : 'openspec_review action=status review=apply',
      planChangeWaiver: record,
    })
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
    if (minutes === undefined) throw new Error('extend needs minutes')
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 15) {
      throw new Error('minutes must be an integer between 1 and 15')
    }
    record.extensions = Array.isArray(record.extensions) ? record.extensions : []
    record.extensions.push({
      at: new Date().toISOString(),
      minutes,
      reason,
      approvedBy: 'user',
    })
    record.limits = typeof record.limits === 'object' && record.limits !== null ? record.limits : {}
    record.limits.waitMinutes = (record.limits.waitMinutes ?? 15) + minutes
    clearDeadline(directory, kind)
    saveReview(directory, record, kind)
    const intent = kind === 'apply' ? undefined : readIntent(directory)
    const currentHash = kind === 'apply'
      ? (gitTree(context.rootPath, 'HEAD') ?? record.objectHash)
      : (intent === undefined ? record.objectHash : draftObject(context.changeRoot, intent).objectHash)
    return projectReview(record, currentHash, {
      review: kind,
      nextAction: kind === 'apply' ? 'openspec_review action=wait review=apply' : 'openspec_review action=wait',
    })
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
    clearDeadline(directory, kind)
    saveReview(directory, record, kind)
    return projectReview(record, record.objectHash, {
      review: kind,
      nextAction: 'openspec_new_change',
      reasons: ['the review was abandoned; remove the review record to start again or open a new change'],
    })
  })
}

/**
 * Record the calling changer session on a review record.
 *
 * The write is a lock-scoped re-read-modify-write: it never saves a pre-lock
 * copy, so a reviewer submit that landed after the wait read keeps its report.
 * A lock-contended write is logged and skipped; the wait result still returns
 * from the post-write read and the next wait retries.
 *
 * @param ctx - host context.
 * @param directory - review directory.
 * @param kind - review kind.
 * @param sessionId - calling changer session id.
 * @returns nothing.
 */
function rememberChangerSession(ctx, directory, kind, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return
  try {
    withReviewLock(directory, `${kind}-remember-changer`, () => {
      const current = readReview(directory, kind)
      if (current === undefined) return
      current.changerSessionId = sessionId
      saveReview(directory, current, kind)
    })
  } catch (error) {
    ctx?.logger?.warn?.(
      `openspec-flow: could not record the changer session for the ${kind} review: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Arm the overdue wakeup for a parked wait.
 *
 * The timer wakes the latest recorded waiter once `waitMinutes` passes and the
 * round still has no report. The return value of the tool execution signal is
 * not reused: the call that registered the deadline has already returned, so
 * the timer owns a signal that is never aborted by that call.
 *
 * @param ctx - host context.
 * @param options - review directory, kind, change, record, round, deadline and waiter.
 * @returns nothing.
 */
function armDeadline(ctx, options) {
  const { directory, kind, change, record, latest, deadline, changerSessionId } = options
  const slot = record.reviewers?.slots?.[0]
  const reviewerAgentId = slot?.agentId
  const round = latest?.round
  const timerSignal = new AbortController().signal
  registerDeadline(directory, kind, {
    delayMs: Math.max(0, deadline - Date.now()),
    round,
    deadline,
    changerSessionId,
    reviewerAgentId,
    logger: ctx?.logger,
    onFire: async () => {
      const current = readReview(directory, kind)
      if (current === undefined) return
      const currentLatest = latestRound(current)
      if (current.reviewerWaived !== undefined
        || currentLatest?.report !== undefined
        || current.state === 'passed'
        || current.state === 'abandoned') return
      const agents = ctx.get?.('agents') ?? ctx.agents
      const sender = reviewerAgentId === undefined ? undefined : agents?.get?.(reviewerAgentId)
      if (sender === undefined) {
        ctx?.logger?.warn?.('openspec-flow: the reviewer is not live; the overdue wakeup was skipped')
        return
      }
      const baseTargets = wakeTargets(changerSessionId, current.changerSessionId)
      const targets = baseTargets.length > 0
        ? baseTargets
        : wakeTargets(sender.session?.header?.parentSession)
      if (targets.length === 0) {
        ctx?.logger?.warn?.('openspec-flow: no changer session is recorded; the overdue wakeup was skipped')
        return
      }
      await sendWakeup(
        ctx,
        sender,
        targets,
        deadlineText({ change, kind, round }),
        timerSignal,
      )
    },
  })
}

/**
 * Wait for the independent reviewer report.
 *
 * The call reads once after a best-effort session write and arms a deadline
 * timer; it never polls. A `waiting` result ends the changer turn and the
 * reviewer submit or the deadline timer wakes it.
 *
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param agent - calling changer agent.
 * @returns the projected review.
 */
async function waitReview(ctx, settings, cwd, args, signal, agent) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const record = readReview(directory, kind)
  if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  if (record.mode !== 'reviewer') throw new Error('wait is only available for an independent reviewer')
  rememberChangerSession(ctx, directory, kind, agent?.id)
  const current = readReview(directory, kind)
  if (current === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  const latest = latestRound(current)
  if (current.reviewerWaived !== undefined || latest?.report !== undefined || current.state === 'passed') {
    const readiness = draftReadiness(current, current.objectHash, kind)
    const nextAction = readiness.ready
      ? (kind === 'apply' ? 'openspec_archive' : 'openspec_apply_next')
      : (kind === 'apply' && readiness.nextAction === 'openspec_review action=dispose'
          ? 'openspec_review action=dispose review=apply'
          : readiness.nextAction)
    if (latest?.report !== undefined) {
      try {
        withReviewLock(directory, `${kind}-card`, () => {
          const latestRecord = readReview(directory, kind)
          const latestNow = latestRound(latestRecord)
          if (latestRecord === undefined || latestNow?.report === undefined) return
          const readinessNow = draftReadiness(latestRecord, current.objectHash, kind)
          writeRoundCard({
            ctx,
            directory,
            kind,
            record: latestRecord,
            round: latestNow.round,
            phase: 'review',
            readiness: readinessNow,
            currentHash: current.objectHash,
            session: agent?.session,
          })
        })
      } catch (error) {
        ctx.logger?.warn?.(
          `openspec-flow: the main-session review card could not be written: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    return projectReview(current, current.objectHash, {
      review: kind,
      waitState: 'ready',
      nextAction,
    })
  }
  const startedAt = latest?.startedAt === undefined ? Date.now() : Date.parse(latest.startedAt)
  const deadline = startedAt + (current.limits?.waitMinutes ?? 15) * 60_000
  if (Date.now() >= deadline) {
    return projectReview(current, current.objectHash, {
      review: kind,
      waitState: 'overdue',
      reasons: ['the reviewer did not submit before the wait limit'],
      nextAction: kind === 'apply'
        ? 'openspec_review action=extend review=apply or action=abandon review=apply'
        : 'openspec_review action=extend or action=abandon',
    })
  }
  armDeadline(ctx, {
    directory,
    kind,
    change,
    record: current,
    latest,
    deadline,
    changerSessionId: agent?.id ?? current.changerSessionId,
  })
  return projectReview(current, current.objectHash, {
    review: kind,
    waitState: 'waiting',
    reasons: ['the reviewer has not submitted yet; end the turn and wait for the wakeup'],
    nextAction: 'end-turn; await the reviewer wakeup',
  })
}

/**
 * Message the same reviewer to retry.
 * @param ctx - host context.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - changer agent.
 * @returns the projected review.
 */
async function retryReview(ctx, cwd, args, signal, parent) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const directory = reviewDirectory(cwd, store, change)
  const subagents = ctx.get?.('subagents') ?? ctx.subagents
  if (subagents === undefined || typeof subagents.sendMessage !== 'function') {
    throw new Error('the reviewer service is unavailable')
  }
  return withReviewLockAsync(directory, `${kind}-retry`, async () => {
    const record = readReview(directory, kind)
    if (record?.mode !== 'reviewer') throw new Error('retry is only available for an independent reviewer')
    const slot = record.reviewers?.slots?.[0]
    if (slot === undefined) throw new Error('the review has no reviewer slot')
    await subagents.sendMessage(parent, slot.agentId, [{
      type: 'text',
      text: `Please review the current ${kind} brief again and submit your report with openspec_reviewer.`,
    }], { signal })
    slot.retries = (slot.retries ?? 0) + 1
    slot.state = 'pending'
    slot.lastRetryAt = new Date().toISOString()
    clearDeadline(directory, kind)
    saveReview(directory, record, kind)
    return projectReview(record, record.objectHash, { review: kind, nextAction: 'openspec_review action=wait' })
  })
}

/**
 * Replace the reviewer with a new activation.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - changer agent.
 * @returns the projected review.
 */
async function replaceReview(ctx, settings, cwd, args, signal, parent) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const directory = reviewDirectory(cwd, store, change)
  const reason = typeof args?.reason === 'string' ? args.reason.trim() : ''
  if (reason === '') throw new Error('replace needs a reason')
  const stored = readPolicy(directory)
  const migrated = stored === undefined
    ? undefined
    : ensureReviewerModel(directory, stored, {
        settings,
        resolveModel: modelResolver({ ctx, agent: parent }),
      })
  const section = migrated === undefined
    ? undefined
    : kind === 'apply' ? policyApply(migrated) : policyDraft(migrated)
  return withReviewLockAsync(directory, `${kind}-replace`, async () => {
    const record = readReview(directory, kind)
    if (record?.mode !== 'reviewer') throw new Error('replace is only available for an independent reviewer')
    const slot = record.reviewers?.slots?.[0]
    if (slot === undefined) throw new Error('the review has no reviewer slot')
    const childId = await startReviewerActivation(
      ctx,
      parent,
      cwd,
      change,
      kind,
      1,
      signal,
      section?.reviewerModel,
    )
    slot.replacements = [...(slot.replacements ?? []), { from: slot.agentId, to: childId, reason, at: new Date().toISOString() }]
    slot.agentId = childId
    slot.state = 'pending'
    slot.startedAt = new Date().toISOString()
    clearDeadline(directory, kind)
    saveReview(directory, record, kind)
    return projectReview(record, record.objectHash, { review: kind, nextAction: 'openspec_review action=wait' })
  })
}

/**
 * Waive the reviewer coverage with user approval.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @returns the projected review.
 */
function waiveReviewer(cwd, args) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const directory = reviewDirectory(cwd, store, change)
  if (args?.approvedBy !== 'user') throw new Error('waive-reviewer needs approvedBy user')
  const waiver = typeof args?.waiver === 'string' ? args.waiver.trim() : ''
  if (waiver === '') throw new Error('waive-reviewer needs the waiver text')
  return withReviewLock(directory, `${kind}-waive-reviewer`, () => {
    const record = readReview(directory, kind)
    if (record?.mode !== 'reviewer') throw new Error('waive-reviewer is only available for an independent reviewer')
    if (latestRound(record)?.report !== undefined) throw new Error('the reviewer already submitted a report')
    record.reviewerWaived = {
      slot: 1,
      reason: typeof args?.reason === 'string' ? args.reason.trim() : null,
      waiver,
      approvedBy: 'user',
      at: new Date().toISOString(),
    }
    record.coverageGap = true
    const readiness = draftReadiness(record, record.objectHash, kind)
    record.state = readiness.ready ? 'passed' : 'in-review'
    clearDeadline(directory, kind)
    saveReview(directory, record, kind)
    return projectReview(record, record.objectHash, { review: kind, nextAction: readiness.nextAction })
  })
}

/**
 * The change path relative to the project root.
 *
 * A store-backed change may live outside the project root; the seal cannot
 * verify such a change and skips its checks.
 * @param rootPath - project root.
 * @param changeRoot - absolute change directory.
 * @returns the POSIX relative path, or undefined when outside the root.
 */
export function relativeChangePath(rootPath, changeRoot) {
  const value = relative(rootPath, changeRoot).split(sep).join('/')
  if (value === '' || value.startsWith('..') || isAbsolute(value)) return undefined
  return value
}

/**
 * Resolve a worktree-relative path.
 * @param root - project root.
 * @param target - absolute target.
 * @returns POSIX relative path, or undefined when outside the worktree.
 */
function worktreeRelative(root, target) {
  const worktreeRoot = gitWorktreeRoot(root) ?? root
  const value = relative(worktreeRoot, target).split(sep).join('/')
  if (value === '' || value.startsWith('..') || isAbsolute(value)) return undefined
  return value
}

/**
 * Warning text for a store-backed change whose seal checks are skipped.
 * @param change - change name.
 * @returns the warning.
 */
export function storeSealSkipWarning(change) {
  return `the seal checks were skipped for a store-backed change outside the project root: ${change}`
}

/**
 * Verify the draft seal commit and record it as the apply base.
 *
 * The commit must change at least one file under the change directory, may
 * also change the plugin's ignore file, and its artifacts must still match the
 * reviewed draft. A store-backed change whose directory is outside the project
 * root skips the checks and reports a warning.
 * @param context - resolved change context.
 * @param record - draft review record.
 * @param directory - review directory.
 * @param object - current draft object.
 * @param change - change name.
 * @returns warnings that do not block apply.
 */
function sealDraft(context, record, directory, object, change) {
  const worktreeRoot = gitWorktreeRoot(context.rootPath) ?? context.rootPath
  const changePath = worktreeRelative(context.rootPath, context.changeRoot)
  if (changePath === undefined) return [storeSealSkipWarning(change)]
  const ignorePath = worktreeRelative(context.rootPath, join(context.rootPath, 'openspec', '.gitignore'))
  const status = gitStatus(worktreeRoot)
  if (status === undefined) {
    throw new Error('the draft review is ready, but the working tree status could not be read')
  }
  const remaining = filterUnrelatedChangeStatus(status, changePath)
  if (remaining.length > 0) {
    throw new Error(`apply needs the change sealed: commit or stash these changes first; the working tree is not clean:\n${remaining.join('\n')}`)
  }
  const head = gitCommit(worktreeRoot)
  if (head === undefined) throw new Error('the draft review is ready, but HEAD could not be resolved')
  const paths = gitCommitPaths(worktreeRoot, head)
  if (paths === undefined) throw new Error('apply could not read the seal commit file list')
  const prefix = `${changePath}/`
  const outside = paths.filter((path) => path !== ignorePath
    && !path.startsWith(prefix)
    && !isChangePath(path))
  if (outside.length > 0) {
    throw new Error(`the seal commit must contain only '${changePath}/', the OpenSpec ignore file and other change paths; HEAD also changes: ${outside.join(', ')}`)
  }
  if (!paths.some((path) => path.startsWith(prefix))) {
    throw new Error(`the seal commit must change at least one file under '${changePath}/'; HEAD changes none`)
  }
  if (record.artifactHash !== object.artifactHash) {
    throw new Error('the change artifacts differ from the reviewed draft; restore the reviewed version or record a user waiver with openspec_review action=waive scope=plan-change')
  }
  record.applyBaseCommit = head
  saveReview(directory, record)
  return []
}

/**
 * Refuse apply while an enabled draft review is not ready and record its base.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns `{ warnings }` that do not block apply.
 * @throws when the gate refuses.
 */
export async function assertDraftReviewReady(ctx, settings, cwd, change, store, signal) {
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const policy = readPolicy(directory)
  const draftGate = settings?.reviews?.draft?.enabled === true
    && policy !== undefined
    && policyDraft(policy).enabled
  if (!draftGate) {
    const acquired = acquireApplyLocks({
      cwd,
      resolvedRoot: context.rootPath,
      store,
      change,
      changeRoot: context.changeRoot,
    })
    return { warnings: [], locks: acquired.locks, created: acquired.created }
  }
  const record = readReview(directory)
  if (record === undefined) {
    throw new Error('the draft review has not started; run openspec_review action=start review=draft')
  }
  const intent = readIntent(directory)
  if (intent === undefined) {
    throw new Error('the review intent file is missing; remove the review record before running openspec_review action=start review=draft again')
  }
  const object = draftObject(context.changeRoot, intent)
  const started = applyStarted(directory, record)
  const readiness = draftReadiness(record, object.objectHash, 'draft', started ? { ignoreStale: true } : {})
  if (!readiness.ready) {
    throw new Error(
      `the draft review is not ready: ${readiness.reasons.join('; ')}. `
      + `Next: ${gateAdvice(record, 'draft', readiness)}.`,
    )
  }
  const acquired = acquireApplyLocks({
    cwd,
    resolvedRoot: context.rootPath,
    store,
    change,
    changeRoot: context.changeRoot,
  })
  const warnings = []
  if (isGitRepository(context.rootPath) && record.applyBaseCommit === undefined) {
    try {
      warnings.push(...sealDraft(context, record, directory, object, change))
    } catch (error) {
      releaseApplyLocks(acquired.created)
      throw error
    }
  }
  return { warnings, locks: acquired.locks, created: acquired.created }
}

/**
 * Refuse archive while another change holds the apply locks or an enabled
 * apply review is not ready.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns `{ context, inspected }` for the caller's release after archive.
 * @throws when the gate refuses.
 */
export async function assertApplyReviewReady(ctx, settings, cwd, change, store, signal) {
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const inspected = inspectApplyLocks({
    cwd,
    resolvedRoot: context.rootPath,
    store,
    change,
    changeRoot: context.changeRoot,
  })
  const blocker = applyLockBlocker(inspected)
  if (blocker !== undefined) throw applyLockBlockedError(blocker)
  if (settings?.reviews?.apply?.enabled !== true) return { context, inspected }
  if (!isGitRepository(context.rootPath)) return { context, inspected }
  const directory = reviewDirectory(context.rootPath, store, change)
  const policy = readPolicy(directory)
  if (policy === undefined || !policyApply(policy).enabled) return { context, inspected }
  const record = readReview(directory, 'apply')
  if (record === undefined) {
    throw new Error('the apply review has not started; run openspec_review action=start review=apply')
  }
  const tree = gitTree(context.rootPath, 'HEAD')
  if (tree === undefined || tree !== record.treeSha) {
    throw new Error('the apply review tree no longer matches HEAD; rerun the apply review on the current commit')
  }
  const worktreeRoot = gitWorktreeRoot(context.rootPath) ?? context.rootPath
  const changePath = worktreeRelative(context.rootPath, context.changeRoot) ?? ''
  const status = gitStatus(worktreeRoot)
  if (status === undefined) throw new Error('the apply review could not read the working tree status')
  const remaining = filterUnrelatedChangeStatus(status, changePath)
  if (remaining.length > 0) {
    throw new Error(`the apply review needs a clean working tree before archive:\n${remaining.join('\n')}`)
  }
  const readiness = draftReadiness(record, tree, 'apply')
  if (!readiness.ready) {
    throw new Error(
      `the apply review is not ready: ${readiness.reasons.join('; ')}. `
      + `Next: ${gateAdvice(record, 'apply', readiness)}.`,
    )
  }
  return { context, inspected }
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
    description: 'Run a review for a change: start the first round, resume a later round, read the brief, submit or read the report, dispose one or more findings in a single call, extend limits, or inspect readiness. `start` refuses a review whose record exists; `resume` refuses one without a record. It refuses apply while the draft review is not ready.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'change'],
      properties: {
        action: {
          type: 'string',
          enum: REVIEW_ACTIONS,
          description: 'Review step to perform: start, resume, status, self-report, report, dispose, waive, extend or abandon.',
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
          description: 'The user goal and acceptance conditions for the first draft start.',
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
        dispositions: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id: { type: 'string' },
              status: { type: 'string', enum: ['fixed', 'deferred', 'rejected', 'waived'] },
              note: { type: 'string' },
              waiver: { type: 'string' },
              approvedBy: { type: 'string', enum: ['user'] },
            },
          },
          description: 'Finding dispositions for action=dispose or a finding action=waive; start and resume reject it.',
        },
        waiver: { type: 'string', description: 'The user waiver text.' },
        approvedBy: { type: 'string', enum: ['user'], description: 'The approver for a waiver or extension.' },
        scope: {
          type: 'string',
          enum: ['plan-change'],
          description: 'Waiver scope: plan-change approves a plan change made during apply.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Change artifact paths covered by a plan-change waiver.',
        },
        minutes: { type: 'number', description: 'Minutes to add to the current wait limit.' },
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
          ? await startApplyReview(ctx, settings, cwd, args, exec.signal, exec.agent)
          : await startReview(ctx, settings, cwd, args, exec.signal, exec.agent)
      }
      if (action === 'resume') {
        return reviewKind(args) === 'apply'
          ? await resumeApplyReview(ctx, settings, cwd, args, exec.signal, exec.agent)
          : await resumeDraftReview(ctx, settings, cwd, args, exec.signal, exec.agent)
      }
      if (action === 'wait') return await waitReview(ctx, settings, cwd, args, exec.signal, exec.agent)
      if (action === 'status') return await reviewStatus(ctx, settings, cwd, args, exec.signal)
      if (action === 'self-report') return await submitSelfReport(ctx, settings, cwd, args, exec.signal, exec.agent)
      if (action === 'report') return await readReport(ctx, settings, cwd, args, exec.signal, exec.agent)
      if (action === 'dispose') return await disposeReviewFinding(ctx, settings, cwd, args, exec.signal, false, exec.agent)
      if (action === 'waive') {
        return args?.scope === 'plan-change'
          ? await waivePlanChange(ctx, settings, cwd, args, exec.signal)
          : await disposeReviewFinding(ctx, settings, cwd, args, exec.signal, true, exec.agent)
      }
      if (action === 'retry') return await retryReview(ctx, cwd, args, exec.signal, exec.agent)
      if (action === 'replace') return await replaceReview(ctx, settings, cwd, args, exec.signal, exec.agent)
      if (action === 'waive-reviewer') return waiveReviewer(cwd, args)
      if (action === 'extend') return await extendReview(ctx, settings, cwd, args, exec.signal)
      return await abandonReview(ctx, settings, cwd, args, exec.signal)
    },
  }))
}
