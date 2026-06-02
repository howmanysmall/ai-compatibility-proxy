import { ProxyError } from "./errors.ts";

import type { Writable } from "type-fest";

import type { ProxyConfiguration } from "./config.ts";
import type { OpenAiChatCompletionRequest, OpenAiChatMessage } from "./openai-types.ts";

const CEREBRAS_ALLOWED_FIELDS = new Set([
	"frequency_penalty",
	"logit_bias",
	"logprobs",
	"max_completion_tokens",
	"messages",
	"model",
	"presence_penalty",
	"seed",
	"stop",
	"stream",
	"temperature",
	"top_logprobs",
	"top_p",
	"user",
]);

const CEREBRAS_UNSUPPORTED_FIELDS = new Set([
	"audio",
	"function_call",
	"functions",
	"metadata",
	"modalities",
	"parallel_tool_calls",
	"prediction",
	"reasoning_effort",
	"response_format",
	"store",
	"tool_choice",
	"tools",
]);

export function normalizeCerebrasRequest(
	openAiChatCompletionRequest: OpenAiChatCompletionRequest,
	proxyConfiguration: ProxyConfiguration,
): OpenAiChatCompletionRequest {
	const normalizedRequest: Writable<OpenAiChatCompletionRequest> = {};

	for (const [field, value] of Object.entries(openAiChatCompletionRequest)) {
		if (field === "max_tokens") {
			if (openAiChatCompletionRequest.max_completion_tokens === undefined && typeof value === "number") {
				normalizedRequest.max_completion_tokens = value;
			}
			continue;
		}

		if (CEREBRAS_ALLOWED_FIELDS.has(field)) {
			normalizedRequest[field] = value;
			continue;
		}

		if (CEREBRAS_UNSUPPORTED_FIELDS.has(field) || proxyConfiguration.cerebrasStrictRequestValidation) {
			handleUnsupportedCerebrasField(field, proxyConfiguration);
		}
	}

	normalizedRequest.model = openAiChatCompletionRequest.model?.trim() || proxyConfiguration.defaultModel;
	normalizedRequest.messages = normalizeCerebrasMessages(openAiChatCompletionRequest.messages);

	const choiceCount = openAiChatCompletionRequest.n;
	if (choiceCount !== undefined && choiceCount !== 1) handleUnsupportedCerebrasField("n", proxyConfiguration);
	return normalizedRequest;
}

function handleUnsupportedCerebrasField(
	field: string,
	{ cerebrasStrictRequestValidation, cerebrasDropUnsupportedFields }: ProxyConfiguration,
): void {
	if (!cerebrasStrictRequestValidation && cerebrasDropUnsupportedFields) return;

	const error = new ProxyError(`Field "${field}" is not supported by the Cerebras adapter configuration.`, {
		param: field,
	});
	Error.captureStackTrace(error, handleUnsupportedCerebrasField);
	throw error;
}

function normalizeCerebrasMessages(messages?: ReadonlyArray<OpenAiChatMessage>): ReadonlyArray<OpenAiChatMessage> {
	if (!Array.isArray(messages) || messages.length === 0) {
		const error = new ProxyError("messages must be a non-empty array.", { param: "messages" });
		Error.captureStackTrace(error, normalizeCerebrasMessages);
		throw error;
	}

	const openAiChatMessages: Array<OpenAiChatMessage> = [];
	let size = 0;

	for (const message of messages) {
		if (
			message.role !== "system" &&
			message.role !== "developer" &&
			message.role !== "user" &&
			message.role !== "assistant"
		) {
			const error = new ProxyError(`Unsupported Cerebras message role "${message.role}".`, {
				param: "messages.role",
			});
			Error.captureStackTrace(error, normalizeCerebrasMessages);
			throw error;
		}

		if (message.tool_calls !== undefined || message.function_call !== undefined) {
			const error = new ProxyError("Tool and function call messages are not supported by this proxy mode.", {
				param: "messages",
			});
			Error.captureStackTrace(error, normalizeCerebrasMessages);
			throw error;
		}

		const openAiChatMessage: Writable<OpenAiChatMessage> = {
			content: normalizeTextContent(message.content),
			role: message.role,
		};
		if (message.name !== undefined) openAiChatMessage.name = message.name;
		openAiChatMessages[size++] = openAiChatMessage;
	}

	return openAiChatMessages;
}

function normalizeTextContent(content: OpenAiChatMessage["content"]): string {
	if (typeof content === "string") return content;

	if (Array.isArray(content)) {
		const stringBuilder: Array<string> = [];
		let size = 0;

		for (const part of content) {
			if (part.type !== "text" || typeof part.text !== "string") {
				const error = new ProxyError("Only text message content parts are supported.", {
					param: "messages.content",
				});
				Error.captureStackTrace(error, normalizeTextContent);
				throw error;
			}

			stringBuilder[size++] = part.text;
		}

		return stringBuilder.join("");
	}

	if (content === undefined) {
		const error = new ProxyError("Message content must be text.", { param: "messages.content" });
		Error.captureStackTrace(error, normalizeTextContent);
		throw error;
	}

	const error = new ProxyError("Unsupported message content shape.", { param: "messages.content" });
	Error.captureStackTrace(error, normalizeTextContent);
	throw error;
}
