# Spec Delta

## ADDED Requirements

### Requirement: The verification example matches the finding status

The report contract SHALL show a `verifications` example whose status options are legal for the status of the finding it names. It MAY offer `verified-fixed` only for a finding that is `fixed`; for an `open` finding it SHALL offer `still-open` and `regressed` alone, because the report validator refuses `verified-fixed` for a finding the changer has not disposed `fixed`.

#### Scenario: An open finding gets no verified-fixed option

- **WHEN** the apply brief is built for a round that starts with recorded finding `R1-01` in status `open`
- **THEN** the `verifications` example names `R1-01` and offers `still-open` and `regressed` only
- **AND** it does not offer `verified-fixed` for that finding

#### Scenario: A fixed finding keeps the verified-fixed option

- **WHEN** the apply brief is built for a round that starts with recorded finding `R1-01` in status `fixed`
- **THEN** the `verifications` example names `R1-01` and offers `verified-fixed`, `still-open` and `regressed`
