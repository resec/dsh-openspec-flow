# Design: Upgrade the bundled OpenSpec CLI to 2.2.0

## Context

See `proposal.md` - Why. Five facts bound the approach, measured against the 2.0.0 baseline before any edit:

- `npm run contract:check -- --candidate 2.2.0` exits 0 over all 19 recorded commands. The only shape move is `version.install.scope` from a string to `null`, and that command is not in the consumed-field list, which reads only `version` and `schemaVersion`.
- `node .cache/candidate-2.2.0/.../openspec.js version --json` reports `schemaVersion: 1`, and the installed manifest declares `engines.node: ">=22.20.0"`, below the plugin's `>=24.9.0`.
- `openspec init --tools none --no-animation` on 2.2.0 still writes only `openspec/config.yaml`, `openspec/specs/` and `openspec/changes/`, exits 0 and creates no skill files.
- A 39-task fixture run through both CLIs returns the same `instruction` text byte for byte and the same `tasks[]` fields; only the absolute `sourcePath` differs, because the fixtures live in different directories.
- The 2.2.0 skills reference lists 13 skills: the 12 workflow skills the repository already tracks plus the always-installed `openspec` router. The router and the new `references/` folders are installed by `openspec update`, which the plugin never runs.

**Upstream release facts** (release notes at https://github.com/Fission-AI/OpenSpec/releases and `CHANGELOG.md` at https://github.com/Fission-AI/OpenSpec/blob/main/CHANGELOG.md):

- 2.1.0: skills install globally through Vercel's `skills` package, `openspec init --tools <ids>` defaults to a global install with `--scope project` to keep them in the repository, and an npm install raises the CLI's Node floor to 22.20.0.
- 2.1.1: skills install from the CLI package itself, so no Git or network checkout is needed; `archive` checks for an existing archive folder before writing any main spec; `validate --strict` accepts frontmatter at the top of a delta spec and warns when a MODIFIED requirement grows past 500 characters; retiring a capability reads wrapped lines that start with `<`.
- 2.2.0: an always-installed `openspec` router skill and a `references/` folder per skill, installed and refreshed by `openspec init` and `openspec update`.

The plugin already avoids everything 2.1.0 and 2.2.0 change about skill installation: `openspec_init` runs `init --tools none --no-animation`, so no skill, router or reference file is written, and the plugin's own skill provider serves the five workflow skills.

## Goals / Non-Goals

**Goals**

- Move the pin, its lockfile entry, the version assertions and every recorded version string to 2.2.0 in one reviewed change.
- Keep the plugin's parser comment, task text and instruction mapping describing the same CLI surface they did on 2.0.0.
- Leave every tool parameter, output field name and CLI invocation unchanged.

**Non-Goals**

- Adopting the global skill install, the `openspec` router skill or `references/` folders. The plugin owns none of them.
- Exposing `openspec update`, `--scope` or `--dry-run` as tools.
- Repacking and reinstalling the profile bundle; that is the post-push release step.

## Decisions

**Jump straight to 2.2.0 without publishing 2.1.x in between.** 2.1.0 and 2.1.1 change skill installation, archive safeguards and `validate --strict` rules; the plugin runs none of the skill installation and passes through the validate and archive JSON unchanged. A 2.1.x release would ship a plugin identical in behaviour while paying the full edit inventory twice. The contract check was run against the 2.2.0 candidate, and the byte-for-byte instruction comparison confirms nothing in the projection moved.

**Keep the runtime code unchanged except where 2.2.0 forces an adaptation.** The parser's rules mirror `src/utils/task-progress.ts`; 2.1.x and 2.2.0 do not change task parsing (verified by identical `tasks[]` output), so only the two comments that name the mirrored version (lines 5 and 36) move. The one forced adaptation is the strict-warning deferral described below. Rewriting code with no behavioural reason would obscure the change and weaken the next upgrade diff.

**Defer 2.2.0's MODIFIED-length strict warning to the existing length gate.** 2.2.0's `validate --strict` warns when a MODIFIED requirement grows past 500 characters, and any warning fails under `--strict`. Refusing on that warning would replace the plugin's actionable length refusal - which names the limit, the official handling and the recovery action - with the CLI's issue list, and would let a policy written earlier in the start freeze before the refusal. `validateChange` therefore treats that single warning as input to the existing `loadPlanPreflights` length gate instead of refusing; the strict-validation position stays before policy resolution, matching `docs/review.md`. Alternative considered and rejected: moving `validateChange` after the policy and preflight gates, which changes which side effects run before a refusal and contradicts the documented gate order.

**Treat the new `validate` and `archive` behaviour as pass-through, not as projection work.** `openspec_validate` returns `items[].issues[]` as the CLI reports them, so a new `validate --strict` warning reaches the caller without a field change. `openspec_archive` already fails on a non-zero CLI result and returns the CLI's `status[].message`; 2.1.1's earlier refusal for an existing archive folder therefore surfaces through the existing error path. A regression test that pins the CLI's own rule would test the dependency rather than the plugin, so the test matrix re-runs the existing archive and validate cases against 2.2.0 instead of adding new ones.

**Keep the version bump in the same change.** The five packaged skills carry `metadata.generatedBy: dsh-openspec-flow@<version>`, which the skill test ties to `package.json`. A change that moves the CLI without moving the plugin version would leave the shipped skills naming a release whose dependency pin does not match theirs.

**Attribute the README payload figures to the environment they were measured in.** The tool-side figures at `README.md:238` come from a 1.16.1 measurement whose harness lives in `dsh-openspec-flow-eval`, so they cannot be re-run from this repository. Only the `instructions apply` byte count is measured again, on the fixture the README already names: a scratch project from `openspec init --tools none`, one change from `openspec new change measure`, a `tasks.md` of 39 single-line tasks, and `instructions apply --change measure --json | wc -c`. Substituting 2.2.0 into the older figures would present unmeasured numbers as 2.2.0 results.

## Risks / Trade-offs

- **`npm install` adds the CLI's new `skills` dependency tree and may rewrite unrelated entries.** → The lockfile diff is reviewed as its own hunk; the expected additions are `skills`, `nostics`, `tar` and `tar`'s tree (`chownr`, `minizlib`, `minipass`, `yallist`, `@isaacs/fs-minipass`), the hoisted `chalk` stays at 5.6.2 for `ora` while a nested 6.0.1 is added under `@fission-ai/openspec`, and `yaml` stays at 2.9.1. Any other move is explained before it is accepted.
- **A version literal is missed outside the inventoried files.** → The full suite runs before completion, and `test/openspec.test.mjs` plus `test/skills.test.mjs` fail on a stale pin rather than passing silently.
- **The README skills table gains a row the plugin cannot provide.** → The row is explicitly marked as not provided, matching the existing rows for the other unadapted official skills.
- **The 2.1.1 archive guard changes a failure message the plugin surfaces.** → The installed integration and e2e suites exercise archive against the real bundled CLI; a projection that dropped the CLI error would fail them.

## Migration Plan

The bundled CLI is an internal dependency, so there is no user data to migrate: a project opened with the new plugin runs 2.2.0 commands against the same `openspec/` tree and the plugin still writes no tool files into it.

Release order follows the maintainer guide: gates, version bump, archive, commit and push. Rollback restores `package.json`, `package-lock.json`, `lib/tasks.js`, the version literals in `test/openspec.test.mjs`, `test/skills.test.mjs` and `test/check-generated-skills.test.mjs`, the five `skills/*/SKILL.md` frontmatter blocks, `README.md`, `AGENTS.md`, `cordis.patch.yml`, `docs/upgrading-openspec-cli.md` and `docs/upgrading-dsh-runtime.md`, then runs `npm install` and the test matrix again.

## Open Questions

None.
