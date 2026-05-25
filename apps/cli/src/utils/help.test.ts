import { describe, it } from "node:test";
import assert from "node:assert/strict";

// These imports will fail until help.ts is created
import {
  HELP_BANNER, GROUP_CORE, GROUP_CONFIG, GROUP_ADVANCED,
  CORE_COMMANDS, CONFIG_COMMANDS, ADVANCED_COMMANDS,
  HELP_SETUP, HELP_CONNECT, HELP_NEGOTIATE, HELP_EVOLVE,
  HELP_VAULT, HELP_CONFIG, HELP_PACK, HELP_BILLING,
  HELP_LOCK, HELP_ROUTE, HELP_SDK,
  HELP_SMOKE, HELP_WATCHDOG, HELP_GENERATE, HELP_PROVIDER,
  HELP_EXPORT, HELP_IMPORT, HELP_INIT, HELP_PROFILE,
} from "./help.js";

describe("help module", () => {
  it("Test 1: exports all named help constants without errors", () => {
    // If we got here without import errors, the module loaded
    assert.ok(true);
  });

  it("Test 2: HELP_BANNER contains Synapse Router CLI", () => {
    assert.ok(HELP_BANNER.includes("Synapse Router CLI"));
  });

  it("Test 3: CORE_COMMANDS array has exactly 4 entries", () => {
    assert.strictEqual(CORE_COMMANDS.length, 4);
  });

  it("Test 4: CONFIG_COMMANDS array has exactly 4 entries", () => {
    assert.strictEqual(CONFIG_COMMANDS.length, 4);
  });

  it("Test 5: ADVANCED_COMMANDS array has exactly 11 entries", () => {
    assert.strictEqual(ADVANCED_COMMANDS.length, 11);
  });

  it("Test 6: all HELP_* constants are non-empty strings", () => {
    const helpConstants = [
      HELP_SETUP, HELP_CONNECT, HELP_NEGOTIATE, HELP_EVOLVE,
      HELP_VAULT, HELP_CONFIG, HELP_PACK, HELP_BILLING,
      HELP_LOCK, HELP_ROUTE, HELP_SDK,
      HELP_SMOKE, HELP_WATCHDOG, HELP_GENERATE, HELP_PROVIDER,
      HELP_EXPORT, HELP_IMPORT, HELP_INIT, HELP_PROFILE,
    ];
    for (const h of helpConstants) {
      assert.ok(typeof h === "string" && h.length > 0, `Expected non-empty string, got ${typeof h} length ${h.length}`);
    }
  });

  it("Test 7: HELP_CONNECT includes --smoke flag documentation", () => {
    assert.ok(HELP_CONNECT.includes("--smoke"), "HELP_CONNECT should document --smoke flag");
  });

  it("Test 8: HELP_CONFIG includes profile, export, import subcommands", () => {
    assert.ok(HELP_CONFIG.includes("profile"), "HELP_CONFIG should mention profile subcommand");
    assert.ok(HELP_CONFIG.includes("export"), "HELP_CONFIG should mention export subcommand");
    assert.ok(HELP_CONFIG.includes("import"), "HELP_CONFIG should mention import subcommand");
  });
});
