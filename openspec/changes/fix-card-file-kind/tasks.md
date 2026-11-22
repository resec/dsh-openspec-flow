# Tasks

## 1. Name the file after its kind

- [x] 1.1 Add the kind to the card file name and to the marker.
- [x] 1.2 Update the existing path and marker assertions.

## 2. Keep the old name readable

- [x] 2.1 Confirm the reader selects by the session-key prefix, so the earlier name still loads.
- [x] 2.2 Add a test that delivers a card written under the earlier name.

## 3. Guard the coexistence

- [x] 3.1 Add a test that writes a draft and an apply card for one session and round and returns both.

## 4. Document and verify

- [x] 4.1 State the new layout and the readable earlier name in `docs/review.md`.
- [x] 4.2 Run `openspec validate fix-card-file-kind --strict`, `npm test`, `npm run openspec:check` and `npm run layout:check`.

## 5. Apply review follow-up

- [x] 5.1 A marker written before the kind existed still matches, so a recorded card is not written twice.
- [x] 5.2 The write test asserts the literal file name, not only the shared path helper.
- [x] 5.3 `docs/review.md` names the kind in the marker and the earlier kind-less match; `docs/upgrading-dsh-runtime.md` shows the kind-bearing layout.
