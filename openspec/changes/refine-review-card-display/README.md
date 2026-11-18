# refine-review-card-display

Refine the review card summary, optional rows, and readiness-reason grouping.

The change keeps the card payload and the Host unchanged: the client derives the
severity counts from the recorded findings, omits unrecorded optional finding and
disposition rows, and merges same-state readiness reasons into one line.
