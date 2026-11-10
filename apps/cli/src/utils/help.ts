// @synapse-router/cli — Shared help text definitions
// Single source of truth for all CLI help output

// ---------------------------------------------------------------------------
// Part A -- Category labels and grouping
// ---------------------------------------------------------------------------

export const HELP_BANNER = `Synapse Router CLI v0.2.0 — Multi-Provider Schema Negotiation Router`;

export const GROUP_CORE = "Core Workflow";
export const GROUP_CONFIG = "Configuration";
export const GROUP_ADVANCED = "Advanced";

export interface HelpCommandEntry {
  name: string;
  usage: string;
  desc: string;
}

export const CORE_COMMANDS: HelpCommandEntry[] = [
  { name: "setup", usage: "setup", desc: "Interactive first-time setup wizard" },
  { name: "negotiate", usage: "negotiate <schema-file>", desc: "Run schema negotiation" },
  { name: "connect", usage: "connect <provider> <intent>", desc: "Connect to a provider and execute a feature" },
];

export const CONFIG_COMMANDS: HelpCommandEntry[] = [
  { name: "vault", usage: "vault set|list|get|remove|verify", desc: "Manage encrypted API keys" },
  { name: "config", usage: "config set|get|list", desc: "Manage configuration (~/.synapse/config.json)" },
  { name: "pack", usage: "pack add|search|list|update|remove|show", desc: "Manage provider packs from Registry" },
  { name: "billing", usage: "billing init|config|status", desc: "Manage billing configuration and quota status" },
];

export const ADVANCED_COMMANDS: HelpCommandEntry[] = [
  { name: "lock", usage: "lock list|show|remove|migrate|outdated", desc: "Manage Schema Locks" },
  { name: "route", usage: "route <intent>", desc: "Route to best provider using multi-dimensional scoring" },
  { name: "sdk", usage: "sdk generate", desc: "Generate SDK from Provider Pack" },
  { name: "smoke", usage: "smoke --provider <name>", desc: "Alias of connect --smoke (provider smoke tests)" },
  { name: "watchdog", usage: "watchdog", desc: "Monitor events and auto-create Git Issues" },
  { name: "provider", usage: "provider list|show", desc: "List and inspect provider packs" },
];

// ---------------------------------------------------------------------------
// Part B -- Full detailed help for each command
// ---------------------------------------------------------------------------

export const HELP_SETUP = `
synapse setup — Interactive first-time setup wizard

Usage:
  synapse setup

Description:
  Guides you through connecting your first provider:
  1. Choose a provider (DeepSeek, OpenAI, Moonshot, etc.)
  2. Enter your API key (hidden input)
  3. Configure base URL (with default)
  4. Select a pack (schema compatibility)

  After setup, you can use:
    synapse connect <provider> <intent>

SDK project scaffolding (non-interactive, formerly "synapse init"):
  synapse setup --sdk [--provider <id>] [--out-dir <path>] [--with-cicd]

  --sdk               Scaffold an SDK project instead of running the wizard
  --provider <id>     Default provider to record in synapse.json
  --out-dir <path>    Output directory (default: ./synapse-sdk)
  --with-cicd         Also write .github/workflows/synapse-sdk.yml

Examples:
  synapse setup
  synapse setup --sdk --provider openai --out-dir ./synapse-sdk
  synapse setup --sdk --with-cicd

See also:
  synapse connect   — Connect to a provider
  synapse sdk       — Generate an SDK from a Pack
  synapse vault     — Manage API keys
  synapse config    — Manage provider configuration
`;

export const HELP_CONNECT = `
synapse connect — Connect to a provider and execute a feature call

Usage:
  synapse connect <provider> <intent> [options]
  synapse connect                         (interactive mode)

Arguments:
  <provider>    Provider ID (e.g. deepseek, openai, moonshot)
  <intent>      Feature intent (e.g. chat, text-to-image, embeddings)

Options:
  --input <json>        Input as JSON string (canonical fields)
  --input-file <path>   Read input from JSON file
  --base-url <url>      Override provider base URL
  --api-key <key>       Override API key (prefer vault)
  --lock <path>         Use existing schema lock file
  --no-cache            Bypass schema lock cache (force re-negotiation)
  --raw                 Output raw provider response
  --format <fmt>        Output format: json | table | compact (default: json)
  --with-billing          Enable billing tracking (skip prompt)
  --no-billing            Disable billing tracking (skip prompt)
  --smoke               Run provider smoke tests (synapse smoke replacement)

Modes:
  Imperative    Full parameters provided — no interaction
                $ synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}]}'

  Interactive   Missing parameters — guided prompts
                $ synapse connect deepseek chat
                $ synapse connect              (all parameters prompted)

Examples:
  # Chat with DeepSeek
  synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'

  # Generate image with stability
  synapse connect stability text-to-image --input '{"prompt":"A sunset over mountains"}'

  # Read input from file
  synapse connect openai chat --input-file ./my-request.json

  # Interactive mode (auto-degraded when parameters missing)
  synapse connect deepseek chat

  # Full interactive
  synapse connect

  # Run smoke test via connect
  synapse connect --smoke --provider openai
`;

export const HELP_NEGOTIATE = `
synapse negotiate — Run schema negotiation

Usage:
  synapse negotiate <schema-file>                   Negotiate from agent schema file
  synapse negotiate --intent <intent> --provider <provider>  Full negotiation pipeline

Arguments:
  <schema-file>          Path to agent schema JSON file

Options:
  --intent <intent>      Feature intent (e.g. chat, text-to-image)
  --provider <provider>  Provider ID (e.g. openai, deepseek)
  --no-cache             Force re-negotiation (delete cached lock + verification)
  --format <fmt>         Output format: json | table (default: table)
  --yes                  Skip all prompts, accept default values
  --dry-run              Run full pipeline, preview results, do not save Lock
  --no-save              Negotiate successfully but do not save Schema Lock
  --no-interactive       Force non-interactive mode (fail if info missing)

Examples:
  synapse negotiate ./my-agent-schema.json
  synapse negotiate --intent chat --provider openai
  synapse negotiate --intent chat --provider openai --no-cache
  synapse negotiate --intent chat --provider openai --format json
  synapse negotiate --intent chat --provider openai --dry-run
  synapse negotiate --intent chat --provider openai --no-save

See also:
  synapse provider list   — List available providers
  synapse connect         — Connect to a provider
  synapse lock list       — Manage cached Schema Locks
`;

export const HELP_VAULT = `
synapse vault — Manage encrypted API keys

Usage:
  synapse vault set <provider> <key> [options]    Store an API key
  synapse vault list                              List stored keys (values hidden)
  synapse vault get <provider>                    Get key value for a provider
  synapse vault remove <provider>                 Remove a stored key
  synapse vault verify <provider>                 Verify key format
  synapse vault rotate <provider>                 Rotate key password (interactive)

Arguments:
  <provider>             Provider ID (e.g. deepseek, openai)
  <key>                  API key value

Options (vault set):
  --base-url <url>       Set provider base URL in config
  --pack <id>            Set provider pack in config

Examples:
  # Store a DeepSeek API key
  synapse vault set deepseek sk-xxx

  # Store key with provider configuration
  synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai

  # List all stored keys
  synapse vault list

  # Verify a key
  synapse vault verify deepseek

  # Get key value
  synapse vault get deepseek

  # Remove a key
  synapse vault remove deepseek

See also:
  synapse config    — Manage provider configuration
  synapse setup     — Interactive setup wizard
  synapse connect   — Connect to a provider
`;

export const HELP_CONFIG = `
synapse config — Manage Synapse Router configuration

Usage:
  synapse config set <key> <value> [--local]
  synapse config get <key>
  synapse config list

Subcommands:
  set <key> <value>   Set a configuration value (dot notation)
    --local             Write to project-local .synapse/config.json instead of global ~/.synapse/config.json
  get <key>           Get a configuration value
  list                List all configuration
  profile list|show|reset|stats|refresh  Manage Provider Profiles
  export [--output|--stdout]              Export .synapse/ data
  import <file> [--stdin]                 Import .synapse/ data

Configuration keys use dot notation:
  Provider config:    deepseek.base_url, deepseek.pack, deepseek.auth_type
  Defaults:           format, defaults.format
  Full path:          providers.deepseek.base_url, defaults.format

Cascading config:
  Global:   ~/.synapse/config.json
  Project:  .synapse/config.json (in current directory — overrides global)
  Use --local flag with 'set' to write to project config.

Examples:
  # Set DeepSeek base URL (global)
  synapse config set deepseek.base_url https://api.deepseek.com/v1

  # Set registry URL for current project only
  synapse config set registry.url http://localhost:3100/api/v1 --local

  # Set DeepSeek pack
  synapse config set deepseek.pack openai

  # Set default output format
  synapse config set format json

  # Get a provider's base URL
  synapse config get deepseek.base_url

  # List all configuration
  synapse config list

Billing configuration:
  Billing settings are stored in ~/.synapse/billing-config.json and accessed
  via the "billing.*" prefix:
    synapse config set billing.openai.onError reject
    synapse config get billing.openai.onError
    synapse config set billing.openai.pricing.chat.strategy perToken

See also:
  synapse setup    — Interactive provider setup
  synapse vault    — Manage API keys
  synapse connect  — Connect to a provider
`;

export const HELP_PACK = `
synapse pack — Manage provider packs from the Registry

Usage:
  synapse pack add <pack>                    Install a pack from Registry
  synapse pack add <pack>@<version>          Install specific version
  synapse pack search <query>                Search Registry for packs
  synapse pack list                          List installed packs
  synapse pack check                         Check for registry updates
  synapse pack update [name]                 Update a pack (or all)
  synapse pack remove <name>                 Remove an installed pack
  synapse pack show <name>                   Show pack details

Arguments:
  <pack>                   Pack name (e.g. openai, @official/openai)
  <version>                Semver version (e.g. 2.0.0)
  <query>                  Search term

Options:
  --yes                    Skip confirmation prompts (non-interactive)
  --local                  Install to current project (.synapse/packs/) instead of ~/.synapse/packs/

Examples:
  synapse pack add openai
  synapse pack add @official/openai@2.0.0
  synapse pack search "chat completions"
  synapse pack list
  synapse pack check
  synapse pack update openai
  synapse pack update          # update all
  synapse pack remove openai
  synapse pack show openai

Environment:
  SYNAPSE_REGISTRY_URL       Override registry URL (default: https://registry.synrc.io)
`;

export const HELP_BILLING = `
synapse billing -- Manage billing configuration and quota status

Usage:
  synapse billing init [options]     Initialize billing configuration
  synapse billing config [subcommand]  View or modify billing configuration
  synapse billing status [options]     View quota status and estimated costs

Subcommands:
  init         Interactive wizard to set up per-provider pricing and quotas
  config       Set/get billing config values (also available via synapse config billing.*)
  status       Display per-provider quota status in grouped table format

Options (init):
  --provider <id>           Provider ID to configure (can repeat for multiple)
  --pricing-strategy <s>    Pricing strategy: perToken, perUnit, flat (default: perToken)
  --quota <limit>           Quota limit in USD (default: 10)
  --quota-period <period>   Quota period: hour, day, month (default: month)
  --on-error <strategy>     Billing error handling: warn, reject (default: warn)

Options (status):
  --format json             Machine-readable output (default: table)

See also:
  synapse config            Manage configuration
  synapse connect           Connect to a provider (auto-wraps with billing if configured)
`;

export const HELP_LOCK = `
synapse lock — Manage Schema Locks

Usage:
  synapse lock list                    List all cached Schema Locks
  synapse lock show <lock-id>          Show Schema Lock details
  synapse lock remove <lock-id>        Remove a Schema Lock (next negotiate regenerates)
  synapse lock migrate <lock-id>       Migrate a Lock to the latest Pack version
  synapse lock outdated                Check for Locks that are outdated

Options:
  --format <fmt>       Output format: json | table (default: table)

Examples:
  synapse lock list
  synapse lock show chat_openai_v1.0.0_abc12345
  synapse lock remove chat_openai_v1.0.0_abc12345
  synapse lock migrate chat_openai_v1.0.0_abc12345
  synapse lock outdated
`;

export const HELP_ROUTE = `
synapse route — Multi-dimensional routing to select the best provider

Usage:
  synapse route <intent> [options]

Arguments:
  <intent>                     Provider intent (e.g. "chat", "text-to-image",
                               "embeddings", "text-generation")

Options:
  --strategy, -s <name>        Routing strategy (default: balanced)
                               Built-in: cheap, fast, quality, balanced, cost-capped
                               Custom:   from 'config set route.strategies.<id>'
  --max-cost <usd>             Max cost per call in USD (e.g. 0.01)
  --min-reliability <0-1>      Min reliability threshold (e.g. 0.9)
  --prefer, -p <ids>           Preferred providers (comma-separated)
  --exclude, -x <ids>          Excluded providers (comma-separated)
  --region <name>              Preferred region (e.g. "us-east", "eu-west")
  --min-version <ver>          Minimum model version (e.g. "4.0")
  --strategy-weights <json>    One-off custom weights (e.g. '{"cost":2,"latency":1}')
  --format, -f <fmt>           Output format: json | table | compact (default: json)
  --help, -h                   Show this help

Config persistence:
  synapse config set route.strategies.myCustom.weights.cost 3
  synapse config set route.strategies.myCustom.weights.reliability 2
  synapse config set route.strategies.myCustom.maxCost 0.05

Examples:
  synapse route chat
  synapse route chat --strategy fast
  synapse route text-to-image --strategy cheap --format table
  synapse route chat --prefer openai,anthropic --exclude groq
  synapse route chat --max-cost 0.01 --format compact
  synapse route chat --strategy-weights '{"cost":5,"latency":1}'
  synapse route chat --region us-east --min-version 4.0

Output (json):
  {
    "provider": "groq",
    "score": { "totalScore": 85.3, "dimensions": {...} },
    "candidates": [...],
    "strategy": "fast",
    "explanation": { "intent": "chat", "totalCandidates": 5, ... }
  }
`;

export const HELP_SDK = `
synapse sdk — Generate SDKs from Provider Packs

Usage:
  synapse sdk generate --pack <pack> --lang <lang> --output <dir> [options]

Commands:
  generate    Generate an SDK from a Provider Pack

Options:
  --pack <id>           Pack ID or path (e.g. openai, ./packs/openai)
  --lang <lang>         Target language: typescript | python
  --output <dir>        Output directory for generated SDK
  --provider <id>       Override provider name (e.g. deepseek using openai pack)
  --base-url <url>      Override default base URL
  --with-billing        Include BillingTracker class for quota tracking

Examples:
  # Generate TypeScript SDK from openai pack
  synapse sdk generate --pack openai --lang typescript --output ./generated-sdk

  # Generate Python SDK
  synapse sdk generate --pack openai --lang python --output ./generated-sdk

  # Generate DeepSeek SDK using openai pack
  synapse sdk generate --pack openai --lang typescript --provider deepseek --base-url https://api.deepseek.com/v1 --output ./generated-sdk

  # Generate SDK with billing tracking
  synapse sdk generate --pack openai --lang typescript --output ./sdk --with-billing
`;

export const HELP_SMOKE = `
Note: \`synapse smoke\` has been merged into \`synapse connect --smoke\`.

synapse smoke — Run provider smoke tests against live production APIs

Usage:
  synapse smoke --provider <name> [options]

Options:
  --provider <name>    Provider ID (required): openai, replicate
  --timeout <seconds>  Timeout per test in seconds (default: 30)
  --format <fmt>       Output format: json | table | compact (default: table)
  --verbose, -v        Show detailed output including raw response
  --api-key <key>      Override API key (prefer vault)
  --help, -h           Show this help

Examples:
  # Test OpenAI connectivity
  synapse smoke --provider openai

  # Test Replicate with custom timeout
  synapse smoke --provider replicate --timeout 60

  # JSON output for scripting
  synapse smoke --provider openai --format json

  # Verbose output with raw response
  synapse smoke --provider openai --verbose

See also:
  synapse vault    — Manage API keys
  synapse connect  — Connect to a provider
`;

export const HELP_WATCHDOG = `
synapse watchdog — Pure-code rule engine for monitoring Synapse events

Usage:
  synapse watchdog [subcommand] [options]

Subcommands:
  (none)                      Single-run: read events, evaluate rules, create issues
  rules list                  List loaded rules from config
  rules validate              Validate rule configuration
  init                        Initialize watchdog config and events directory

Options:
  --daemon                    Run in daemon mode (continuous monitoring)
  --interval <duration>       Override check interval (e.g. 5m, 10m, 1h)
  --config <path>             Path to rules config YAML (default: .synapse/watchdog.yml)
  --dry-run                   Preview actions without creating issues
  --help, -h                  Show this help

Examples:
  # Single run (great for CI)
  synapse watchdog

  # Daemon mode with default 5m interval
  synapse watchdog --daemon

  # Daemon with custom interval
  synapse watchdog --daemon --interval 10m

  # Custom config + preview mode
  synapse watchdog --config ./my-rules.yml --dry-run

  # List rules
  synapse watchdog rules list

  # Validate rules
  synapse watchdog rules validate

See also:
  synapse sdk       — Generate SDK from provider packs
  synapse init      — Initialize synapse-sdk project
`;

export const HELP_PROVIDER = `
synapse provider — List and inspect provider packs

Usage:
  synapse provider list [--remote]        List available provider packs
  synapse provider show <id> [--remote]   Show provider card details

Options:
  --remote               Query remote Registry instead of local

Arguments:
  <id>                   Provider ID (e.g. openai, deepseek, replicate)

Examples:
  synapse provider list
  synapse provider list --remote
  synapse provider show openai

See also:
  synapse connect   — Connect to a provider
  synapse sdk       — Generate SDK from provider packs
  synapse pack      — Manage packs from Registry
`;

