# Spec Delta

## MODIFIED Requirements

### Requirement: The client queries cards for the current turn

The Client SHALL render, in a `conversation.chat.turnTail` entry, the cards returned by `reviewCards/get` for the current session and turn number. A request MAY carry several turns of the session; the entry SHALL render only its own turn's cards. A turn without cards SHALL render nothing, and a card bound to another turn SHALL NOT be reused.

#### Scenario: A card appears after its turn

- **WHEN** a turn ends after a card file was written for the session
- **THEN** the turn tail queries `reviewCards/get` and shows that card

#### Scenario: A refresh keeps the card

- **WHEN** the page is refreshed after a turn with a card
- **THEN** the same turn tail query returns the bound card again

#### Scenario: No card is rendered without data

- **WHEN** the turn has no card file
- **THEN** the turn tail renders nothing
- **AND** an older turn's card is not reused

#### Scenario: The endpoint fails

- **WHEN** `reviewCards/get` fails
- **THEN** the turn tail renders nothing and the review flow is unaffected

## ADDED Requirements

### Requirement: The Host returns each card file once

For one request the Host SHALL return each card file at most once, even when two known project roots resolve to the same review root. A card returned once SHALL keep one turn binding and one delivery decision.

#### Scenario: Two project roots share a review root

- **WHEN** two known project roots resolve to the same review root and one card file belongs to the requested session and turn
- **THEN** the endpoint returns that card once
- **AND** the card records one turn binding

#### Scenario: Distinct review roots keep their cards

- **WHEN** two known project roots resolve to different review roots and each holds a card for the requested session
- **THEN** the endpoint returns both cards once each

### Requirement: The Host reads only the requested session's cards

The Host SHALL consider only card files whose name starts with the requested session key. A card file with another name SHALL NOT be parsed, bound or returned, even when its payload carries the requested session id. A malformed card file outside that name set SHALL NOT affect the request.

#### Scenario: A payload match with another file name is ignored

- **WHEN** a card file whose name does not start with the requested session key carries that session id in its payload
- **THEN** the endpoint does not return that card
- **AND** it does not bind the card to the turn

#### Scenario: A malformed unrequested card does not fail the request

- **WHEN** a file outside the requested session's name set is not valid JSON
- **THEN** the request returns the requested session's cards

#### Scenario: A legacy card keeps its session key prefix

- **WHEN** a legacy card file under `openspec/.review/<store>#<change>/cards/` starts with the requested session key
- **THEN** the endpoint reads and returns that card under the existing legacy rules

### Requirement: The Host answers a batch turn request

When `reviewCards/get` carries `turns`, the Host SHALL answer one `byTurn` entry for each turn, empty when no card answers, applying the existing binding, withholding, turn-window, watermark and ordering rules to each turn in ascending turn order. A repeated turn SHALL collapse to its first entry and bind once. A request with more than 64 turns or a non-positive turn SHALL answer `reviewCards/bad-argument`. A request without `turns` SHALL keep the single-turn `cards` answer.

#### Scenario: Two turns return their own cards

- **WHEN** a batch request carries turns 50 and 51 and each has a bound card
- **THEN** `byTurn["50"]` returns the turn-50 card
- **AND** `byTurn["51"]` returns the turn-51 card

#### Scenario: A repeated turn binds once

- **WHEN** a batch request carries the same turn twice
- **THEN** the Host answers one `byTurn` entry for that turn
- **AND** it binds and returns that turn's card once

#### Scenario: Each batch turn applies its own window

- **WHEN** a batch turn carries a turn end time and an unclaimed card was written after it
- **THEN** that turn does not bind or return the later card
- **AND** a later turn in the same batch may bind it

#### Scenario: Unclaimed cards bind in ascending turn order

- **WHEN** a batch carries two turns and unclaimed cards fall in each turn's window
- **THEN** the Host binds each card to the turn whose window contains it
- **AND** the binding follows ascending turn order

#### Scenario: Too many turns are rejected

- **WHEN** a batch request carries 65 turns
- **THEN** the Host answers `reviewCards/bad-argument`
- **AND** it binds no card

#### Scenario: A request without turns keeps the cards answer

- **WHEN** a request omits `turns`
- **THEN** the response keeps the single-turn `cards` array
- **AND** it carries no `byTurn` object

#### Scenario: An unreadable card does not fail the batch

- **WHEN** one matching card file in a batch turn is not valid JSON
- **THEN** the Host skips that file
- **AND** the other turns in the batch keep their answers

#### Scenario: A directory lock failure keeps the turn entry

- **WHEN** a review directory's lock is held while a batch turn reads it
- **THEN** that turn's `byTurn` entry still exists
- **AND** it carries the cards from the other directories
- **AND** the other turns still answer

### Requirement: A batch leaves the watermark of sequential requests

After a batch the per-session delivery watermark SHALL equal the watermark left by the same turns requested one at a time in ascending turn order. A turn end time SHALL NOT advance the watermark past that time, and the Host SHALL persist the watermark once per review directory for the batch.

#### Scenario: Batch and sequential leave the same watermark

- **WHEN** the same turns are answered once as a batch and once one at a time
- **THEN** both runs leave the same `lastDeliveredAt` for the session

#### Scenario: A batch turn end bounds the watermark

- **WHEN** a batch turn carries an end time earlier than the current time
- **THEN** the stored watermark does not pass that end time

#### Scenario: A batch writes each directory watermark once

- **WHEN** a batch answers cards from one review directory
- **THEN** the Host writes that directory's `card-delivery.json` once for the batch

### Requirement: The Client merges turn queries per session

The Client SHALL merge the card queries of one session's turn tails into one batch request carrying each turn's own window. It SHALL dispatch each `byTurn` entry to its turn tail, render only that turn's cards, and fall back to single-turn requests for those turns when the batch request fails. A turn missing from the answer SHALL render nothing.

#### Scenario: Two turn tails share one request

- **WHEN** two completed turns of one session mount together
- **THEN** the client sends one batch request carrying both turns
- **AND** each turn tail renders only the cards of its own turn

#### Scenario: The batch carries each turn's window

- **WHEN** the turn tails carry start and end times
- **THEN** each batch turn carries its own `from` and `to` values
- **AND** an implausible or missing time is omitted for that turn

#### Scenario: A failed batch falls back to single-turn requests

- **WHEN** the batch request fails
- **THEN** each affected turn tail issues its own single-turn request
- **AND** each renders its own card or nothing

#### Scenario: A turn with an empty entry renders nothing

- **WHEN** the batch answer carries an empty array for a turn
- **THEN** that turn tail renders nothing
