import { ProxyError } from "./errors";
import { OPENAI_NULL } from "./openai-constants";

import type { OpenAiChatCompletionRequest, OpenAiChatMessage } from "./openai-types";

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

export function validateAnthropicRequest(openAiChatCompletionRequest: OpenAiChatCompletionRequest): void {
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

export function validateMessageForAnthropic(openAiChatMessage: OpenAiChatMessage): void {
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

export function getTextContent(content: OpenAiChatMessage["content"], parameter: string): string {
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
