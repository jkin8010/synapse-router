// @synapse-router/cli — `synapse profile` command
// Provider profile aggregation from events.ndjson + inspection CLI

import { readFile, readdir, writeFile, access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { HELP_PROFILE } from "../utils/help.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function synapseDir(cwd: string = process.cwd()) {
  return join(cwd, ".synapse");
}

function profilesDir(cwd: string = process.cwd()) {
  return join(synapseDir(cwd), "profiles");
}

function eventsPath(cwd: string = process.cwd()) {
  return join(synapseDir(cwd), "watchdog", "events.ndjson");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileEvent {
  t: string;
  p: string;
  f: string;
  status: string;
  code?: string;
  latency?: number;
  tokens?: number;
  cost?: number;
}

export interface ProviderProfile {
  provider: string;
  updated_at: string;
  sample_count: number;
  success_rate: number;
  latency_ms: { p50: number; p95: number; p99: number };
  error_breakdown: Record<string, number>;
  cost_per_1k: number;
  features: Record<string, FeatureProfile>;
}

interface FeatureProfile {
  success_rate: number;
  latency_p50: number;
  sample_count: number;
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}

// ---------------------------------------------------------------------------
// Events loading
// ---------------------------------------------------------------------------

async function loadEvents(eventsFilePath: string): Promise<ProfileEvent[]> {
  try {
    const content = await readFile(eventsFilePath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: ProfileEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    return events;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Profile building (aggregation from events)
// ---------------------------------------------------------------------------

function buildProfilesFromEvents(events: ProfileEvent[]): ProviderProfile[] {
  const byProvider = new Map<string, ProfileEvent[]>();

  for (const e of events) {
    const p = e.p;
    if (!byProvider.has(p)) byProvider.set(p, []);
    byProvider.get(p)!.push(e);
  }

  const profiles: ProviderProfile[] = [];

  for (const [provider, evts] of byProvider) {
    const total = evts.length;
    const ok = evts.filter((e) => e.status === "ok").length;
    const successRate = total > 0 ? ok / total : 0;

    const latencies = evts
      .map((e) => e.latency)
      .filter((l): l is number => typeof l === "number")
      .sort((a, b) => a - b);

    const errorCounts: Record<string, number> = {};
    for (const e of evts) {
      if (e.status === "error" || e.status === "timeout") {
        const code = e.code ?? "unknown";
        errorCounts[code] = (errorCounts[code] ?? 0) + 1;
      }
    }
    const errorBreakdown: Record<string, number> = {};
    for (const [code, count] of Object.entries(errorCounts)) {
      errorBreakdown[code] = Math.round((count / total) * 10000) / 10000;
    }

    const tokensArr = evts
      .map((e) => e.tokens)
      .filter((t): t is number => typeof t === "number");
    const costArr = evts
      .map((e) => e.cost)
      .filter((c): c is number => typeof c === "number");
    const totalCost = costArr.reduce((s, c) => s + c, 0);
    const totalTokens = tokensArr.reduce((s, t) => s + t, 0);
    const costPer1k = totalTokens > 0 ? Math.round((totalCost / totalTokens) * 100000) / 100000 : 0;

    // Per-feature breakdown
    const byFeature = new Map<string, ProfileEvent[]>();
    for (const e of evts) {
      const f = e.f;
      if (!byFeature.has(f)) byFeature.set(f, []);
      byFeature.get(f)!.push(e);
    }
    const features: Record<string, FeatureProfile> = {};
    for (const [feat, fevts] of byFeature) {
      const fOk = fevts.filter((e) => e.status === "ok").length;
      const flatencies = fevts
        .map((e) => e.latency)
        .filter((l): l is number => typeof l === "number")
        .sort((a, b) => a - b);
      features[feat] = {
        success_rate: fevts.length > 0 ? Math.round((fOk / fevts.length) * 10000) / 10000 : 0,
        latency_p50: flatencies.length > 0 ? percentile(flatencies, 50) : 0,
        sample_count: fevts.length,
      };
    }

    profiles.push({
      provider,
      updated_at: evts[evts.length - 1]?.t ?? new Date().toISOString(),
      sample_count: total,
      success_rate: Math.round(successRate * 10000) / 10000,
      latency_ms: {
        p50: latencies.length > 0 ? percentile(latencies, 50) : 0,
        p95: latencies.length > 0 ? percentile(latencies, 95) : 0,
        p99: latencies.length > 0 ? percentile(latencies, 99) : 0,
      },
      error_breakdown: errorBreakdown,
      cost_per_1k: costPer1k,
      features,
    });
  }

  return profiles;
}

// ---------------------------------------------------------------------------
// Profile persistence
// ---------------------------------------------------------------------------

async function loadProfile(provider: string): Promise<ProviderProfile | null> {
  const path = join(profilesDir(), `${provider}.json`);
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveProfile(profile: ProviderProfile): Promise<void> {
  const dir = profilesDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${profile.provider}.json`), JSON.stringify(profile, null, 2) + "\n", "utf8");
}

export async function loadAllProfiles(): Promise<ProviderProfile[]> {
  const dir = profilesDir();
  const results: ProviderProfile[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const provider = entry.name.replace(/\.json$/, "");
    const profile = await loadProfile(provider);
    if (profile) results.push(profile);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Subcommand: list
// ---------------------------------------------------------------------------

async function listProfiles(): Promise<void> {
  const events = await loadEvents(eventsPath());
  const profiles = events.length > 0
    ? buildProfilesFromEvents(events)
    : await loadAllProfiles();

  if (profiles.length === 0) {
    console.log("No provider profiles found.");
    console.log("Profiles are built from .synapse/watchdog/events.ndjson data.");
    return;
  }

  console.log();
  console.log("Provider Profiles:");
  console.log("");

  for (const p of profiles) {
    const rate = (p.success_rate * 100).toFixed(1);
    const count = String(p.sample_count).padStart(6);
    console.log(`  ${p.provider.padEnd(18)} ${count} samples  ${rate}% success  p50=${p.latency_ms.p50}ms  p95=${p.latency_ms.p95}ms`);
  }

  console.log();
  console.log(`${profiles.length} provider(s)`);
}

// ---------------------------------------------------------------------------
// Subcommand: show
// ---------------------------------------------------------------------------

async function showProfile(provider: string): Promise<void> {
  if (!provider) {
    console.error("Error: provider name required");
    console.error("Usage: synapse profile show <provider>");
    process.exit(1);
  }

  // Try cached profile first, then events
  let profile = await loadProfile(provider);
  if (!profile) {
    const events = await loadEvents(eventsPath());
    const providerEvents = events.filter((e) => e.p === provider);
    if (providerEvents.length === 0) {
      console.error(`Error: no data found for provider "${provider}"`);
      console.error("Available data sources:");
      console.error("  - .synapse/watchdog/events.ndjson");
      console.error("  - .synapse/profiles/*.json");
      process.exit(1);
    }
    const profiles = buildProfilesFromEvents(providerEvents);
    profile = profiles[0];
  }

  const rate = (profile.success_rate * 100).toFixed(1);

  console.log(`
  Provider:    ${profile.provider}
  Updated:     ${profile.updated_at}
  Samples:     ${profile.sample_count}
  Success:     ${rate}%
  Latency:
    p50:       ${profile.latency_ms.p50}ms
    p95:       ${profile.latency_ms.p95}ms
    p99:       ${profile.latency_ms.p99}ms
  Cost/1K:     $${profile.cost_per_1k.toFixed(5)}`);

  if (Object.keys(profile.error_breakdown).length > 0) {
    console.log("  Errors:");
    for (const [code, rate2] of Object.entries(profile.error_breakdown)) {
      console.log(`    ${code}:  ${(rate2 * 100).toFixed(1)}%`);
    }
  }

  if (Object.keys(profile.features).length > 0) {
    console.log("  Features:");
    for (const [feat, fp] of Object.entries(profile.features)) {
      const fRate = (fp.success_rate * 100).toFixed(1);
      console.log(`    ${feat.padEnd(18)} ${String(fp.sample_count).padStart(5)} samples  ${fRate}% success  p50=${fp.latency_p50}ms`);
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: reset
// ---------------------------------------------------------------------------

async function resetProfile(provider: string): Promise<void> {
  if (!provider) {
    console.error("Error: provider name required");
    console.error("Usage: synapse profile reset <provider>");
    process.exit(1);
  }

  const path = join(profilesDir(), `${provider}.json`);
  try {
    await rm(path);
    console.log(`✓ Profile "${provider}" reset`);
  } catch {
    console.log(`No profile found for "${provider}" — nothing to reset`);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: stats (global)
// ---------------------------------------------------------------------------

async function showGlobalStats(): Promise<void> {
  const events = await loadEvents(eventsPath());
  const profiles = events.length > 0
    ? buildProfilesFromEvents(events)
    : await loadAllProfiles();

  if (profiles.length === 0) {
    console.log("No data available.");
    return;
  }

  const totalSamples = profiles.reduce((s, p) => s + p.sample_count, 0);
  const totalSuccess = profiles.reduce(
    (s, p) => s + Math.round(p.success_rate * p.sample_count),
    0,
  );
  const overallRate = totalSamples > 0 ? (totalSuccess / totalSamples * 100).toFixed(1) : "0.0";

  // P50 across all providers (weight by sample count — approximate)
  const allLatenciesSorted = profiles
    .flatMap((p) => [p.latency_ms.p50])
    .sort((a, b) => a - b);

  console.log(`
  Synapse Global Stats
  ─────────────────────
  Total Providers:     ${profiles.length}
  Total Requests:      ${totalSamples}
  Overall Success:     ${overallRate}%
  Provider Latency (p50 range): ${allLatenciesSorted[0] ?? 0}ms – ${allLatenciesSorted[allLatenciesSorted.length - 1] ?? 0}ms
`);

  // Per-provider summary line
  for (const p of profiles) {
    const rate = (p.success_rate * 100).toFixed(1);
    console.log(`  ${p.provider.padEnd(18)} ${String(p.sample_count).padStart(6)} req  ${rate}% ok  p50=${p.latency_ms.p50}ms`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Refresh: rebuild profiles from events
// ---------------------------------------------------------------------------

async function refreshProfiles(): Promise<void> {
  const events = await loadEvents(eventsPath());
  if (events.length === 0) {
    console.log("No events found in .synapse/watchdog/events.ndjson");
    return;
  }

  const profiles = buildProfilesFromEvents(events);
  for (const profile of profiles) {
    await saveProfile(profile);
  }

  console.log(`✓ ${profiles.length} profile(s) refreshed from ${events.length} event(s)`);
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printProfileHelp(): void {
  console.log(HELP_PROFILE);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleProfileCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printProfileHelp();
    return;
  }

  const subcommand = argv[0];

  switch (subcommand) {
    case "list":
      await listProfiles();
      break;
    case "show":
      await showProfile(argv[1]);
      break;
    case "reset":
      await resetProfile(argv[1]);
      break;
    case "stats":
      await showGlobalStats();
      break;
    case "refresh":
      await refreshProfiles();
      break;
    default:
      // Default to list if no subcommand
      if (!subcommand) {
        await listProfiles();
      } else {
        console.error(`Unknown profile subcommand: ${subcommand}`);
        printProfileHelp();
        process.exit(1);
      }
  }
}
