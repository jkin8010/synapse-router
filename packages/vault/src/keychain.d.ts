import type { KeychainProvider } from "./types.js";
export declare const KEYCHAIN_SERVICE = "synapse-router";
export declare const KEYCHAIN_ACCOUNT = "vault-encryption-key";
export declare class MacOSKeychain implements KeychainProvider {
    isAvailable(): Promise<boolean>;
    set(service: string, account: string, secret: string): Promise<void>;
    get(service: string, account: string): Promise<string | null>;
    delete(service: string, account: string): Promise<boolean>;
}
export declare class LinuxKeychain implements KeychainProvider {
    isAvailable(): Promise<boolean>;
    set(service: string, account: string, secret: string): Promise<void>;
    get(service: string, account: string): Promise<string | null>;
    delete(service: string, account: string): Promise<boolean>;
}
export declare class NoKeychain implements KeychainProvider {
    isAvailable(): Promise<boolean>;
    set(): Promise<void>;
    get(): Promise<string | null>;
    delete(): Promise<boolean>;
}
export declare function getKeychainProvider(): Promise<KeychainProvider>;
