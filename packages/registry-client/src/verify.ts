// ─── Registry Verification Submission & Manifest Fetch (D-14~D-16) ──────
// Fire-and-forget verification result submission + remote manifest pull.
// Registry unavailability MUST NOT block the main pipeline (D-14).

import type { RegistryClient } from "./client.js";

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Verification result submitted to Registry.
 * Mirrors VerificationResult from negotiator, adding schema_id + provider_id
 * for Registry-side indexing.
 */
export interface VerificationSubmission {
  schema_id: string;
  provider_id: string;
  status: "manifest_mismatch" | "mock_failure" | "timeout" | "passed";
  manifest_diff?: {
    missing: string[];
    extra: string[];
    type_mismatch: Array<{ field: string; expected: string; actual: string }>;
  };
  mock_result?: {
    request_sent: unknown;
    response_received: unknown;
    error_message: string;
  };
  verified_at: string;
}

// ─── submitVerification ───────────────────────────────────────────────────

/**
 * Fire-and-forget POST to Registry's contract-verifications endpoint.
 *
 * - null client: silently returns (D-14: Registry is optional)
 * - 5 second timeout via AbortSignal
 * - All errors silently caught (D-16: never block the main pipeline)
 * - Authorization header set from SYNAPSE_REGISTRY_TOKEN if present
 */
export async function submitVerification(
  client: RegistryClient | null,
  result: VerificationSubmission,
): Promise<void> {
  if (!client) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = process.env["SYNAPSE_REGISTRY_TOKEN"];
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    await fetch(`${client.registryUrl}/api/v1/contract-verifications`, {
      method: "POST",
      headers,
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Fire-and-forget: silently ignore all errors (D-16)
  }
}

// ─── fetchPackManifest ────────────────────────────────────────────────────

/**
 * Fetch the remote manifest (spec) for a pack from the Registry.
 *
 * - null client: returns null
 * - Any failure (network, auth, not-found): returns null
 *
 * Returns the raw spec object from the Registry pack detail,
 * or null if the Registry is unavailable or the pack is not found.
 */
export async function fetchPackManifest(
  client: RegistryClient | null,
  ns: string,
  name: string,
): Promise<Record<string, unknown> | null> {
  if (!client) return null;

  try {
    const detail = await client.getPack(ns, name);
    return (detail.spec as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}
