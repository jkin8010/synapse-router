---
sidebar_position: 2
title: CLI Command Reference
---

# CLI Command Reference

The Synapse CLI is the developer tool entry point for the Router. All Schema Negotiation, Provider Routing, Billing Management, Pack Management, Vault Management, and SDK Generation is done through the CLI.

All commands follow the unified `synapse <command> [subcommand] [options]` format. Each command supports the `--help` flag for detailed usage and parameter listings. Output defaults to human-readable text, with `--format json` available for structured JSON output suitable for programmatic processing.

## Command Overview

| Command | Description | Page |
|---------|-------------|------|
| `synapse connect` | Connect to a Provider and execute an intent (incl. `--smoke` for testing) | [/docs/cli/connect](/docs/cli/connect) |
| `synapse vault` | Manage encrypted API Keys (AES-256-GCM) | [/docs/cli/vault](/docs/cli/vault) |
| `synapse negotiate` | Schema negotiation — intent matching and Schema Lock creation | [/docs/cli/negotiate](/docs/cli/negotiate) |
| `synapse sdk` | Generate SDK from a Provider Pack | [/docs/cli/sdk](/docs/cli/sdk) |
| `synapse route` | Multi-dimensional scored routing | [/docs/cli/route](/docs/cli/route) |
| `synapse billing` | Billing management and quota viewing | [/docs/cli/billing](/docs/cli/billing) |
| `synapse pack` | Manage Provider Packs | [/docs/cli/pack](/docs/cli/pack) |
| `synapse lock` | Manage Schema Locks | [/docs/cli/lock](/docs/cli/lock) |
| `synapse config` | Configuration management (dot notation, incl. `profile`/`export`/`import` subcommands, replaces `profile`/`export`/`import`) | [/docs/cli/config](/docs/cli/config) |
| `synapse setup` | Interactive initialization wizard (replaces `init`) | [/docs/cli/setup](/docs/cli/setup) |

## Quick Navigation

Grouped by usage category for quick reference:

- **Core Workflow:** [connect](/docs/cli/connect), [negotiate](/docs/cli/negotiate), [route](/docs/cli/route), [sdk](/docs/cli/sdk)
- **Configuration:** [setup](/docs/cli/setup), [config](/docs/cli/config), [vault](/docs/cli/vault), [billing](/docs/cli/billing), [pack](/docs/cli/pack), [lock](/docs/cli/lock)
- **Advanced:** `synapse --help` for additional commands (`provider`, `watchdog` — `init`/`smoke`/`profile`/`export`/`import` are merged into `config`/`connect`/`setup`)

## General Conventions

### Provider ID

Provider IDs use lowercase kebab-case format, e.g. `deepseek`, `openai`, `stability-ai`. The ID serves as a unique identifier across the system for vault storage, routing selection, billing tracking, and other scenarios.

### Intent Types

An Intent represents the agent's intent type, used to match a Provider's Feature:

- `chat` — Chat Completion
- `text-to-image` — Text-to-Image Generation
- `embeddings` — Embedding Generation
- `speech-to-text` — Speech-to-Text

### API Key Security

API Keys are encrypted using AES-256-GCM and are never stored in plaintext. All log output is automatically redacted to ensure Keys never appear in Traces or Spans. Key lifecycle management is handled through the `synapse vault` command.

### First-Time Setup

When using the Synapse CLI for the first time, follow this recommended order:

1. Run `synapse setup` interactive wizard to complete initial configuration
2. Use `synapse vault set <provider> <key>` to store API Keys
3. Use `synapse connect <provider> <intent>` to test the connection
4. Configure billing and routing strategies as needed

## Recent Updates (v5.0)

The following command changes were introduced in v5.0:

| Change | Description |
| --- | --- |
| `smoke` merged into `connect` | Use `synapse connect --smoke` instead of the standalone `synapse smoke` command |
| `init` merged into `setup` | Use `synapse setup` for interactive first-time setup (replaces `synapse init`) |
| `profile` merged into `config` | Use `synapse config profile` for profile management (replaces `synapse profile`) |
| `export` / `import` merged into `config` | Use `synapse config export` / `synapse config import` (replaces standalone commands) |
| `negotiate` gains interactive mode | Running `synapse negotiate` with no arguments launches an 8-step interactive wizard |

## Link Index

- [connect](/docs/cli/connect)
- [vault](/docs/cli/vault)
- [negotiate](/docs/cli/negotiate)
- [route](/docs/cli/route)
- [sdk](/docs/cli/sdk)
- [billing](/docs/cli/billing)
- [pack](/docs/cli/pack)
- [lock](/docs/cli/lock)
- [config](/docs/cli/config)
- [setup](/docs/cli/setup)
