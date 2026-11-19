# Spec Delta

## ADDED Requirements

### Requirement: The lab job installs a CJK font

The CI lab job SHALL install `fonts-wqy-zenhei` before `npm run lab -- doctor`, so the doctor's CJK font check passes without the larger `fonts-noto-cjk` download. The workflow test SHALL assert the package the workflow installs.

#### Scenario: The lab job installs its CJK font

- **WHEN** the lab job prepares the doctor's prerequisites
- **THEN** it installs `fonts-wqy-zenhei` before `npm run lab -- doctor`
- **AND** the workflow test asserts that package name
