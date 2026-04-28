# @synapse-router/vault

API Key 加密存储。为 Provider API Key 提供安全的本地加密存储方案。

## 安装

```bash
npm install @synapse-router/vault
```

## 快速开始

```typescript
import { createVault } from "@synapse-router/vault";

// 创建 Vault 实例（默认目录 ~/.synapse/keys/）
const vault = createVault();

// 存储 API Key
await vault.setKey("openai", "sk-your-key-here", "Bearer");

// 获取 API Key
const key = await vault.getKey("openai");
// "sk-your-key-here"

// 列出所有已存储的 Provider
const providers = await vault.listKeys();
// ["openai", "stability"]

// 验证 Key 格式
const valid = await vault.verifyKey("openai");
// true

// 删除 Key
await vault.removeKey("openai");

// 轮换加密密码
await vault.rotateKey("my-new-password");
```

## 安全设计

### 加密方案

| 组件          | 规格                                      |
|--------------|-------------------------------------------|
| 密钥派生      | PBKDF2, **600,000** 迭代, SHA-256         |
| 加密算法      | AES-256-GCM（认证加密）                    |
| Salt          | 128-bit 随机值                             |
| IV            | 96-bit 随机值（每次加密独立生成）            |
| Auth Tag      | 128-bit                                   |

### 密码来源（优先级）

1. **OS Keychain**（macOS Keychain / Linux Secret Service）— 存储 derived key，避免重复派生
2. **Machine ID 混合密码** — `hostname:username:machineId`
3. **降级密码** — `hostname:username`（Machine ID 不可用时）

> ⚠️ 当 Machine ID 不可用时，Vault 会打印警告，密码安全性降低。

### Machine ID

- **macOS**: 从 `ioreg` 读取 `IOPlatformUUID`
- **Linux**: 读取 `/etc/machine-id`

Machine ID 参与初始 Salt 生成（拼接到随机 Salt 后形成 64 hex 字符的扩展 Salt），但不影响已有 Vault 的密钥派生（读取时使用存储的 Salt）。

### 文件安全

- Vault 数据文件（`vault.json`）的父目录权限 `0o700`（仅 owner 可访问）
- 审计日志目录权限 `0o700`
- 并发写入通过文件锁（`vault.lock`）保护
- 原子写入：先写临时文件，再 `rename` 替换

## Vault API

### `createVault(config?)`

```typescript
import { createVault } from "@synapse-router/vault";
import type { VaultConfig } from "@synapse-router/vault";

const vault = createVault({
  vaultDir: "/path/to/vault",         // 存储目录，默认 ~/.synapse/keys/
  encryptionKey: "my-password",        // 自定义密码，默认从 Machine ID 派生
  instanceId: "unique-id",            // 实例 ID，用于生成唯一 lock file
  preferKeychain: true,                // 优先使用 OS Keychain，默认 true
  audit: true,                         // 审计日志：true=FileAuditLogger, false=NoopAuditLogger
});
```

### `vault.setKey(provider, key, authType, ttl?)`

存储 API Key。

```typescript
await vault.setKey("openai", "sk-xxx", "Bearer");
await vault.setKey("stability", "sk-yyy", "APIKey", 3600); // 1 小时 TTL
```

### `vault.getKey(provider)`

获取 API Key 明文。Key 过期时返回 `null`。

```typescript
const key = await vault.getKey("openai");
```

### `vault.removeKey(provider)`

删除 API Key，返回是否成功删除。

```typescript
const removed = await vault.removeKey("openai");
```

### `vault.listKeys()`

列出所有已存储 Key 的 Provider 名称。

```typescript
const providers = await vault.listKeys();
```

### `vault.hasKey(provider)`

检查某个 Provider 是否有存储的 Key。

```typescript
const exists = await vault.hasKey("openai");
```

### `vault.verifyKey(provider)`

验证 Key 格式是否正确。内置常见 Provider 的格式正则：

| Provider    | 格式                              |
|------------|-----------------------------------|
| OpenAI     | `/^sk-[A-Za-z0-9_-]{20,}$/`      |
| Replicate  | `/^r8_[A-Za-z0-9]{20,}$/`        |
| Anthropic  | `/^sk-ant-[A-Za-z0-9_-]{20,}$/`  |
| Google     | `/^AIza[A-Za-z0-9_-]{30,}$/`     |
| 其他       | 至少 20 个非空白字符               |

```typescript
const valid = await vault.verifyKey("openai");
```

### `vault.rotateKey(newPassword)`

轮换加密密码。使用新密码重新加密所有 Key。

```typescript
await vault.rotateKey("my-new-secure-password");
```

> 此操作会：解密所有现有 Key → 生成新 Salt + 新 Derived Key → 重新加密所有 Key → 原子写入

## 审计日志

### FileAuditLogger

默认审计日志实现，写入 `vaultDir/audit.jsonl`，每行一条 JSON。

```typescript
import { FileAuditLogger } from "@synapse-router/vault";

const logger = new FileAuditLogger("/path/to/vault", 1000); // 最多 1000 条

// 自动记录（通过 Vault 操作触发）
// 查询审计记录
const events = logger.getEvents({
  action: "set_key",
  provider: "openai",
  since: "2026-01-01T00:00:00Z",
});
```

### 审计事件类型

```typescript
type AuditAction =
  | "set_key"          // 存储 Key
  | "get_key"          // 获取 Key
  | "remove_key"       // 删除 Key
  | "rotate_key"       // 轮换密码
  | "verify_key"       // 验证 Key 格式
  | "list_keys"        // 列出 Key
  | "lock_acquired"    // 获取文件锁
  | "lock_released";   // 释放文件锁
```

### 事件结构

```typescript
interface AuditEvent {
  timestamp: string;
  action: AuditAction;
  provider?: string;
  success: boolean;
  error?: string;
  source?: string;
}
```

### NoopAuditLogger

禁用审计时的空实现：

```typescript
const vault = createVault({ audit: false });
```

## Keychain 集成

### macOS Keychain

使用 `security` 命令存储/读取 derived key：

```typescript
import { MacOSKeychain, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT } from "@synapse-router/vault";

const keychain = new MacOSKeychain();
await keychain.set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, "derived-key-hex");
const stored = await keychain.get(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
```

### Linux Keychain

使用 `secret-tool`（libsecret）：

```typescript
import { LinuxKeychain } from "@synapse-router/vault";

const keychain = new LinuxKeychain();
if (await keychain.isAvailable()) {
  await keychain.set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, "derived-key-hex");
}
```

### 自动检测

```typescript
import { getKeychainProvider } from "@synapse-router/vault";

const keychain = getKeychainProvider();
if (await keychain.isAvailable()) {
  // OS Keychain 可用
}
```

## 底层加密 API

```typescript
import { deriveKey, encrypt, decrypt } from "@synapse-router/vault";

// 从密码派生 AES-256 Key
const { key, salt } = deriveKey("my-password");
// 指定 Salt（读取已有 Vault 时）
const { key } = deriveKey("my-password", existingSalt);

// 加密
const encrypted = encrypt("sk-my-api-key", key);
// "iv_hex:authTag_hex:ciphertext_hex"

// 解密
const plain = decrypt(encrypted, key);
// "sk-my-api-key"
```
