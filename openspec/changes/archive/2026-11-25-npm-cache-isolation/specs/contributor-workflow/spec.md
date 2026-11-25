# contributor-workflow delta

## ADDED Requirements

### Requirement: The lab job pins the repository npm cache

The CI lab job SHALL set `OPENSPEC_FLOW_NPM_CACHE` to the npm cache directory restored by `actions/setup-node` before any lab command, so the lab resolves the same cache instead of downloading DSH dependencies into a fresh directory. The workflow test SHALL assert the value and that its assignment precedes `npm run lab -- doctor`.

#### Scenario: The lab job points the lab at the setup-node cache

- **WHEN** the lab job starts
- **THEN** it writes `OPENSPEC_FLOW_NPM_CACHE=$HOME/.npm` to `$GITHUB_ENV` before the doctor and the lab

#### Scenario: The workflow test asserts the pinned cache

- **WHEN** the workflow test reads the lab job
- **THEN** it checks the value and that the assignment precedes `npm run lab -- doctor`
