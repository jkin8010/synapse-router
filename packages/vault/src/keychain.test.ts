import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MacOSKeychain,
  LinuxKeychain,
  NoKeychain,
  getKeychainProvider,
  KEYCHAIN_SERVICE,
  KEYCHAIN_ACCOUNT,
} from "./keychain.js";

describe("Keychain providers", () => {
  describe("NoKeychain", () => {
    it("isAvailable returns false", async () => {
      const kc = new NoKeychain();
      assert.equal(await kc.isAvailable(), false);
    });

    it("set throws Error", async () => {
      const kc = new NoKeychain();
      await assert.rejects(() => kc.set("svc", "acct", "secret"));
    });

    it("get returns null", async () => {
      const kc = new NoKeychain();
      const result = await kc.get("svc", "acct");
      assert.equal(result, null);
    });

    it("delete returns false", async () => {
      const kc = new NoKeychain();
      const result = await kc.delete("svc", "acct");
      assert.equal(result, false);
    });
  });

  describe("getKeychainProvider", () => {
    it("returns a KeychainProvider (may be NoKeychain on unsupported platforms)", async () => {
      const kc = await getKeychainProvider();
      assert.ok(kc);
      assert.ok(typeof kc.isAvailable === "function");
      assert.ok(typeof kc.get === "function");
      assert.ok(typeof kc.set === "function");
      assert.ok(typeof kc.delete === "function");
    });
  });

  describe("KEYCHAIN_SERVICE and KEYCHAIN_ACCOUNT constants", () => {
    it("are non-empty strings", () => {
      assert.ok(KEYCHAIN_SERVICE.length > 0);
      assert.ok(KEYCHAIN_ACCOUNT.length > 0);
    });
  });

  describe("MacOSKeychain (smoke — only runs on darwin)", () => {
    it("can be constructed", () => {
      const kc = new MacOSKeychain();
      assert.ok(kc);
    });

    it("has all required methods", () => {
      const kc = new MacOSKeychain();
      assert.ok(typeof kc.isAvailable === "function");
      assert.ok(typeof kc.get === "function");
      assert.ok(typeof kc.set === "function");
      assert.ok(typeof kc.delete === "function");
    });
  });

  describe("LinuxKeychain (smoke)", () => {
    it("can be constructed", () => {
      const kc = new LinuxKeychain();
      assert.ok(kc);
    });

    it("has all required methods", () => {
      const kc = new LinuxKeychain();
      assert.ok(typeof kc.isAvailable === "function");
      assert.ok(typeof kc.get === "function");
      assert.ok(typeof kc.set === "function");
      assert.ok(typeof kc.delete === "function");
    });
  });
});
