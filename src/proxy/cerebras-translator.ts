import { ProxyError } from "./errors.ts";

import type { ProxyConfig } from "./config.ts";
import type { OpenAIChatCompletionRequest, OpenAIChatMessage } from "./openai-types.ts";

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
	request: OpenAIChatCompletionRequest,
	config: ProxyConfig,
): OpenAIChatCompletionRequest {
	const normalizedRequest: OpenAIChatCompletionRequest = {};

	for (const [field, value] of Object.entries(request)) {
		if (field === "max_tokens") {
			if (request.max_completion_tokens === undefined && typeof value === "number") {
				normalizedRequest.max_completion_tokens = value;
			}
			continue;
		}

		if (CEREBRAS_ALLOWED_FIELDS.has(field)) {
			normalizedRequest[field] = value;
			continue;
		}

		if (CEREBRAS_UNSUPPORTED_FIELDS.has(field) || config.cerebrasStrictRequestValidation) {
			handleUnsupportedCerebrasField(field, config);
		}
	}

	normalizedRequest.model = request.model?.trim() || config.defaultModel;
	normalizedRequest.messages = normalizeCerebrasMessages(request.messages);

	const choiceCount = request["n"];
	if (choiceCount !== undefined && choiceCount !== 1) {
		handleUnsupportedCerebrasField("n", config);
	}

	return normalizedRequest;
}

function handleUnsupportedCerebrasField(field: string, config: ProxyConfig): void {
	if (!config.cerebrasStrictRequestValidation && config.cerebrasDropUnsupportedFields) return;

	throw new ProxyError(`Field "${field}" is not supported by the Cerebras adapter configuration.`, {
		param: field,
	});
}

function normalizeCerebrasMessages(
	messages: OpenAIChatCompletionRequest["messages"],
): ReadonlyArray<OpenAIChatMessage> {
	if (!Array.isArray(messages) || messages.length === 0) {
		throw new ProxyError("messages must be a non-empty array.", { param: "messages" });
	}

	return messages.map((message) => {
		if (
			message.role !== "system" &&
			message.role !== "developer" &&
			message.role !== "user" &&
			message.role !== "assistant"
		) {
			throw new ProxyError(`Unsupported Cerebras message role "${message.role}".`, { param: "messages.role" });
		}

		if (message.tool_calls !== undefined || message.function_call !== undefined) {
			throw new ProxyError("Tool and function call messages are not supported by this proxy mode.", {
				param: "messages",
			});
		}

		return {
			content: normalizeTextContent(message.content),
			role: message.role,
			...(message.name ? { name: message.name } : {}),
		};
	});
}

function normalizeTextContent(content: OpenAIChatMessage["content"]): string {
	if (typeof content === "string") return content;

	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (part.type !== "text" || typeof part.text !== "string") {
					throw new ProxyError("Only text message content parts are supported.", {
						param: "messages.content",
					});
				}

				return part.text;
			})
			.join("");
	}

	if (content === undefined) {
		throw new ProxyError("Message content must be text.", { param: "messages.content" });
	}

	throw new ProxyError("Unsupported message content shape.", { param: "messages.content" });
}
