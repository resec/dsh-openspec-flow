# fix-batch-sync-query

Split the batch sync and poll GitHub list reads so a heavy single GraphQL request cannot fail the scheduled run, and degrade an unavailable batch instead of aborting.
