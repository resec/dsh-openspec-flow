/**
 * OpenSpec CLI verbs a description or a document must not present as an instruction.
 *
 * Shared by the description and document guards so both reject the same command
 * set; a second hand-written list drifts and lets a command through. The skill
 * guard keeps its own narrower list because it also rejects a bare `openspec`
 * and an alias command, which a description may legitimately mention.
 */
export const CLI_COMMAND = /\bopenspec (?:validate|archive|list|status|show|new|init|update|view|diff|schemas|instructions|config|store|completion|context|workset)\b/
