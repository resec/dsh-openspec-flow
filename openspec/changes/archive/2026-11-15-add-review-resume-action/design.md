# Design: review resume action

## Context

See [proposal.md](proposal.md) for the motivation. The current implementation has one entry, `startReview` in `lib/tools/review.js`, that both creates the record and advances rounds. It requires `intent` on every call before it reads the record, writes `intent.md` inside the lock on every call, and updates `record.intent`. `startApplyReview` reads the draft `intent.md` from disk instead of taking an argument. The propose and apply skills describe only the first start.

The record format, the object hash (`draftObject(changeRoot, intent)`), the round layout and the reviewer slot contract stay unchanged.

## Goals / Non-Goals

Goals:

- One action per round entry: `start` creates the record, `resume` advances it.
- The draft intent is written once and read thereafter.
- The draft and apply paths share the same entry rules.
- Every next action and refusal names the correct entry.

Non-goals:

- No change to the record schema, the object hash input, the round cap or the reviewer slot.
- No new migration tool for records whose `intent.md` was overwritten by an older plugin version; such a record keeps its latest recorded intent.
- No change to the apply review's git preconditions.

## Decisions

### Split the entry into `start` and `resume`, sharing one round-opening helper

`start` keeps policy locking, intent validation and record creation. `resume` reads the existing policy, the recorded intent and the existing record. Both call one helper that chooses the round (reuse the latest unreported round or open the next), writes the brief, wakes the reviewer and saves. A review that already passed on the current object returns the recorded brief on `resume` for both kinds; the apply early return gains the `brief` field the draft path already returns.

Alternative considered: keep `start` for both entries and add only the intent fallback. Rejected: the entry would stay ambiguous and the draft `start` would still need to distinguish first-round from later-round behavior.

### `resume` takes no intent and reads `intent.md`

`resume` reads the file written by the first start. The shared parameter object declares `intent` for every action, so `additionalProperties: false` cannot reject it per action; the `resume` entry therefore refuses a supplied `intent` itself with an error that names `start`, and the run leaves `intent.md` and the recorded hash unchanged. The record's `intent` field is left as recorded.

Alternative considered: a per-action `oneOf` input schema that removes `intent` from `resume`. Rejected for this change: it restructures the whole argument schema and its tests for one field, while an entry check gives the same observable refusal.

`resume` also compares `sha256(intent.md)` with the recorded `intent.sha256` and refuses a mismatch. The write-once guarantee then covers both the tool and an outside edit of the file.

Alternative considered: allow `resume` to rewrite the intent. Rejected: it would change the reviewed object without an artifact change and contradict the write-once rule.

### The first start writes `intent.md` before the record, inside the lock

The current code writes the intent inside the lock before creating the record. Keep that ordering so a failed record write never leaves a record without its intent, and move the "no record" check inside the lock as well. A refused `start` leaves the file untouched.

### `resume` reads the policy but never creates one

A record can only exist after a policy was written, so `resume` uses `readPolicy`. When the policy is missing but a record exists, the call fails with a diagnostic instead of recreating the policy. `ensureReviewerModel` still runs on `resume` so a policy written before reviewer models existed gains the field on the next round, matching today's first-start migration. That write touches `policy.json` only.

### Keep validation and the apply preconditions on both entries

Both entries run `validateChange`, the apply entries keep the git and clean-tree checks, and the apply entries keep the draft artifact binding check against the recorded draft hash. A resumed round reviews the current artifacts, not the ones the previous round reviewed.

### Next actions distinguish the two entries

`readiness.nextAction` carries the review kind and names `openspec_review action=resume review=<kind>` when a record exists and either the current object differs from the recorded one or a finding is fixed but not verified. The readiness function takes the kind from its caller, so an apply status cannot name the draft entry. The gate errors in `assertDraftReviewReady` and `assertApplyReviewReady` say "resume the next round". The no-record paths keep `openspec_review action=start review=<kind>`. Tool descriptions name both entries.

Two existing dead ends are corrected with the same rule: the gate error for a missing `intent.md` names "remove the review record", and the `abandon` result keeps a real tool call in `nextAction` (`openspec_new_change`) while its `reasons` carry the record-removal advice, instead of naming a `start` that the new guard refuses.

### Refusal messages point at the other entry

`start` on an existing draft or apply record fails with `the <kind> review already started; run openspec_review action=resume review=<kind>`. `resume` without a record fails with `the <kind> review has not started; run openspec_review action=start review=<kind>`. Both are thrown before validation work where the record can be read cheaply, and the `start` guard is repeated inside the lock.

## Risks / Trade-offs

- [An agent following the old skills calls `start` for round 2] → The error names `resume`, and the skills, flow rule, README and `docs/review.md` are updated in the same change.
- [A stored record loses its `intent.md` or its `policy.json`] → `resume` fails with a diagnostic that names the missing file and the only recovery, removing the review record. The record cannot silently fall back to a hash without an intent, and `start` cannot recreate the policy behind the record's back.
- [An abandoned review cannot advance] → `abandon` returns `openspec_new_change` as the next action and keeps the record-removal advice in `reasons`, instead of naming a `start` the new guard refuses.
- [Resume reuses an unreported round whose object changed] → The round's object hash is overwritten and its brief rewritten with the new hash, as `start` does today; the reviewer sees the new brief on wake only when a new round opens.
- [Policy migration writes on resume] → Only `policy.json` is written, and only when a section lacks `reviewerModel`; `intent.md` stays untouched, which the tests assert.

## Migration Plan

- No data migration. Existing records are readable; `resume` works on the record written by any earlier version.
- Rollback: revert the plugin; records remain valid because the record schema is unchanged.
- Deploy: the plugin is linked into the `web` profile, so the host needs the `include:openspec-flow` entry re-enabled or DSH restarted before a live session sees the new action.
