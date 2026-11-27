/**
 * Draft review tool and the apply gate.
 *
 * The tool is deterministic: it reads change artifacts, writes briefs and
 * reports, validates the report shape and computes readiness. It never calls a
 * model and never edits implementation files.
 *
 * @module dsh-openspec-flow/tools/review
 */

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { runOpenSpec, throwIfOnlyStatus, withStore } from '../openspec.js'
import { assertBuiltinSchema } from '../schema.js'
import { projectValidate } from '../state.js'
import { buildApplyBrief, buildDraftBrief } from '../review/brief.js'
import { classifyRequirementLength, lengthGateMessage } from '../review/length.js'
import { classifyExecutionPreflight, executionGateMessage } from '../review/preflight.js'
import { readRoundReport, writeCard } from '../review/cards.js'
import { diffArtifactFiles, draftObject } from '../review/object.js'
import { normalizeWaiverFiles } from '../review/waiver.js'
import {
  assertReviewerModelAvailable,
  modelResolver,
  reviewerAgentOptions,
} from '../review/model.js'
import {
  criteriaOf,
  ensureApplyPolicy,
  ensurePolicy,
  ensureReviewerModel,
  readPolicy,
  requireReviewConfig,
  supplementPolicy,
} from '../review/policy.js'
import { LEGACY_REVIEWS_NOTICE, readReviewConfig } from '../review/file.js'
import { DEFAULT_ENTRY, entryNames, pipelineOf, resolveEntry } from '../review/entry.js'
import {
  gitCommonDir,
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
  sha256,
  statusLinePath,
  withReviewLock,
  writeJsonAtomic,
  writeTextAtomic,
} from '../review/store.js'
import {
  buildSealCommit,
  pinSeal,
  sealArtifactHash,
  sealChangedPaths,
} from '../worktree/seal.js'
import {
  acquireApplyLocks,
  acquireStoreApplyLock,
  applyLockBlocker,
  applyLockBlockedError,
  gitWorktreeRoot,
  inspectApplyLocks,
  releaseApplyLocks,
} from '../review/apply-lock.js'
import { disposeFinding, summarizeFindings } from '../review/report.js'
import { draftReadiness } from '../review/readiness.js'
import { submitReport } from '../review/submit.js'
import { archiveDraftAttempt } from '../review/revision.js'
import { withReviewLockAsync } from '../review/store.js'
import { entrySeq, latestEntry, latestExtraRound, latestRound, nextRoundSeq, parseRoundToken, readReview, resolveRoundEntry, roundEntries, roundPrefix, roundRevisions, saveReview } from '../review/record.js'
import { clearDeadline, deadlineText, registerDeadline, sendWakeup, wakeTargets } from '../review/wakeup.js'
import { armRoundWatch, disarmRoundWatch } from '../review/watch.js'
import { optionalStore, renderJson, requireChange, sessionCwd } from './shared.js'
import { mainWorktreeRoot, readApplyState, writeApplyState } from '../worktree/state.js'

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
    review: { type: 'string', description: 'Configured review entry name; default draft.' },
    baseline: { type: 'string', enum: ['draft', 'none'], description: 'Apply review baseline; absent for draft reviews.' },
    state: { type: 'string', enum: ['not-started', 'in-review', 'passed', 'abandoned'] },
    mode: { type: 'string', enum: ['self', 'reviewer'] },
    independent: { type: 'boolean' },
    policy: { type: 'boolean', description: 'Whether the change policy carries an apply section.' },
    enabled: { type: 'boolean', description: 'Whether the change policy enables apply review.' },
    available: { type: 'boolean', description: 'Whether apply review can run in this project.' },
    coverageGap: { type: 'boolean' },
    reviewId: { type: 'string' },
    round: { type: 'number' },
    roundToken: { type: 'string', description: 'Extra round token E<n>; omitted for a normal round.' },
    extraRounds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['roundToken', 'round', 'verdict', 'hasReport', 'ready'],
        properties: {
          roundToken: { type: 'string' },
          round: { type: 'number' },
          verdict: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          hasReport: { type: 'boolean' },
          ready: { type: 'boolean' },
        },
      },
    },
    revisions: {
      type: 'array',
      description: 'Archived draft attempts; each names its round, cause and stored files.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['round', 'revision', 'objectHash', 'cause', 'archivedAt', 'briefPath'],
        properties: {
          round: { type: 'number' },
          revision: { type: 'number' },
          objectHash: { type: 'string' },
          cause: { type: 'string', enum: ['object-changed', 'blocked-report'] },
          archivedAt: { type: 'string' },
          briefPath: { type: 'string' },
          reportPath: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'changes-requested', 'blocked'] },
        },
      },
    },
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
    configNotice: {
      type: 'string',
      description: 'Present when the plugin row config still carries a reviews section; names the project review file.',
    },
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
    // 2.2.0 adds a --strict warning for a MODIFIED requirement past 500
    // characters. Defer that one warning to the actionable length gate so
    // callers keep their refusal message and gate order.
    const lengthWarning = strict
      && report.issues.length > 0
      && report.issues.every((issue) => /^MODIFIED\b[\s\S]*Requirement text is very long/u.test(String(issue.message ?? '')))
    if (!lengthWarning) {
      const details = report.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
      const refusal = strict
        ? `${label} refuses change '${change}' that does not pass strict validation`
        : `${label} refuses an invalid change`
      throw new Error(`${refusal}:\n${details}`)
    }
  }
  return { ...report, strict }
}

/**
 * Read the change deltas and the related main-spec requirement projections.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @param context - resolved change context.
 * @returns `{ deltas, mainSpecs }`, with `null` for a missing main spec.
 */
async function loadPlanInputs(ctx, settings, cwd, change, store, signal, context) {
  const { json } = await runOpenSpec(
    ctx,
    settings,
    cwd,
    withStore(['show', change, '--type', 'change', '--json'], store),
    signal,
  )
  throwIfOnlyStatus(json, ['deltas'])
  const deltas = Array.isArray(json.deltas) ? json.deltas : []
  const mainSpecsDir = join(dirname(dirname(context.changeRoot)), 'specs')
  const mainSpecs = new Map()
  const specs = new Set(deltas
    .map((delta) => (typeof delta?.spec === 'string' ? delta.spec : ''))
    .filter((spec) => spec !== ''))
  for (const spec of specs) {
    const segments = spec.split('/')
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) continue
    const mainSpecPath = join(mainSpecsDir, ...segments, 'spec.md')
    if (!existsSync(mainSpecPath)) {
      mainSpecs.set(spec, null)
      continue
    }
    const shown = await runOpenSpec(
      ctx,
      settings,
      cwd,
      withStore(['show', spec, '--type', 'spec', '--json'], store),
      signal,
    )
    throwIfOnlyStatus(shown.json, ['requirements'])
    mainSpecs.set(spec, Array.isArray(shown.json.requirements) ? shown.json.requirements : [])
  }
  return { deltas, mainSpecs }
}

/**
 * Read tasks.md for the execution preflight.
 * @param changeRoot - absolute change directory.
 * @returns the text, or an empty string when the file is absent.
 */
function readTasksText(changeRoot) {
  const path = join(changeRoot, 'tasks.md')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/**
 * Read the plan inputs once and classify both draft preflights.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @param context - resolved change context.
 * @returns `{ requirementLength, execution }`.
 */
async function loadPlanPreflights(ctx, settings, cwd, change, store, signal, context) {
  const { deltas, mainSpecs } = await loadPlanInputs(ctx, settings, cwd, change, store, signal, context)
  return {
    requirementLength: classifyRequirementLength(deltas, mainSpecs),
    execution: classifyExecutionPreflight({
      deltas,
      mainSpecs,
      tasksText: readTasksText(context.changeRoot),
      pathExists: (path) => existsSync(join(context.rootPath, path)),
    }),
  }
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
 * The card round fields of one entry.
 * @param entry - round entry.
 * @returns `{ round, roundToken? }`.
 */
function roundCardFields(entry) {
  const token = typeof entry?.round === 'string' ? entry.round : undefined
  return {
    round: entrySeq(entry),
    ...(token === undefined ? {} : { roundToken: token }),
  }
}

/**
 * Write one review card for a recorded round.
 * @param options - context, directory, kind, record, round, round token, phase,
 *   readiness, current hash and Session.
 * @returns true when the card file was written.
 */
function writeRoundCard(options) {
  const roundEntry = options.roundToken === undefined
    ? (options.record.rounds ?? []).find((entry) => entry.round === options.round)
    : resolveRoundEntry(options.record, options.roundToken)
  try {
    return writeCard({
      directory: options.directory,
      kind: options.kind,
      phase: options.phase,
      record: options.record,
      round: options.round,
      ...(options.roundToken === undefined ? {} : { roundToken: options.roundToken }),
      report: readRoundReport(options.directory, roundEntry),
      waiver: readPlanChangeWaiver(options.directory),
      readiness: options.readiness,
      currentHash: options.currentHash,
      session: options.session,
      logger: options.ctx?.logger,
    })
  } catch (error) {
    options.ctx?.logger?.warn?.(
      `openspec-flow: the review card could not be written: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
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
  if (record?.applyBaseCommit !== undefined) return true
  const policy = readPolicy(directory)
  const names = policy === undefined ? ['apply'] : entryNames(policy)
  return names.some((name) => entryOf(policy, name).object === 'tree'
    && readReview(directory, name) !== undefined)
}

/**
 * Map a policy review section to the mode and independence it implies.
 * @param section - policy review section, or undefined.
 * @returns `{ mode, independent }`.
 */
function reviewMode(section) {
  return section?.reviewers === 1
    ? { mode: 'reviewer', independent: true }
    : { mode: 'self', independent: false }
}

/**
 * Project the archived attempts of every draft round.
 * @param record - review record.
 * @returns `{ revisions }` when at least one attempt was archived, otherwise {}.
 */
function revisionSummary(record) {
  if (record?.review !== 'draft') return {}
  const entries = []
  for (const round of roundEntries(record)) {
    for (const revision of roundRevisions(round)) {
      entries.push({
        round: round.round,
        revision: revision.revision,
        objectHash: revision.objectHash,
        cause: revision.cause,
        archivedAt: revision.archivedAt,
        briefPath: revision.brief?.path,
        ...(revision.report === undefined
          ? {}
          : { reportPath: revision.report.path, verdict: revision.report.verdict }),
      })
    }
  }
  return entries.length === 0 ? {} : { revisions: entries }
}

/**
 * Build the model-facing result for a review record.
 * @param record - review record or undefined.
 * @param currentObjectHash - current artifact hash.
 * @param extra - fields for this action.
 * @returns the output value.
 */
function projectReview(record, currentObjectHash, extra = {}) {
  const round = latestEntry(record)
  const readiness = record === undefined
    ? { ready: false, reasons: ['the draft review has not started'], nextAction: 'openspec_review action=start' }
    : draftReadiness(record, currentObjectHash, record.review, extra.readinessOptions ?? {})
  const baseline = record?.baseline ?? extra.baseline ?? (record?.review === 'apply' ? 'draft' : undefined)
  return {
    change: record?.change ?? extra.change,
    review: record?.review ?? extra.review ?? 'draft',
    ...(baseline === undefined ? {} : { baseline }),
    state: record?.state ?? 'not-started',
    mode: record?.mode ?? extra.mode ?? 'self',
    independent: record === undefined ? extra.independent === true : record.independent === true,
    ...(extra.policy === undefined ? {} : { policy: extra.policy }),
    ...(extra.enabled === undefined ? {} : { enabled: extra.enabled }),
    ...(extra.available === undefined ? {} : { available: extra.available }),
    ...(record?.coverageGap === true ? { coverageGap: true } : {}),
    ...(record?.id === undefined ? {} : { reviewId: record.id }),
    ...(round === undefined ? {} : { round: latestRound(record)?.round ?? entrySeq(round) }),
    ...(round === undefined || typeof round.round !== 'string' ? {} : { roundToken: round.round }),
    ...(Array.isArray(record?.extraRounds) && record.extraRounds.length > 0
      ? {
          extraRounds: record.extraRounds.map((entry) => ({
            roundToken: entry.round,
            round: entrySeq(entry),
            verdict: typeof entry.verdict === 'string' ? entry.verdict : null,
            hasReport: entry.report !== undefined,
            ready: readiness.ready && entry === round,
          })),
        }
      : {}),
    ...(record?.objectHash === undefined ? {} : { objectHash: record.objectHash }),
    ...(currentObjectHash === undefined ? {} : { currentObjectHash }),
    ...(extra.brief === undefined ? {} : { brief: extra.brief }),
    ...(extra.report === undefined ? {} : { report: extra.report }),
    ...(extra.planChangeWaiver === undefined ? {} : { planChangeWaiver: extra.planChangeWaiver }),
    ...(record?.commitSha === undefined ? {} : { commitSha: record.commitSha }),
    ...(record?.treeSha === undefined ? {} : { treeSha: record.treeSha }),
    ...(record?.baseTreeSha === undefined ? {} : { baseTreeSha: record.baseTreeSha }),
    findings: summarizeFindings(record?.findings ?? []),
    ...revisionSummary(record),
    ...(extra.dispositions === undefined ? {} : { dispositions: extra.dispositions }),
    ready: extra.ready ?? readiness.ready,
    ...(extra.waitState === undefined ? {} : { waitState: extra.waitState }),
    reasons: extra.reasons ?? readiness.reasons,
    nextAction: extra.nextAction ?? readiness.nextAction,
    ...(extra.configNotice === undefined ? {} : { configNotice: extra.configNotice }),
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
 * Require a positive integer round or an extra round token when supplied.
 * @param args - tool arguments.
 * @param kind - review kind; draft has no extra rounds.
 * @returns the round token, or undefined.
 */
function optionalRound(args, kind = 'draft') {
  const value = args?.round
  if (value === undefined) return undefined
  const parsed = parseRoundToken(value)
  if (parsed === undefined) throw new Error('round must be a positive integer or an E<n> token')
  if (kind === 'draft' && parsed.kind === 'extra') {
    throw new Error('draft review has no extra rounds; round must be a positive integer')
  }
  return parsed.token
}

/**
 * Read the optional apply review baseline.
 * @param args - tool arguments.
 * @returns `draft`, `none`, or undefined when absent.
 * @throws when the value is not a supported baseline.
 */
function optionalBaseline(args) {
  const value = args?.baseline
  if (value === undefined) return undefined
  if (value !== 'draft' && value !== 'none') throw new Error('baseline must be draft or none')
  return value
}

/**
 * Read the optional review configuration path.
 * @param args - tool arguments.
 * @returns the trimmed path, or undefined when absent or blank.
 */
function optionalConfigPath(args) {
  const value = args?.configPath
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value.trim()
}

/**
 * Refuse a dispositions argument on start or resume.
 * @param args - tool arguments.
 * @param action - `start` or `resume`.
 * @returns nothing; throws when dispositions is present.
 */
function assertNoDispositions(args, action, kind) {
  if (args?.dispositions === undefined) return
  if (action === 'start') {
    throw new Error(`start does not accept dispositions; use openspec_review action=dispose review=${kind} after a report records findings`)
  }
  throw new Error(`resume does not accept dispositions; dispose findings with openspec_review action=dispose review=${kind} (or waive one with action=waive review=${kind}) before resuming`)
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
  const latest = latestEntry(record)
  if (latest === undefined || latest.report === undefined) {
    const action = record.mode === 'reviewer' ? 'wait' : 'self-report'
    return entryCommand(kind, action)
  }
  return readiness.nextAction
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
  throw new Error(`resume needs every finding disposed; still open: ${open.map((finding) => finding.id).join(', ')}. Run ${entryCommand(kind, 'dispose')} first.`)
}

/** The legacy entry table used when a policy has not been locked yet. */
const LEGACY_ENTRY_CONFIG = {
  reviews: {
    draft: { object: 'directory' },
    apply: { object: 'tree' },
  },
}

/**
 * Read the requested review entry name.
 * @param args - tool arguments.
 * @returns the entry name, default `draft`.
 */
function reviewKind(args) {
  const value = args?.review
  if (value === undefined) return DEFAULT_ENTRY
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('review must name a configured review entry')
  }
  return value.trim()
}

/**
 * Resolve one entry from a locked policy or the legacy entry table.
 * @param policy - locked policy, or undefined.
 * @param kind - entry name.
 * @returns the resolved entry.
 */
function entryOf(policy, kind) {
  return resolveEntry(policy ?? LEGACY_ENTRY_CONFIG, kind)
}

/**
 * Resolve the entry a tool call names.
 *
 * Start and resume may resolve an entry declared by the project file before the
 * policy records it; every other action resolves only the locked policy (or the
 * legacy table) so an unknown entry is refused before a record is read.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param options - `requireConfig` reads the project file when the policy does
 *   not declare the entry.
 * @returns the resolved entry.
 */
function entryForArgs(cwd, args, options = {}) {
  const change = requireChange(args)
  const store = optionalStore(args)
  const policy = readPolicy(reviewDirectory(cwd, store, change))
  const kind = reviewKind(args)
  try {
    return entryOf(policy, kind)
  } catch (error) {
    const configPath = optionalConfigPath(args)
    if (policy !== undefined && configPath === undefined) {
      if (kind === 'draft' || kind === 'apply') return resolveEntry(LEGACY_ENTRY_CONFIG, kind)
      throw error
    }
    let config
    try {
      config = requireReviewConfig(readReviewConfig(cwd, {
        configPath,
      }))
    } catch (configError) {
      throw options.requireConfig === true ? configError : error
    }
    return resolveEntry(config.value, kind)
  }
}

/**
 * The ` review=<entry>` suffix for a next action.
 * @param kind - entry name.
 * @returns the suffix, empty for draft.
 */
function entryArg(kind) {
  return kind === DEFAULT_ENTRY ? '' : ` review=${kind}`
}

/**
 * Build a review next-action command for one entry.
 * @param kind - entry name.
 * @param action - tool action.
 * @returns the command.
 */
function entryCommand(kind, action) {
  return `openspec_review action=${action}${entryArg(kind)}`
}

/**
 * Build a next-action command that always names the entry.
 * @param kind - entry name.
 * @param action - tool action.
 * @returns the command.
 */
function explicitEntryCommand(kind, action) {
  return `openspec_review action=${action} review=${kind}`
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
async function messageReviewer(ctx, parent, change, kind, round, agentId, signal, options = {}) {
  const subagents = ctx.get?.('subagents') ?? ctx.subagents
  if (subagents === undefined || typeof subagents.sendMessage !== 'function') {
    throw new Error('the reviewer service is unavailable')
  }
  if (parent === undefined || parent === null) throw new Error('the reviewer needs the changer agent')
  const text = options.refresh === true
    ? `The draft attempt for change ${change} was archived and round ${String(round)} is refreshed with the current artifacts. Call openspec_reviewer with action="read", target="brief", change="${change}", review="${kind}" and submit your report.`
    : `A new ${kind} review round ${String(round)} is ready for change ${change}. Call openspec_reviewer with action="read", target="brief", change="${change}", review="${kind}" and submit your report.`
  await subagents.sendMessage(parent, agentId, [{ type: 'text', text }], { signal })
}

/**
 * Arm the draft round watch and deliver its one notice.
 *
 * The notice is advisory: it asks the slot reviewer to submit a blocked report
 * for the round the watch was armed for and never writes review content. A
 * missing changer agent, an unavailable subagent service or a lock held by a
 * concurrent resume only logs a warning; `resume` still closes the round.
 *
 * @param options - host context, review directory, change, change root, intent,
 *   round, bound hash and the changer agent.
 * @returns nothing.
 */
function armDraftRoundWatch(options) {
  const {
    ctx, directory, change, changeRoot, intent, round, hash,
  } = options
  const kind = options.kind ?? DEFAULT_ENTRY
  armRoundWatch({
      directory,
      kind,
      changeRoot,
      intent,
      round,
      hash,
      logger: ctx.logger,
      onStale: async ({ round: staleRound, from, to }) => {
        const notice = await withReviewLockAsync(directory, `${kind}-watch-notice`, () => {
            const current = readReview(directory, kind)
            if (current === undefined) return undefined
            if (current.state === 'passed' || current.state === 'abandoned') return undefined
            const latest = latestEntry(current)
            if (latest === undefined || latest.round !== staleRound || latest.report !== undefined) return undefined
            if (current.staleNotice?.to === to) return undefined
            if (current.staleNotice?.to === undefined && current.staleNotice?.round === staleRound) return undefined
            const notice = {
              round: staleRound,
              from: latest.objectHash,
              to,
              at: new Date().toISOString(),
            }
            current.staleNotice = notice
            latest.notices = Array.isArray(latest.notices) ? latest.notices : []
            latest.notices.push(notice)
            saveReview(directory, current, kind)
            return {
              changerSessionId: current.changerSessionId,
              agentId: current.reviewers?.slots?.[0]?.agentId,
            }
        })
        if (notice === undefined || notice.agentId === undefined) return
        const agents = ctx.get?.('agents') ?? ctx.agents
        const sender = typeof notice.changerSessionId === 'string'
          ? agents?.get?.(notice.changerSessionId)
          : undefined
        if (sender === undefined) {
          ctx.logger?.warn?.('openspec-flow: the draft watch notice has no live changer agent; the message was skipped')
          return
        }
        await sendWakeup(
          ctx,
          sender,
          [notice.agentId],
          `The draft artifacts for change ${change} changed after draft round ${String(staleRound)} started (${from.slice(0, 8)} to ${to.slice(0, 8)}). Do not review the new content under that round. Submit verdict "blocked" with round: ${String(staleRound)} and a one-line summary.`,
        )
      },
    })
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
async function startReview(ctx, settings, cwd, args, signal, parent, entry) {
  return entry.object === 'directory'
    ? draftReviewEntry(ctx, settings, cwd, args, signal, parent, 'start', entry.name)
    : applyReviewEntry(ctx, settings, cwd, args, signal, parent, 'start', entry.name)
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
async function resumeDraftReview(ctx, settings, cwd, args, signal, parent, entry) {
  return entry.object === 'directory'
    ? draftReviewEntry(ctx, settings, cwd, args, signal, parent, 'resume', entry.name)
    : applyReviewEntry(ctx, settings, cwd, args, signal, parent, 'resume', entry.name)
}

/**
 * Whether one draft attempt carries a substantive report.
 * @param round - round entry.
 * @returns true for a pass or changes-requested report.
 */
function isSubstantiveDraftReport(round) {
  const verdict = round?.report?.verdict ?? round?.verdict
  return verdict === 'pass' || verdict === 'changes-requested'
}

/**
 * Whether one draft attempt carries a blocked report.
 * @param round - round entry.
 * @returns true for a blocked report.
 */
function isBlockedDraftAttempt(round) {
  const verdict = round?.report?.verdict ?? round?.verdict
  return verdict === 'blocked'
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
async function draftReviewEntry(ctx, settings, cwd, args, signal, parent, mode, kind) {
  const first = mode === 'start'
  assertNoDispositions(args, first ? 'start' : 'resume', kind)
  const change = requireChange(args)
  const store = optionalStore(args)
  const requestedRound = optionalRound(args)
  if (!first && typeof args?.intent === 'string' && args.intent.trim() !== '') {
    throw new Error(`resume takes no intent; pass the user goal and acceptance conditions to ${entryCommand(kind, 'start')}`)
  }
  const intentArgument = first ? requireIntent(args) : undefined
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  if (first) {
    assertNoReviewRecord(directory, kind)
  } else {
    const existing = requireReviewRecord(directory, kind)
    if (applyStarted(directory, existing)) {
      throw new Error(`the ${kind} review cannot be resumed once apply started; review a plan change with openspec_review action=start review=apply and a recorded user waiver`)
    }
  }
  await validateChange(ctx, settings, cwd, change, store, signal)
  const { requirementLength, execution } = await loadPlanPreflights(ctx, settings, cwd, change, store, signal, context)
  const resolveModel = modelResolver({ ctx, agent: parent })
  const configNotice = settings?.legacyReviews === true ? LEGACY_REVIEWS_NOTICE : undefined
  let lockedPolicy
  const explicitConfig = optionalConfigPath(args)
  if (first) {
    const existing = readPolicy(directory)
    const needsConfig = existing === undefined
      || explicitConfig !== undefined
      || (existing.reviews?.[kind] !== undefined && existing.reviews[kind].reviewerModel === undefined)
    const reviewConfig = needsConfig
      ? requireReviewConfig(readReviewConfig(context.rootPath, { configPath: explicitConfig }))
      : undefined
    const locked = ensurePolicy({
      projectRoot: context.rootPath,
      change,
      store,
      config: reviewConfig?.value,
      source: reviewConfig?.source,
      gitEnabled: isGitRepository(context.rootPath),
      lockedBy: 'first-review',
      resolveModel,
    })
    lockedPolicy = existing !== undefined && explicitConfig !== undefined && reviewConfig?.value !== undefined
      ? supplementPolicy(locked.directory, locked.policy, {
        config: reviewConfig.value,
        resolveModel,
      })
      : locked.policy
    lockedPolicy = ensureReviewerModel(locked.directory, lockedPolicy, {
      config: reviewConfig?.value,
      resolveModel,
    })
  } else {
    const existingPolicy = readPolicy(directory)
    if (existingPolicy === undefined) {
      throw new Error(`the ${kind} review policy is missing; remove the review record before running ${entryCommand(kind, 'start')} again`)
    }
    const needsConfig = (existingPolicy.reviews?.[kind] !== undefined
      && existingPolicy.reviews[kind].reviewerModel === undefined)
      || explicitConfig !== undefined
    const reviewConfig = needsConfig
      ? requireReviewConfig(readReviewConfig(context.rootPath, {
        configPath: explicitConfig,
      }))
      : undefined
    lockedPolicy = explicitConfig !== undefined && reviewConfig?.value !== undefined
      ? supplementPolicy(directory, existingPolicy, {
        config: reviewConfig.value,
        resolveModel,
      })
      : existingPolicy
    lockedPolicy = ensureReviewerModel(directory, lockedPolicy, {
      config: reviewConfig?.value,
      resolveModel,
    })
  }
  const policy = entryOf(lockedPolicy, kind).section
  if (!policy.enabled) throw new Error(`${kind} review is disabled for this change`)
  let intent
  if (first) {
    intent = intentArgument
  } else {
    intent = readIntent(directory)
    if (intent === undefined) {
      throw new Error(`the review intent file is missing; remove the review record before running ${entryCommand(kind, 'start')} again`)
    }
    const recorded = readReview(directory, kind)
    if (recorded?.intent?.sha256 !== undefined && recorded.intent.sha256 !== sha256(intent)) {
      throw new Error(`the review intent file changed after the review started; remove the review record before running ${entryCommand(kind, 'start')} again`)
    }
  }
  const object = draftObject(context.changeRoot, intent)

  return withReviewLockAsync(directory, mode, async () => {
    let round
    let isNewRound = false
    let record
    if (first) {
      assertNoReviewRecord(directory, kind)
      writeTextAtomic(join(directory, INTENT_FILE), intent)
      const id = `${kind}-${randomUUID()}`
      record = {
        schemaVersion: 1,
        id,
        change,
        store: store ?? null,
        review: kind,
        object: 'directory',
        criteria: criteriaOf(policy),
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
        length: requirementLength,
        execution,
        limits: { waitMinutes: policy.waitMinutes },
        rounds: [],
        findings: [],
        createdAt: new Date().toISOString(),
      }
    } else {
      record = requireReviewRecord(directory, kind)
      if (record.state === 'abandoned') {
        throw new Error(`the ${kind} review was abandoned; start a new change or remove its review record`)
      }
      if (record.state === 'passed' && record.objectHash === object.objectHash) {
        return projectReview(record, object.objectHash, { brief: readText(join(directory, latestRound(record).brief.path)) })
      }
      record.length = requirementLength
      record.execution = execution
    }
    const last = latestRound(record)
    const substantive = last !== undefined && isSubstantiveDraftReport(last)
    const blockedAttempt = last !== undefined && isBlockedDraftAttempt(last)
    if (substantive) assertNoOpenFindings(record, kind)
    const reuse = last !== undefined && last.report === undefined
      && last.objectHash === object.objectHash
    const refresh = last !== undefined && !substantive && !reuse
    const plannedRound = (reuse || refresh) ? last.round : (record.rounds?.length ?? 0) + 1
    if (requestedRound !== undefined && requestedRound !== plannedRound) {
      throw new Error(`the next draft review round is ${String(plannedRound)}, not ${String(requestedRound)}`)
    }
    let refreshed = false
    if (refresh) {
      archiveDraftAttempt({
        directory,
        round: last,
        kind,
        cause: blockedAttempt ? 'blocked-report' : 'object-changed',
        notice: last.notices?.at(-1) ?? record.staleNotice,
      })
      round = last.round
      refreshed = true
    } else if (reuse) {
      round = last.round
    }
    if (round === undefined) {
      const next = (record.rounds?.length ?? 0) + 1
      round = next
      record.rounds = Array.isArray(record.rounds) ? record.rounds : []
      record.rounds.push({
        round,
        seq: nextRoundSeq(record),
        objectHash: object.objectHash,
        artifactHash: object.artifactHash,
        artifactFiles: object.files,
        startedAt: new Date().toISOString(),
      })
      isNewRound = true
    }
    if (reuse) last.startedAt = new Date().toISOString()
    if (refreshed) {
      last.objectHash = object.objectHash
      last.artifactHash = object.artifactHash
      last.artifactFiles = object.files
      last.startedAt = new Date().toISOString()
    }
    record.objectHash = object.objectHash
    record.artifactHash = object.artifactHash
    record.artifactFiles = object.files
    record.state = 'in-review'
    const currentRound = resolveRoundEntry(record, round)
    const briefText = buildDraftBrief({
      change,
      review: kind,
      objectHash: object.objectHash,
      intentHash: object.intentHash,
      files: object.files,
      projectRoot: context.rootPath,
      requirementLength,
      execution,
      round,
      findings: record.findings ?? [],
      criteria: record.criteria,
    })
    const roundDir = `${roundPrefix(kind)}-${String(round)}`
    const briefPath = `${roundDir}/brief.md`
    const briefFile = join(directory, briefPath)
    mkdirSync(join(directory, roundDir), { recursive: true })
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
          kind,
          1,
          signal,
          policy.reviewerModel,
        )
        record.reviewers = {
          count: 1,
          slots: [{ slot: 1, agentId: childId, state: 'pending', startedAt: new Date().toISOString(), round }],
        }
      } else if (isNewRound || refreshed) {
        await messageReviewer(ctx, parent, change, kind, round, slot.agentId, signal, { refresh: refreshed })
        slot.state = 'pending'
        slot.round = round
        slot.lastWokenAt = new Date().toISOString()
      }
    }
    clearDeadline(directory, kind)
    if (typeof parent?.id === 'string' && parent.id !== '') record.changerSessionId = parent.id
    saveReview(directory, record, kind)
    if (policy.reviewers === 1 && currentRound.report === undefined) {
      armDraftRoundWatch({
        ctx,
        directory,
        kind,
        change,
        changeRoot: context.changeRoot,
        intent,
        round,
        hash: object.objectHash,
        parent,
      })
    }
    if (isNewRound && last?.report !== undefined && (record.findings?.length ?? 0) > 0) {
      const cardReadiness = draftReadiness(record, object.objectHash, kind)
      writeRoundCard({
        ctx,
        directory,
        kind,
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
      nextAction: entryCommand(kind, policy.reviewers === 1 ? 'wait' : 'self-report'),
      ...(configNotice === undefined ? {} : { configNotice }),
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
async function startApplyReview(ctx, settings, cwd, args, signal, parent, entry) {
  return applyReviewEntry(ctx, settings, cwd, args, signal, parent, 'start', entry.name)
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
async function resumeApplyReview(ctx, settings, cwd, args, signal, parent, entry) {
  return applyReviewEntry(ctx, settings, cwd, args, signal, parent, 'resume', entry.name)
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
async function applyReviewEntry(ctx, settings, cwd, args, signal, parent, mode, kind) {
  const first = mode === 'start'
  assertNoDispositions(args, first ? 'start' : 'resume', kind)
  const change = requireChange(args)
  const store = optionalStore(args)
  const requestedRound = optionalRound(args, kind)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  if (!isGitRepository(context.rootPath)) {
    throw new Error(`${kind} review is unavailable: this project has no git repository`)
  }
  const worktreeRoot = gitWorktreeRoot(context.rootPath) ?? context.rootPath
  const changePath = worktreeRelative(context.rootPath, context.changeRoot) ?? ''
  const status = gitStatus(worktreeRoot)
  if (status === undefined) throw new Error(`${kind} review could not read the working tree status`)
  const remaining = filterUnrelatedChangeStatus(status, changePath)
  if (remaining.length > 0) {
    throw new Error(`${kind} review needs a clean working tree; commit or stash these changes first:\n${remaining.join('\n')}`)
  }
  const commitSha = gitCommit(context.rootPath)
  if (commitSha === undefined) throw new Error(`${kind} review needs a commit; HEAD could not be resolved`)
  const treeSha = gitTree(context.rootPath, commitSha)
  if (treeSha === undefined) throw new Error(`${kind} review could not resolve the commit tree`)
  const directory = reviewDirectory(context.rootPath, store, change)
  let existingRecord
  if (first) {
    assertNoReviewRecord(directory, kind)
  } else {
    existingRecord = requireReviewRecord(directory, kind)
  }
  const existingPolicy = readPolicy(directory)
  const beforeApplyName = existingPolicy === undefined
    ? 'draft'
    : pipelineOf(existingPolicy).beforeApply
  const draftRecord = readReview(directory, beforeApplyName)
  if (existingRecord?.state === 'abandoned') {
    throw new Error(`the ${kind} review was abandoned; start a new change or remove its review record`)
  }
  if (existingPolicy?.reviews?.[kind] !== undefined && existingPolicy.reviews[kind].enabled === false) {
    throw new Error(`${kind} review is disabled for this change`)
  }
  if (!first && existingPolicy === undefined) {
    throw new Error(`the ${kind} review policy is missing; remove the review record before running ${entryCommand(kind, 'start')} again`)
  }
  const validation = await validateChange(ctx, settings, cwd, change, store, signal, { strict: true })

  const { requirementLength, execution } = await loadPlanPreflights(ctx, settings, cwd, change, store, signal, context)
  if (requirementLength.blocking) {
    throw new Error(lengthGateMessage(
      requirementLength,
      change,
      `${kind} review`,
      first ? entryCommand(kind, 'start') : entryCommand(kind, 'resume'),
    ))
  }
  if (execution.blocking) {
    throw new Error(executionGateMessage(
      execution,
      change,
      `${kind} review`,
      first ? entryCommand(kind, 'start') : entryCommand(kind, 'resume'),
    ))
  }

  const resolveModel = modelResolver({ ctx, agent: parent })
  const configNotice = settings?.legacyReviews === true ? LEGACY_REVIEWS_NOTICE : undefined
  let policy
  const explicitConfig = optionalConfigPath(args)
  if (first) {
    const needsConfig = existingPolicy === undefined
      || explicitConfig !== undefined
      || (existingPolicy.reviews?.[kind] !== undefined
        && existingPolicy.reviews[kind].reviewerModel === undefined)
    const reviewConfig = needsConfig
      ? requireReviewConfig(readReviewConfig(context.rootPath, { configPath: explicitConfig }))
      : undefined
    const locked = ensurePolicy({
      projectRoot: context.rootPath,
      change,
      store,
      config: reviewConfig?.value,
      source: reviewConfig?.source,
      gitEnabled: true,
      lockedBy: 'first-review',
      resolveModel,
    })
    const base = existingPolicy !== undefined && explicitConfig !== undefined && reviewConfig?.value !== undefined
      ? supplementPolicy(locked.directory, locked.policy, {
        config: reviewConfig.value,
        resolveModel,
      })
      : locked.policy
    policy = ensureReviewerModel(
      locked.directory,
      kind === 'apply' && reviewConfig?.value !== undefined
        ? ensureApplyPolicy(locked.directory, base, { config: reviewConfig.value })
        : base,
      { config: reviewConfig?.value, resolveModel },
    )
  } else {
    const needsMigration = (existingPolicy.reviews?.[kind] !== undefined
      && existingPolicy.reviews[kind].reviewerModel === undefined)
      || explicitConfig !== undefined
    const reviewConfig = needsMigration
      ? requireReviewConfig(readReviewConfig(context.rootPath, { configPath: explicitConfig }))
      : undefined
    const base = explicitConfig !== undefined && reviewConfig?.value !== undefined
      ? supplementPolicy(directory, existingPolicy, {
        config: reviewConfig.value,
        resolveModel,
      })
      : existingPolicy
    policy = ensureReviewerModel(
      directory,
      kind === 'apply' && reviewConfig?.value !== undefined
        ? ensureApplyPolicy(directory, base, { config: reviewConfig.value })
        : base,
      { config: reviewConfig?.value, resolveModel },
    )
  }
  const apply = entryOf(policy, kind).section
  if (!apply.enabled) throw new Error(`${kind} review is disabled for this change`)

  const draftPolicyEnabled = entryOf(policy, pipelineOf(policy).beforeApply).section.enabled
  const requestedBaseline = optionalBaseline(args)
  const recordedBaseline = existingRecord?.baseline ?? 'draft'
  const baseline = first
    ? (requestedBaseline ?? (draftPolicyEnabled ? 'draft' : 'none'))
    : (requestedBaseline ?? recordedBaseline)
  if (!first && requestedBaseline !== undefined && requestedBaseline !== recordedBaseline) {
    throw new Error(`the apply review baseline is ${recordedBaseline}; resume with that baseline or omit it`)
  }
  if (first && requestedBaseline === 'draft' && !draftPolicyEnabled) {
    throw new Error('the draft review is disabled for this change; use baseline none')
  }
  if (first && baseline === 'none' && draftRecord !== undefined) {
    throw new Error('an explicit no-draft baseline is refused for a change that already has a draft review; use the draft baseline')
  }

  let intent
  let planDrift
  let planWaiver
  if (baseline === 'draft' && draftPolicyEnabled) {
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
        const waiverChangePath = relativeChangePath(context.rootPath, context.changeRoot)
        const normalization = normalizeWaiverFiles(planWaiver?.files, {
          changeRoot: context.changeRoot,
          changePath: waiverChangePath,
        })
        const covered = new Set(normalization.files)
        if (planWaiver !== undefined) planWaiver = { ...planWaiver, files: normalization.files }
        const unwaived = planDrift.files.filter((file) => !covered.has(file.path)).map((file) => file.path)
        if (unwaived.length > 0) {
          throw new Error(
            `the apply review needs a user waiver for the changed plan files: ${unwaived.join(', ')}. `
            + `Run openspec_review action=waive scope=plan-change with files: ${JSON.stringify(unwaived)} `
            + '(relative to the change directory; absolute and project-relative forms under the change directory are also accepted).',
          )
        }
      }
    }
  }
  const explicitBase = typeof args?.base === 'string' && args.base.trim() !== '' ? args.base.trim() : undefined
  if (requestedBaseline === 'none' && explicitBase === undefined) {
    throw new Error('an explicit no-draft apply review needs a non-empty base')
  }
  const baseCommit = explicitBase
    ?? (baseline === 'draft' ? draftRecord?.applyBaseCommit : existingRecord?.baseCommit)
    ?? gitMergeBase(context.rootPath, 'HEAD', 'origin/main')
  if (baseCommit === undefined) {
    throw new Error('apply review could not determine a base commit; pass base=<commit>')
  }
  const baseSource = explicitBase !== undefined
    ? 'explicit'
    : baseline === 'draft' && draftRecord?.applyBaseCommit !== undefined
      ? 'seal'
      : baseline === 'none' && existingRecord?.baseCommit !== undefined
        ? existingRecord.baseSource
        : 'merge-base'
  const baseTreeSha = gitTree(context.rootPath, baseCommit)
  if (baseTreeSha === undefined) throw new Error(`apply review could not resolve base '${baseCommit}'`)
  const diffText = gitDiff(context.rootPath, baseTreeSha, treeSha)
  if (diffText === undefined) throw new Error('apply review could not generate the tree diff')

  const worktreeApply = settings?.worktree?.enabled !== false && isGitRepository(context.rootPath)
  const acquired = worktreeApply
    ? (store !== undefined
      ? acquireStoreApplyLock({
        cwd,
        resolvedRoot: context.rootPath,
        implementationRoot: mainWorktreeRoot(cwd) ?? cwd,
        store,
        change,
        changeRoot: context.changeRoot,
      })
      : { locks: [], created: [] })
    : acquireApplyLocks({
      cwd,
      resolvedRoot: context.rootPath,
      store,
      change,
      changeRoot: context.changeRoot,
    })
  try {
    return await withReviewLockAsync(directory, `${mode}-${kind}`, async () => {
    let isNewRound = false
    let round
    let record
    if (first) {
      assertNoReviewRecord(directory, kind)
      record = {
        schemaVersion: 1,
        id: `${kind}-${randomUUID()}`,
        change,
        store: store ?? null,
        review: kind,
        object: 'tree',
        baseline,
        criteria: criteriaOf(apply),
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
        baseSource: baseSource,
        ...(intent === undefined ? {} : { intent: { path: INTENT_FILE, sha256: sha256(intent) } }),
        ...(planDrift === undefined ? {} : { draftDrift: planDrift }),
        limits: { waitMinutes: apply.waitMinutes },
        rounds: [],
        findings: [],
        createdAt: new Date().toISOString(),
      }
    } else {
      record = requireReviewRecord(directory, kind)
      if (record.state === 'abandoned') {
        throw new Error('the apply review was abandoned; start a new change or remove its review record')
      }
      if (record.baseline === undefined) record.baseline = baseline
      record.baseSource = baseSource
      if (record.state === 'passed' && record.treeSha === treeSha && record.rebaseReview === undefined) {
        return projectReview(record, treeSha, {
          review: kind,
          brief: readText(join(directory, latestRound(record).brief.path)),
        })
      }
    }
    const marker = record.rebaseReview
    const lastNormal = latestRound(record)
    const previous = latestEntry(record)
    if (marker !== undefined && treeSha === marker.treeSha) {
      // The rebased tree equals the reviewed tree; no recovery round is needed.
      delete record.rebaseReview
      record.objectHash = treeSha
      record.commitSha = commitSha
      record.treeSha = treeSha
      record.baseTreeSha = baseTreeSha
      record.baseCommit = baseCommit
      record.baseSource = baseSource
      saveReview(directory, record, kind)
      const reviewed = latestEntry(record)
      return projectReview(record, treeSha, {
        review: kind,
        brief: reviewed === undefined ? '' : readText(join(directory, reviewed.brief.path)) ?? '',
      })
    }
    if (marker !== undefined) {
      assertNoOpenFindings(record, kind)
      const lastExtra = latestExtraRound(record)
      if (lastExtra !== undefined && lastExtra.report === undefined) {
        round = lastExtra.round
        lastExtra.objectHash = treeSha
        lastExtra.commitSha = commitSha
        lastExtra.treeSha = treeSha
        lastExtra.baseTreeSha = baseTreeSha
        lastExtra.startedAt = new Date().toISOString()
      } else {
        if (lastExtra !== undefined) {
          const extraReadiness = draftReadiness(record, treeSha, kind)
          if (extraReadiness.ready) {
            return projectReview(record, treeSha, {
              review: kind,
              brief: readText(join(directory, lastExtra.brief.path)) ?? '',
            })
          }
          assertNoOpenFindings(record, kind)
        }
        const next = (record.extraRounds?.length ?? 0) + 1
        round = `E${next}`
        record.extraRounds = Array.isArray(record.extraRounds) ? record.extraRounds : []
        record.extraRounds.push({
          round,
          seq: nextRoundSeq(record),
          objectHash: treeSha,
          commitSha,
          treeSha,
          baseTreeSha,
          startedAt: new Date().toISOString(),
        })
        isNewRound = true
      }
    } else if (lastNormal !== undefined && lastNormal.report === undefined) {
      // An apply round keeps rebinding an unreported round: its object is the
      // committed tree and a moved head is handled by the rebase extra-round
      // marker; only a draft round closes as blocked.
      round = lastNormal.round
      lastNormal.objectHash = treeSha
      lastNormal.commitSha = commitSha
      lastNormal.treeSha = treeSha
      lastNormal.baseTreeSha = baseTreeSha
      lastNormal.startedAt = new Date().toISOString()
    } else {
      if (lastNormal !== undefined && lastNormal.report !== undefined) assertNoOpenFindings(record, kind)
      const next = (record.rounds?.length ?? 0) + 1
      round = next
      record.rounds = Array.isArray(record.rounds) ? record.rounds : []
      record.rounds.push({
        round,
        seq: nextRoundSeq(record),
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
    const prefix = roundPrefix(kind)
    const roundDirectory = join(directory, `${prefix}-${String(round)}`)
    mkdirSync(roundDirectory, { recursive: true })
    const diffPath = `${prefix}-${String(round)}/diff.patch`
    writeTextAtomic(join(directory, diffPath), diffText)
    const changedPaths = diffText.split('\n')
      .filter((line) => line.startsWith('+++ b/'))
      .map((line) => line.slice('+++ b/'.length))
    const briefText = buildApplyBrief({
      review: kind,
      change,
      commitSha,
      treeSha,
      baseCommit,
      baseSource: baseSource,
      baseTreeSha,
      diffPath: join(directory, diffPath),
      changedPaths,
      validation,
      baseline,
      planDrift,
      planWaiver,
      round,
      findings: record.findings ?? [],
      criteria: record.criteria,
      intentPath: intent === undefined ? undefined : join(directory, INTENT_FILE),
      intentHash: intent === undefined ? undefined : sha256(intent),
    })
    const briefPath = `${prefix}-${String(round)}/brief.md`
    writeTextAtomic(join(directory, briefPath), briefText)
    const currentRound = resolveRoundEntry(record, round)
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
          kind,
          1,
          signal,
          apply.reviewerModel,
        )
        record.reviewers = {
          count: 1,
          slots: [{ slot: 1, agentId: childId, state: 'pending', startedAt: new Date().toISOString(), round }],
        }
      } else if (isNewRound) {
        await messageReviewer(ctx, parent, change, kind, round, slot.agentId, signal)
        slot.state = 'pending'
        slot.round = round
        slot.lastWokenAt = new Date().toISOString()
      }
    }
    clearDeadline(directory, kind)
    if (typeof parent?.id === 'string' && parent.id !== '') record.changerSessionId = parent.id
    saveReview(directory, record, kind)
    if (isNewRound && previous?.report !== undefined && (record.findings?.length ?? 0) > 0) {
      const cardReadiness = draftReadiness(record, treeSha, kind)
      writeRoundCard({
        ctx,
        directory,
        kind,
        record,
        ...roundCardFields(previous),
        phase: 'resolution',
        readiness: cardReadiness,
        currentHash: treeSha,
        session: parent?.session,
      })
    }
    return projectReview(record, treeSha, {
      review: kind,
      brief: briefText,
      nextAction: apply.reviewers === 1 ? entryCommand(kind, 'wait') : entryCommand(kind, 'self-report'),
      ...(configNotice === undefined ? {} : { configNotice }),
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
  const round = optionalRound(args, kind)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const existing = readReview(directory, kind)
  if (existing === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  const policy = readPolicy(directory)
  const entry = entryOf(policy, kind)
  const section = policy === undefined ? undefined : entry.section
  if (section === undefined || !section.enabled) throw new Error(`${kind} review is disabled for this change`)
  if (section.reviewers !== 0) throw new Error(`independent reviewers use openspec_reviewer, not self-report`)
  let currentHash
  if (entry.object === 'tree') {
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
    const current = latestEntry(record)
    if (current === undefined) throw new Error(`the ${kind} review has no round`)
    if (round !== undefined && round !== current.round) {
      throw new Error(`the current ${kind} round is ${String(current.round)}, not ${String(round)}`)
    }
    if (currentHash !== current.objectHash) {
      throw new Error(`the ${kind} object changed since this round started; run ${explicitEntryCommand(kind, 'resume')} to open the next round`)
    }
    const result = submitReport({
      directory,
      kind,
      record,
      report: args?.report,
      currentHash,
      readinessOptions: { applyStarted: entry.object === 'directory' && applyStarted(directory, record) },
    })
    const latest = latestEntry(result.record)
    if (latest !== undefined) {
      writeRoundCard({
        ctx,
        directory,
        kind,
        record: result.record,
        ...roundCardFields(latest),
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
  const policy = readPolicy(directory)
  const explicitConfig = optionalConfigPath(args)
  let entry
  try {
    entry = entryOf(policy, kind)
  } catch (error) {
    if (policy === undefined || explicitConfig !== undefined) {
      const config = requireReviewConfig(readReviewConfig(context.rootPath, {
        configPath: explicitConfig,
      }))
      entry = resolveEntry(config.value, kind)
    } else if (kind === 'draft' || kind === 'apply') {
      entry = resolveEntry(LEGACY_ENTRY_CONFIG, kind)
    } else {
      throw error
    }
  }
  const record = readReview(directory, kind)
  if (entry.object === 'tree') {
    const hasEntry = policy?.reviews?.[kind] !== undefined
    const enabled = hasEntry && entry.section.enabled
    const available = isGitRepository(context.rootPath)
    if (!available) {
      return projectReview(record, undefined, {
        change,
        review: kind,
        policy: hasEntry,
        enabled,
        available: false,
        reasons: [`${kind} review is unavailable: this project has no git repository`],
        nextAction: 'openspec_archive',
      })
    }
    if (!hasEntry) {
      return projectReview(record, undefined, {
        change,
        review: kind,
        policy: false,
        enabled: false,
        available: true,
        reasons: [`no ${kind} review policy is locked; the first start or resume with configPath supplements it once`],
        nextAction: `${explicitEntryCommand(kind, 'start')} configPath=openspec/reviews.json`,
      })
    }
    if (!enabled) {
      return projectReview(record, undefined, {
        change,
        review: kind,
        policy: true,
        enabled: false,
        available: true,
        reasons: [`${kind} review is disabled for this change`],
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
        ...reviewMode(entry.section),
        reasons: [`the ${kind} review has not started`],
        nextAction: explicitEntryCommand(kind, 'start'),
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
      ...(entry.section.enabled === true ? reviewMode(entry.section) : {}),
      nextAction: explicitEntryCommand(kind, 'start'),
    })
  }
  const intent = readIntent(directory)
  const currentObjectHash = intent === undefined ? undefined : draftObject(context.changeRoot, intent).objectHash
  const started = applyStarted(directory, record)
  const archiveEntry = pipelineOf(policy ?? LEGACY_ENTRY_CONFIG).beforeArchive
  return projectReview(record, currentObjectHash, {
    change,
    review: kind,
    readinessOptions: {
      ...(started ? { ignoreStale: true, readyAction: explicitEntryCommand(archiveEntry, 'status') } : {}),
      applyStarted: started,
    },
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
async function readReport(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  entryOf(readPolicy(directory), kind)
  const record = readReview(directory, kind)
  if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  const requested = optionalRound(args, kind)
  const entry = requested === undefined ? latestEntry(record) : resolveRoundEntry(record, requested)
  if (entry?.report === undefined) throw new Error(`round ${String(requested ?? 'current')} has no report`)
  const report = readJson(join(directory, entry.report.path))
  return projectReview(record, entry.objectHash, { report, review: kind })
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
  const action = waived ? 'waive' : 'dispose'
  const kind = args?.review === undefined ? undefined : reviewKind(args)
  const store = optionalStore(args)
  const entries = dispositionEntries(args, waived)
  const batch = args?.dispositions !== undefined
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const policy = readPolicy(directory)
  if (kind === undefined) {
    const listed = entryNames(policy ?? LEGACY_ENTRY_CONFIG)
    throw new Error(`openspec_review action=${action} needs review; configured entries: ${listed.join(', ')}`)
  }
  const requestedRound = optionalRound(args, kind)
  const resolved = entryOf(policy, kind)
  return withReviewLock(directory, `${kind}-${waived ? 'waive' : 'dispose'}`, () => {
    const record = readReview(directory, kind)
    if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    if (requestedRound !== undefined) {
      const target = resolveRoundEntry(record, requestedRound)
      if (target === undefined) throw new Error(`round ${String(requestedRound)} is not recorded`)
      const latest = latestEntry(record)
      if (latest === undefined || latest.round !== target.round) {
        throw new Error(`the current ${kind} round is ${String(latest?.round)}, not ${String(requestedRound)}`)
      }
    }
    if (resolved.object === 'directory' && applyStarted(directory, record)) {
      const archiveEntry = pipelineOf(readPolicy(directory) ?? LEGACY_ENTRY_CONFIG).beforeArchive
      throw new Error(`the ${kind} review is frozen once apply started; inspect it with ${explicitEntryCommand(archiveEntry, 'status')}`)
    }
    record.findings = Array.isArray(record.findings) ? record.findings : []
    const criteria = record.criteria ?? criteriaOf(resolved.section)
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
        disposeFinding(finding, { ...entry, ...criteria })
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
    const intent = resolved.object === 'tree' ? undefined : readIntent(directory)
    const currentHash = resolved.object === 'tree'
      ? (gitTree(context.rootPath, 'HEAD') ?? record.objectHash)
      : (intent === undefined ? record.objectHash : draftObject(context.changeRoot, intent).objectHash)
    const started = resolved.object === 'directory' && applyStarted(directory, record)
    const readiness = draftReadiness(record, currentHash, kind, { applyStarted: started })
    record.state = readiness.ready ? 'passed' : 'in-review'
    saveReview(directory, record, kind)
    if (readiness.ready) {
      const latest = latestEntry(record)
      if (latest !== undefined) {
        writeRoundCard({
          ctx,
          directory,
          kind,
          record,
          ...roundCardFields(latest),
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
 * Compute the coverage a recorded plan-change waiver establishes.
 *
 * Readiness is asserted only when the apply record exists, the draft record
 * carries a per-file list, the intent is readable and the drift is non-empty and
 * fully covered. Every other reachable state reports a reason instead.
 * @param options - `draft`, `apply`, `intent`, `changeRoot` and `covered`.
 * @returns `{ ready, reasons }`.
 */
function waiverCoverage({ draft, apply, intent, changeRoot, covered }) {
  if (apply === undefined) {
    return { ready: false, reasons: ['coverage is checked when the apply review starts'] }
  }
  if (draft === undefined || intent === undefined) {
    return {
      ready: false,
      reasons: ['coverage cannot be computed because the draft review is disabled or its record is missing'],
    }
  }
  if (!Array.isArray(draft.artifactFiles)) {
    return {
      ready: false,
      reasons: ['no per-file drift was recorded'],
    }
  }
  try {
    const drift = diffArtifactFiles(draft.artifactFiles, draftObject(changeRoot, intent).files)
    if (drift.length === 0) {
      return {
        ready: false,
        reasons: ['no drift is pending; resume the apply review after the plan change'],
      }
    }
    const uncovered = drift
      .filter((file) => !covered.has(file.path))
      .map((file) => file.path)
    if (uncovered.length === 0) return { ready: true, reasons: [] }
    return {
      ready: false,
      reasons: uncovered.map((path) => `the waiver does not cover ${path}`),
    }
  } catch (error) {
    return {
      ready: false,
      reasons: [`coverage could not be computed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
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
  const changePath = relativeChangePath(context.rootPath, context.changeRoot)
  const normalized = normalizeWaiverFiles(files, { changeRoot: context.changeRoot, changePath })
  if (normalized.refused.length > 0) {
    const details = normalized.refused
      .map((entry) => `- ${entry.input}: ${entry.reason}`)
      .join('\n')
    throw new Error(
      `a plan-change waiver refused these files:\n${details}\n`
      + 'Pass paths relative to the change directory, for example files: ["proposal.md","tasks.md"]; '
      + 'absolute and project-relative forms under the change directory are also accepted.',
    )
  }
  return withReviewLock(directory, 'plan-change-waiver', () => {
    const policy = readPolicy(directory)
    const pipeline = pipelineOf(policy ?? LEGACY_ENTRY_CONFIG)
    const beforeApply = entryOf(policy, pipeline.beforeApply)
    const treeEntries = entryNames(policy ?? LEGACY_ENTRY_CONFIG)
      .filter((name) => entryOf(policy, name).object === 'tree')
      .map((name) => readReview(directory, name))
      .filter((record) => record !== undefined)
    const draft = readReview(directory, beforeApply.name)
    const apply = treeEntries.find((record) => record.draftDrift !== undefined) ?? treeEntries[0]
    if (draft?.applyBaseCommit === undefined && apply === undefined) {
      throw new Error(`a plan-change waiver needs a started apply; resume the ${beforeApply.name} review for a plan change before apply started`)
    }
    const existing = readPlanChangeWaiver(directory)
    const existingFiles = Array.isArray(existing?.files)
      ? normalizeWaiverFiles(existing.files, { changeRoot: context.changeRoot, changePath }).files
      : []
    const merged = [...new Set([...existingFiles, ...normalized.files])].sort()
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
    const coverage = waiverCoverage({
      draft,
      apply,
      intent: readIntent(directory),
      changeRoot: context.changeRoot,
      covered: new Set(merged),
    })
    return projectReview(draft, draft?.objectHash, {
      change,
      review: beforeApply.name,
      ready: coverage.ready,
      reasons: coverage.reasons,
      nextAction: apply === undefined
        ? explicitEntryCommand(pipeline.beforeArchive, 'start')
        : explicitEntryCommand(pipeline.beforeArchive, 'status'),
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
  const requestedRound = optionalRound(args, kind)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const resolved = entryOf(readPolicy(directory), kind)
  return withReviewLock(directory, `${kind}-extend`, () => {
    const record = readReview(directory, kind)
    if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
    if (requestedRound !== undefined) {
      const target = resolveRoundEntry(record, requestedRound)
      if (target === undefined) throw new Error(`round ${String(requestedRound)} is not recorded`)
      const latest = latestEntry(record)
      if (latest === undefined || latest.round !== target.round) {
        throw new Error(`the current ${kind} round is ${String(latest?.round)}, not ${String(requestedRound)}`)
      }
    }
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
    const intent = resolved.object === 'tree' ? undefined : readIntent(directory)
    const currentHash = resolved.object === 'tree'
      ? (gitTree(context.rootPath, 'HEAD') ?? record.objectHash)
      : (intent === undefined ? record.objectHash : draftObject(context.changeRoot, intent).objectHash)
    return projectReview(record, currentHash, {
      review: kind,
      nextAction: entryCommand(kind, 'wait'),
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
    disarmRoundWatch(directory, kind)
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
      const currentLatest = latestEntry(current)
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
  const resolved = entryOf(readPolicy(directory), kind)
  const record = readReview(directory, kind)
  if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  if (record.mode !== 'reviewer') throw new Error('wait is only available for an independent reviewer')
  rememberChangerSession(ctx, directory, kind, agent?.id)
  const current = readReview(directory, kind)
  if (current === undefined) throw new Error(`no ${kind} review is recorded for this change`)
  const latest = latestEntry(current)
  if (current.reviewerWaived !== undefined || latest?.report !== undefined || current.state === 'passed') {
    const started = resolved.object === 'directory' && applyStarted(directory, current)
    const readiness = draftReadiness(current, current.objectHash, kind, { applyStarted: started })
    const nextAction = readiness.ready
      ? (resolved.object === 'tree' ? 'openspec_archive' : 'openspec_apply_next')
      : readiness.nextAction
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
      nextAction: `${entryCommand(kind, 'extend')} or ${entryCommand(kind, 'abandon')}`,
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
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @param parent - changer agent.
 * @returns the projected review.
 */
async function retryReview(ctx, settings, cwd, args, signal, parent) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  entryOf(readPolicy(directory), kind)
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
    return projectReview(record, record.objectHash, {
      review: kind,
      nextAction: entryCommand(kind, 'wait'),
    })
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
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
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
    : entryOf(migrated, kind).section
  return withReviewLockAsync(directory, `${kind}-replace`, async () => {
    const record = readReview(directory, kind)
    if (record?.mode !== 'reviewer') throw new Error('replace is only available for an independent reviewer')
    const slot = record.reviewers?.slots?.[0]
    if (slot === undefined) throw new Error('the review has no reviewer slot')
    const childId = await startReviewerActivation(
      ctx,
      parent,
      context.rootPath,
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
    return projectReview(record, record.objectHash, {
      review: kind,
      nextAction: entryCommand(kind, 'wait'),
    })
  })
}

/**
 * Waive the reviewer coverage with user approval.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param args - tool arguments.
 * @param signal - cancellation.
 * @returns the projected review.
 */
async function waiveReviewer(ctx, settings, cwd, args, signal) {
  const change = requireChange(args)
  const kind = reviewKind(args)
  const store = optionalStore(args)
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const resolved = entryOf(readPolicy(directory), kind)
  if (args?.approvedBy !== 'user') throw new Error('waive-reviewer needs approvedBy user')
  const waiver = typeof args?.waiver === 'string' ? args.waiver.trim() : ''
  if (waiver === '') throw new Error('waive-reviewer needs the waiver text')
  return withReviewLock(directory, `${kind}-waive-reviewer`, () => {
    const record = readReview(directory, kind)
    if (record?.mode !== 'reviewer') throw new Error('waive-reviewer is only available for an independent reviewer')
    if (latestEntry(record)?.report !== undefined) throw new Error('the reviewer already submitted a report')
    record.reviewerWaived = {
      slot: 1,
      reason: typeof args?.reason === 'string' ? args.reason.trim() : null,
      waiver,
      approvedBy: 'user',
      at: new Date().toISOString(),
    }
    record.coverageGap = true
    const started = resolved.object === 'directory' && applyStarted(directory, record)
    const readiness = draftReadiness(record, record.objectHash, kind, { applyStarted: started })
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
 * Record the draft seal as the apply base.
 *
 * A git worktree apply constructs the seal commit with a temporary index from
 * the change directory and the plugin-written ignore file, leaving main
 * unchanged. The worktree-disabled compatibility path keeps the committed
 * `HEAD` seal. A store-backed change whose directory is outside the project
 * root skips the checks and reports a warning.
 * @param context - resolved change context.
 * @param directory - review directory.
 * @param object - current draft object.
 * @param change - change name.
 * @param options - `construct` and `store`.
 * @returns warnings that do not block apply.
 */
export function sealDraft(context, directory, object, change, options = {}) {
  const worktreeRoot = gitWorktreeRoot(context.rootPath) ?? context.rootPath
  const changePath = worktreeRelative(context.rootPath, context.changeRoot)
  if (changePath === undefined) return [storeSealSkipWarning(change)]
  const ignorePath = worktreeRelative(context.rootPath, join(context.rootPath, 'openspec', '.gitignore'))
  const entryName = options.entryName ?? DEFAULT_ENTRY
  if (options.construct === true) {
    return constructSeal(directory, object, change, options, worktreeRoot, changePath, ignorePath, entryName)
  }
  return sealCommittedHead(directory, object, change, worktreeRoot, changePath, ignorePath, entryName)
}

/** Construct and pin the seal commit for a git worktree apply. */
function constructSeal(directory, object, change, options, worktreeRoot, changePath, ignorePath, entryName) {
  const status = gitStatus(worktreeRoot)
  if (status === undefined) {
    throw new Error(`the ${entryName} review is ready, but the working tree status could not be read`)
  }
  const remaining = status.split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => {
      const path = statusLinePath(line)
      if (ignorePath !== undefined && path === ignorePath) return false
      return !isChangePath(path)
    })
  if (remaining.length > 0) {
    throw new Error(`apply needs the change sealed: commit or stash these changes first; the working tree is not clean:\n${remaining.join('\n')}`)
  }
  const stagedIgnore = ignorePath !== undefined && existsSync(join(worktreeRoot, ignorePath))
    ? ignorePath
    : undefined
  const commit = buildSealCommit({
    root: worktreeRoot,
    changePath,
    ignorePath: stagedIgnore,
    change,
  })
  const paths = sealChangedPaths(worktreeRoot, commit) ?? []
  const prefix = `${changePath}/`
  if (!paths.some((path) => path.startsWith(prefix))) {
    throw new Error(`the seal commit must change at least one file under '${changePath}/'; it changes none. If an earlier seal commit already contains the change directory, uncommit that commit so the directory is untracked, then run apply again.`)
  }
  const treeHash = sealArtifactHash(worktreeRoot, commit, changePath, object.files)
  if (treeHash !== object.artifactHash) {
    throw new Error('the change artifacts differ from the reviewed draft; restore the reviewed version or record a user waiver with openspec_review action=waive scope=plan-change')
  }
  return withReviewLock(directory, 'seal-draft', () => {
    const current = readReview(directory, entryName)
    if (current === undefined) {
      throw new Error(`the ${entryName} review record disappeared while sealing; run openspec_review action=status review=${entryName}`)
    }
    if (current.applyBaseCommit !== undefined) return []
    if (current.artifactHash !== treeHash) {
      throw new Error('the change artifacts differ from the reviewed draft; restore the reviewed version or record a user waiver with openspec_review action=waive scope=plan-change')
    }
    const readiness = draftReadiness(current, current.objectHash, entryName)
    if (!readiness.ready) {
      throw new Error(`the ${entryName} review is not ready: ${readiness.reasons.join('; ')}. Next: ${gateAdvice(current, entryName, readiness)}.`)
    }
    pinSeal({ root: worktreeRoot, store: options.store, change, commit })
    current.applyBaseCommit = commit
    saveReview(directory, current, entryName)
    return []
  })
}

/** Keep the committed-`HEAD` seal for the worktree-disabled compatibility path. */
function sealCommittedHead(directory, object, change, worktreeRoot, changePath, ignorePath, entryName) {
  const status = gitStatus(worktreeRoot)
  if (status === undefined) {
    throw new Error(`the ${entryName} review is ready, but the working tree status could not be read`)
  }
  const remaining = filterUnrelatedChangeStatus(status, changePath)
  if (remaining.length > 0) {
    throw new Error(`apply needs the change sealed: commit or stash these changes first; the working tree is not clean:\n${remaining.join('\n')}`)
  }
  const head = gitCommit(worktreeRoot)
  if (head === undefined) throw new Error(`the ${entryName} review is ready, but HEAD could not be resolved`)
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
  return withReviewLock(directory, 'seal-draft', () => {
    const current = readReview(directory, entryName)
    if (current === undefined) {
      throw new Error(`the ${entryName} review record disappeared while sealing; run openspec_review action=status review=${entryName}`)
    }
    if (current.applyBaseCommit !== undefined) return []
    if (current.artifactHash !== object.artifactHash) {
      throw new Error('the change artifacts differ from the reviewed draft; restore the reviewed version or record a user waiver with openspec_review action=waive scope=plan-change')
    }
    const readiness = draftReadiness(current, object.objectHash, entryName)
    if (!readiness.ready) {
      throw new Error(`the ${entryName} review is not ready: ${readiness.reasons.join('; ')}. Next: ${gateAdvice(current, entryName, readiness)}.`)
    }
    current.applyBaseCommit = head
    saveReview(directory, current, entryName)
    return []
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
 * @returns `{ warnings }` that do not block apply.
 * @throws when the gate refuses.
 */
export async function assertDraftReviewReady(ctx, settings, cwd, change, store, signal, options = {}) {
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const directory = reviewDirectory(context.rootPath, store, change)
  const policy = readPolicy(directory)
  const acquire = () => options.skipApplyLocks === true
    ? { locks: [], created: [] }
    : acquireApplyLocks({
      cwd,
      resolvedRoot: context.rootPath,
      store,
      change,
      changeRoot: context.changeRoot,
    })
  let gate
  if (settings?.reviewEnabled !== false && policy !== undefined) {
    const name = pipelineOf(policy).beforeApply
    if (entryNames(policy).includes(name)) {
      gate = { name, ...entryOf(policy, name) }
      if (gate.object !== 'directory') {
        throw new Error(`pipeline.beforeApply names entry "${name}", whose object is "${gate.object}"; it must be a "directory" entry`)
      }
    }
  }
  const draftGate = gate !== undefined && gate.section.enabled
  if (!draftGate) {
    const acquired = acquire()
    return {
      warnings: [],
      locks: acquired.locks,
      created: acquired.created,
      context,
      applyBaseCommit: gitCommit(context.rootPath),
    }
  }
  const entryName = gate.name
  const record = readReview(directory, entryName)
  if (record === undefined) {
    throw new Error(`the ${entryName} review has not started; run openspec_review action=start review=${entryName}`)
  }
  const intent = readIntent(directory)
  if (intent === undefined) {
    throw new Error(`the ${entryName} review intent file is missing; remove the review record before running openspec_review action=start review=${entryName} again`)
  }
  const started = applyStarted(directory, record)
  const object = started ? undefined : draftObject(context.changeRoot, intent)
  if (!started && record.objectHash === object.objectHash) {
    const { requirementLength, execution } = await loadPlanPreflights(ctx, settings, cwd, change, store, signal, context)
    record.length = requirementLength
    record.execution = execution
    withReviewLock(directory, 'plan-preflight', () => {
      const current = readReview(directory, entryName)
      if (current === undefined) return
      current.length = requirementLength
      current.execution = execution
      saveReview(directory, current, entryName)
    })
    if (requirementLength.blocking) {
      throw new Error(lengthGateMessage(requirementLength, change, 'apply'))
    }
    if (execution.blocking) {
      throw new Error(executionGateMessage(execution, change, 'apply'))
    }
  }
  const readiness = draftReadiness(record, object?.objectHash ?? record.objectHash, entryName, {
    ...(started ? { ignoreStale: true } : {}),
    applyStarted: started,
  })
  if (!readiness.ready) {
    throw new Error(
      `the ${entryName} review is not ready: ${readiness.reasons.join('; ')}. `
      + `Next: ${gateAdvice(record, entryName, readiness)}.`,
    )
  }
  const acquired = acquire()
  const warnings = []
  if (isGitRepository(context.rootPath) && record.applyBaseCommit === undefined) {
    try {
      const sealObject = object ?? draftObject(context.changeRoot, intent)
      warnings.push(...sealDraft(context, directory, sealObject, change, {
        construct: options.constructSeal === true,
        store,
        entryName,
      }))
    } catch (error) {
      releaseApplyLocks(acquired.created)
      throw error
    }
  }
  return {
    warnings,
    locks: acquired.locks,
    created: acquired.created,
    context,
    applyBaseCommit: readReview(directory, entryName)?.applyBaseCommit,
  }
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
 * @param options - skipTreeCheck: the caller only needs the apply-lock blocker
 *   before refusing a plugin worktree (the archive tool's land instruction).
 * @returns `{ context, inspected }` for the caller's release after archive.
 * @throws when the gate refuses.
 */
export async function assertApplyReviewReady(ctx, settings, cwd, change, store, signal, options = {}) {
  const context = await loadChangeContext(ctx, settings, cwd, change, store, signal)
  const compatibilityRoot = settings?.worktree?.enabled === false
    ? (gitWorktreeRoot(cwd) ?? cwd)
    : (mainWorktreeRoot(cwd) ?? cwd)
  const inspected = inspectApplyLocks({
    cwd,
    resolvedRoot: context.rootPath,
    implementationRoot: compatibilityRoot,
    store,
    change,
    changeRoot: context.changeRoot,
  })
  const blocker = applyLockBlocker(inspected)
  if (blocker !== undefined) throw applyLockBlockedError(blocker)
  // The archive tool's land refusal never archives, so only the lock blocker matters here.
  if (options.skipTreeCheck === true) return { context, inspected }
  if (settings?.reviewEnabled === false) return { context, inspected }
  if (!isGitRepository(context.rootPath)) return { context, inspected }
  const directory = reviewDirectory(context.rootPath, store, change)
  const policy = readPolicy(directory)
  if (policy === undefined) return { context, inspected }
  const name = pipelineOf(policy).beforeArchive
  if (!entryNames(policy).includes(name)) return { context, inspected }
  const gate = entryOf(policy, name)
  if (gate.object !== 'tree') {
    throw new Error(`pipeline.beforeArchive names entry "${name}", whose object is "${gate.object}"; it must be a "tree" entry`)
  }
  if (!gate.section.enabled) return { context, inspected }
  const record = readReview(directory, name)
  if (record === undefined) {
    throw new Error(`the ${name} review has not started; run openspec_review action=start review=${name}`)
  }
  const tree = gitTree(context.rootPath, 'HEAD')
  if (tree === undefined || tree !== record.treeSha) {
    throw new Error(`the ${name} review tree no longer matches HEAD; rerun the ${name} review on the current commit`)
  }
  const worktreeRoot = gitWorktreeRoot(context.rootPath) ?? context.rootPath
  const changePath = worktreeRelative(context.rootPath, context.changeRoot) ?? ''
  const status = gitStatus(worktreeRoot)
  if (status === undefined) throw new Error(`the ${name} review could not read the working tree status`)
  const remaining = filterUnrelatedChangeStatus(status, changePath)
  if (remaining.length > 0) {
    throw new Error(`the ${name} review needs a clean working tree before archive:\n${remaining.join('\n')}`)
  }
  const readiness = draftReadiness(record, tree, name)
  if (!readiness.ready) {
    throw new Error(
      `the ${name} review is not ready: ${readiness.reasons.join('; ')}. `
      + `Next: ${gateAdvice(record, name, readiness)}.`,
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
    description: 'Run a review for a change: start the first round, resume a later round, read the brief, submit or read the report, dispose one or more findings in a single call, extend limits, or inspect readiness. `start` refuses a review whose record exists; `resume` refuses one without a record. Apply review requires a ready draft review unless an explicit `baseline: "none"` and a non-empty `base` are passed for a change without a draft record.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'change'],
      properties: {
        action: {
          type: 'string',
          enum: REVIEW_ACTIONS,
          description: 'Review step to perform: start, resume, wait, status, self-report, report, dispose, waive, retry, replace, waive-reviewer, extend or abandon.',
        },
        change: {
          type: 'string',
          description: 'Change name, exactly as the list action reports it.',
        },
        review: {
          type: 'string',
          description: 'Configured review entry name; defaults to draft and is required for dispose or a finding waive.',
        },
        store: {
          type: 'string',
          description: 'Registered store id.',
        },
        worktree: {
          type: 'string',
          description: 'Optional apply worktree path for an existing branch or PR checkout; it is validated and never created or deleted.',
        },
        intent: {
          type: 'string',
          description: 'The user goal and acceptance conditions for the first draft start.',
        },
        round: {
          description: 'Round number or an extra round token E<n> when the action needs one.',
          anyOf: [
            { type: 'integer', minimum: 1 },
            { type: 'string', pattern: '^E[1-9][0-9]*$' },
          ],
        },
        base: {
          type: 'string',
          description: 'Apply review base commit or revision; defaults to the recorded apply base or git merge-base HEAD origin/main, except that an explicit no-draft baseline requires a non-empty base.',
        },
        configPath: {
          type: 'string',
          description: 'Review configuration file for the first policy lock; the project file is the default.',
        },
        baseline: {
          type: 'string',
          enum: ['draft', 'none'],
          description: 'Apply review baseline: draft requires the draft review (the default when the draft policy is enabled); none reviews a committed branch without a draft record and requires an explicit base.',
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
          description: 'Change artifact paths covered by a plan-change waiver. Accepts change-relative, project-relative and absolute paths and records each relative to the change directory; refuses an entry that escapes the change directory or names another change.',
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
      const explicitWorktree = typeof args?.worktree === 'string' && args.worktree.trim() !== ''
      const planChangeWaiver = action === 'waive' && args?.scope === 'plan-change'
      const entry = planChangeWaiver ? undefined : entryForArgs(cwd, args)
      const treeEntry = entry?.object === 'tree'
      const reviewCwd = treeEntry
        ? await resolveApplyReviewCwd(cwd, args)
        : cwd
      if (action === 'start') {
        const result = treeEntry
          ? await startApplyReview(ctx, settings, reviewCwd, args, exec.signal, exec.agent, entry)
          : await startReview(ctx, settings, cwd, args, exec.signal, exec.agent, entry)
        if (treeEntry && explicitWorktree) {
          ensureReviewState(reviewCwd, args)
        }
        return result
      }
      if (action === 'resume') {
        return treeEntry
          ? await resumeApplyReview(ctx, settings, reviewCwd, args, exec.signal, exec.agent, entry)
          : await resumeDraftReview(ctx, settings, cwd, args, exec.signal, exec.agent, entry)
      }
      const actionCwd = treeEntry ? reviewCwd : cwd
      if (action === 'wait') return await waitReview(ctx, settings, actionCwd, args, exec.signal, exec.agent)
      if (action === 'status') return await reviewStatus(ctx, settings, actionCwd, args, exec.signal)
      if (action === 'self-report') return await submitSelfReport(ctx, settings, actionCwd, args, exec.signal, exec.agent)
      if (action === 'report') return await readReport(ctx, settings, actionCwd, args, exec.signal)
      if (action === 'dispose') return await disposeReviewFinding(ctx, settings, actionCwd, args, exec.signal, false, exec.agent)
      if (action === 'waive') {
        return args?.scope === 'plan-change'
          ? await waivePlanChange(ctx, settings, actionCwd, args, exec.signal)
          : await disposeReviewFinding(ctx, settings, actionCwd, args, exec.signal, true, exec.agent)
      }
      if (action === 'retry') return await retryReview(ctx, settings, actionCwd, args, exec.signal, exec.agent)
      if (action === 'replace') return await replaceReview(ctx, settings, actionCwd, args, exec.signal, exec.agent)
      if (action === 'waive-reviewer') return await waiveReviewer(ctx, settings, actionCwd, args, exec.signal)
      if (action === 'extend') return await extendReview(ctx, settings, actionCwd, args, exec.signal)
      return await abandonReview(ctx, settings, actionCwd, args, exec.signal)
    },
  }))
}


/** Validate an explicit worktree or resolve the recorded apply worktree. */
async function resolveApplyReviewCwd(cwd, args) {
  const sessionMain = mainWorktreeRoot(cwd) ?? cwd
  const sessionCommon = gitCommonDir(sessionMain)
  const requested = typeof args?.worktree === 'string' && args.worktree.trim() !== ''
    ? resolve(sessionMain, args.worktree.trim())
    : undefined
  if (requested !== undefined) {
    if (!existsSync(requested) || !isGitRepository(requested)) {
      throw new Error(`the apply review worktree is not a git checkout: ${requested}`)
    }
    const checkoutRoot = gitWorktreeRoot(requested)
    if (checkoutRoot === undefined || resolve(checkoutRoot) !== resolve(requested)) {
      throw new Error('the apply review worktree must be the root of a linked checkout, not a subdirectory')
    }
    if (resolve(requested) === resolve(sessionMain)) {
      throw new Error('the apply review worktree must be a linked checkout, not the main worktree')
    }
    if (gitCommonDir(requested) !== sessionCommon) {
      throw new Error('the apply review worktree must belong to this project\'s git common directory')
    }
    const status = gitStatus(requested)
    if (status === undefined || status.length > 0) {
      throw new Error(`the apply review worktree must be clean: ${requested}`)
    }
    return requested
  }
  const state = readApplyState(sessionMain, args?.store ?? undefined, requireChange(args))
  if (state !== undefined && state.status === 'active' && existsSync(state.worktree)) return state.worktree
  return cwd
}

/** Write a review-only state for a user-created PR checkout. */
function ensureReviewState(worktree, args) {
  const store = optionalStore(args)
  const change = requireChange(args)
  const main = mainWorktreeRoot(worktree)
  if (main === undefined || readApplyState(main, store, change) !== undefined) return
  const now = new Date().toISOString()
  writeApplyState(main, store, change, {
    schemaVersion: 1,
    change,
    store: store ?? null,
    mainRoot: main,
    worktree,
    branch: gitBranchName(worktree),
    baseCommit: typeof args?.base === 'string' && args.base.trim() !== ''
      ? (gitCommit(worktree, args.base.trim()) ?? args.base.trim())
      : gitCommit(worktree),
    sealedCommit: null,
    status: 'active',
    createdAt: now,
    lastUsedAt: now,
    lockToken: null,
    lockPid: null,
  })
}

/** The current branch name, or HEAD when detached. */
function gitBranchName(root) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'HEAD'
}
