/**
 * Intent matching — canonical intent comparison used by negotiation.
 *
 * Kept in the negotiator package so the API layer (and any other caller)
 * uses one implementation of "do these two intents refer to the same
 * capability" instead of re-implementing the rule per layer.
 */

/**
 * Normalize an intent label: lowercase and drop `_` / `-` separators so that
 * "text_to_image", "text-to-image" and "texttoimage" compare equal.
 */
export function normalizeIntent(intent: string): string {
  return intent.toLowerCase().replace(/[_-]/g, "");
}

/**
 * Returns true when `agentIntent` and `featureIntent` are compatible.
 *
 * Matching is bidirectional substring matching after normalization, so
 * "chat" matches "chat-completions" and vice versa.
 */
export function intentsMatch(agentIntent: string, featureIntent: string): boolean {
  const a = normalizeIntent(agentIntent);
  const b = normalizeIntent(featureIntent);
  return a.includes(b) || b.includes(a);
}