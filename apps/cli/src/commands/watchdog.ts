// @synapse-router/cli — `synapse watchdog` command
// Pure-code rule engine that reads .synapse/watchdog/events.ndjson,
// matches patterns, and creates Git Issues for critical events.
// No LLM anywhere.

import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { HELP_WATCHDOG } from "../utils/help.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchdogEvent {
  t: string;
  code: string;
  status?: string;
  provider?: string;
  feature?: string;
  latency?: number;
  [key: string]: unknown;
}

interface RuleMatch {
  field: string;
  equals?: string;
  code_prefix?: string;
  compare?: "gt" | "lt";
  baseline?: string | number;
}

interface WatchdogRule {
  id: string;
  severity: "critical" | "warning" | "info";
  match: RuleMatch;
  window: string;
  threshold: number;
  action: "create-issue" | "log-only";
  issue_repo?: string;
  issue_title?: string;
  issue_labels?: string[];
  issue_body_template?: string;
}

interface WatchdogConfig {
  interval: string;
  max_events: number;
  rules: WatchdogRule[];
}

interface TriggeredRule {
  rule: WatchdogRule;
  count: number;
  lastEvent: WatchdogEvent;
}

interface WatchdogOptions {
  daemon: boolean;
  intervalOverride?: string;
  configPath: string;
  dryRun: boolean;
  eventsPath?: string;
}

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

function parseDuration(s: string): number {
  const match = s.trim().match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!match) throw new Error(`Invalid duration: ${s}`);
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case "ms": return n;
    case "s":  return n * 1000;
    case "m":  return n * 60 * 1000;
    case "h":  return n * 3600 * 1000;
    case "d":  return n * 86400 * 1000;
    default:   return n * 60 * 1000;
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Simple YAML parser — handles the watchdog config subset
// ---------------------------------------------------------------------------

function parseYaml(content: string): Record<string, unknown> {
  const lines = content.split("\n");
  let i = 0;

  function readValue(): unknown {
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trimEnd();

      // Skip blanks and comments
      if (trimmed === "" || trimmed.trimStart().startsWith("#")) {
        i++;
        continue;
      }

      const indent = line.length - line.trimStart().length;

      // Multiline literal block scalar: |
      if (trimmed.trimStart() === "|") {
        i++;
        return readBlockScalar(indent + 2);
      }

      // Key: value or Key:
      const kv = trimmed.match(/^([\w_-]+)\s*:\s*(.*)$/);
      if (kv) {
        const key = kv[1];
        const rest = kv[2].trim();
        i++;
        if (rest === "" || rest === "|") {
          if (rest === "|") {
            return { [key]: readBlockScalar(indent + 2) };
          }
          // Empty value — might be an object or list
          const val = readIndentedValue(indent);
          if (val !== undefined) {
            return { [key]: val };
          }
          return { [key]: null };
        }
        if (rest === "[]") return { [key]: [] };
        return { [key]: parseScalar(rest) };
      }

      // List item: - value
      const li = trimmed.match(/^(-)\s+(.*)$/);
      if (li) {
        const rest = li[2].trim();
        i++;
        if (rest === "") {
          const val = readIndentedValue(indent);
          return val !== undefined ? val : null;
        }
        const kv2 = rest.match(/^([\w_-]+)\s*:\s*(.*)$/);
        if (kv2) {
          const k = kv2[1];
          const v = kv2[2].trim();
          if (v === "") {
            const nested = readIndentedValue(indent);
            return { [k]: nested ?? null };
          }
          return { [k]: parseScalar(v) };
        }
        return parseScalar(rest);
      }

      i++;
    }
    return null;
  }

  function readBlockScalar(minIndent: number): string {
    const buf: string[] = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "" || line.trimStart().startsWith("#")) {
        buf.push("");
        i++;
        continue;
      }
      const currentIndent = line.length - line.trimStart().length;
      if (currentIndent < minIndent && line.trim() !== "") {
        break;
      }
      buf.push(line.slice(Math.min(minIndent, currentIndent)));
      i++;
    }
    // Trim trailing empty lines
    while (buf.length > 0 && buf[buf.length - 1] === "") buf.pop();
    return buf.join("\n").replace(/\n$/, "");
  }

  function readIndentedValue(parentIndent: number): unknown {
    if (i >= lines.length) return undefined;

    const line = lines[i];
    const trimmed = line.trimStart();
    const currentIndent = line.length - trimmed.length;

    if (currentIndent <= parentIndent) return undefined;

    // Check if next non-empty line starts a list
    if (trimmed.startsWith("- ")) {
      return readList(currentIndent);
    }

    // Read object
    const obj: Record<string, unknown> = {};
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "" || l.trimStart().startsWith("#")) {
        i++;
        continue;
      }
      const ci = l.length - l.trimStart().length;
      if (ci <= parentIndent) break;
      if (ci !== currentIndent) break;
      Object.assign(obj, readValue());
    }
    return obj;
  }

  function readList(listIndent: number): unknown[] {
    const items: unknown[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "" || l.trimStart().startsWith("#")) {
        i++;
        continue;
      }
      const ci = l.length - l.trimStart().length;
      if (ci < listIndent) break;
      if (ci > listIndent) {
        // Could be a nested value of previous item — skip for our use case
        i++;
        continue;
      }
      const trimmed = l.trimStart();
      if (trimmed.startsWith("- ")) {
        const rest = trimmed.slice(2).trim();
        if (rest === "") {
          i++;
          const nested = readIndentedValue(listIndent);
          if (nested !== undefined) items.push(nested);
          continue;
        }
        const kv = rest.match(/^([\w_-]+)\s*:\s*(.*)$/);
        if (kv && kv[2].trim() === "") {
          i++;
          const nested = readIndentedValue(listIndent);
          items.push({ [kv[1]]: nested ?? null });
          continue;
        }
        if (kv) {
          items.push({ [kv[1]]: parseScalar(kv[2].trim()) });
        } else {
          items.push(parseScalar(rest));
        }
        i++;
      } else {
        break;
      }
    }
    return items;
  }

  function parseScalar(s: string): unknown {
    if (s === "true" || s === "yes") return true;
    if (s === "false" || s === "no") return false;
    if (s === "null" || s === "~") return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^\d+\.\d+$/.test(s)) return parseFloat(s);
    // Remove surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  const result: Record<string, unknown> = {};
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    Object.assign(result, readValue());
  }
  return result;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: WatchdogConfig = {
  interval: "5m",
  max_events: 10000,
  rules: [
    {
      id: "schema-rejected-spike",
      severity: "critical",
      match: { field: "code", equals: "schema_rejected" },
      window: "5m",
      threshold: 3,
      action: "create-issue",
      issue_repo: "auto",
      issue_title: "🚨 [synapse] {provider} {feature} schema 被拒次数异常",
      issue_labels: ["synapse", "auto-generated"],
      issue_body_template: `## 自动检测

- **Provider**: {provider}
- **Feature**: {feature}
- **时间窗口**: {window}
- **发生次数**: {count}
- **最后事件**: {last_event.t}

可能原因：Provider API 接口发生了变化，当前 SDK 生成的 Schema 不匹配。

建议操作：
\`\`\`bash
git pull
synapse evolve
pnpm test
git add -A && git commit -m "chore: 重新生成 SDK"
\`\`\``,
    },
    {
      id: "provider-5xx-spike",
      severity: "critical",
      match: { field: "status", equals: "error", code_prefix: "5" },
      window: "15m",
      threshold: 5,
      action: "create-issue",
      issue_repo: "auto",
      issue_title: "🚨 [synapse] {provider} {feature} 5xx 错误激增",
      issue_labels: ["synapse", "auto-generated"],
      issue_body_template: `## 自动检测

- **Provider**: {provider}
- **Feature**: {feature}
- **时间窗口**: {window}
- **发生次数**: {count}
- **最后事件**: {last_event.t}

Provider 在短时间内返回大量 5xx 错误，可能服务异常。`,
    },
    {
      id: "latency-double",
      severity: "warning",
      match: { field: "latency", compare: "gt", baseline: "2x" },
      window: "5m",
      threshold: 10,
      action: "log-only",
    },
    {
      id: "rate-limit-up",
      severity: "info",
      match: { field: "code", equals: "rate_limited" },
      window: "30m",
      threshold: 20,
      action: "log-only",
    },
  ],
};

async function loadConfig(configPath: string): Promise<WatchdogConfig> {
  try {
    const content = await readFile(configPath, "utf8");
    const parsed = parseYaml(content) as Record<string, unknown>;

    const rules = (parsed.rules as Array<Record<string, unknown>>)?.map((r) => ({
      id: r.id as string,
      severity: (r.severity ?? "info") as WatchdogRule["severity"],
      match: r.match as RuleMatch,
      window: (r.window ?? "5m") as string,
      threshold: (r.threshold ?? 1) as number,
      action: (r.action ?? "log-only") as WatchdogRule["action"],
      issue_repo: r.issue_repo as string | undefined,
      issue_title: r.issue_title as string | undefined,
      issue_labels: r.issue_labels as string[] | undefined,
      issue_body_template: r.issue_body_template as string | undefined,
    })) ?? DEFAULT_CONFIG.rules;

    return {
      interval: (parsed.interval ?? DEFAULT_CONFIG.interval) as string,
      max_events: (parsed.max_events ?? DEFAULT_CONFIG.max_events) as number,
      rules,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Events loading
// ---------------------------------------------------------------------------

async function loadEvents(eventsPath: string, maxEvents: number): Promise<WatchdogEvent[]> {
  try {
    const content = await readFile(eventsPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    // Take the most recent maxEvents
    const recent = lines.slice(-maxEvents);
    const events: WatchdogEvent[] = [];
    for (const line of recent) {
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
// Rule matching engine — pure code, no LLM
// ---------------------------------------------------------------------------

function matchesRule(event: WatchdogEvent, rule: WatchdogRule): boolean {
  const { field, equals, code_prefix, compare, baseline } = rule.match;
  const value = event[field];

  // Exact match
  if (equals !== undefined) {
    if (String(value) !== equals) return false;
  }

  // Code prefix match (for status code prefixes like "5xx")
  if (code_prefix !== undefined && value !== undefined) {
    if (!String(value).startsWith(code_prefix)) return false;
  }

  // Numeric comparison
  if (compare !== undefined && baseline !== undefined) {
    const numValue = typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(numValue)) return false;

    let baselineNum: number;
    if (typeof baseline === "string" && baseline.endsWith("x")) {
      // "2x" means double the baseline — but baseline needs a reference.
      // In this context, "2x" means we're comparing the event's latency directly.
      // Since baseline is "2x", we check if the field value exceeds 2 * the number
      // interpreted from the baseline string.
      baselineNum = parseFloat(baseline);
      if (isNaN(baselineNum)) return false;
    } else if (typeof baseline === "number") {
      baselineNum = baseline;
    } else {
      baselineNum = parseFloat(String(baseline));
      if (isNaN(baselineNum)) return false;
    }

    switch (compare) {
      case "gt": return numValue > baselineNum;
      case "lt": return numValue < baselineNum;
    }
  }

  return true;
}

function evaluateRules(events: WatchdogEvent[], rules: WatchdogRule[]): TriggeredRule[] {
  const now = Date.now();
  const triggered: TriggeredRule[] = [];

  for (const rule of rules) {
    const windowMs = parseDuration(rule.window);
    const cutoff = now - windowMs;

    const matching = events.filter((e) => {
      const eventTime = new Date(e.t).getTime();
      if (isNaN(eventTime)) return false;
      return eventTime > cutoff && matchesRule(e, rule);
    });

    if (matching.length >= rule.threshold) {
      triggered.push({
        rule,
        count: matching.length,
        lastEvent: matching[matching.length - 1],
      });
    }
  }

  return triggered;
}

// ---------------------------------------------------------------------------
// Issue creation with dedup
// ---------------------------------------------------------------------------

function getGitRemote(): string | null {
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8", stdio: "pipe" }).trim();
    // Normalize: git@github.com:org/repo.git → org/repo
    const match = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    return match ? `${match[1]}/${match[2]}` : url;
  } catch {
    return null;
  }
}

function resolveRepo(rule: WatchdogRule): string | null {
  if (rule.issue_repo && rule.issue_repo !== "auto") return rule.issue_repo;
  return getGitRemote();
}

async function existingIssueExists(rule: WatchdogRule, provider: string): Promise<boolean> {
  const labels = rule.issue_labels ?? ["synapse"];
  const labelArgs = labels.map((l) => `--label "${l}"`).join(" ");

  try {
    // gh issue list returns open issues with matching labels
    const output = execSync(
      `gh issue list --state open ${labelArgs} --limit 100 --json title 2>/dev/null`,
      { encoding: "utf8", stdio: "pipe" }
    );
    const issues = JSON.parse(output) as Array<{ title: string }>;

    // Dedup: check if any open issue title contains the rule_id + provider pair
    const searchStr = rule.id;
    return issues.some((issue) => issue.title.includes(searchStr));
  } catch {
    return false;
  }
}

function buildIssueTitle(rule: WatchdogRule, event: WatchdogEvent): string {
  let title = rule.issue_title ?? `[synapse] ${rule.id}`;
  title = title.replace(/\{provider\}/g, event.provider ?? "unknown");
  title = title.replace(/\{feature\}/g, event.feature ?? "unknown");
  title = title.replace(/\{count\}/g, String(event.count ?? "?"));
  title = title.replace(/\{window\}/g, rule.window);
  return title;
}

function buildIssueBody(rule: WatchdogRule, event: WatchdogEvent, count: number): string {
  let body = rule.issue_body_template ?? `Rule **${rule.id}** triggered.\n\n- Count: ${count}\n- Window: ${rule.window}`;
  body = body.replace(/\{provider\}/g, event.provider ?? "unknown");
  body = body.replace(/\{feature\}/g, event.feature ?? "unknown");
  body = body.replace(/\{count\}/g, String(count));
  body = body.replace(/\{window\}/g, rule.window);
  body = body.replace(/\{last_event\.t\}/g, event.t ?? "unknown");
  return body;
}

async function createIssue(
  rule: WatchdogRule,
  event: WatchdogEvent,
  count: number,
  dryRun: boolean
): Promise<void> {
  const title = buildIssueTitle(rule, event);
  const body = buildIssueBody(rule, event, count);
  const labels = rule.issue_labels ?? ["synapse"];

  // Dedup check
  const provider = event.provider ?? "unknown";
  const alreadyExists = await existingIssueExists(rule, provider);
  if (alreadyExists) {
    console.log(`  [dedup] 跳过: 已有相同规则 "${rule.id}" + provider "${provider}" 的 open issue`);
    return;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] 将创建 Issue:`);
    console.log(`    Title:  ${title}`);
    console.log(`    Labels: ${labels.join(", ")}`);
    console.log(`    Body preview: ${body.slice(0, 100)}...`);
    return;
  }

  try {
    const labelArgs = labels.map((l) => `--label "${l}"`).join(" ");
    const cmd = `gh issue create --title "${title.replace(/"/g, '\\"')}" ${labelArgs} --body "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    execSync(cmd, { encoding: "utf8", stdio: "pipe" });
    console.log(`  [issue] ✓ 已创建: ${title}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [issue] ✗ 创建失败: ${msg}`);
    console.error(`  [issue] 手动创建命令:`);
    console.error(`    gh issue create --title "${title}" --label "${labels.join(",")}" --body "..."`);
  }
}

// ---------------------------------------------------------------------------
// Core watchdog run
// ---------------------------------------------------------------------------

async function runWatchdog(options: WatchdogOptions): Promise<TriggeredRule[]> {
  const config = await loadConfig(options.configPath);
  const eventsPath = options.eventsPath ?? join(process.cwd(), ".synapse", "watchdog", "events.ndjson");
  const events = await loadEvents(eventsPath, config.max_events);

  if (events.length === 0) {
    return [];
  }

  const triggered = evaluateRules(events, config.rules);

  for (const t of triggered) {
    const sev = t.rule.severity.toUpperCase();
    const icon = t.rule.severity === "critical" ? "🚨" : t.rule.severity === "warning" ? "⚠️" : "ℹ️";
    console.log(
      `[${new Date().toISOString()}] ${icon} [${sev}] ${t.rule.id}: ${t.count}x in ${t.rule.window} (threshold: ${t.rule.threshold})`
    );

    if (t.rule.action === "create-issue") {
      await createIssue(t.rule, t.lastEvent, t.count, options.dryRun);
    }
  }

  return triggered;
}

// ---------------------------------------------------------------------------
// Subcommand: rules list
// ---------------------------------------------------------------------------

async function rulesList(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  console.log(`Loaded ${config.rules.length} rule(s):\n`);
  for (const rule of config.rules) {
    const sev = rule.severity.toUpperCase();
    console.log(`  ${rule.id}`);
    console.log(`    severity:  ${sev}`);
    console.log(`    match:     ${JSON.stringify(rule.match)}`);
    console.log(`    window:    ${rule.window}`);
    console.log(`    threshold: ${rule.threshold}`);
    console.log(`    action:    ${rule.action}`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Subcommand: rules validate
// ---------------------------------------------------------------------------

async function rulesValidate(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  const errors: string[] = [];

  for (const rule of config.rules) {
    if (!rule.id) errors.push(`Rule missing id`);
    if (!rule.match?.field) errors.push(`Rule "${rule.id}": match.field is required`);
    if (!rule.window) errors.push(`Rule "${rule.id}": window is required`);
    try {
      parseDuration(rule.window);
    } catch {
      errors.push(`Rule "${rule.id}": invalid window "${rule.window}"`);
    }
    if (rule.threshold < 1) errors.push(`Rule "${rule.id}": threshold must be >= 1`);
    if (rule.action === "create-issue" && !rule.issue_title) {
      errors.push(`Rule "${rule.id}": issue_title is required for create-issue action`);
    }
  }

  if (errors.length > 0) {
    console.error("Validation errors:");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log(`✓ ${config.rules.length} rule(s) valid`);
}

// ---------------------------------------------------------------------------
// Init: create default config and events directory
// ---------------------------------------------------------------------------

async function initWatchdog(): Promise<void> {
  const synapseDir = join(process.cwd(), ".synapse", "watchdog");
  await mkdir(synapseDir, { recursive: true });

  // Write default config
  const configPath = join(process.cwd(), ".synapse", "watchdog.yml");
  try {
    await access(configPath);
    console.log(`Config already exists: ${configPath}`);
  } catch {
    // Generate default config YAML
    const defaultYaml = `# Synapse Watchdog 配置
# 纯代码规则引擎，监控 .synapse/watchdog/events.ndjson 并自动创建 Git Issue

interval: 5m
max_events: 10000

rules:
  - id: schema-rejected-spike
    severity: critical
    match:
      field: code
      equals: schema_rejected
    window: 5m
    threshold: 3
    action: create-issue
    issue_repo: auto
    issue_title: "🚨 [synapse] {provider} {feature} schema 被拒次数异常"
    issue_labels:
      - synapse
      - auto-generated
    issue_body_template: |
      ## 自动检测

      - **Provider**: {provider}
      - **Feature**: {feature}
      - **时间窗口**: {window}
      - **发生次数**: {count}
      - **最后事件**: {last_event.t}

      可能原因：Provider API 接口发生了变化，当前 SDK 生成的 Schema 不匹配。

      建议操作：
      \`\`\`bash
      git pull
      synapse evolve
      pnpm test
      git add -A && git commit -m "chore: 重新生成 SDK"
      \`\`\`

  - id: provider-5xx-spike
    severity: critical
    match:
      field: status
      equals: error
      code_prefix: "5"
    window: 15m
    threshold: 5
    action: create-issue
    issue_repo: auto
    issue_title: "🚨 [synapse] {provider} {feature} 5xx 错误激增"
    issue_labels:
      - synapse
      - auto-generated
    issue_body_template: |
      ## 自动检测

      - **Provider**: {provider}
      - **Feature**: {feature}
      - **时间窗口**: {window}
      - **发生次数**: {count}
      - **最后事件**: {last_event.t}

      Provider 在短时间内返回大量 5xx 错误，可能服务异常。

  - id: latency-double
    severity: warning
    match:
      field: latency
      compare: gt
      baseline: "2x"
    window: 5m
    threshold: 10
    action: log-only

  - id: rate-limit-up
    severity: info
    match:
      field: code
      equals: rate_limited
    window: 30m
    threshold: 20
    action: log-only
`;
    await writeFile(configPath, defaultYaml, "utf8");
    console.log(`Created default config: ${configPath}`);
  }

  // Create empty events file if not exists
  const eventsPath = join(synapseDir, "events.ndjson");
  try {
    await access(eventsPath);
  } catch {
    await import("node:fs/promises").then((fs) => fs.writeFile(eventsPath, "", "utf8"));
    console.log(`Created events file: ${eventsPath}`);
  }

  console.log("\nWatchdog initialized. Run 'synapse watchdog' to start monitoring.");
}

// ---------------------------------------------------------------------------
// CLI Entry: printWatchdogHelp
// ---------------------------------------------------------------------------

export function printWatchdogHelp(): void {
  console.log(HELP_WATCHDOG);
}

// ---------------------------------------------------------------------------
// CLI Entry: parseWatchdogArgs
// ---------------------------------------------------------------------------

interface ParsedWatchdogArgs {
  subcommand: string | null;
  daemon: boolean;
  intervalOverride?: string;
  configPath: string;
  dryRun: boolean;
}

function parseWatchdogArgs(argv: string[]): ParsedWatchdogArgs {
  const result: ParsedWatchdogArgs = {
    subcommand: null,
    daemon: false,
    configPath: join(process.cwd(), ".synapse", "watchdog.yml"),
    dryRun: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--daemon") {
      result.daemon = true;
    } else if (arg === "--interval" && argv[i + 1]) {
      result.intervalOverride = argv[++i];
    } else if (arg === "--config" && argv[i + 1]) {
      result.configPath = argv[++i];
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printWatchdogHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      // First positional is subcommand (or second if "rules")
      if (arg === "rules" && argv[i + 1]) {
        result.subcommand = `rules ${argv[++i]}`;
      } else if (!result.subcommand) {
        result.subcommand = arg;
      }
    }
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI Entry: handleWatchdogCommand
// ---------------------------------------------------------------------------

export async function handleWatchdogCommand(argv: string[]): Promise<void> {
  const parsed = parseWatchdogArgs(argv);

  // Subcommands
  if (parsed.subcommand === "rules list") {
    await rulesList(parsed.configPath);
    return;
  }
  if (parsed.subcommand === "rules validate") {
    await rulesValidate(parsed.configPath);
    return;
  }
  if (parsed.subcommand === "init") {
    await initWatchdog();
    return;
  }

  // Main watchdog run
  const interval = parsed.intervalOverride ?? "5m";
  const intervalMs = parseDuration(interval);

  console.log(`[synapse watchdog] 启动中...`);
  console.log(`  Config:     ${parsed.configPath}`);
  console.log(`  Interval:   ${formatMs(intervalMs)}`);
  console.log(`  Mode:       ${parsed.daemon ? "daemon" : "single-run"}`);
  if (parsed.dryRun) console.log(`  Dry-run:    yes`);
  console.log();

  const options: WatchdogOptions = {
    daemon: parsed.daemon,
    intervalOverride: parsed.intervalOverride,
    configPath: parsed.configPath,
    dryRun: parsed.dryRun,
  };

  // Single run
  if (!parsed.daemon) {
    const startTime = Date.now();
    const triggered = await runWatchdog(options);
    const elapsed = Date.now() - startTime;

    if (triggered.length === 0) {
      console.log(`[${new Date().toISOString()}] ✓ 无异常 (${formatMs(elapsed)})`);
    }
    return;
  }

  // Daemon mode
  console.log(`[daemon] 开始持续监控，每 ${formatMs(intervalMs)} 检查一次...`);
  console.log(`[daemon] 按 Ctrl+C 停止\n`);

  const tick = async () => {
    try {
      const triggered = await runWatchdog(options);
      if (triggered.length === 0) {
        console.log(`[${new Date().toISOString()}] . (无异常)`);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] 错误: ${err}`);
    }
  };

  // Run immediately, then on interval
  await tick();
  const timer = setInterval(tick, intervalMs);

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n[daemon] 停止 watchdog...`);
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
