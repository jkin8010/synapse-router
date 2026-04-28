// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultConfig {
  vaultDir: string;              // 存储目录路径，默认 ~/.synapse/keys/
  encryptionKey?: string;         // 用户密码派生的加密密钥
  instanceId?: string;            // 实例唯一标识，用于生成唯一 lock file name
  preferKeychain?: boolean;       // 优先使用 OS Keychain（默认 true）
  audit?: boolean | AuditLogger;  // 审计日志：true=FileAuditLogger, false=NoopAuditLogger, 或自定义
}

export interface VaultEntry {
  provider: string;
  encrypted_key: string;
  auth_type: "Bearer" | "APIKey" | "OAuth2";
  created_at: string;
  updated_at: string;
  last_verified_at?: string;
  expires_at?: string;           // ISO 8601 过期时间
}

export interface VaultData {
  salt: string;
  entries: Record<string, VaultEntry>;  // keyed by provider
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

// ---------------------------------------------------------------------------
// Audit types
// ---------------------------------------------------------------------------

export type AuditAction =
  | "set_key"
  | "get_key"
  | "remove_key"
  | "rotate_key"
  | "verify_key"
  | "list_keys"
  | "lock_acquired"
  | "lock_released";

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
  getEvents(filter?: { action?: string; provider?: string; since?: string }): AuditEvent[];
  clear(): void;
}

// ---------------------------------------------------------------------------
// Keychain types
// ---------------------------------------------------------------------------

export interface KeychainProvider {
  set(service: string, account: string, secret: string): Promise<void>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<boolean>;
  isAvailable(): Promise<boolean>;
}
