import { getFiniteNumber } from "$utilities/default-utilities";
import { getUnixSeconds } from "$utilities/time-utilities";

import { isAnthropicMessagesResponse } from "./anthropic-types";
import { OPENAI_NULL } from "./openai-constants";

import type { ReadonlyRecord } from "$ts-types/utility-types";
import type { Writable } from "type-fest";

import type { AnthropicMessagesResponse, AnthropicStopReason, AnthropicUsage } from "./anthropic-types";
import type { OpenAiChatCompletionResponse, OpenAiFinishReason, OpenAiUsage } from "./openai-types";

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

function getAnthropicResponse(value: AnthropicMessagesResponse | unknown): AnthropicMessagesResponse | undefined {
	return isAnthropicMessagesResponse.allows(value) ? value : undefined;
}

function getAnthropicText(content: ReadonlyArray<ReadonlyRecord<string, unknown>>): string {
	const textParts = new Array<string>();
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
