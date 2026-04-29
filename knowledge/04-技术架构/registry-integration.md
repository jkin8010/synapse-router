# Synapse Router — Registry 集成说明

> **目标**: 定义 synapse-router 如何与 synapse-registry 集成，实现 Pack 在线发现、下载和更新
> **日期**: 2026-04-28

---

## 1. 集成全景

```
┌───────────────────────────────────────────────────────────┐
│                Synapse Registry (闭源 SaaS)                │
│                                                           │
│  API:                                                     │
│  GET /packs                      Pack 列表/搜索           │
│  GET /packs/:ns/:name            Pack 详情               │
│  GET /packs/:ns/:name/versions   版本列表                 │
│  GET /packs/:ns/:name/download/:version  下载 tarball     │
│  GET /changelog/:ns/:name        变更日志                 │
└──────────────────────────┬────────────────────────────────┘
                           │ REST API
                           ▼
┌───────────────────────────────────────────────────────────┐
│          synapse-router (开源, 用户本地)                    │
│                                                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │ CLI (apps/cli)       │  │ API Server (apps/api)      │ │
│  │                      │  │                           │ │
│  │ 新增命令:            │  │ 修改:                      │ │
│  │ pack add             │  │ loadProviders() 支持多来源  │ │
│  │ pack remove          │  │ /health 报告 registry 状态  │ │
│  │ pack update          │  │                           │ │
│  │ pack outdated        │  │                           │ │
│  │ pack search          │  │                           │ │
│  │ pack info            │  │                           │ │
│  └──────────────────────┘  └───────────────────────────┘ │
│                                                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │ Pack Loader          │  │ Registry Client            │ │
│  │ (packages/core 扩展) │  │ (新增包)                   │ │
│  │                      │  │                           │ │
│  │ 三级加载优先级:       │  │ 封装:                      │ │
│  │ 1. 项目本地           │  │ - Registry API 调用        │ │
│  │ 2. Registry 安装      │  │ - Pack 下载 + 校验         │ │
│  │ 3. 内置 Pack         │  │ - 缓存管理                 │ │
│  └──────────────────────┘  │ - 版本协商                 │ │
│                            └───────────────────────────┘ │
│                                                           │
│  本地存储:                                                │
│  ~/.synapse/packs/        Registry 安装的 Pack            │
│  ~/.synapse/installed.json 安装记录                       │
│  ~/.synapse/cache/        下载缓存                       │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Router 需要修改的模块

### 2.1 新增包: `@synapse-router/registry-client`

```
packages/registry-client/
├── src/
│   ├── index.ts            # 导出
│   ├── client.ts           # Registry API 客户端
│   ├── downloader.ts       # Pack 下载 + 校验
│   ├── installer.ts        # Pack 安装 + 解压
│   ├── version.ts          # 版本协商 + 兼容性检查
│   └── cache.ts            # 下载缓存管理
├── package.json
└── tsconfig.json
```

**核心接口**:

```typescript
// packages/registry-client/src/client.ts

export interface RegistryClientConfig {
  registryUrl: string;                // "https://api.synapse.registry.dev/api/v1"
  coreVersion: string;                // 当前 @synapse-router/core 版本
  authToken?: string;                 // API Token（可选，匿名访问也可）
  cacheDir?: string;                  // 下载缓存目录
  packsDir?: string;                  // Pack 安装目录
}

export class RegistryClient {
  constructor(config: RegistryClientConfig);

  // Pack 发现
  async searchPacks(query: SearchPacksQuery): Promise<PackListResponse>;
  async getPackDetail(namespace: string, name: string): Promise<PackDetailResponse>;
  async getPackVersions(namespace: string, name: string): Promise<PackVersionListResponse>;

  // Pack 下载
  async downloadPack(namespace: string, name: string, version: string): Promise<DownloadResult>;

  // Pack 安装
  async installPack(packRef: string, options?: InstallOptions): Promise<InstallResult>;
  async removePack(packRef: string): Promise<RemoveResult>;
  async updatePack(packRef: string): Promise<UpdateResult>;
  async checkOutdated(): Promise<OutdatedResult[]>;

  // 变更通知
  async getChangelog(namespace: string, name: string): Promise<ChangelogResponse>;
}

// 安装选项
export interface InstallOptions {
  force?: boolean;           // 覆盖已安装的 Pack
  version?: string;          // 指定版本
  skipValidation?: boolean;  // 跳过校验（开发用）
}

// 安装结果
export interface InstallResult {
  success: boolean;
  namespace: string;
  name: string;
  version: string;
  source: "registry" | "builtin" | "local";
  features: Array<{
    id: string;
    intent: string;
    name: string;
  }>;
  warnings?: string[];
}
```

### 2.2 修改: CLI (`apps/cli/src/index.ts`)

当前 CLI 的 `provider list/show` 从本地 `packs/` 目录加载。需要扩展为支持 Registry 命令：

```typescript
// apps/cli/src/index.ts — 需要新增的命令

// ─── Pack 管理（Registry 集成） ─────────────────────────────────

async function packAdd(packRef: string, flags: Set<string>): Promise<void> {
  // 1. 解析 Pack 引用: "@official/openai", "openai", "@official/openai@2.1.0"
  const { namespace, name, version } = parsePackRef(packRef);

  // 2. 初始化 Registry Client
  const client = createRegistryClient();

  // 3. 安装 Pack
  const result = await client.installPack(packRef, {
    force: flags.has("force"),
    version,
  });

  // 4. 输出结果
  if (result.success) {
    console.log(`✅ ${namespace}/${name}@${result.version} installed successfully!`);
    console.log();
    console.log("Features:");
    for (const feature of result.features) {
      console.log(`  • ${feature.name} (${feature.intent})`);
    }
    console.log();
    console.log("Next steps:");
    console.log(`  synapse vault set ${name} <your-api-key>`);
    console.log(`  synapse negotiate --provider ${name}`);
  }
}

async function packRemove(packRef: string): Promise<void> {
  // 移除 ~/.synapse/packs/<name>/ 目录
  // 更新 installed.json
}

async function packUpdate(packRef: string): Promise<void> {
  // 检查 Registry 最新版本
  // 下载 + 安装
}

async function packOutdated(): Promise<void> {
  // 检查所有已安装 Pack 是否有更新
}

async function packSearch(query: string): Promise<void> {
  // 从 Registry 搜索 Pack
  const client = createRegistryClient();
  const results = await client.searchPacks({ q: query });
  // 格式化输出
}

async function packInfo(packRef: string): Promise<void> {
  // 从 Registry 获取 Pack 详情
}

async function packList(): Promise<void> {
  // 列出本地已安装的 Pack
}
```

**Pack 引用解析**:

```typescript
function parsePackRef(ref: string): { namespace: string; name: string; version?: string } {
  // "@official/openai@2.1.0" → { namespace: "@official", name: "openai", version: "2.1.0" }
  // "@official/openai"       → { namespace: "@official", name: "openai", version: undefined }
  // "openai"                 → { namespace: "@official", name: "openai", version: undefined } (默认 @official)
  // "@community/mj-proxy"    → { namespace: "@community", name: "mj-proxy", version: undefined }

  const [nsName, version] = ref.split("@").length > 2
    ? [ref.substring(0, ref.lastIndexOf("@")), ref.substring(ref.lastIndexOf("@") + 1)]
    : ref.includes("@")
      ? [ref, undefined]
      : [`@official/${ref}`, undefined];

  const [namespace, name] = nsName.startsWith("@")
    ? [nsName.split("/")[0], nsName.split("/")[1]]
    : ["@official", nsName];

  return { namespace, name, version };
}
```

### 2.3 修改: API Server (`apps/api/src/index.ts`)

当前 API Server 的 `loadProviders()` 只从本地 `packs/` 目录加载。需要扩展为三级加载：

```typescript
// apps/api/src/index.ts — 修改 loadProviders

async function loadAllProviders(
  builtinPacksDir: string,
  registryPacksDir?: string,
  localPacksDir?: string
): Promise<Map<string, ProviderCard>> {
  const providers = new Map<string, ProviderCard>();

  // Level 1: 内置 Pack（最低优先级）
  const builtin = await loadProviders(builtinPacksDir);
  for (const [id, card] of builtin) {
    providers.set(id, card);
  }

  // Level 2: Registry 安装的 Pack（覆盖内置）
  if (registryPacksDir) {
    const registry = await loadProviders(registryPacksDir);
    for (const [id, card] of registry) {
      providers.set(id, card);  // 覆盖
    }
  }

  // Level 3: 项目本地 Pack（最高优先级）
  if (localPacksDir) {
    const local = await loadProviders(localPacksDir);
    for (const [id, card] of local) {
      providers.set(id, card);  // 覆盖
    }
  }

  return providers;
}
```

### 2.4 新增: /health 端点增强

```typescript
// apps/api/src/index.ts — /health 端点增强

if (req.method === "GET" && matchRoute("/health", pathname)) {
  const registryStatus = await checkRegistryHealth();
  sendJson(res, 200, {
    status: "ok",
    providers_loaded: ctx.providers.size,
    registry: registryStatus,      // 新增
    packs_sources: {               // 新增
      builtin: /* 数量 */,
      registry: /* 数量 */,
      local: /* 数量 */,
    }
  });
  return;
}

async function checkRegistryHealth(): Promise<{
  status: "ok" | "degraded" | "unavailable";
  url: string;
  latency_ms: number;
}> {
  try {
    const start = Date.now();
    await fetch(`${REGISTRY_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return { status: "ok", url: REGISTRY_URL, latency_ms: Date.now() - start };
  } catch {
    return { status: "unavailable", url: REGISTRY_URL, latency_ms: -1 };
  }
}
```

---

## 3. 安装流程实现细节

### 3.1 Pack 下载与校验

```typescript
// packages/registry-client/src/downloader.ts

export interface DownloadResult {
  tarballPath: string;           // 本地 tarball 路径
  version: string;               // 实际版本号
  checksum: string;              // SHA-256 校验和
  coreMinVersion: string;        // 最低 core 版本
  size: number;                  // 文件大小 (bytes)
}

export async function downloadPack(
  namespace: string,
  name: string,
  version: string,
  config: RegistryClientConfig
): Promise<DownloadResult> {
  const url = `${config.registryUrl}/packs/${namespace}/${name}/download/${version}`;
  const cacheDir = config.cacheDir ?? path.join(homedir(), ".synapse", "cache");
  const tarballName = `${name}-${version}.tgz`;
  const tarballPath = path.join(cacheDir, tarballName);

  // 检查缓存
  if (fs.existsSync(tarballPath)) {
    return {
      tarballPath,
      version,
      checksum: "",  // 从缓存元数据获取
      coreMinVersion: "",
      size: fs.statSync(tarballPath).size,
    };
  }

  // 下载
  const response = await fetch(url, {
    headers: {
      "X-Core-Version": config.coreVersion,
      ...(config.authToken ? { "Authorization": `Bearer ${config.authToken}` } : {}),
    },
  });

  if (!response.ok) {
    throw new RegistryDownloadError(response.status, await response.text());
  }

  const versionHeader = response.headers.get("X-Pack-Version") ?? version;
  const checksumHeader = response.headers.get("X-Pack-Checksum") ?? "";
  const coreMinHeader = response.headers.get("X-Core-Min-Version") ?? "0.1.0";

  // 保存到缓存
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(tarballPath, buffer);

  // 校验
  const actualChecksum = `sha256-${crypto.createHash("sha256").update(buffer).digest("hex")}`;
  if (checksumHeader && actualChecksum !== checksumHeader) {
    await fs.promises.unlink(tarballPath);
    throw new RegistryChecksumError(expected: checksumHeader, actual: actualChecksum);
  }

  return {
    tarballPath,
    version: versionHeader,
    checksum: actualChecksum,
    coreMinVersion: coreMinHeader,
    size: buffer.length,
  };
}
```

### 3.2 Pack 安装与解压

```typescript
// packages/registry-client/src/installer.ts

export async function installPack(
  downloadResult: DownloadResult,
  config: RegistryClientConfig
): Promise<InstallResult> {
  const packsDir = config.packsDir ?? path.join(homedir(), ".synapse", "packs");
  const targetDir = path.join(packsDir, /* pack name from tarball */);

  // 版本兼容性检查
  if (!semverCompatible(config.coreVersion, downloadResult.coreMinVersion)) {
    return {
      success: false,
      error: `Incompatible: Pack requires core >=${downloadResult.coreMinVersion}, current is ${config.coreVersion}`,
      // ...
    };
  }

  // 解压 tarball
  await fs.promises.mkdir(targetDir, { recursive: true });
  await execFile("tar", [
    "-xzf", downloadResult.tarballPath,
    "-C", targetDir,
    "--strip-components=1",   // 去掉顶层目录
  ]);

  // 校验 Pack 结构
  const validation = await validateInstalledPack(targetDir);
  if (!validation.valid) {
    // 回滚
    await fs.promises.rm(targetDir, { recursive: true });
    return {
      success: false,
      error: `Pack validation failed: ${validation.errors.join(", ")}`,
      // ...
    };
  }

  // 读取 provider-card.json
  const card = JSON.parse(
    await fs.promises.readFile(path.join(targetDir, "provider-card.json"), "utf8")
  );

  // 更新安装记录
  await updateInstalledRecord(card.provider.id, {
    version: downloadResult.version,
    checksum: downloadResult.checksum,
    source: "registry",
    installed_at: new Date().toISOString(),
  });

  return {
    success: true,
    namespace: "@official",
    name: card.provider.id,
    version: downloadResult.version,
    source: "registry",
    features: card.features.map((f: any) => ({
      id: f.id,
      intent: f.intent,
      name: f.name,
    })),
  };
}
```

### 3.3 安装记录

```typescript
// ~/.synapse/installed.json
interface InstalledPacks {
  [packId: string]: {
    version: string;
    checksum: string;
    source: "registry" | "builtin" | "local";
    namespace: string;
    installed_at: string;
    updated_at: string;
  };
}
```

---

## 4. 版本兼容性检查

### 4.1 Core 版本与 Pack 版本的关系

```
@synapse-router/core 版本   Pack 的 core_min_version   兼容?
─────────────────────────   ─────────────────────────   ─────
0.1.0                       >=0.1.0                      ✅
0.1.0                       >=0.2.0                      ❌
0.2.0                       >=0.1.0                      ✅
0.2.0                       >=0.2.0                      ✅
```

### 4.2 semver 兼容性检查

```typescript
function semverCompatible(coreVersion: string, minVersion: string): boolean {
  const core = parseSemver(coreVersion);
  const min = parseSemver(minVersion);
  
  // Core 主版本号必须 >= Min 主版本号
  if (core.major < min.major) return false;
  if (core.major === min.major && core.minor < min.minor) return false;
  
  return true;
}
```

### 4.3 升级策略

```bash
# 当 Pack 新版本要求更高的 core 版本时
$ synapse pack update openai
⚠️  @official/openai@3.0.0 requires @synapse-router/core >=0.2.0
   Current version: 0.1.0
   
   Options:
   1. Upgrade core: npm install @synapse-router/core@0.2.0
   2. Install older Pack: synapse pack add openai@2.1.0
   3. Skip this update

# 当 Pack 新版本是 breaking change 时
$ synapse pack update openai
⚠️  Breaking changes in @official/openai@3.0.0:
   - Feature "image-generations": field "quality" enum removed "standard" value
   - Feature "chat": "max_tokens" renamed to "max_completion_tokens"
   
   Migration guide: https://synapse.registry.dev/packs/@official/openai/migration/3.0
   Pin current version: synapse pack add openai@2.1.0
```

---

## 5. 降级与容错

### 5.1 Registry 不可用时的行为

| 场景 | 行为 |
|------|------|
| `synapse pack add` 时 Registry 不可用 | 报错退出，建议稍后重试 |
| `synapse provider list` 时 Registry 不可用 | 正常工作（从本地 Pack 加载） |
| API Server 启动时 Registry 不可用 | 正常启动，使用本地 Pack |
| `synapse pack outdated` 时 Registry 不可用 | 报错退出 |
| `synapse negotiate` 时 Registry 不可用 | 正常工作（本地协商） |

**核心原则**: Registry 是可选增强，不是必须依赖。Router 在无 Registry 时仍可正常工作。

### 5.2 Pack 校验失败时的行为

```bash
$ synapse pack add openai
⬇️  Downloading @official/openai@2.1.0...
✗ Checksum mismatch!
  Expected: sha256-abc123...
  Actual:   sha256-def456...
  
  This may indicate a network error or tampered download.
  Please retry. If the problem persists, report at:
  https://github.com/useeclaw/synapse-router/issues
```

---

## 6. 配置

### 6.1 Registry 配置

```typescript
// ~/.synapse/config.json（可选）
interface SynapseConfig {
  registry: {
    url: string;                   // Registry API URL
    auth_token?: string;           // API Token
    timeout_ms?: number;           // 请求超时（默认 10000）
    cache_enabled?: boolean;       // 是否启用下载缓存（默认 true）
  };
  packs: {
    registry_dir?: string;         // Registry Pack 安装目录（默认 ~/.synapse/packs）
    local_dir?: string;            // 项目本地 Pack 目录（默认 ./synapse-packs）
    builtin_dir?: string;          // 内置 Pack 目录（默认 项目 packs/）
  };
}
```

### 6.2 环境变量

```bash
# Registry 连接
SYNAPSE_REGISTRY_URL=https://api.synapse.registry.dev/api/v1
SYNAPSE_REGISTRY_TOKEN=sr_live_abc123...

# 本地路径
SYNAPSE_PACKS_DIR=~/.synapse/packs
SYNAPSE_CACHE_DIR=~/.synapse/cache
```

---

## 7. 实施路线

### Phase 1: 基础集成（2 周）

- [ ] 创建 `@synapse-router/registry-client` 包
- [ ] 实现 `downloadPack()` + `installPack()`
- [ ] CLI: `synapse pack add` / `pack remove` / `pack list`
- [ ] `loadAllProviders()` 三级加载
- [ ] 版本兼容性检查
- [ ] 安装记录 `installed.json`

### Phase 2: 发现与更新（1 周）

- [ ] CLI: `synapse pack search` / `pack info` / `pack outdated`
- [ ] CLI: `synapse pack update` / `pack update --all`
- [ ] 下载缓存管理
- [ ] /health 端点增强

### Phase 3: 变更通知（1 周）

- [ ] CLI: `synapse pack changelog <pack>`
- [ ] 变更通知轮询
- [ ] Breaking change 提示

---

最后更新：2026-04-28
