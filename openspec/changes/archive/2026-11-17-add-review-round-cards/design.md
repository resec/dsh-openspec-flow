# Design: Add review round cards

## Context

See `proposal.md` for the motivation. Two earlier designs failed. A formal plugin record needs `@deepseek-ai/dsh-session`, and an isolated-DSH tarball install gives the plugin and the Host separate copies; the profile copy cannot resolve its own dependencies. A public `session.append` custom event needs no package, but the pinned DSH persistence read path refuses an unknown event without `ignorable: true`, so a card event could make the whole session unreadable after restart. The final design stores cards as files under the review root and serves them through the existing review channel.

The review record, report files and the review lock already live under `openspec/.review/<store>#<change>/`; writes there are serialized by `withReviewLock`. The review channel already serves the plugin's `/openspec-review` endpoint through `ctx.connection.rpc.call`.

## Goals / Non-Goals

**Goals**

- One card file per round phase, rendered in the turn tail without writing anything into the session log or the model context.
- Full report body, recorded disposition state and plan-change waiver in the expanded card, without truncation or pagination.
- Main-session review card for independent reviews, reviewer-session card on submit, and a self-review round that disposes findings writes a review card plus a resolution card.
- No draft/apply round cap anywhere: settings, policy, records, tool arguments or `extend`.
- No new runtime dependency and no Session event.

**Non-Goals**

- No card pagination, filtering, search or actions; the card is read-only information.
- No card history browser: only the card bound to the current turn is shown.
- No compaction or cleanup policy for old card files in this change; they are small and live in the ignored review root.
- No migration of historical reports into card files; old sessions simply show no card.

## Decisions

### File-backed cards, not Session events

A card is a JSON file under `cards/` in the change's review directory. It never becomes a Session event, so the session log stays byte-identical and cannot be made unreadable after a restart. The plugin imports no `@deepseek-ai/*` package, so a tarball install has no module-copy problem and no Host module sharing.

**Alternatives rejected:** (a) `appendPluginRecord` needs a DSH package and failed the isolated install; (b) an ordinary `session.append` event has no `ignorable` marker and the pinned persistence reader refuses it; (c) a tool-result `summary` puts the data in the model context.

### Card file layout and write points

Each card file is `cards/<sessionKey>-<phase>-<round>.json`, where `sessionKey` is a short SHA-256 of the session id, so a session id cannot escape the directory. The file contains:

```json
{
  "schemaVersion": 1,
  "sessionId": "...",
  "sessionKey": "...",
  "change": "...",
  "review": "draft",
  "phase": "review | resolution",
  "round": 2,
  "turn": null,
  "writtenAt": "2026-...",
  "payload": { "...": "complete card payload" }
}
```

Writes are atomic (`writeJsonAtomic`) and happen inside the existing review lock at the same points as before:

- `self-report` writes the review card for the changer session.
- reviewer `submit` writes the review card for the reviewer session.
- changer `wait` returning `ready` writes the main-session review card of the latest submitted round; changer `report` writes it only when the requested round is the latest submitted round and the marker is absent.
- `resume` writes the resolution card only when it opens a new round and the closed round had a report and disposed findings.
- a final `dispose`/`waive` writes the resolution card when the next action is apply or archive.

The review record keeps `cards: [{ sessionId, phase, round, at }]` for deduplication. A failed file write is logged and does not roll back a stored report or a disposal.

### Endpoint and turn binding

The review channel gains `reviewCards/get` with `{ sessionId, turn, from? }`.

- The Host resolves the session's project from the live agents/working directory, scans that project's `openspec/.review/*/cards/*.json`, and selects the files whose payload session matches.
- Cards already bound to `turn` are returned again, so a refresh recovers them.
- Unclaimed cards (`turn: null`) written at or after `from` (the current turn's start time) are bound to `turn` by updating the file atomically; they are returned in the same response.
- A per-session delivery watermark at `<reviewDir>/card-delivery.json` (last returned write time) prevents a card from being bound to a later turn when the client did not ask during its own turn. When `from` is unavailable the watermark is the fallback.
- A malformed or unreadable card file is skipped; an endpoint failure yields an empty result and does not affect review state.
- The endpoint never mutates review records, reports or the session log.

The client sends the turn number and the turn start time from the turn-tail slot. It renders only the returned cards, so a card bound to another turn is never reused.

### Client card

`conversation.chat.turnTail` is registered through `ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ ..., inject: (sessionId) => ({ sessionId }) }, ...))`, the same inject-callback shape the installed `dsh-client-ui-action-cards` turn-tail entry uses. If the installed client-slots contract does not pass a session id to `inject`, the component falls back to the `turn` payload's session id; if neither exists, the client stops and the design goes back to the user for a spec change instead of guessing. On mount the component calls `reviewCards/get` with `{ sessionId, turn: turn.turn, from: turn.start }`, stores the returned cards in local state, and renders them. While loading or on failure it renders nothing. Each card holds its own `useState` collapse flag and renders the collapsed summary; expanding shows the report verdict and summary, every report field, verification evidence, disposition notes, risks, scope and the waiver in a scroll container. Labels are fixed Chinese strings, independent of the page locale. No projection is registered for cards.

### Payload

The payload includes the whole `report.json` object, the recorded findings with their disposition fields, the plan-change waiver, object binding, counts, next action and readiness reasons. The client renders it directly. A round adds its report body to one card file (5–20 KB in current samples); the file lives in the ignored review root.

### Model behavior

The plugin instructs the model through the propose/apply skills, the reviewer brief and the policy section: write at most one short note for information the report cannot express (a trade-off, an authorization need, a wait timeout, a self-review limitation or the next step), and do not restate findings, evidence, risks, scope or notes. The reviewer brief tells the reviewer to write no summary after submitting. The tool-result test asserts that no card payload and no card-specific field enters a result, while the existing `report` and `own-report` results keep returning the stored report.

### Remove the round cap

`maxRounds` is removed from `DEFAULT_DRAFT_REVIEW`, `DEFAULT_APPLY_REVIEW`, the section normalization, the settings bounds, the policy builder and readers, the review record limits, the `extend` implementation and the tool parameter schema. A legacy settings section that still carries `maxRounds` is accepted and dropped on the next save; a legacy policy or record keeps the field but it is never read. `extend` keeps only `minutes`.

### Remove the event/projection implementation

The earlier attempt's Session-event writer, `card-projection.js`, the optional `sessionProjections` registration and their tests are removed rather than adapted. The review record `cards` marker remains for write deduplication.

## Risks / Trade-offs

- **Turn misbinding** → the client sends the turn start time; a per-session watermark backs up the case where the client never queried during the card's turn; a card bound to another turn is never reused. A missed binding loses the card, not review state.
- **Card files accumulate** → accepted; they are small files under the ignored review root, and a cleanup policy can come later.
- **Endpoint failure or corruption** → the client renders nothing and review tools keep working; a malformed file is skipped.
- **Refresh depends on the Host** → a refresh re-queries the endpoint and returns bound cards; a deleted card file loses only the card.
- **No projection** → the client makes one endpoint call per turn tail; an idle turn returns no cards and updates the watermark.
- **Manual client bundle has no build step** → plain `React.createElement` with inline styles; client tests cover registration, request/selection and the cardless case; an isolated GUI check covers rendering when a browser is available.
- **Legacy `maxRounds` in profile/config** → accepted and ignored, dropped on the next save; review records and policies keep the field untouched.
- **Version collision** → the unreleased 0.8.0 artifact already exists under `dist/`; this change moves to `0.9.0` so the new tarball and skills are distinguishable.

## Migration Plan

1. Remove the `@deepseek-ai/dsh-session` dependency and its lockfile entry, the probe script/test, the Session-event card writer, the card projection and the projection registration; restore the built-ins-only rule in `AGENTS.md`; add atomic card-file writes under `cards/` and the watermark at `<reviewDir>/card-delivery.json`.
2. Add the `reviewCards/get` endpoint with turn binding and the delivery watermark; test it with temporary review directories and a fake channel context.
3. Add the client `turnTail` query/render path and the fixed Chinese labels; test request construction, selection and the cardless case.
4. Remove the round cap from config, policy, records, tools and the page; adjust tests and docs in the same change.
5. Bump `package.json` to `0.9.0`, regenerate the lockfile, update `docs/upgrading-openspec-cli.md` and every skill's `metadata.generatedBy`.
6. Commit the implementation, run the apply review, fix every blocker, archive the change and commit the archive.
7. Build the release tarball from the final reviewed commit. The agent installs it in a self-contained isolated DSH under a temporary home and runs the card-file, endpoint, turn-binding and render-data checks that can be automated; the host is never used.
8. Attempt the visual Web GUI check in that isolated DSH when a browser is available; if it cannot be automated, it is the user's self-verification boundary, not a task.
9. Rollback in the isolated DSH: reinstall the previous tarball; old records and policies remain readable because `maxRounds` is ignored, not rewritten.

## Verification boundary

The development host profile, configuration and sessions are not used for verification: no host plugin is installed, restarted or mutated during this change. The agent prepares a self-contained, isolated, clean DSH under a temporary home and runs the card-file, endpoint, turn-binding and render-data checks there. A visual Web GUI review that cannot be automated in that DSH is the only check left to the user, and it is not written as a `tasks.md` step.

The push follows this boundary.

## Open Questions

None. The user confirmed the card content, collapse behavior, language, write points, the file/remote delivery and the round-cap removal.
