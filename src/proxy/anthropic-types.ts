import { type } from "arktype";

import type { LiteralUnion } from "type-fest";

export const isAnthropicMessageRole = type('"user" | "assistant"');
export type AnthropicMessageRole = typeof isAnthropicMessageRole.infer;

export type AnthropicStopReason = LiteralUnion<
	"end_turn" | "stop_sequence" | "max_tokens" | "tool_use" | "pause_turn" | "refusal",
	string
>;
export const isAnthropicStopReason = type("string").as<AnthropicStopReason>();

export const isAnthropicTextBlock = type({
	"+": "reject",
	text: "string",
	type: "'text'",
}).readonly();
export type AnthropicTextBlock = typeof isAnthropicTextBlock.infer;

export const isAnthropicMessage = type({
	"+": "reject",
	content: isAnthropicTextBlock.array().readonly().or("string"),
	role: isAnthropicMessageRole,
}).readonly();
export type AnthropicMessage = typeof isAnthropicMessage.infer;

export const isAnthropicMessagesRequest = type({
	"+": "reject",
	max_tokens: "number % 1",
	messages: isAnthropicMessage.array().readonly(),
	model: "string",
	"stop_sequences?": type("string[]").readonly(),
	"stream?": "boolean",
	"system?": "string",
	"temperature?": "number",
	"top_p?": "number",
}).readonly();
export type AnthropicMessagesRequest = typeof isAnthropicMessagesRequest.infer;

export const isAnthropicUsage = type({
	"[string]": "unknown",
	"cache_creation_input_tokens?": "number % 1",
	"cache_read_input_tokens?": "number % 1",
	"input_tokens?": "number % 1",
	"output_tokens?": "number % 1",
}).readonly();
export type AnthropicUsage = typeof isAnthropicUsage.infer;

export const isAnthropicMessagesResponse = type({
	"[string]": "unknown",
	"content?": type("Record<string, unknown>").readonly().array().readonly(),
	"id?": "string",
	"model?": "string",
	"role?": "'assistant'",
	"stop_reason?": isAnthropicStopReason.or("null"),
	"stop_sequence?": "string | null",
	type: "'message'",
	"usage?": isAnthropicUsage,
}).readonly();
export type AnthropicMessagesResponse = typeof isAnthropicMessagesResponse.infer;
