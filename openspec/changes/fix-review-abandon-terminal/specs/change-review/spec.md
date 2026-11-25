## ADDED Requirements

### Requirement: An abandoned review stays abandoned

A record with state `abandoned` SHALL be closed. A finding `dispose` or `waive`, `self-report`, `retry`, `replace`, `waive-reviewer` and `extend`, and an `openspec_reviewer` `submit`, SHALL fail on it for either review kind and leave the record unchanged. No reviewer SHALL be messaged or started. The error SHALL name the review kind, state that the review was abandoned and name the recovery: start a new change or remove the review record. Read actions SHALL keep working.

#### Scenario: A finding disposition is refused

- **WHEN** the record is abandoned and `action: "dispose"` or a finding `action: "waive"` names the review kind
- **THEN** the call fails and states that the review of that kind was abandoned with the recovery
- **AND** the record state and every finding keep their status

#### Scenario: A reviewer submit is refused

- **WHEN** the record is abandoned and the slot reviewer calls `openspec_reviewer` with `action: "submit"`
- **THEN** the call fails and states that the review of that kind was abandoned with the recovery
- **AND** no report is written, the record is unchanged and the changer is not woken

#### Scenario: A self-report is refused

- **WHEN** the record is abandoned and `action: "self-report"` is called for the review kind
- **THEN** the call fails and states that the review of that kind was abandoned with the recovery
- **AND** no report is written and the record is unchanged

#### Scenario: Reviewer recovery actions are refused

- **WHEN** the record is abandoned and `retry`, `replace` or `waive-reviewer` is called for the review kind
- **THEN** the call fails and states that the review of that kind was abandoned with the recovery
- **AND** no reviewer is messaged or started and the record is unchanged

#### Scenario: An extension is refused

- **WHEN** the record is abandoned and `extend` is called with user approval, a reason and minutes
- **THEN** the call fails and states that the review of that kind was abandoned with the recovery
- **AND** no extension is recorded

#### Scenario: Reads still work

- **WHEN** the record is abandoned and `status`, `report` for a recorded round or the reviewer `read` is called
- **THEN** the call is not refused for the abandonment and reports the abandoned state
