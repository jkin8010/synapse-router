# Infinite-Canvas 多协议适配层分析

> **日期**: 2026-08-10
> **状态**: ✅ 已完成
> **来源**: GitHub [hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas) v2026.08.04 源码剖析
> **分析对象**: 多协议适配层（生图 8 协议 + 视频 9 协议）

---

## 1. 项目概况

Infinite-Canvas 是一个本地部署的 AI 图像/视频生成工作室（"无限画布"UI），个人开发者 hero8152（B站），禁止商业封装。

- **技术栈**: Python FastAPI 单体后端（main.py 19,038 行 / 860KB）+ 原生 HTML/JS 前端（无构建工具链）
- **规模**: 76 类 + 850 函数 + 164 路由；前端 canvas.js 757 全局函数、smart-canvas.js 963KB
- **测试**: 仅 1 个测试文件；无 CI/lint/类型检查
- **存储**: 全部 JSON 文件（画布/会话/素材库），无数据库

## 2. 适配层架构

### 三层协议体系

```
协议 = 平台级(protocol) × 模型级覆盖(model_protocols) × 请求模式(image_request_mode)
```

- 平台协议 8 种: `openai / apimart / gemini / gemini-cli / volcengine / runninghub / jimeng / codex`
- 4 个平台协议锁定（`FIXED_PROTOCOL_PROVIDER_IDS`）: modelscope, volcengine, jimeng, runninghub
- 请求模式 5 种: openai（标准）/ openai-json（Agnes extra_body）/ openai-responses（GPT-Image-2 tool 调用）/ openai-video-proxy / apimart（专用 body）

### 生图分派（`generate_ai_image`，243 行）

优先级从高到低: 土豆特化 → modelscope → codex CLI → gemini-cli → jimeng CLI → runninghub → gemini 原生 → volcengine → OpenAI 兼容兜底（再按请求模式细分 6 条路径）

### 平台识别三信号

| 信号 | 说明 |
|---|---|
| protocol 字段 | 配置里声明（jimeng/runninghub/volcengine/codex/gemini-cli） |
| base_url 特征 | 靠域名猜（apimart.ai、tudou、agnes-ai.com） |
| 模型名正则 | `is_gpt_image_2_model` 归一化匹配 7 种变体写法 |

### 异步任务统一抽象（核心设计）

| 平台 | 异步机制 | 统一后 |
|---|---|---|
| ModelScope | `X-ModelScope-Async-Mode` 头 + 轮询 | 提交 → 轮询 → 提取 |
| 土豆 | `/images/generations/async` → task_id | 同上 |
| RunningHub | 上传参考图 → 提交 → 轮询 → 下载 | 同上 |
| 即梦 | CLI `--poll=N` | 同上 |

前端永远只见 `{images:[url], model, provider_id}`，异构性被完全吞掉。

## 3. 与 synapse-router 差距对比

| 维度 | Infinite-Canvas 适配层 | synapse-router 现状 | 差距 |
|---|---|---|---|
| 执行模型 | 同步 + 异步提交/轮询（4 机制统一） | 仅同步 request-response（`callProvider`） | 🔴 最大盲区 |
| 媒体输入 | 参考图三形态（multipart/dataURL/本地）+ 视频抽帧 + mask 分离 | DSL 无 media 概念 | 🔴 图生图刚需 |
| 超时 | 按模型分级（慢模型 read=1800s） | 无声明，全局默认 | 🟡 |
| 容错 | edits→generations 回退链 + 防重复扣费 | 仅字段级 fallback | 🟡 |
| 端点推导 | 前缀去重（防 `/v1/v1` 双写） | `deriveApiPath` 简单拼接 | 🟡 踩坑点 |
| 模型识别 | 模糊归一化（7 种变体） | 精确匹配 provider-card | 🟢 已解决 |

## 4. 值得借鉴的 6 点（按优先级）

### 4.1 执行模型声明: sync vs async-poll ⭐

DSL feature 增加 `execution` 声明:

```json
{
  "execution": {
    "mode": "async-poll",
    "submit_path": "/images/generations/async",
    "poll_path": "/tasks/{task_id}",
    "task_id_field": "task_id",
    "timeout": { "connect": 20, "read": 1800 }
  }
}
```

异步平台接入成本从"写一个 generate_xxx"降为"写一段 JSON"。这是 Router 哲学的自然延伸。

### 4.2 媒体形态声明

```json
"media": {
  "role": "image|mask|video|audio",
  "transport": "multipart|data-url|url|frames",
  "max_items": 8, "max_size": 1536
}
```

mask 单独分离走 inpainting（`role: mask` 映射到不同端点）。

### 4.3 超时分级

慢模型（生图/视频）read=1800s，普通模型走默认。一个全局超时打天下的工具必然在慢模型上假失败。放进 provider-card 或 execution 块。

### 4.4 声明式回退链 + 幂等防重复扣费

- edits 失败 → 自动回退 generations（非 GPT-2）
- GPT-2 edits 失败 → 直接停止重试（注释: "避免上游可能已扣费后再次请求"）

core 已有 `fallback_provider`（provider 级），缺请求格式级回退。DSL 声明:

```json
"fallbacks": [{ "when": "images_api_unsupported", "then": "generations" }]
```

### 4.5 端点路径防双写

`/api/v3, /v1beta, /v1, /v2` 前缀去重（base_url 已带 /v1 就不再加）。**待排查**: connector `deriveApiPath` 若直接拼接，DeepSeek 场景（`https://api.deepseek.com/v1` + `/v1/chat/completions`）会出 `/v1/v1`。

### 4.6 错误友好化

按状态码 + body 特征匹配的翻译表（`friendly_image_error_detail`），比裸抛 JSON 强。方向与现有 hint + fix_suggestion 一致，可借鉴实现。

## 5. 不值得借鉴的

- ❌ if-else 特判瀑布 → 声明式 DSL 正是为消灭它而生
- ❌ 字符串特征猜平台（靠域名）→ 脆弱，应坚持 provider-card 显式声明
- ❌ 单文件 19K 行 → 不学
- ❌ 无测试 → 现有 57 测试 + AGENTS.md 体系已碾压

## 6. 落地顺序建议

1. **先修端点拼接 bug 风险**（10 分钟排查，可能已存在）
2. **DSL 加 execution 声明**（设计文档先行，改动集中在 connector 流水线）
3. **DSL 加 media 形态声明**（配合接第一个图生图/视频 provider 时验证）
4. 超时分级 + 回退链（接到真实异步平台后按需加）

## 7. 总结

> Infinite-Canvas 值得抄的不是架构，是它用 19K 行代码踩出来的"真实世界的坑清单"——而 synapse-router 的 DSL 恰好是把这些坑变成声明字段的最佳容器。

---

相关文档:
- [[04-技术架构/synapse-router-architecture|系统架构]]
- [[04-技术架构/synapse-router-dsl-spec|DSL 规范]]
- [[01-产品规划/synapse-p1-redefinition|P1 重定义]]
