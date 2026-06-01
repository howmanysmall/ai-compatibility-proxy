import { type } from "arktype";

export const isOpenAiChatRole = type('"system" | "developer" | "user" | "assistant" | "tool" | "function"');
export type OpenAiChatRole = typeof isOpenAiChatRole.infer;

export const isOpenAiFinishReason = type('"stop" | "length" | "tool_calls" | "content_filter"');
export type OpenAiFinishReason = typeof isOpenAiFinishReason.infer;

export const isOpenAiTextContentPart = type({
	text: "string",
	type: '"text"',
}).readonly();
export type OpenAiTextContentPart = typeof isOpenAiTextContentPart.infer;

export const isOpenAiChatMessage = type({
	"content?": type("string | null").or(
		isOpenAiTextContentPart.or("Record<string, unknown>").readonly().array().readonly(),
	),
	"function_call?": "unknown",
	"name?": "string",
	role: isOpenAiChatRole,
	"tool_call_id?": "string",
	"tool_calls?": "unknown",
}).readonly();
export type OpenAiChatMessage = typeof isOpenAiChatMessage.infer;

export const isOpenAiChatCompletionRequest = type({
	"[string]": "unknown",
	"max_completion_tokens?": "number % 1",
	"max_tokens?": "number % 1",
	"messages?": isOpenAiChatMessage.array().readonly().atLeastLength(1),
	"model?": "string",
	"stop?": type("string | null").or(type("string[]").readonly()),
	"stream?": "boolean",
	"temperature?": "number",
	"top_p?": "number",
}).readonly();
export type OpenAiChatCompletionRequest = typeof isOpenAiChatCompletionRequest.infer;

export const isOpenAiErrorBody = type({
	error: type({
		code: type("string | null"),
		message: "string",
		param: type("string | null"),
		type: "string",
	}).readonly(),
}).readonly();
export type OpenAiErrorBody = typeof isOpenAiErrorBody.infer;

export const isOpenAiChatCompletionChoice = type({
	finish_reason: isOpenAiFinishReason.or("null"),
	index: "number % 1",
	message: type({
		content: "string",
		role: "'assistant'",
	}).readonly(),
}).readonly();
export type OpenAiChatCompletionChoice = typeof isOpenAiChatCompletionChoice.infer;

export const isOpenAiUsage = type({
	completion_tokens: "number % 1",
	prompt_tokens: "number % 1",
	total_tokens: "number % 1",
}).readonly();
export type OpenAiUsage = typeof isOpenAiUsage.infer;

export const isOpenAiChatCompletionResponse = type({
	choices: isOpenAiChatCompletionChoice.array().readonly(),
	created: "number",
	id: "string",
	model: "string",
	object: "'chat.completion'",
	"usage?": isOpenAiUsage,
}).readonly();
export type OpenAiChatCompletionResponse = typeof isOpenAiChatCompletionResponse.infer;

export const isOpenAiChatCompletionChunk = type({
	choices: type({
		delta: type({
			"content?": "string",
			"role?": "'assistant'",
		}).readonly(),
		finish_reason: isOpenAiFinishReason.or("null"),
		index: "number % 1",
	})
		.readonly()
		.array()
		.readonly(),
	created: "number",
	id: "string",
	model: "string",
	object: '"chat.completion.chunk"',
	"usage?": isOpenAiUsage,
}).readonly();
export type OpenAiChatCompletionChunk = typeof isOpenAiChatCompletionChunk.infer;

export const isOpenAiModel = type({
	created: "number",
	id: "string",
	object: "'model'",
	owned_by: "string",
}).readonly();
export type OpenAiModel = typeof isOpenAiModel.infer;

export const isOpenAiModelListResponse = type({
	data: isOpenAiModel.array().readonly(),
	object: "'list'",
}).readonly();
export type OpenAiModelListResponse = typeof isOpenAiModelListResponse.infer;
