import { type Schema } from "@synapse-router/core";
export interface NegotiateSchemaInput {
    task: string;
    goal: string;
    constraints?: any;
}
export interface NegotiatedSchema {
    schema: Schema;
    schema_id: string;
}
export type LLMRole = "system" | "user" | "assistant";
export interface LLMMessage {
    role: LLMRole;
    content: string;
}
export interface LLMClient {
    complete(messages: LLMMessage[]): Promise<string>;
}
export interface NegotiateSchemaOptions {
    llm?: LLMClient;
}
export interface OpenAICompatibleClientOptions {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    fetch?: typeof fetch;
}
export declare const SCHEMA_NEGOTIATION_SYSTEM_PROMPT: string;
export declare function negotiateSchema(input: NegotiateSchemaInput, options?: NegotiateSchemaOptions): Promise<NegotiatedSchema>;
export declare function createOpenAICompatibleClient(options: OpenAICompatibleClientOptions): LLMClient;
