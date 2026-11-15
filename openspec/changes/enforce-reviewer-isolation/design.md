# Design: enforce reviewer isolation

## Context

See `proposal.md` for the problem. The current reviewer preset composes scoped tools, but the Host row registers the changer tools in the global tool scope. A reviewer agent therefore inherits them. A live reviewer session listed `openspec_review`, `openspec_apply_next`, `openspec_mark_task_done`, `openspec_archive`, `openspec_new_change`, `openspec_inspect`, `issues_*` and `create_worktree` alongside the preset tools.

The plugin validates a change before a draft review (`validateChange` in `lib/tools/review.js`) and before an apply review, but always without `--strict`. The apply brief asks the reviewer to confirm strict validation, which the reviewer can only do through the leaked `openspec_inspect`.

## Goals / Non-Goals

- Goal: the reviewer's model-facing catalog contains only the preset's read, search, web and `openspec_reviewer` tools, regardless of what other Host plugins register.
- Goal: a reviewer whose restriction cannot be applied does not start.
- Goal: apply review start and resume refuse a committed change that fails strict validation, and the brief carries the result.
- Non-goal: changing the changer's catalog or disabling any Host plugin profile-wide.
- Non-goal: changing the reviewer preset's declared plugin list, the review record schema, the reviewer model configuration, the self-review mode or the archive-gate semantics.
- Non-goal: making the draft review strict. Draft review stays non-strict, matching the existing draft requirement.

## Decisions

### Deny the inherited Host tools by name, computed from the global registry

The reviewer entry (`reviewer.js`) reads the global tool registry with `ctx.tools.definitions()` (the omitted scope is the global view) and registers `ctx.tools.restrict({ deny: names })` in its scoped context. The deny set names every tool registered in the global scope except the six names the preset itself provides: `read`, `grep`, `glob`, `web_search`, `web_fetch` and `openspec_reviewer`. Excluding those names keeps the preset's scoped tools visible even if a Host plugin also registers a tool under one of them (the scoped registration shadows the global one).

The earlier plan used `restrict({ allow: [] })`. That is wrong on the pinned runtime: a restriction is intersected over every tool the viewing scope inherits, and only the viewing scope's own registrations are exempt. An agent bound under the reviewer preset inherits the preset tools, so an empty allow mask removes them too and the reviewer starts with no tools. A deny set removes only the names it contains and leaves the preset tools alone.

The deny set is computed, not hard-coded:

- It covers the changer tools, `issues_*` and `create_worktree` without enumerating them.
- It does not fail on a deployment that lacks one of those plugins; every name comes from the live registry.
- A `tools/change` listener recomputes the global names and appends a deny restriction for names that appeared after activation, so a Host tool registered later does not silently join the reviewer catalog. The listener adds the new names to the denied `Set` before calling `restrict`, so the synchronous `tools/change` re-entry sees no new names and returns. If `restrict` throws, the listener removes those names from the `Set` and logs a warning; the earlier restriction stays in force and a later `tools/change` retries them.

Why not the alternatives:

- A preset `plugins` list only adds scoped plugins; it cannot remove Host tools. `cordis.patch.yml` is therefore not an effective allowlist.
- `ToolRegistrationOptions.when` can hide a tool the plugin itself registers, but `issues_*` and `create_worktree` belong to other Host plugins. It would still leave those visible.
- A hard-coded deny list is brittle in the other direction: a deployment without one of the named plugins fails the restriction, and a future Host tool leaks by default. The computed set is the same mechanism without the fixed vocabulary.

### Fail closed at activation, refresh on registry changes

The initial restriction is applied during the reviewer entry's `apply`. If `ctx.tools.restrict` throws or the registry cannot be read, the activation fails and `startReviewerActivation` fails before a reviewer runs. A reviewer that starts without the restriction would silently restore the old surface, so failing the activation is the safe outcome.

After activation, the `tools/change` listener recomputes and restricts newly registered global names. The listener is a refresh, not the primary gate: the initial activation covers the profile composition that exists when the reviewer starts. If the refresh itself cannot register a restriction, the listener rolls the new names back out of the denied `Set` and logs a warning; the earlier deny set stays in force, and the next `tools/change` retries those names. The reviewer step may see the newly registered tool until a retry succeeds. This is a same-process runtime-installation edge, recorded as a residual risk; the plugin cannot tear down an already published reviewer from this entry.

### Run strict validation in the apply entry for start and resume

`validateChange` gains a strict option that adds `--strict` to the bundled CLI call. The draft entry keeps the default non-strict call; the apply entry calls it with `strict: true` before it writes a record or advances a round. Both apply `start` and `resume` go through `applyReviewEntry`, so a resume that opens a new round validates the committed tree again.

On failure the plugin throws before the review lock and before any record or round write. The error names the change, states that apply review requires strict validation, and lists each issue path and message. The draft error remains its own message.

The alternative — allowing `openspec_inspect` to the reviewer and keeping the current brief — was rejected: it preserves a Host tool in the reviewer catalog and makes a deterministic CLI check a model responsibility.

### Carry the validation result in the apply brief

`buildApplyBrief` accepts a validation summary (strict mode and issue count) and writes it in the brief header. The archive-readiness axis refers to the host check and states that the reviewer does not need to run validation. The brief's sha256 already binds the evidence into the review round, so the record schema does not change.

The alternative — storing a separate validation field in the review record — was rejected as unnecessary: the validation is deterministic for the committed tree, the tree hash binds the round, and the brief is already hashed.

### Verification

- A fake-context test asserts the reviewer entry denies exactly the global tool names except the six preset names, and leaves the preset tools registered.
- A fake-context test adds a global `read` tool and asserts it is not denied, so the preset's read tool keeps its slot.
- A fake-context test registers a new global tool and emits `tools/change`; the test asserts the new name is denied while the preset tools stay.
- A fake-context test makes the initial `restrict` throw; the test asserts the reviewer entry's `apply` throws.
- A fake-context test makes the second `restrict` call throw after a new global tool appears; the test asserts the warning, the earlier deny set, and that a later `tools/change` retries and denies the tool.
- An apply review test captures the CLI argv and asserts `--strict`; a strict-warning fixture asserts the entry refuses without creating a record.
- A review test asserts the apply brief contains the host validation line and does not ask the reviewer to run validation.
- Task 1.6, run before commit, performs the pinned-runtime contract check with a global and a scoped tool and records the observed catalog; it is the pre-implementation gate for the restriction semantics.
- Task 3.3, run after the Host reload, performs the live `request/header` check on a disposable reviewer; it is not deferred to the post-commit workflow follow-up.

## Risks / Trade-offs

- [A Host tool is registered after the reviewer starts] → The `tools/change` listener adds its name to the deny set; a failed refresh is logged and remains a residual fail-open for runtime-installed plugins.
- [A deny name does not exist because its plugin was unloaded] → Restriction names come from the live global registry, so this cannot happen for the initial set; a later unload leaves an inert deny entry.
- [The preset scope is rejected as unscoped] → The initial restriction throws and the reviewer does not start. The runtime verification task distinguishes this from a catalog error.
- [Strict validation refuses changes that previously started apply review] → This is intended. The error lists the warnings; the changer fixes them before the round opens. Draft review is unaffected.
- [Existing reviewer sessions keep the old composition] → Only new activations use the changed entry. The runtime verification uses a new reviewer after the Host reload; old sessions are not retrofitted.
- [Docs drift from the effective catalog] → The documentation test asserts the new phrases; the spec requirement covers the catalog and validation owner.

## Migration Plan

- No data migration. Review records and commit/tree hashes keep their format.
- Reload the Host plugin (or restart DSH) to load the changed `reviewer.js` and review code; a new reviewer activation uses the new composition.
- Rollback: remove the restriction refresh and the strict flag from the apply entry. Existing records remain readable; no record format changes.

## Open Questions

None.
