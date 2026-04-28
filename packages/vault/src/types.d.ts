export interface VaultConfig {
    vaultDir: string;
    encryptionKey?: string;
    instanceId?: string;
    preferKeychain?: boolean;
    audit?: boolean | AuditLogger;
}
export interface VaultEntry {
    provider: string;
    encrypted_key: string;
    auth_type: "Bearer" | "APIKey" | "OAuth2";
    created_at: string;
    updated_at: string;
    last_verified_at?: string;
    expires_at?: string;
}
export interface VaultData {
    salt: string;
    entries: Record<string, VaultEntry>;
}
export interface Vault {
    setKey(provider: string, key: string, authType: "Bearer" | "APIKey" | "OAuth2", ttl?: number): Promise<void>;
    getKey(provider: string): Promise<string | null>;
    removeKey(provider: string): Promise<boolean>;
    listKeys(): Promise<string[]>;
    hasKey(provider: string): Promise<boolean>;
    verifyKey(provider: string): Promise<boolean>;
    rotateKey(newPassword: string): Promise<void>;
}
export type AuditAction = "set_key" | "get_key" | "remove_key" | "rotate_key" | "verify_key" | "list_keys" | "lock_acquired" | "lock_released";
export interface AuditEvent {
    timestamp: string;
    action: AuditAction;
    provider?: string;
    success: boolean;
    error?: string;
    source?: string;
}
export interface AuditLogger {
    log(event: Omit<AuditEvent, "timestamp">): void;
    getEvents(filter?: {
        action?: string;
        provider?: string;
        since?: string;
    }): AuditEvent[];
    clear(): void;
}
export interface KeychainProvider {
    set(service: string, account: string, secret: string): Promise<void>;
    get(service: string, account: string): Promise<string | null>;
    delete(service: string, account: string): Promise<boolean>;
    isAvailable(): Promise<boolean>;
}
