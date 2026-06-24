/**
 * Field-Level Negotiation Engine
 *
 * Implements deterministic field-level negotiation between Agent field requirements
 * and Provider Pack field_mappings. Produces structured accepted | adapted | rejected
 * results with explicit changes[] or reasons[].
 *
 * This is Layer 1 of the two-layer negotiation strategy. Layer 2 (LLM Fallback)
 * is in a separate module.
 *
 * @module negotiator/field-negotiator
 */

import type { FieldMapping } from "@synapse-router/core";

// ─── Public Types ─────────────────────────────────────────────────────────

/** An Agent's request for a specific field */
export interface AgentFieldRequest {
  name: string;
  type: string;
  required: boolean;
}

/** A field that matched directly (same canonical and provider field name) */
export interface FieldMatch {
  canonicalField: string;
  providerField: string;
  type: string;
  required: boolean;
  transform?: string;
  fallback?: unknown;
}

/** A field that needs renaming (canonical name → provider name) */
export interface FieldRename {
  canonicalField: string;
  providerField: string;
  type: string;
}

/** A field needing type downgrade */
export interface TypeDowngrade {
  field: string;
  fromType: string;
  toType: string;
}

/** A missing field with its required status */
export interface MissingField {
  name: string;
  required: boolean;
}

/** Complete field comparison result */
export interface FieldComparison {
  matched: FieldMatch[];
  renamed: FieldRename[];
  missing: MissingField[];
  extra: string[];
  typeDowngrades: TypeDowngrade[];
}

/** Options controlling negotiation strictness */
export interface NegotiateOptions {
  allowFieldRenaming?: boolean;
  allowTypeDowngrade?: boolean;
  allowDroppingOptional?: boolean;
}

/** Negotiation result (aligned with core NegotiationResult shape) */
export type NegotiationDecision =
  | { status: "accepted" }
  | { status: "adapted"; changes: string[] }
  | { status: "rejected"; reasons: string[] };

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: NegotiateOptions = {
  allowFieldRenaming: true,
  allowTypeDowngrade: true,
  allowDroppingOptional: true,
};

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Find a field_mapping entry for a given canonical field name.
 */
function findMapping(
  fieldName: string,
  mappings: FieldMapping[]
): FieldMapping | undefined {
  return mappings.find((m) => m.canonical_field === fieldName);
}

// ─── compareFieldMappings ─────────────────────────────────────────────────

/**
 * Compare Agent field requests against Provider field_mappings.
 *
 * Produces a structured comparison that distinguishes:
 * - matched: fields present and accounted for in mappings
 * - renamed: fields whose canonical name differs from provider name
 * - missing: fields the Agent wants but have no mapping entry
 * - typeDowngrades: fields where type compatibility is questionable
 *
 * @param agentFields - Fields the Agent wants to use
 * @param mappings - Provider's field_mappings array
 * @returns Structured comparison result
 */
export function compareFieldMappings(
  agentFields: AgentFieldRequest[],
  mappings: FieldMapping[]
): FieldComparison {
  const matched: FieldMatch[] = [];
  const renamed: FieldRename[] = [];
  const missing: MissingField[] = [];
  const typeDowngrades: TypeDowngrade[] = [];

  for (const agentField of agentFields) {
    const mapping = findMapping(agentField.name, mappings);

    if (!mapping) {
      missing.push({ name: agentField.name, required: agentField.required });
      continue;
    }

    if (mapping.provider_field === agentField.name) {
      // Direct match: canonical field name = agent field name = provider field name
      matched.push({
        canonicalField: agentField.name,
        providerField: mapping.provider_field,
        type: agentField.type,
        required: mapping.required,
        transform: mapping.transform,
        fallback: mapping.fallback,
      });
    } else {
      // Field renamed: agent calls it X, provider calls it Y
      renamed.push({
        canonicalField: agentField.name,
        providerField: mapping.provider_field,
        type: agentField.type,
      });
    }
  }

  return {
    matched,
    renamed,
    missing,
    extra: [],
    typeDowngrades,
  };
}

// ─── resolveFieldNegotiation ──────────────────────────────────────────────

/**
 * Resolve a FieldComparison into a structured negotiation decision.
 *
 * Decision logic:
 * - If all required fields matched and no downgrades → accepted
 * - If only renames or optional drops or allowed downgrades → adapted (with changes[])
 * - If required fields missing or disallowed downgrades → rejected (with reasons[])
 *
 * @param comparison - The field comparison result
 * @param options - Negotiation options (defaults allow all adaptations)
 * @returns Negotiation decision
 */
export function resolveFieldNegotiation(
  comparison: FieldComparison,
  options?: NegotiateOptions
): NegotiationDecision {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const changes: string[] = [];
  const reasons: string[] = [];

  // Check for type downgrades
  if (comparison.typeDowngrades.length > 0) {
    if (opts.allowTypeDowngrade) {
      for (const d of comparison.typeDowngrades) {
        changes.push(`type downgrade: "${d.field}" from ${d.fromType} to ${d.toType}`);
      }
    } else {
      for (const d of comparison.typeDowngrades) {
        reasons.push(`type downgrade not allowed: "${d.field}" from ${d.fromType} to ${d.toType}`);
      }
    }
  }

  // Check for field renames
  if (comparison.renamed.length > 0 && opts.allowFieldRenaming) {
    for (const r of comparison.renamed) {
      changes.push(`field "${r.canonicalField}" → "${r.providerField}"`);
    }
  }

  // Check for missing fields — required vs optional
  const missingRequired = comparison.missing.filter((m) => m.required);
  const missingOptional = comparison.missing.filter((m) => !m.required);

  if (missingRequired.length > 0) {
    for (const m of missingRequired) {
      reasons.push(`no mapping for required field "${m.name}"`);
    }
  }

  if (missingOptional.length > 0) {
    if (opts.allowDroppingOptional) {
      for (const m of missingOptional) {
        changes.push(`field "${m.name}" has no provider mapping (dropped)`);
      }
    } else {
      for (const m of missingOptional) {
        reasons.push(`no mapping for field "${m.name}"`);
      }
    }
  }

  // Decision
  if (reasons.length > 0) {
    return { status: "rejected", reasons };
  }

  if (changes.length > 0) {
    return { status: "adapted", changes };
  }

  return { status: "accepted" };
}

// ─── negotiateFeature ─────────────────────────────────────────────────────

/**
 * Provider feature descriptor (subset of provider-card.json feature)
 */
export interface ProviderFeature {
  feature_id: string;
  intent: string;
  name: string;
  description?: string;
  input: {
    name: string;
    fields: Array<{ name: string; type: string; required?: boolean }>;
  };
  field_mappings: FieldMapping[];
}

/**
 * Negotiate a single intent against available Provider features.
 *
 * 1. Find all features matching the requested intent
 * 2. For each matching feature, compare Agent fields against its field_mappings
 * 3. Return the best result (accepted > adapted > rejected)
 *
 * @param intent - The Agent's intent (e.g. "chat", "text-to-image")
 * @param agentFields - Fields the Agent wants to use
 * @param availableFeatures - Provider features to negotiate against
 * @param options - Negotiation options
 * @returns Negotiation decision
 */
export function negotiateFeature(
  intent: string,
  agentFields: AgentFieldRequest[],
  availableFeatures: ProviderFeature[],
  options?: NegotiateOptions
): NegotiationDecision {
  // Find features matching the intent
  const matchingFeatures = availableFeatures.filter(
    (f) => f.intent === intent
  );

  if (matchingFeatures.length === 0) {
    return {
      status: "rejected",
      reasons: [`no provider found for intent "${intent}"`],
    };
  }

  // Try each matching feature, return the best result
  let bestRejected: NegotiationDecision | null = null;

  for (const feature of matchingFeatures) {
    const comparison = compareFieldMappings(
      agentFields,
      feature.field_mappings
    );

    const decision = resolveFieldNegotiation(comparison, options);

    if (decision.status === "accepted") {
      return decision; // Best possible outcome
    }

    if (decision.status === "adapted") {
      // Check if we already have a better adapted result
      if (!bestRejected || bestRejected.status === "rejected") {
        bestRejected = decision;
      }
    }

    if (decision.status === "rejected" && !bestRejected) {
      bestRejected = decision;
    }
  }

  if (bestRejected) {
    return bestRejected;
  }

  return {
    status: "rejected",
    reasons: [`no compatible feature found for intent "${intent}"`],
  };
}
