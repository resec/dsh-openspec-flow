# Design: fix the reviewer preset tool config

## Context

See `proposal.md` for the failure. The preset is one `@deepseek-ai/dsh-agent-preset` declaration in `cordis.patch.yml`. Its `tool-fs-search` child currently carries only `id` and `name`. DSH applies a patch row's `config` wholesale, and the tool declares `sampleOverCapGlobResults` as required without a default; the bundled `dsh-base` row chooses `false`. The plugin pins `engines.dsh` to `=0.2.2-rc.2`, so the preset must satisfy that runtime's schema.

## Goals

- Make the `openspec-reviewer` preset activate on the pinned runtime.
- Keep the preset's read-only tool composition unchanged.
- Lock the required key with a regression assertion in the existing preset test.
- Record the runtime compatibility contract in the `tool-surface` delta.

## Non-Goals

- Changing the reviewer's tools, persona, model routing, or read-only guarantees.
- Changing `engines.dsh`, the Node baseline, or the DSH upgrade procedure.
- Adding a general YAML or tool-config validator to the test suite.
- Adding a profile-level workaround; the repository fix replaces the need for one.
- Changing the existing reviewer requirements; the new compatibility requirement is additive.

## Decisions

### Configure the preset, not the profile

The defect ships with the plugin: every profile that mounts `openspec-reviewer` fails on the pinned runtime. A profile patch or a live override repairs one installation and masks the next preset edit. The preset's `cordis.patch.yml` is the single source of truth for both the bundled bundle patch and the tests, so the fix belongs there.

### Use `false`, matching `dsh-base`

`sampleOverCapGlobResults: false` keeps the over-cap `glob` page as the modification-time-ordered head. That is the behavior the bundled runtime composition already chooses, and the reviewer does not depend on top-level sampling. `true` would silently change the ordering contract of reviewer searches without a requirement for it.

### Assert the nested key in the existing preset test

The test already reads `cordis.patch.yml` as text to prove the preset is read-only and exported. Extending it with a check for the fs-search config is the same style, runs without a Host, and fails if a future edit drops the key. A full preset mount in the test would need the real DSH preset runtime, which the repository's fake Host context does not provide; the live check is an independent reviewer start after the preset is reloaded.

### Record the runtime compatibility contract in `tool-surface`

The existing requirements say the reviewer preset is read-only and runs one independent reviewer; none states that the preset must activate under the pinned runtime's tool schema. Adding that requirement makes the failure a covered behavior and gives the regression test a spec anchor. It stays in `tool-surface` because the preset is part of the tool surface, not a new capability.

Alternative: keep the change spec-less with `skip_specs: true`. The draft review object requires at least one delta spec, so a spec-less change cannot pass the review gate this change is meant to unblock; it would also leave the compatibility contract implicit.

### Use self-review for this change and verify the reviewer separately

The user directed this change to use self-review: the independent reviewer is the subject under repair, so it cannot also review the repair. The locked policy records `reviewers: 0` and `lockedBy: "user-override:self-review"`; the draft and apply reviews are self-reports. The independent reviewer stays covered by task 2.1, which starts a `reviewers: 1` review after the preset is reloaded, so the repaired path is still exercised.

## Risks / Trade-offs

- **A future DSH upgrade changes the required tool config again** → `engines.dsh` pins the runtime, and the upgrade procedure already requires checking the target runtime's schemas; the preset test names this key so a removal is visible.
- **The running profile does not re-activate the preset from the edited bundle patch** → The change requires a plugin reload or DSH restart before the live independent review; the tasks state that check and do not claim a hot reload.
- **A text assertion passes while the YAML is still invalid** → The live independent reviewer start is the integration check; the change is not complete until it succeeds.
- **The change is reviewed with self-review** → The independent reviewer is the subject under repair; task 2.1 verifies it separately after the reload, so the repaired path is not left unverified.

## Migration Plan

1. Add the preset config and the test assertion.
2. Run the unit tests, coverage and contract checks.
3. Reload the plugin or restart DSH so the preset row activates with the new config.
4. Start an independent reviewer through a `reviewers: 1` change after the reload, as the live verification.
5. Rollback removes the single config key; the preset then fails activation again on the pinned runtime, so rollback is only appropriate if the runtime pin also moves.

## Open Questions

None.
