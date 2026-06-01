import { type } from "arktype";

import { ProxyError } from "./errors.ts";
import { OPENAI_NULL } from "./openai-constants.ts";

import type {
	AnthropicMessagesRequest,
	AnthropicMessagesResponse,
	AnthropicStopReason,
	AnthropicUsage,
} from "./anthropic-types.ts";
import type {
	OpenAIChatCompletionRequest,
	OpenAIChatCompletionResponse,
	OpenAIChatMessage,
	OpenAIFinishReason,
	OpenAIUsage,
} from "./openai-types.ts";

const UNSUPPORTED_ANTHROPIC_REQUEST_FIELDS: ReadonlyArray<string> = [
	"audio",
	"function_call",
	"functions",
	"logit_bias",
	"logprobs",
	"metadata",
	"modalities",
	"parallel_tool_calls",
	"prediction",
	"reasoning_effort",
	"response_format",
	"seed",
	"store",
	"tool_choice",
	"tools",
	"top_logprobs",
];

export const AnthropicMessage = type({
	content: [
		{
			text: "string",
			type: "'text' | 'thinking'",
		},
		"[]",
	],
	id: "string",
	model: "string",
	"role?": "'assistant'",
	"stop_reason?": "string | null",
	"stop_sequence?": "string | null",
	type: "'message'",
	"usage?": {
		"cache_creation_input_tokens?": "number",
		"cache_read_input_tokens?": "number",
		input_tokens: "number",
		output_tokens: "number",
	},
});

export function translateOpenAIToAnthropic(
	request: OpenAIChatCompletionRequest,
	defaultModel: string,
	defaultMaxTokens: number,
): AnthropicMessagesRequest {
	validateAnthropicRequest(request);

	const model = getModel(request, defaultModel);
	const messages = getMessages(request);
	const systemMessages: Array<string> = [];
	const anthropicMessages: Array<AnthropicMessagesRequest["messages"][number]> = [];

	for (const message of messages) {
		validateMessageForAnthropic(message);
		const content = getTextContent(message.content, `messages.${message.role}.content`);

		if (message.role === "system" || message.role === "developer") {
			if (content) systemMessages.push(content);
			continue;
		}

		if (message.role !== "user" && message.role !== "assistant") {
			throw new ProxyError(`Unsupported message role "${message.role}" for Anthropic Messages.`, {
				param: "messages.role",
			});
		}

		anthropicMessages.push({
			content,
			role: message.role,
		});
	}

	if (anthropicMessages.length === 0) {
		throw new ProxyError("At least one user or assistant message is required.", { param: "messages" });
	}

	const anthropicRequest: AnthropicMessagesRequest = {
		max_tokens: getMaxTokens(request, defaultMaxTokens),
		messages: anthropicMessages,
		model,
	};

	if (systemMessages.length > 0) anthropicRequest.system = systemMessages.join("\n\n");
	if (typeof request.temperature === "number") anthropicRequest.temperature = request.temperature;
	if (typeof request.top_p === "number") anthropicRequest.top_p = request.top_p;
	if (typeof request.stream === "boolean") anthropicRequest.stream = request.stream;

	const stopSequences = getStopSequences(request.stop);
	if (stopSequences.length > 0) anthropicRequest.stop_sequences = stopSequences;

	return anthropicRequest;
}

export function translateAnthropicToOpenAI(
	response: AnthropicMessagesResponse | unknown,
	requestModel: string,
): OpenAIChatCompletionResponse {
	const anthropicResponse = isAnthropicMessagesResponse(response) ? response : {};
	const created = getUnixSeconds();
	const model = anthropicResponse.model ?? requestModel;
	const content = getAnthropicText(anthropicResponse.content ?? []);
	const usage = mapAnthropicUsage(anthropicResponse.usage);

	return {
		choices: [
			{
				finish_reason: mapAnthropicFinishReason(anthropicResponse.stop_reason),
				index: 0,
				message: {
					content,
					role: "assistant",
				},
			},
		],
		created,
		id: anthropicResponse.id ?? `chatcmpl-${crypto.randomUUID()}`,
		model,
		object: "chat.completion",
		...(usage ? { usage } : {}),
	};
}

export function mapAnthropicFinishReason(reason: AnthropicStopReason | null | undefined): OpenAIFinishReason | null {
	if (!reason) return OPENAI_NULL;

	if (reason === "max_tokens") return "length";
	if (reason === "tool_use") return "tool_calls";
	if (reason === "refusal") return "content_filter";
	return "stop";
}

export function mapAnthropicUsage(usage: AnthropicUsage | undefined): OpenAIUsage | undefined {
	if (!usage) return undefined;

	const promptTokens = getPromptTokens(usage);
	const completionTokens = getNumber(usage.output_tokens);

	return {
		completion_tokens: completionTokens,
		prompt_tokens: promptTokens,
		total_tokens: promptTokens + completionTokens,
	};
}

function validateAnthropicRequest(request: OpenAIChatCompletionRequest): void {
	for (const field of UNSUPPORTED_ANTHROPIC_REQUEST_FIELDS) {
		if (request[field] !== undefined) {
			throw new ProxyError(`Field "${field}" is not supported by the Anthropic Messages adapter.`, {
				param: field,
			});
		}
	}

	const choiceCount = request["n"];
	if (choiceCount !== undefined && choiceCount !== 1) {
		throw new ProxyError("Only n=1 is supported.", { param: "n" });
	}
}

function validateMessageForAnthropic(message: OpenAIChatMessage): void {
	if (message.tool_calls !== undefined) {
		throw new ProxyError("Tool call messages are not supported.", { param: "messages.tool_calls" });
	}

	if (message.function_call !== undefined) {
		throw new ProxyError("Function call messages are not supported.", { param: "messages.function_call" });
	}

	if (message.role === "tool" || message.role === "function") {
		throw new ProxyError(`Unsupported message role "${message.role}".`, { param: "messages.role" });
	}
}

function getModel(request: OpenAIChatCompletionRequest, defaultModel: string): string {
	const model = request.model?.trim() || defaultModel;
	if (!model) throw new ProxyError("A model is required.", { param: "model" });
	return model;
}

function getMessages(request: OpenAIChatCompletionRequest): ReadonlyArray<OpenAIChatMessage> {
	if (!Array.isArray(request.messages) || request.messages.length === 0) {
		throw new ProxyError("messages must be a non-empty array.", { param: "messages" });
	}

	return request.messages;
}

function getMaxTokens(request: OpenAIChatCompletionRequest, defaultMaxTokens: number): number {
	const maxTokens = request.max_completion_tokens ?? request.max_tokens ?? defaultMaxTokens;

	if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
		throw new ProxyError("max_tokens must be a positive integer.", { param: "max_tokens" });
	}

	return maxTokens;
}

function getTextContent(content: OpenAIChatMessage["content"], parameter: string): string {
	if (typeof content === "string") return content;

	if (Array.isArray(content)) {
		const textParts: Array<string> = [];

		for (const part of content) {
			if (part.type !== "text" || typeof part.text !== "string") {
				throw new ProxyError("Only text message content parts are supported.", { param: parameter });
			}

			textParts.push(part.text);
		}

		return textParts.join("");
	}

	if (content === OPENAI_NULL || content === undefined) {
		throw new ProxyError("Message content must be text.", { param: parameter });
	}

	throw new ProxyError("Unsupported message content shape.", { param: parameter });
}

function getStopSequences(stop: OpenAIChatCompletionRequest["stop"]): ReadonlyArray<string> {
	if (stop === OPENAI_NULL || stop === undefined) return [];
	if (typeof stop === "string") return [stop];
	if (Array.isArray(stop) && stop.every((sequence) => typeof sequence === "string")) return stop;
	throw new ProxyError("stop must be a string or an array of strings.", { param: "stop" });
}

function getAnthropicText(content: ReadonlyArray<Readonly<Record<string, unknown>>>): string {
	const textParts: Array<string> = [];

	for (const block of content) {
		if (block["type"] === "text" && typeof block["text"] === "string") textParts.push(block["text"]);
	}

	return textParts.join("");
}

function getNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getPromptTokens(usage: AnthropicUsage): number {
	return (
		getNumber(usage.input_tokens) +
		getNumber(usage.cache_creation_input_tokens) +
		getNumber(usage.cache_read_input_tokens)
	);
}

function getUnixSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function isAnthropicMessagesResponse(value: unknown): value is AnthropicMessagesResponse {
	return !(AnthropicMessage(value) instanceof type.errors);
}
