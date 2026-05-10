import type { PricingRule } from "./types.js";

/**
 * Internal type matching provider-card.json pricing structure.
 * Example real packs:
 *   openai:    { input: 0.0015, output: 0.002, unit: "1k tokens" }
 *   stability: { input: 0.0,   output: 0.04,  unit: "per image" }
 *   replicate: (no pricing field)
 *   comfyui:   (no pricing field)
 */
interface ProviderCardPricing {
  input?: number;
  output?: number;
  unit?: string;
}

/**
 * Convert provider card pricing JSON into a PricingRule.
 *
 * Handling strategy (priority order):
 * 1. undefined pricing -> flat costPerCall: 0 (covers replicate/comfyui)
 * 2. /token/i.test(unit) -> perToken strategy with inputPrice/outputPrice
 * 3. /^per\s/i.test(unit) AND NOT /call|request/i -> perUnit strategy
 * 4. Everything else -> flat strategy (per call / per request / unrecognized)
 *
 * Pure function: no side effects, no state, no I/O.
 */
export function pricingFromProviderCard(
  pricing: ProviderCardPricing | undefined,
): PricingRule {
  if (!pricing) {
    return { strategy: "flat", costPerCall: 0 };
  }

  const input = pricing.input ?? 0;
  const output = pricing.output ?? 0;
  const unit = pricing.unit ?? "per call";

  // Token-based: "1k tokens", "1M tokens", "per token", "1000 tokens"
  if (/token/i.test(unit)) {
    return {
      strategy: "perToken",
      unit,
      inputPrice: input,
      outputPrice: output,
    };
  }

  // Unit-based: only recognize known per-unit patterns (image, minute, second, hour, day, character, word, page, item, unit)
  // Must NOT be "per call" or "per request" (those go to flat)
  const knownPerUnitKeywords = ["image", "minute", "second", "hour", "day", "character", "word", "page", "item", "unit"];
  const unitAfterPer = unit.replace(/^per\s+/i, "").trim().toLowerCase();
  if (/^per\s/i.test(unit) && !/call|request/i.test(unit) && knownPerUnitKeywords.some((kw) => unitAfterPer === kw || unitAfterPer.endsWith(" " + kw) || unitAfterPer.endsWith("-" + kw))) {
    return {
      strategy: "perUnit",
      unit,
      unitPrice: output > 0 ? output : input,
    };
  }

  // Flat: "per call", "per request", or any unrecognized unit
  return {
    strategy: "flat",
    unit: "per call",
    costPerCall: input + output,
  };
}
