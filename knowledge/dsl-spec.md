# DSL 规范

Synapse Router DSL 将一次 AI 操作描述为契约，而不是 Provider 私有 API 参数。

## 路由契约

```ts
type RouteContract = {
  id: string;
  intent: string;
  inputSchema: SchemaRef;
  outputSchema: SchemaRef;
  capabilities: CapabilityRequirement[];
  policy?: RoutePolicy;
};
```

## Schema 引用

Schema 应可寻址、可版本化。

```ts
type SchemaRef = {
  name: string;
  version: string;
  format: "json-schema" | "zod";
};
```

## 能力要求

能力要求描述 Provider 为满足契约必须支持什么。

```ts
type CapabilityRequirement =
  | { kind: "structured-output"; strict: boolean }
  | { kind: "tool-calling"; tools: string[] }
  | { kind: "vision-input" }
  | { kind: "streaming"; required: boolean };
```

## 路由策略

策略用于约束可接受的路由决策。

```ts
type RoutePolicy = {
  maxLatencyMs?: number;
  maxCostUsd?: number;
  preferredProviders?: string[];
  excludedProviders?: string[];
  allowSchemaDowngrade?: boolean;
};
```

## 协商结果

协商必须在执行前产出结构化结果。

```ts
type NegotiationResult =
  | { status: "accepted"; contract: RouteContract }
  | { status: "adapted"; contract: RouteContract; changes: string[] }
  | { status: "rejected"; reasons: string[] };
```

