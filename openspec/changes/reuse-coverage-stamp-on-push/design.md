# Design: reuse a passing coverage stamp on push

## Context

See [proposal.md](proposal.md) for the motivation. Current state that shapes the approach:

- [scripts/coverage.mjs](../../../scripts/coverage.mjs) deletes `.coverage/`, runs the instrumented suite, then assigns `process.exitCode` from `runGate`. A suite failure returns before `runGate` runs, and a gate error is thrown and caught; neither path sees a gate result. It never sees the violation list or the resolved base.
- [scripts/coverage-gate.mjs](../../../scripts/coverage-gate.mjs) computes `violations`, and in `updateBaseline` mode writes the baseline and returns `0` **before** the enforce check returns `1` for violations. Its exit code alone therefore cannot prove the run passed. `resolveBase` picks the first of `[base, 'origin/main', 'main']` that has a merge base, and the effective mode is `options.mode ?? config.mode ?? 'report'` inside `runGate`.
- [test/coverage-gate.test.mjs](../../../test/coverage-gate.test.mjs) calls `runGate` and asserts numeric codes, so the return type must stay a number.
- [.githooks/pre-push](../../../.githooks/pre-push) runs `npm run openspec:check`, then either exits on `COVERAGE_SKIP=1` or execs `npm run verify` (`merge-verification-entry` has renamed the entry that used to be `npm run coverage:check`).
- `.cache/` is already ignored ([.gitignore](../../../.gitignore)) and already holds the Node compile cache. `coverage.mjs` deletes `.coverage/`, so the stamp cannot live there.
- An archive commit moves `openspec/changes/**` and rewrites `openspec/specs/**`; it never touches the fingerprinted inputs.

## Goals / Non-Goals

**Goals**

- Skip only the verification rerun, never the strict artifact validation.
- Make the mint and clear decisions depend on the gate's own verdict and resolved base, not on an exit code that has a second meaning.
- Keep the failure mode additive: any doubt runs verification exactly as today.

**Non-Goals**

- No change to thresholds, baseline values, test suites or the instrumented run.
- No remote attestation. The stamp is a local gate hint, in the same trust class as the hook it serves.
- No reuse across machines, checkouts or clones; the stamp never leaves the checkout.

## Decisions

### Mint from an exported predicate and enforce callbacks

`runGate` keeps returning a number. It exports `shouldRecordStamp({ mode, updateBaseline, code, violations })`, true only for `mode === 'enforce' && updateBaseline === false && code === 0 && violations.length === 0`, and accepts `onEnforcePass` and `onEnforceFail`. `onEnforcePass` fires only when the predicate holds; `onEnforceFail` fires only for `mode === 'enforce' && !updateBaseline` with a nonzero code. Both calls sit after the `updateBaseline` early return, which closes the R1 hole: a baseline update that prints violations returns `0` but never fires either callback.

Alternative rejected: deriving "passed" from `process.exitCode === 0` in `coverage.mjs`. The update-baseline path proves that is wrong.

### Clear on evaluation failures only, in one tested function

`onEnforceFail` alone cannot cover a suite failure or a gate error, because `coverage.mjs` never reaches `runGate` in those cases. The clear therefore lives in `scripts/coverage-stamp.mjs` as `clearStampOnFailure({ root, mode, updateBaseline })`, which delegates to the dirty-tree-guarded `clearStamp` only when `mode === 'enforce' && !updateBaseline`. `coverage.mjs` calls it on:

1. the suite-failure early return,
2. the caught error around the `runGate` call only,
3. the `onEnforceFail` callback.

The catch is narrow on purpose. `parseArgs` and `assertCurrentNode` run before the suite and their failures say nothing about the committed inputs, so a wrong Node, an unknown argument or a missing `--reason` leaves the stamp untouched; a wrong Node on PATH is routine and must not cost the reuse. The mode rule moves into one exported `resolveMode(root, requested)`: `runGate` now resolves through it instead of its private expression, `coverage.mjs` uses it for the clear decision, and an unknown mode still throws a `GateError`. Two copies of the rule would drift and make the mint decision disagree with the verdict that produced it.

The preflight and argument exclusions are proven through an exported runner, not through a spawn. `coverage.mjs` gains an `import.meta.url` entry guard and exports `runVerification({ root = ROOT, argv, version })`; the CLI entry calls it with the process values. A test calls `runVerification({ root: fixtureRoot, argv: ['--bogus'] })` and `runVerification({ root: fixtureRoot, argv: [], version: 'v22.0.0' })`, which fail in `parseArgs` and `assertCurrentNode` respectively - both before the suite starts - and asserts the fixture's own stamp is untouched. Pointing the runner at the fixture is what makes the assertion meaningful: a spawn of the script always resolves `ROOT` to the real repository.

Alternative rejected: spawning `node scripts/coverage.mjs --bogus` against the repository. It exits before the suite, but it reads the developer's real stamp, so the assertion can pass while the wiring is wrong.

Both writers' dirty-tree refusal is a non-throwing no-op that reports its reason: it runs inside `onEnforcePass`, which `runGate` invokes, so throwing would turn a passing verification on a dirty tree into exit 2 - worse than the status quo the change replaces. A refused write or clear keeps the gate's exit code and leaves the record unchanged.

Alternative rejected: exporting the violation list and deciding in `coverage.mjs`. It duplicates the gate's mode and update-baseline rules in the caller.

### Pass the resolved base out of the gate

`resolveBase` becomes exported and `runGate` calls it once for the new-code diff, then hands that exact commit to `onEnforcePass({ base })`. The stamp records what the gate judged rather than recomputing `merge-base origin/main HEAD`, which differs when the invocation passes `--base main` or when only the `main` fallback resolves.

Alternative rejected: recording `merge-base origin/main HEAD` unconditionally. A `--base main` run would attest a base its verdict never used.

### Cover the measurement and gate inputs, and say so

The fingerprint covers `lib/`, `index.js`, `test/`, `package.json`, `package-lock.json`, `coverage.config.json`, `coverage.baseline.json`, `scripts/coverage.mjs`, `scripts/coverage-gate.mjs`, `scripts/coverage-stamp.mjs`, `scripts/run-tests.mjs` and `scripts/node-version.mjs`. The first list omitted the baseline and the gate scripts, so a commit that only loosens the baseline or the gate math would reuse a verdict the new code no longer produces.

The suite also reads `README.md`, `docs/review.md` and `skills/**` and asserts their content. Fingerprinting those paths would tie the stamp to documentation edits that cannot change coverage numbers, so they stay out and the limit is stated: a docs- or skills-only commit that breaks a suite assertion is pushed with verification skipped and fails on the next real run.

Alternative rejected: fingerprinting all of `scripts/`. It would invalidate on `bundle-pack.mjs`, which cannot change a verdict, and each needless rerun is the cost this change removes.

### Require a clean tree in the writers

The fingerprint is taken from `HEAD`, but the gate measured the working tree. Both `writeStamp` and `clearStamp` refuse when the tree is dirty, so the guard lives in the exported writers and a fixture can test it. Uncommitted paths under other `openspec/changes/` directories are exempt: the repository supports parallel changes, the directory carries no coverage input, and the pre-push seal rules already ignore it. Without the exemption a second untracked change directory would make every parallel change unable to mint a stamp. Requiring a clean tree makes the two objects the same and closes the revert loophole: a test edit that passes while uncommitted cannot mint a stamp for a commit that never contained it.

This makes the verification order load-bearing: `AGENTS.md` moves "run `npm run verify`" after the implementation commit, so the normal flow (implement, commit, verify, review, archive, push) mints a stamp that the archive commit preserves. A verification that runs on a dirty tree writes nothing and costs the next push one rerun, which is the status quo.

Alternative rejected: fingerprinting working-tree content instead of `HEAD`. It would allow dirty verification, but it also lets an untracked file under `test/` contribute to a verdict for a push that never carries it, and it costs a full read of `lib/` and `test/` on every push.

### Keep one definition of "verifies"

`coverage-gate` owns the record, the fingerprint, the base and the six checks. `development-workflow` says the hook skips the rerun "when the coverage stamp verifies as `coverage-gate` defines it" and does not restate the conditions. Restating them produced two different contracts in the first round; the archive scenario belongs to the capability that owns the check.

### Decide reuse in the hook through one script call

The hook runs `node scripts/coverage-stamp.mjs check`, whose exit code is the whole decision; the script prints the reason either way. The root defaults to the repository containing the script, as `coverage.mjs` and `run-tests.mjs` do; `--root` exists for fixture tests. The hook order is strict validation, then `COVERAGE_SKIP=1`, then the check, then `npm run verify`. `COVERAGE_SKIP=1` is handled before the check so it keeps skipping without a stamp.

### Test the predicate, the writers and the clear rule directly

The predicate and both callbacks are tested through `runGate` with stub callbacks. `writeStamp`, `clearStamp` and `clearStampOnFailure` are tested against a throwaway git repository: a dirty tree refuses both writes and clears, a failed-run clear removes the record only for enforce, and a stale record does not survive a successful write. `runVerification` is tested only on inputs that fail before the suite starts (`--bogus` and an unsupported version), so a test never runs the suite through the exported runner; nothing spawns a full run, because that would recurse into the test file. The single end-to-end assertion (a real passing run writes a stamp the check accepts, an archive-style commit keeps it, a committed `lib/` change invalidates it) belongs to the integration task.

Fixture repositories ignore `.cache/` so the clean-tree check sees a clean repo, and they are created directly rather than registered through `test/review-fixtures.mjs`, whose cleanup asserts that no recorded fixture root carries a `.cache` directory.

### Compare Node exactly, not by major

The stamped `process.version` must equal the running one. A Node change can move V8 coverage precision, so exact equality is the conservative choice; a patch upgrade costs one rerun and then the stamp is rewritten.

### Fail closed in the check, no-op in the writers

Every error in the `check` command - unreadable file, unknown record version, missing git, missing input path, missing base - exits nonzero, so the hook runs verification. The stamp cannot weaken the gate. The write and clear operations inside a passing run are the exception: they report a refusal and return, because a throwing writer would turn a passing verification into a failed command. A writer error other than the guard is a programming fault and may propagate only when it cannot be mistaken for a verification result.

## Risks / Trade-offs

- [Docs- and skills-only commits are not fingerprinted] -> Verification is skipped for them; a broken README, `docs/review.md` or `skills/**` assertion surfaces on the next normal run instead of at the push. Accepted to keep documentation edits from forcing full reruns.
- [A stale stamp passes after a revert-only change] -> Correct by construction: byte-identical committed inputs mean the recorded numbers still describe the tree, and the clean-tree write rule closes the uncommitted-revert case.
- [Dirty verification mints nothing and clears nothing] -> Accepted and documented; the flow verifies after the commit, and the fallback is the current rerun.
- [Untracked files force a rerun even when they cannot affect coverage] -> Accepted; the alternative is enumerating affected paths, which duplicates the scope definition and fails open when it drifts.
- [A repository without a local `origin/main` never reuses the stamp] -> The check resolves `[origin/main, main]` like the gate; a repository where neither resolves fails the base check closed.
- [A user bypasses the hook with `git push --no-verify`] -> Pre-existing and out of scope.
- [Strict Node patch equality invalidates after an upgrade] -> Expected; the first push after the upgrade reruns verification and rewrites the stamp.
- [The stamp is not signed and a contributor can edit it] -> The local gate is already bypassable with `git push --no-verify`; the stamp adds no new trust boundary.

## Migration Plan

1. Add `scripts/coverage-stamp.mjs`, the exported predicate, callbacks, `resolveBase` and `resolveMode`; no hook change yet.
2. Wire the write and the evaluation-failure clears into `coverage.mjs`.
3. Change the hook to call the check between validation and `npm run verify`.
4. Update `install-hooks.mjs`, `AGENTS.md`, `README.md`, the delta specs and the tests in the same commit.
5. Rollback: restore the unconditional `npm run verify` exec in the hook and drop the write and clear; the stamp file is inert and can stay.

## Open Questions

None.
