# contributor-workflow Delta

## ADDED Requirements

### Requirement: CI lab job provisions pnpm

The CI lab job SHALL install a pinned pnpm before `npm run lab -- doctor` and `npm run test:lab -- --mock-only`, because DSH forwards plugin installation to pnpm. The workflow test SHALL assert that the action is in the lab job before `npm ci`, that the version is pinned, and that the lab documentation names the same version.

#### Scenario: A bare runner runs the lab

- **WHEN** the lab job starts on a runner without pnpm
- **THEN** it installs the pinned pnpm before the doctor and the lab
- **AND** the lab can add the plugin tarball

#### Scenario: The action is misplaced or unpinned

- **WHEN** the pnpm action is absent from the lab job, follows `npm ci`, or omits an explicit version
- **THEN** the workflow test fails and names the missing placement or pin

#### Scenario: The documented pin drifts

- **WHEN** the workflow's pnpm version and the version in `docs/lab.md` differ
- **THEN** the workflow test fails and reports both versions
