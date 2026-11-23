/**
 * OpenSpec CLI verbs a description or a document must not present as an instruction.
 *
 * Shared so the description, document and skill guards reject the same command
 * set; a fourth hand-written list drifts and lets a command through.
 */
export const CLI_COMMAND = /\bopenspec (?:validate|archive|list|status|show|new|init|update|view|diff|schemas|instructions|config|store|completion)\b/
