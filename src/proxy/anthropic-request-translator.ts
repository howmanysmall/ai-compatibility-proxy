import { isArrayOfStrings } from "$validators/simple-types";

import { validateAnthropicRequest, validateMessageForAnthropic, getTextContent } from "./anthropic-message-validation";
import { ProxyError } from "./errors";
import { OPENAI_NULL } from "./openai-constants";

import type { Writable } from "type-fest";

import type { AnthropicMessagesRequest } from "./anthropic-types";
import type { OpenAiChatCompletionRequest, OpenAiChatMessage } from "./openai-types";

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

function getStopSequences(stop: OpenAiChatCompletionRequest["stop"]): ReadonlyArray<string> {
	if (stop === OPENAI_NULL || stop === undefined) return [];
	if (typeof stop === "string") return [stop];
	if (isArrayOfStrings(stop)) return stop;

	const error = new ProxyError("stop must be a string or an array of strings.", { param: "stop" });
	Error.captureStackTrace(error, getStopSequences);
	throw error;
}
