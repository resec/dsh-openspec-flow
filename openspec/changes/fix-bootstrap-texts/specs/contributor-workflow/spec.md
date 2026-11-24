# Spec Delta

## ADDED Requirements

### Requirement: Bootstrap points at activate.sh only when it works

Bootstrap SHALL present the `source scripts/activate.sh` step at the end of a
successful run only when the clone holds a clone-local Node runtime at
`.cache/toolchain/node/bin/node`. Otherwise the closing hint SHALL name the host
runtime the run used, direct the user to `npm run verify`, and describe the
activate step as conditional on a later clone-local download instead of
presenting it as the next step.

#### Scenario: A clone-local runtime exists

- **WHEN** bootstrap finishes and `.cache/toolchain/node/bin/node` exists
- **THEN** the closing hint presents `source scripts/activate.sh` and `npm run verify`

#### Scenario: The run used a host runtime

- **WHEN** bootstrap finishes without `.cache/toolchain/node/bin/node`
- **THEN** the closing hint does not present `source scripts/activate.sh` as the next step
- **AND** it names the host runtime and `npm run verify`
