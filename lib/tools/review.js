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
import { disposeFinding, summarizeFindings } from '../review/report.js'
import { draftReadiness } from '../review/readiness.js'
import { submitReport } from '../review/submit.js'
import { withReviewLockAsync } from '../review/store.js'
import { latestRound, readReview, roundPrefix, saveReview } from '../review/record.js'
import { optionalStore, renderJson, requireChange, sessionCwd } from './shared.js'

const REVIEW_FILE = 'review.json'
const APPLY_REVIEW_FILE = 'apply-review.json'
const INTENT_FILE = 'intent.md'

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
    : draftReadiness(record, currentObjectHash, record.review)
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
    ...(record?.commitSha === undefined ? {} : { commitSha: record.commitSha }),
    ...(record?.treeSha === undefined ? {} : { treeSha: record.treeSha }),
    ...(record?.baseTreeSha === undefined ? {} : { baseTreeSha: record.baseTreeSha }),
    findings: summarizeFindings(record?.findings ?? []),
    ready: readiness.ready,
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
  if (first) assertNoReviewRecord(directory, 'draft')
  else requireReviewRecord(directory, 'draft')
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
        limits: { maxRounds: policy.maxRounds, waitMinutes: policy.waitMinutes },
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
    saveReview(directory, record)
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
  if (policyDraft(policy).enabled) {
    if (draftRecord === undefined) throw new Error('apply review needs a completed draft review for this change')
    intent = readIntent(directory)
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

  return withReviewLockAsync(directory, first ? 'start-apply' : 'resume-apply', async () => {
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
        limits: { maxRounds: apply.maxRounds, waitMinutes: apply.waitMinutes },
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
    saveReview(directory, record, 'apply')
    return projectReview(record, treeSha, {
      review: 'apply',
      brief: briefText,
      nextAction: apply.reviewers === 1 ? 'openspec_review action=wait review=apply' : 'openspec_review action=self-report review=apply',
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
    const readiness = draftReadiness(record, currentHash, kind)
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
    return projectReview(record, record.objectHash, {
      review: kind,
      nextAction: 'openspec_new_change',
      reasons: ['the review was abandoned; remove the review record to start again or open a new change'],
    })
  })
}

/**
 * Sleep for a short interval.
 * @param ms - milliseconds.
 * @returns a promise.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wait for the independent reviewer report.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function waitReview(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const record = readReview(directory, kind)
  if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  if (record.mode !== 'reviewer') throw new Error('wait is only available for an independent reviewer')
  const segmentEnd = Date.now() + 90_000
  for (;;) {
    const current = readReview(directory, kind)
    if (current === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    const latest = latestRound(current)
    if (current.reviewerWaived !== undefined || latest?.report !== undefined || current.state === 'passed') {
      return projectReview(current, current.objectHash, { review: kind })
    }
    const startedAt = latest?.startedAt === undefined ? Date.now() : Date.parse(latest.startedAt)
    const deadline = startedAt + (current.limits?.waitMinutes ?? 15) * 60_000
    if (Date.now() >= deadline) {
      return projectReview(current, current.objectHash, {
        review: kind,
        reasons: ['the reviewer did not submit before the wait limit'],
        nextAction: 'openspec_review action=extend or action=abandon',
      })
    }
    if (Date.now() >= segmentEnd) {
      return projectReview(current, current.objectHash, {
        review: kind,
        reasons: ['the reviewer has not submitted yet'],
        nextAction: 'openspec_review action=wait',
      })
    }
    if (signal?.aborted) throw new Error('the wait was cancelled')
    await sleep(250)
  }
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
    saveReview(directory, record, kind)
    return projectReview(record, record.objectHash, { review: kind, nextAction: readiness.nextAction })
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
  if (intent === undefined) {
    throw new Error('the review intent file is missing; remove the review record before running openspec_review action=start review=draft again')
  }
  const object = draftObject(context.changeRoot, intent)
  const readiness = draftReadiness(record, object.objectHash, 'draft')
  if (!readiness.ready) {
    throw new Error(
      `the draft review is not ready: ${readiness.reasons.join('; ')}. `
      + 'Run openspec_review action=status, dispose findings, or resume the next round.',
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
  const readiness = draftReadiness(record, tree, 'apply')
  if (!readiness.ready) {
    throw new Error(
      `the apply review is not ready: ${readiness.reasons.join('; ')}. `
      + 'Run openspec_review action=status review=apply, dispose findings, or resume the next round.',
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
    description: 'Run a review for a change: start the first round, resume a later round, read the brief, submit or read the report, dispose findings, extend limits, or inspect readiness. `start` refuses a review whose record exists; `resume` refuses one without a record. It refuses apply while the draft review is not ready.',
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
          ? await startApplyReview(ctx, settings, cwd, args, exec.signal, exec.agent)
          : await startReview(ctx, settings, cwd, args, exec.signal, exec.agent)
      }
      if (action === 'resume') {
        return reviewKind(args) === 'apply'
          ? await resumeApplyReview(ctx, settings, cwd, args, exec.signal, exec.agent)
          : await resumeDraftReview(ctx, settings, cwd, args, exec.signal, exec.agent)
      }
      if (action === 'wait') return await waitReview(ctx, settings, cwd, args, exec.signal)
      if (action === 'status') return await reviewStatus(ctx, settings, cwd, args, exec.signal)
      if (action === 'self-report') return await submitSelfReport(ctx, settings, cwd, args, exec.signal)
      if (action === 'report') return await readReport(ctx, settings, cwd, args, exec.signal)
      if (action === 'dispose') return await disposeReviewFinding(ctx, settings, cwd, args, exec.signal, false)
      if (action === 'waive') return await disposeReviewFinding(ctx, settings, cwd, args, exec.signal, true)
      if (action === 'retry') return await retryReview(ctx, cwd, args, exec.signal, exec.agent)
      if (action === 'replace') return await replaceReview(ctx, settings, cwd, args, exec.signal, exec.agent)
      if (action === 'waive-reviewer') return waiveReviewer(cwd, args)
      if (action === 'extend') return await extendReview(ctx, settings, cwd, args, exec.signal)
      return await abandonReview(ctx, settings, cwd, args, exec.signal)
    },
  }))
}
