import { getFiniteNumber } from "@utilities/default-utilities";
import { getUnixSeconds } from "@utilities/time-utilities";
import { isArrayOfStrings } from "@validators/simple-types";

import { isAnthropicMessagesResponse } from "./anthropic-types";
import { ProxyError } from "./errors.ts";
import { OPENAI_NULL } from "./openai-constants";

import type { ReadonlyRecord } from "@ts-types/utility-types";
import type { Writable } from "type-fest";

import type {
	AnthropicMessagesRequest,
	AnthropicMessagesResponse,
	AnthropicStopReason,
	AnthropicUsage,
} from "./anthropic-types.ts";
import type {
	OpenAiChatCompletionRequest,
	OpenAiChatCompletionResponse,
	OpenAiChatMessage,
	OpenAiFinishReason,
	OpenAiUsage,
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

export function translateOpenAiToAnthropic(
	openAiChatCompletionRequest: OpenAiChatCompletionRequest,
	defaultModel: string,
	defaultMaxTokens: number,
): AnthropicMessagesRequest {
	validateAnthropicRequest(openAiChatCompletionRequest);

	const model = getModel(openAiChatCompletionRequest, defaultModel);
	const messages = getMessages(openAiChatCompletionRequest);

	const systemMessages: Array<string> = [];
	let systemMessagesSize = 0;

	const anthropicMessages: Array<AnthropicMessagesRequest["messages"][number]> = [];
	let anthropicMessagesSize = 0;

	for (const message of messages) {
		validateMessageForAnthropic(message);
		const content = getTextContent(message.content, `messages.${message.role}.content`);

		if (message.role === "system" || message.role === "developer") {
			if (content) systemMessages[systemMessagesSize++] = content;
			continue;
		}

		if (message.role !== "user" && message.role !== "assistant") {
			const error = new ProxyError(`Unsupported message role "${message.role}" for Anthropic Messages.`, {
				param: "messages.role",
			});
			Error.captureStackTrace(error, translateOpenAiToAnthropic);
			throw error;
		}

		anthropicMessages[anthropicMessagesSize++] = {
			content,
			role: message.role,
		};
	}

	if (anthropicMessagesSize === 0) {
		const error = new ProxyError("At least one user or assistant message is required.", { param: "messages" });
		Error.captureStackTrace(error, translateOpenAiToAnthropic);
		throw error;
	}

	const anthropicRequest: Writable<AnthropicMessagesRequest> = {
		max_tokens: getMaxTokens(openAiChatCompletionRequest, defaultMaxTokens),
		messages: anthropicMessages,
		model,
	};

	if (systemMessagesSize > 0) anthropicRequest.system = systemMessages.join("\n\n");
	if (typeof openAiChatCompletionRequest.temperature === "number") {
		anthropicRequest.temperature = openAiChatCompletionRequest.temperature;
	}
	if (typeof openAiChatCompletionRequest.top_p === "number") {
		anthropicRequest.top_p = openAiChatCompletionRequest.top_p;
	}
	if (typeof openAiChatCompletionRequest.stream === "boolean") {
		anthropicRequest.stream = openAiChatCompletionRequest.stream;
	}

	const stopSequences = getStopSequences(openAiChatCompletionRequest.stop);
	if (stopSequences.length > 0) anthropicRequest.stop_sequences = stopSequences;

	return anthropicRequest;
}

function getAnthropicResponse(
	anthropicMessagesResponse: AnthropicMessagesResponse | unknown,
): AnthropicMessagesResponse | undefined {
	if (isAnthropicMessagesResponse.allows(anthropicMessagesResponse)) return anthropicMessagesResponse;
	return undefined;
}

export function translateAnthropicToOpenAi(
	anthropicMessagesResponse: AnthropicMessagesResponse | unknown,
	requestModel: string,
): OpenAiChatCompletionResponse {
	const anthropicResponse = getAnthropicResponse(anthropicMessagesResponse);
	const created = getUnixSeconds();
	const model = anthropicResponse?.model ?? requestModel;
	const content = getAnthropicText(anthropicResponse?.content ?? []);
	const usage = mapAnthropicUsage(anthropicResponse?.usage);

	const openAiChatCompletionResponse: Writable<OpenAiChatCompletionResponse> = {
		choices: [
			{
				finish_reason: mapAnthropicFinishReason(anthropicResponse?.stop_reason),
				index: 0,
				message: {
					content,
					role: "assistant",
				},
			},
		],
		created,
		id: anthropicResponse?.id ?? `chatcmpl-${crypto.randomUUID()}`,
		model,
		object: "chat.completion",
	};
	if (usage) openAiChatCompletionResponse.usage = usage;
	return openAiChatCompletionResponse;
}

export function mapAnthropicFinishReason(anthropicStopReason?: AnthropicStopReason | null): OpenAiFinishReason | null {
	if (!anthropicStopReason) return OPENAI_NULL;

	if (anthropicStopReason === "max_tokens") return "length";
	if (anthropicStopReason === "tool_use") return "tool_calls";
	if (anthropicStopReason === "refusal") return "content_filter";

	return "stop";
}

export function mapAnthropicUsage(anthropicUsage?: AnthropicUsage): OpenAiUsage | undefined {
	if (!anthropicUsage) return undefined;

	const promptTokens = getPromptTokens(anthropicUsage);
	const completionTokens = getFiniteNumber(anthropicUsage.output_tokens);

	return {
		completion_tokens: completionTokens,
		prompt_tokens: promptTokens,
		total_tokens: promptTokens + completionTokens,
	};
}

function validateAnthropicRequest(openAiChatCompletionRequest: OpenAiChatCompletionRequest): void {
	for (const field of UNSUPPORTED_ANTHROPIC_REQUEST_FIELDS) {
		if (openAiChatCompletionRequest[field] !== undefined) {
			const error = new ProxyError(`Field "${field}" is not supported by the Anthropic Messages adapter.`, {
				param: field,
			});
			Error.captureStackTrace(error, validateAnthropicRequest);
			throw error;
		}
	}

	const choiceCount = openAiChatCompletionRequest.n;
	if (choiceCount !== undefined && choiceCount !== 1) {
		const error = new ProxyError("Only n=1 is supported.", { param: "n" });
		Error.captureStackTrace(error, validateAnthropicRequest);
		throw error;
	}
}

function validateMessageForAnthropic(openAiChatMessage: OpenAiChatMessage): void {
	if (openAiChatMessage.tool_calls !== undefined) {
		const error = new ProxyError("Tool call messages are not supported.", { param: "messages.tool_calls" });
		Error.captureStackTrace(error, validateMessageForAnthropic);
		throw error;
	}

	if (openAiChatMessage.function_call !== undefined) {
		const error = new ProxyError("Function call messages are not supported.", { param: "messages.function_call" });
		Error.captureStackTrace(error, validateMessageForAnthropic);
		throw error;
	}

	if (openAiChatMessage.role === "tool" || openAiChatMessage.role === "function") {
		const error = new ProxyError(`Unsupported message role "${openAiChatMessage.role}".`, {
			param: "messages.role",
		});
		Error.captureStackTrace(error, validateMessageForAnthropic);
		throw error;
	}
}

function getModel(openAiChatCompletionRequest: OpenAiChatCompletionRequest, defaultModel: string): string {
	const model = openAiChatCompletionRequest.model?.trim() || defaultModel;
	if (model.length === 0) {
		const error = new ProxyError("A model is required.", { param: "model" });
		Error.captureStackTrace(error, getModel);
		throw error;
	}

	return model;
}

function getMessages({ messages }: OpenAiChatCompletionRequest): ReadonlyArray<OpenAiChatMessage> {
	if (!Array.isArray(messages) || messages.length === 0) {
		const error = new ProxyError("messages must be a non-empty array.", { param: "messages" });
		Error.captureStackTrace(error, getMessages);
		throw error;
	}
	return messages;
}

function getMaxTokens(
	{ max_completion_tokens, max_tokens }: OpenAiChatCompletionRequest,
	defaultMaxTokens: number,
): number {
	const maxTokens = max_completion_tokens ?? max_tokens ?? defaultMaxTokens;

	if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
		const error = new ProxyError("max_tokens must be a positive integer.", { param: "max_tokens" });
		Error.captureStackTrace(error, getMaxTokens);
		throw error;
	}

	return maxTokens;
}

function getTextContent(content: OpenAiChatMessage["content"], parameter: string): string {
	if (typeof content === "string") return content;

	if (Array.isArray(content)) {
		const textParts: Array<string> = [];
		let size = 0;

		for (const part of content) {
			if (part.type !== "text" || typeof part.text !== "string") {
				const error = new ProxyError("Only text message content parts are supported.", { param: parameter });
				Error.captureStackTrace(error, getTextContent);
				throw error;
			}

			textParts[size++] = part.text;
		}

		return textParts.join("");
	}

	if (content === OPENAI_NULL || content === undefined) {
		const error = new ProxyError("Message content must be text.", { param: parameter });
		Error.captureStackTrace(error, getTextContent);
		throw error;
	}

	const error = new ProxyError("Unsupported message content shape.", { param: parameter });
	Error.captureStackTrace(error, getTextContent);
	throw error;
}

function getStopSequences(stop: OpenAiChatCompletionRequest["stop"]): ReadonlyArray<string> {
	if (stop === OPENAI_NULL || stop === undefined) return [];
	if (typeof stop === "string") return [stop];
	if (isArrayOfStrings(stop)) return stop;

	const error = new ProxyError("stop must be a string or an array of strings.", { param: "stop" });
	Error.captureStackTrace(error, getStopSequences);
	throw error;
}

function getAnthropicText(content: ReadonlyArray<ReadonlyRecord<string, unknown>>): string {
	const textParts: Array<string> = [];
	let size = 0;

	for (const block of content) {
		if (block.type === "text" && typeof block.text === "string") textParts[size++] = block.text;
	}

	return textParts.join("");
}

function getPromptTokens(anthropicUsage: AnthropicUsage): number {
	return (
		getFiniteNumber(anthropicUsage.input_tokens) +
		getFiniteNumber(anthropicUsage.cache_creation_input_tokens) +
		getFiniteNumber(anthropicUsage.cache_read_input_tokens)
	);
}
