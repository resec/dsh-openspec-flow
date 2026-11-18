# Fix CI test environment

## Why

The first CI run after the workflow was added failed in both jobs. A clean checkout cannot run the suite because the review tests copy a probe project from a sibling `.probe` directory that is not tracked, and the lab job cannot install the plugin because DSH forwards installation to pnpm, which the Ubuntu runner does not provide. Both passed locally only because this workstation has the sibling directory and a global pnpm. The same run showed that the lab doctor reports ready without pnpm, so the documented prerequisite is not enforced before the lab starts.

## What Changes

- Move the review probe project under `test/fixtures/probe/openspec/` and make `test/review-fixtures.mjs` the single source of the probe path; the inspect and integration tests import that path instead of defining their own.
- Add a repository-layout assertion that the probe path stays inside the repository, that no test module recomputes it, and that every fixture file is tracked.
- Check pnpm in the lab doctor and fail with a correction-oriented message when it is missing.
- Install a pinned pnpm in the CI lab job before the doctor and the lab, and assert its placement, pin and documentation in the CI workflow test.
- List pnpm in `docs/lab.md`, `CONTRIBUTING.md` and the README doctor summary.
- No runtime behavior, public API, dependency version or macOS CI changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: add a requirement that review fixture data is tracked and resolved through one shared fixture path inside the repository.
- `contributor-workflow`: add a requirement that the CI lab job provisions a pinned pnpm.
- `lab-harness`: extend the doctor preflight to check pnpm.

## Impact

- Tests: `test/review-fixtures.mjs`, `test/inspect.test.mjs`, `test/integration.test.mjs`, `test/repo-layout.test.mjs`, `test/lab-doctor.test.mjs`, `test/ci-workflow.test.mjs`.
- Fixture data: `test/fixtures/probe/openspec/**`.
- Lab: `scripts/lab/core/doctor.mjs`.
- CI: `.github/workflows/ci.yml`.
- Documentation: `docs/lab.md`, `CONTRIBUTING.md`, `README.md`.
- No runtime code, public API or dependency versions change.
