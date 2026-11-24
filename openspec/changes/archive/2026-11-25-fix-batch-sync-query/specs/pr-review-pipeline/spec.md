# pr-review-pipeline delta

## ADDED Requirements

### Requirement: Batch inspection per pull request

The batch SHALL read the open list with scalar fields only and SHALL obtain each candidate's changed paths from that pull request alone, never from the whole open list. A row whose changed paths cannot be read SHALL be reported as a refusal for that pull request with its reason and SHALL NOT stop the batch.

#### Scenario: The list request carries scalar fields only

- **WHEN** the batch reads the open list
- **THEN** the list request carries no changed paths and no merge state for the rows, and each candidate's changed paths come from one request for that pull request

#### Scenario: Eligibility reads one pull request

- **WHEN** a labeled non-draft pull request based on `main` changes exactly one active change
- **THEN** the batch reports it as eligible up to the update limit, and a pull request changing no active change or several is left out of the eligible set

#### Scenario: An inspection failure is a refusal

- **WHEN** one candidate's changed-path request fails after its retry
- **THEN** the batch reports that pull request as refused with the reason, counts it in neither the eligible set nor the remainder, and continues with the remaining candidates

### Requirement: Retry boundary

The open list, the fallback scalar list and the per-pull-request inspection or detail read SHALL be retried at most once when they fail with a transient gateway error: an HTTP 5xx response, a gateway timeout or a reset connection. The update-branch request, the head poll after an update, the authenticated-login read, a merge, a comment and a label write SHALL keep single-shot semantics, and a failure that is not transient SHALL be reported without a retry.

#### Scenario: A transient read failure is retried once

- **WHEN** a list, scalar-list, inspection or detail read fails with a transient gateway error
- **THEN** the command repeats that read once and uses the rows it returns

#### Scenario: The update-branch request is never retried

- **WHEN** the update-branch request fails with a transient gateway error
- **THEN** the batch reports the refusal for that pull request and sends no second update request

#### Scenario: A non-transient failure is reported without a retry

- **WHEN** a request fails with an unauthenticated, usage or malformed-response error
- **THEN** the command reports the error and makes no retry attempt

### Requirement: Unavailable batch list

When the open list still fails after one retry, the batch SHALL report an unavailable outcome with `unavailable: true` and `changed: false`, write no `syncs` record, update no branch and create no landing entry, and SHALL exit successfully so the scheduled run continues to the landing or review step.

#### Scenario: A gateway failure leaves the list unavailable

- **WHEN** the list request fails with a transient gateway error on the attempt and on its retry
- **THEN** the batch reports `unavailable: true` with `changed: false`

#### Scenario: An unavailable batch changes nothing

- **WHEN** the list is unavailable
- **THEN** no branch is updated, no `syncs` entry is recorded and no landing entry is created

#### Scenario: An unavailable batch does not stop the run

- **WHEN** the list is unavailable
- **THEN** the command exits successfully and the run continues to the landing or review step so reviews remain available

### Requirement: Poll retry and fallback

The poll SHALL retry its transiently failing full-detail list request once. When it still fails, the poll SHALL read a scalar list plus one detail request per pull request that needs evaluation, report the same candidates as the full-detail read and mark the result `fallback: true`. A remaining scalar-list or detail failure SHALL fail the poll instead of reporting a partial candidate list.

#### Scenario: A transient list failure is retried

- **WHEN** the full-detail list request fails once with a gateway error
- **THEN** the poll retries it and reports its candidates without the fallback marker

#### Scenario: The fallback reports the same candidates

- **WHEN** the full-detail request fails on both attempts
- **THEN** the poll reports the candidate numbers the full-detail read would report

#### Scenario: The fallback is marked

- **WHEN** the fallback serves the poll
- **THEN** the result carries `fallback: true`

#### Scenario: The fallback skips no eligible row

- **WHEN** the fallback evaluates the scalar list
- **THEN** every row is either given a detail request or skipped by the same recorded-head rule the full-detail read applies

#### Scenario: A partial candidate list is not reported

- **WHEN** the scalar list or any detail request remains unavailable after its retry
- **THEN** the poll fails and reports no candidate list
