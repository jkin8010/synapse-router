# @synapse-router/cli

Synapse Router 命令行工具。通过 CLI 管理 Provider、API Key、协商和执行。

## 安装

```bash
npm install -g @synapse-router/cli
```

## 命令概览

```
synapse <command> [options]

Commands:
  provider list                       列出所有 provider packs
  provider show <id>                  查看 provider 详情
  vault set <provider> <key>          存储 API key
  vault list                          列出存储的 keys
  vault get <provider>               获取 key 值
  vault remove <provider>            删除 key
  vault verify <provider>            验证 key 格式
  vault rotate <provider>            轮换加密密码
  negotiate <schema-file>            运行 schema 协商
  execute <provider> <feature> <input>  执行 provider feature

Options:
  --help, -h               显示帮助
  --version, -v            显示版本号
```

## Provider 命令

### `synapse provider list`

列出所有已安装的 Provider Pack。

```bash
synapse provider list
# Providers:
#   openai       OpenAI                https://api.openai.com/v1
#   replicate    Replicate             https://api.replicate.com/v1
#   stability    Stability AI          https://api.stability.ai/v1
#   comfyui      ComfyUI               http://127.0.0.1:8188
```

### `synapse provider show <id>`

查看指定 Provider 的完整 Provider Card（JSON 格式）。

```bash
synapse provider show openai
# {
#   "provider": {
#     "id": "openai",
#     "name": "OpenAI",
#     "version": "1.0.0",
#     ...
#   },
#   "features": [...]
# }
```

## Vault 命令

### `synapse vault set <provider> <key>`

存储 API Key。自动从 Provider Card 检测 `auth_type`。

```bash
synapse vault set openai sk-proj-xxxx
# ✓ openai key stored

synapse vault set stability sk-xxxx
# ✓ stability key stored
```

Key 使用 AES-256-GCM 加密存储在 `~/.synapse/keys/` 目录下，支持 OS Keychain 集成。

### `synapse vault list`

列出所有已存储 Key 的 Provider（Key 值不显示）。

```bash
synapse vault list
# Stored providers:
#   openai
#   stability
```

### `synapse vault get <provider>`

获取指定 Provider 的 API Key 明文。

```bash
synapse vault get openai
# sk-proj-xxxx
```

### `synapse vault remove <provider>`

删除指定 Provider 的 API Key。

```bash
synapse vault remove openai
# ✓ openai key removed
```

### `synapse vault verify <provider>`

验证 API Key 格式是否正确。

```bash
synapse vault verify openai
# ✓ openai key format is valid

synapse vault verify openai
# ✗ openai key format is invalid
```

内置 Provider 格式验证：

| Provider    | 格式要求                          |
|------------|-----------------------------------|
| OpenAI     | `sk-` 开头，20+ 字符               |
| Replicate  | `r8_` 开头，20+ 字符               |
| Anthropic  | `sk-ant-` 开头，20+ 字符           |
| Google     | `AIza` 开头，30+ 字符              |
| 其他       | 至少 20 个非空白字符               |

### `synapse vault rotate <provider>`

轮换加密密码（交互式，尚未实现 CLI 入口）。

> 当前需通过 `@synapse-router/vault` 包的 `rotateKey()` 方法编程调用。

## Negotiate 命令

### `synapse negotiate <schema-file>`

根据 Agent Schema 文件运行协商，匹配支持对应 intent 的 Provider。

```bash
# 准备 Agent Schema
cat > agent.json << 'EOF'
{
  "agent_id": "my-agent",
  "agent_name": "My Agent",
  "version": "1.0.0",
  "access_protocol": { "kind": "api", "auth_type": "Bearer" },
  "features": [
    {
      "feature_id": "gen-image",
      "feature_name": "Generate Image",
      "intent": "text-to-image",
      "input_schema": { "name": "input", "fields": [{ "name": "prompt", "type": "string", "required": true }] },
      "output_schema": { "name": "output", "fields": [{ "name": "image_url", "type": "string" }] },
      "capabilities": [{ "kind": "image-generation", "modalities": ["png"] }]
    }
  ]
}
EOF

synapse negotiate agent.json
# Matched providers:
#   stability: text_to_image_post_v1_generation_text2img
#   openai: images_generations_post_v1_images_generations
```

## Execute 命令

### `synapse execute <provider> <feature> <input>`

执行指定 Provider 的功能。

```bash
synapse execute openai chat_post_v1_chat_completions '{"messages": [{"role": "user", "content": "Hello"}]}'
```

> 注意：`execute` 命令当前尚未完全实现。

## 全局选项

```bash
synapse --version     # 显示版本号：synapse-router CLI v0.1.0
synapse --help        # 显示帮助信息
synapse version       # 同 --version
synapse help          # 同 --help
```

## 数据目录

CLI 使用以下本地目录：

| 路径                      | 用途              |
|--------------------------|-------------------|
| `~/.synapse/keys/`       | Vault 加密存储     |
| `~/.synapse/providers/`  | 用户自定义 Provider |
| `./packs/`               | 预置 Provider Pack |
