# Design: Add review round cards

## Context

See `proposal.md` for the motivation. The current implementation reports a round through model prose: `projectReview` returns finding counts, reasons and the next action; `readReport` returns the complete report JSON; the reviewer's `submit` returns only status fields; and the wakeup text is one sentence. The plugin already stores every fact the card needs in the review record and the round `report.json`.

Two constraints shape the design. First, the review record, report files and the review lock live under `openspec/.review/<store>#<change>/`; writes are serialized by `withReviewLock`. Second, the installed plugin runs from a tarball whose `package.json` currently declares only the OpenSpec CLI, so it cannot import a DSH package without declaring it.

See `specs/review-cards/spec.md`, `specs/change-review/spec.md`, `specs/tool-surface/spec.md`, `specs/review-configuration/spec.md`, `specs/review-documentation/spec.md`, `specs/skill-adaptation/spec.md` and `specs/project-invariants/spec.md` for the behavior contracts.

## Goals / Non-Goals

**Goals**

- One plugin-generated record per round phase, invisible to the model, grouped by turn and rendered as a collapsed card in the turn tail.
- Full report body, recorded disposition state and plan-change waiver in the expanded card, without truncation or pagination.
- Main-session review card for independent reviews, reviewer-session card on submit, and a self-review round that disposes findings writes a review card plus a resolution card.
- No draft/apply round cap anywhere: settings, policy, records, tool arguments or `extend`.
- A declared, pinned DSH session dependency with an install-time single-instance probe.

**Non-Goals**

- No change to the report schema, verdict rules, severity, readiness or disposition protocol.
- No card pagination, filtering, search or actions; the card is read-only information.
- No Remote-query fallback in this change. If the probe fails, the change stops rather than shipping a second transport.
- No migration of historical reports into card records; old sessions simply show no card.

## Decisions

### Plugin record, not a tool result

The card is written with `appendPluginRecord(session, 'plugin:openspec-flow/review-card', payload)`. The resulting event is `ignorable`, outside `SessionEventMap`, and never enters the model-visible surface. This is the only channel that satisfies both "no model tokens" and "persists with the session log". Alternative: add a `summary` field to the tool result. It is simple but puts the data in the model context, which the user rejected. Alternative: read card data from a Host channel at render time. It avoids the dependency but cannot associate a card with a turn reliably and complicates history/refresh; it remains the documented fallback.

**Consequence:** the plugin now declares `@deepseek-ai/dsh-session` at the pinned version and the "Node built-ins only" rule in `AGENTS.md` becomes "Node built-ins plus the pinned DSH session package". The `appendPluginRecord` API is experimental; the exact-version pin and the probe are the guards.

### The payload carries the complete report

The payload includes the whole `report.json` object, the recorded findings with their disposition fields, the plan-change waiver, object binding, counts, next action and readiness reasons. The client renders it directly; no follow-up Host read is needed. A round adds roughly the size of its report to the session log (5–20 KB in current samples). This is accepted: the report file already exists, and the card must render without a live Host read, including after reopen.

**Alternative rejected:** store only the report path and fetch through the existing review channel when the card expands. It saves log bytes but makes rendering dependent on a live Host and on path access, and it complicates the reviewer-session card.

### Write points and deduplication

Cards are written inside the existing review lock:

- `self-report` writes the review card for the changer session.
- reviewer `submit` writes the review card for the reviewer session.
- changer `wait` returning `ready` writes the main-session review card of the latest submitted round; changer `report` writes that card only when the requested round is the latest submitted round and the record lacks the marker for this session, phase and round.
- `resume` writes the resolution card only when it opens a new round and the round being closed had a report and disposed findings.
- a final `dispose`/`waive` writes the resolution card when the next action is apply or archive.

The review record gains `cards: [{ sessionId, phase, round, at }]`. Each writer checks the marker inside the lock, so a repeated `wait`/`report` cannot append twice. The reviewer writes only to its own Session; the main-session card is not written from the reviewer tool because the reviewer does not own the changer Session handle. The `wait` marker write is a second lock acquisition after the result read; a failed or contended write is logged and does not change the `wait` result.

### Projection grouped by turn

A unit keyed `openspecReviewCards` folds `turn/start` into `currentTurn` and appends each review-card record to `byTurn[currentTurn]`. The wire view is `{ byTurn }` only. The state and view use a small `{ parse(value) }` shape check instead of zod; a malformed record is skipped. The projection is registered once by the main plugin entry through the optional `ctx.get('sessionProjections')` service, inside a try/catch that logs and continues when the service is absent or registration throws; `reviewer.js` does not add the service to its inject list, so a projection problem cannot prevent the reviewer tool from registering. The registry is global per Host process: one registration folds every Session, including reviewer Sessions, so the reviewer's turn tail reads the same key.

### Client card

A `conversation.chat.turnTail` entry reads `useProjection('openspecReviewCards')` and renders `byTurn[turn.turn]`, where `turn.turn` is the current turn number supplied by the slot. It never infers the current turn from the projection's keys. Each card holds its own `useState` collapse flag; it uses only React from the page module table, no primitives or CSS module. The expanded body renders the report verdict and summary, every report field, verification evidence, disposition note, risk, out-of-scope entry and the waiver, in a scroll container. Card labels are fixed Chinese string constants, independent of the page locale; the configuration page keeps its bilingual dictionaries.

### Model behavior

The plugin instructs the model through the propose/apply skills, the reviewer brief and the policy section: write at most one short note for information the report cannot express (a trade-off, an authorization need, a wait timeout, a self-review limitation or the next step), and do not restate findings, evidence, risks, scope or notes. The reviewer brief tells the reviewer to write no summary after submitting. The requirement is stated on the plugin and its texts, because reply text cannot be enforced by a tool; the tool-result test asserts that no card payload and no card-specific field enters a result, while the existing `report` and `own-report` results keep returning the stored report.

### Remove the round cap

`maxRounds` is removed from `DEFAULT_DRAFT_REVIEW`, `DEFAULT_APPLY_REVIEW`, the section normalization, the settings bounds, the policy builder and readers, the review record limits, the `extend` implementation and the tool parameter schema. A legacy settings section that still carries `maxRounds` is accepted and dropped on the next save; a legacy policy or record keeps the field but it is never read. `extend` keeps only `minutes`.

### Single-instance probe

The repository test proves the writer contract against the fake Host (record committed, projection readable, the tool result carries no payload) and builds a second copy of the session package in a fixture to prove that the mismatch is detected. The real gate is `scripts/probe-session.mjs`, run only after the tarball is installed into an isolated, self-provided clean DSH (never the development host profile): it imports `@deepseek-ai/dsh-session` from the plugin's installed path and from the Host's path, compares them, creates a Session through the Host copy, writes a probe record through the plugin copy, and asserts the record is absent from the model-visible transcript. A probe failure stops the release; at runtime a failed card write is logged and does not roll back a stored report or a disposal, so a card failure cannot corrupt review state.

## Risks / Trade-offs

- **Module duplication breaks private-field access** → exact version pin, the isolated-DSH probe as the release boundary, and an actionable error; if the probe fails, stop this change and open a separate change for a transport fallback rather than shipping a second transport here.
- **A projection registration failure disables the card or the plugin** → the projection is registered once from the main entry through the optional service inside a try/catch; a failure is logged and the tools still register; a test injects a throwing registrar.
- **Experimental `appendPluginRecord` changes across DSH releases** → `engines.dsh` pins the runtime; the DSH upgrade guide and the probe must be re-run when upgrading.
- **Session log growth** → accepted for this change; a future spill/compaction policy can move report bodies out of the event if needed.
- **Card invisible when a turn has no answer** → the model keeps a short note, so the turn ends with an answer; the real GUI check covers a turn without prose.
- **Manual client bundle has no build step** → the card is plain `React.createElement` with inline styles; the client test covers registration, turn selection and the cardless case; the real GUI check covers rendering.
- **Legacy `maxRounds` in profile/config** → accepted and ignored, dropped on the next save; review records and policies keep the field untouched.

## Migration Plan

1. Add the dependency and update the lockfile.
2. Run the repository writer contract test and the mismatch fixture.
3. Remove the round cap from config, policy, records, tools and the page; adjust tests and docs in the same change.
4. Commit the implementation, run the apply review, fix every blocker, archive the change and commit the archive.
5. Build the release tarball from that final reviewed commit, then let the user install and inspect it in an isolated clean DSH: the install probe (one module, record absent from the model-visible transcript) and the Web GUI card inspection. The development host is not used.
6. Rollback in the isolated DSH: reinstall the previous tarball; old records and policies remain readable because the field is ignored, not rewritten. A stale `maxRounds` in any existing profile drops on that profile's next settings save; it is not part of the isolated verification.

## Verification boundary

The development host profile, configuration and sessions are not used for verification: no host plugin is installed, restarted or mutated during this change. Any DSH behavior check runs in a self-provided, isolated, clean DSH.

Two checks cannot be executed by the agent and are recorded here for the user's self-verification rather than as `tasks.md` steps:

- the isolated-DSH install probe: the plugin and Host resolve one `@deepseek-ai/dsh-session` module, and the probe record stays out of the model-visible transcript;
- the Web GUI card inspection: collapsed card, expanded report summary and full report, plan-change waiver, two self-review cards, main-session review card, reviewer-session card, cardless turn and refresh recovery.

The push follows this boundary. Until the user confirms it in the isolated DSH, the change stops after archive and commit.

## Open Questions

None. The user confirmed the card content, collapse behavior, language, write points, dependency removal and round-cap removal.
