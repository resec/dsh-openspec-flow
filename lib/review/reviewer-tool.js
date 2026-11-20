/**
 * Reviewer-facing tool: read the brief and submit the report.
 *
 * This tool is registered only by the `dsh-openspec-flow/reviewer` entry that
 * the `openspec-reviewer` preset composes. The changer's catalog does not
 * contain it.
 *
 * @module dsh-openspec-flow/review/reviewer-tool
 */

import { join } from 'node:path'
import { readJson, readText, reviewDirectory, withReviewLock, gitTree } from './store.js'
import { readRoundReport, writeCard } from './cards.js'
import { entrySeq, latestEntry, parseRoundToken, readReview, resolveRoundEntry, roundEntries } from './record.js'
import { draftObject } from './object.js'
import { submitReport } from './submit.js'
import { clearDeadline, sendWakeup, wakeTargets, wakeText } from './wakeup.js'
import { optionalStore, renderJson, requireChange, sessionCwd } from '../tools/shared.js'

const REVIEWER_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['change', 'review', 'slot', 'state', 'ready'],
  properties: {
    change: { type: 'string' },
    review: { type: 'string', enum: ['draft', 'apply'] },
    slot: { type: 'number' },
    state: { type: 'string' },
    ready: { type: 'boolean' },
    round: { type: 'number' },
    roundToken: { type: 'string' },
    brief: { type: 'string' },
    report: { type: 'object', additionalProperties: true },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'severity', 'status', 'title', 'firstRound', 'verifiedInRound', 'lastVerification'],
        properties: {
          id: { type: 'string' },
          severity: { type: 'string' },
          status: { type: 'string' },
          title: { type: 'string' },
          firstRound: { type: 'number' },
          firstRoundToken: { type: 'string' },
          verifiedInRound: { oneOf: [{ type: 'number' }, { type: 'null' }] },
          verifiedInRoundToken: { type: 'string' },
          lastVerification: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    rounds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['round', 'verdict', 'hasReport'],
        properties: {
          round: { type: 'number' },
          roundToken: { type: 'string' },
          verdict: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          hasReport: { type: 'boolean' },
        },
      },
    },
    reasons: { type: 'array', items: { type: 'string' } },
  },
}

/**
 * Find the reviewer slot for the calling agent.
 * @param record - review record.
 * @param agentId - caller id.
 * @returns the slot.
 */
function requireSlot(record, agentId) {
  const slot = (record.reviewers?.slots ?? []).find((candidate) => candidate.slot === 1)
  if (slot === undefined) throw new Error('the review has no reviewer slot')
  if (slot.agentId !== agentId) throw new Error('this agent is not the reviewer for this review')
  return slot
}

/**
 * The extra token of a round entry.
 * @param entry - round entry.
 * @returns the token, or undefined for a normal round.
 */
function tokenOf(entry) {
  return typeof entry?.round === 'string' ? entry.round : undefined
}

/**
 * The numeric sequence of a round entry.
 * @param entry - round entry.
 * @returns the sequence.
 */
function seqOf(entry) {
  return entrySeq(entry) ?? (typeof entry?.round === 'number' ? entry.round : undefined)
}

/**
 * The round display fields of one entry.
 * @param entry - round entry.
 * @returns `{ round, roundToken? }`.
 */
function roundFields(entry) {
  const token = tokenOf(entry)
  return {
    round: seqOf(entry),
    ...(token === undefined ? {} : { roundToken: token }),
  }
}

/**
 * Recompute the current object hash for a review.
 * @param record - review record.
 * @param directory - review directory.
 * @param cwd - project root.
 * @param kind - review kind.
 * @returns the hash.
 */
function currentHash(record, directory, cwd, kind) {
  if (kind === 'apply') {
    const tree = gitTree(cwd, 'HEAD')
    if (tree === undefined) throw new Error('HEAD could not be resolved')
    return tree
  }
  const intent = readText(join(directory, 'intent.md'))
  if (intent === undefined) throw new Error('the review intent file is missing')
  const changeRoot = record.changeRoot ?? join(cwd, 'openspec', 'changes', record.change)
  return draftObject(changeRoot, intent).objectHash
}

/**
 * Register `openspec_reviewer`.
 * @param ctx - reviewer plugin context.
 * @returns nothing.
 */
export function registerReviewerTool(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_reviewer',
    description: 'Reviewer workspace: read the review brief, an own report by round, or the recorded finding state, or submit the report for the recorded slot. It is available only inside the openspec-reviewer preset.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'change'],
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'submit', 'status'],
          description: 'Reviewer step: read, submit or status.',
        },
        change: { type: 'string', description: 'Change name.' },
        review: { type: 'string', enum: ['draft', 'apply'], description: 'Review kind.' },
        store: { type: 'string', description: 'Registered store id.' },
        target: {
          type: 'string',
          enum: ['brief', 'own-report', 'findings', 'status'],
          description: 'Target for a read: brief, own-report (optional round), findings or status.',
        },
        round: {
          description: 'Round number or an extra round token E<n> when the action needs one.',
          anyOf: [
            { type: 'integer', minimum: 1 },
            { type: 'string', pattern: '^E[1-9][0-9]*$' },
          ],
        },
        report: { type: 'object', additionalProperties: true, description: 'The report described in the brief.' },
      },
    },
    output: {
      schema: REVIEWER_OUTPUT_SCHEMA,
      render: renderJson,
    },
    async execute(args, exec) {
      const change = requireChange(args)
      const kind = args?.review ?? 'draft'
      if (kind !== 'draft' && kind !== 'apply') throw new Error('review must be draft or apply')
      const store = optionalStore(args)
      const cwd = await sessionCwd(ctx, exec)
      const directory = reviewDirectory(cwd, store, change)
      const record = readReview(directory, kind)
      if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
      const agentId = exec.agent?.id
      const slot = requireSlot(record, agentId)
      if (args?.action === 'read') {
        const target = args?.target ?? 'brief'
        if (target === 'brief') {
          const round = latestEntry(record)
          if (round?.brief === undefined) throw new Error('the current round has no brief')
          return {
            change, review: kind, slot: slot.slot, state: record.state, ready: false,
            ...roundFields(round), brief: readText(join(directory, round.brief.path)) ?? '',
            reasons: [],
          }
        }
        if (target === 'own-report') {
          const requested = args?.round
          if (requested !== undefined) {
            const parsed = parseRoundToken(requested)
            if (parsed === undefined) throw new Error('round must be a positive integer or an E<n> token')
            if (parsed.kind === 'extra' && kind !== 'apply') throw new Error('draft review has no extra rounds')
          }
          const round = requested === undefined ? latestEntry(record) : resolveRoundEntry(record, requested)
          if (round === undefined) throw new Error(`round ${String(requested)} is not recorded`)
          if (round.report === undefined) throw new Error(`round ${String(round.round)} has no report`)
          return {
            change, review: kind, slot: slot.slot, state: record.state, ready: false,
            ...roundFields(round), report: readJson(join(directory, round.report.path)),
            reasons: [],
          }
        }
        if (target === 'findings') {
          const findings = (Array.isArray(record.findings) ? record.findings : []).map((finding) => ({
            id: finding.id,
            severity: finding.severity,
            status: finding.status,
            title: finding.title,
            firstRound: finding.firstRound,
            ...(typeof finding.firstRoundToken === 'string' ? { firstRoundToken: finding.firstRoundToken } : {}),
            verifiedInRound: Number.isInteger(finding.verifiedInRound) ? finding.verifiedInRound : null,
            ...(typeof finding.verifiedInRoundToken === 'string' ? { verifiedInRoundToken: finding.verifiedInRoundToken } : {}),
            lastVerification: typeof finding.lastVerification === 'string' ? finding.lastVerification : null,
          }))
          const rounds = roundEntries(record).map((round) => ({
            ...roundFields(round),
            verdict: typeof round.verdict === 'string' ? round.verdict : null,
            hasReport: round.report !== undefined,
          }))
          return {
            change, review: kind, slot: slot.slot, state: record.state, ready: record.state === 'passed',
            ...roundFields(latestEntry(record) ?? {}), findings, rounds, reasons: [],
          }
        }
        return {
          change, review: kind, slot: slot.slot, state: record.state, ready: record.state === 'passed',
          ...roundFields(latestEntry(record) ?? {}), reasons: [],
        }
      }
      if (args?.action === 'status') {
        return {
          change, review: kind, slot: slot.slot, state: record.state, ready: record.state === 'passed',
          ...roundFields(latestEntry(record) ?? {}), reasons: [],
        }
      }
      const round = args?.round
      const submitted = withReviewLock(directory, `${kind}-reviewer-submit`, () => {
        const current = readReview(directory, kind)
        if (current === undefined) throw new Error(`no ${kind} review is recorded for this change`)
        requireSlot(current, agentId)
        const latest = latestEntry(current)
        if (latest === undefined) throw new Error('the review has no round')
        if (round !== undefined) {
          const parsed = parseRoundToken(round)
          if (parsed === undefined) throw new Error('round must be a positive integer or an E<n> token')
          if (parsed.kind === 'extra' && kind !== 'apply') throw new Error('draft review has no extra rounds')
          if (latest.round !== parsed.token) {
            throw new Error(`the current ${kind} round is ${String(latest.round)}, not ${String(round)}`)
          }
        }
        const hash = currentHash(current, directory, cwd, kind)
        if (hash !== latest.objectHash) throw new Error(`the ${kind} object changed since this round started`)
        const started = kind === 'draft'
          && (current.applyBaseCommit !== undefined || readReview(directory, 'apply') !== undefined)
        const result = submitReport({
          directory,
          kind,
          record: current,
          report: args?.report,
          currentHash: hash,
          readinessOptions: { applyStarted: started },
        })
        const submittedRound = latestEntry(result.record)
        if (submittedRound !== undefined) {
          writeCard({
            directory,
            kind,
            phase: 'review',
            record: result.record,
            ...roundFields(submittedRound),
            report: readRoundReport(directory, submittedRound),
            waiver: readJson(join(directory, 'plan-change-waiver.json')),
            readiness: result.readiness,
            currentHash: hash,
            session: exec.agent?.session,
            logger: ctx.logger,
          })
        }
        return {
          review: result,
          ...roundFields(latest),
          verdict: latest.verdict,
        }
      })
      const deadline = clearDeadline(directory, kind)
      const baseTargets = wakeTargets(
        submitted.review.record.changerSessionId,
        deadline?.changerSessionId,
      )
      const targets = baseTargets.length > 0
        ? baseTargets
        : wakeTargets(exec.agent?.session?.header?.parentSession)
      const nextAction = kind === 'apply' && submitted.review.readiness.ready
        ? 'openspec_archive'
        : submitted.review.readiness.nextAction
      if (targets.length === 0) {
        ctx.logger?.warn?.('openspec-flow: no changer session is recorded; the review wakeup was skipped')
      } else {
        await sendWakeup(ctx, exec.agent, targets, wakeText({
          change,
          kind,
          round: submitted.roundToken ?? submitted.round,
          verdict: submitted.verdict,
          ready: submitted.review.readiness.ready,
          nextAction,
        }), exec.signal)
      }
      return {
        change, review: kind, slot: slot.slot, state: submitted.review.record.state,
        ready: submitted.review.readiness.ready, round: submitted.round,
        ...(submitted.roundToken === undefined ? {} : { roundToken: submitted.roundToken }),
        reasons: submitted.review.readiness.reasons,
      }
    },
  }))
}
