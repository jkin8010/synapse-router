import { hashSchema, normalizeSchema, validateSchema } from "@synapse-router/core";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const SCHEMA_NEGOTIATION_SYSTEM_PROMPT = [
    "You are the schema negotiation component of Synapse Router.",
    "Return only JSON for a Synapse Router Schema.",
    "Allowed field types are string, number, boolean, enum, and image.",
    "Use at most 10 fields, at most depth 2, and at most 10 enum values.",
    "Do not include provider-specific API parameters or business workflow logic."
].join("\n");
export async function negotiateSchema(input, options = {}) {
    const llm = options.llm ?? createDefaultLLMClient();
    const content = await llm.complete([
        { role: "system", content: SCHEMA_NEGOTIATION_SYSTEM_PROMPT },
        { role: "user", content: createUserPrompt(input) }
    ]);
    const schema = parseSchema(content);
    const validation = validateSchema(schema);
    if (!validation.valid) {
        throw new Error(`LLM returned invalid schema: ${validation.errors.join("; ")}`);
    }
    const normalized = normalizeSchema(schema);
    return {
        schema: normalized,
        schema_id: hashSchema(normalized)
    };
}
export function createOpenAICompatibleClient(options) {
    const model = options.model ?? DEFAULT_OPENAI_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
    const fetchImpl = options.fetch ?? fetch;
    return {
        async complete(messages) {
            const response = await fetchImpl(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${options.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0,
                    response_format: { type: "json_object" }
                })
            });
            if (!response.ok) {
                throw new Error(`OpenAI-compatible request failed with status ${response.status}`);
            }
            const payload = await response.json();
            const content = payload.choices[0]?.message.content;
            if (typeof content !== "string" || content.trim().length === 0) {
                throw new Error("OpenAI-compatible response did not include message content");
            }
            return content;
        }
    };
}
function createDefaultLLMClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey !== undefined && apiKey.trim().length > 0) {
        return createOpenAICompatibleClient({ apiKey });
    }
    return {
        async complete() {
            return JSON.stringify({
                name: "negotiated-schema",
                fields: [
                    { name: "input", type: "string", required: true }
                ]
            });
        }
    };
}
function createUserPrompt(input) {
    return [
        "Create the smallest useful Synapse Router schema for this AI routing task.",
        "",
        `Task: ${input.task}`,
        `Goal: ${input.goal}`,
        `Constraints: ${JSON.stringify(input.constraints ?? {})}`,
        "",
        "Return JSON with this shape:",
        JSON.stringify({
            name: "schema-name",
            version: "optional-version",
            fields: [
                {
                    name: "field-name",
                    type: "string | number | boolean | enum | image",
                    required: true,
                    enumValues: ["only-for-enum"]
                }
            ]
        })
    ].join("\n");
}
function parseSchema(content) {
    const json = extractJson(content);
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("LLM output must be a JSON object");
    }
    return parsed;
}
function extractJson(content) {
    const trimmed = content.trim();
    const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fencedJson?.[1] !== undefined) {
        return fencedJson[1].trim();
    }
    return trimmed;
}
//# sourceMappingURL=index.js.map