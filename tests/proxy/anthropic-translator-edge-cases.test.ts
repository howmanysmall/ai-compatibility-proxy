import {
	mapAnthropicFinishReason,
	mapAnthropicUsage,
	translateAnthropicToOpenAi,
	translateOpenAiToAnthropic,
} from "@proxy/anthropic-translator";
import { ProxyError } from "@proxy/errors";

import type { OpenAiChatCompletionRequest } from "@proxy/openai-types";

function expectProxyError(callback: () => unknown, param: string): void {
	try {
		callback();
		throw new Error("Expected ProxyError.");
	} catch (error) {
		expect(error instanceof ProxyError, "Expected ProxyError instance.").toBe(true);
		if (!(error instanceof ProxyError)) return;
		expect(error.param, "Expected ProxyError param.").toBe(param);
	}
}

test("translateOpenAiToAnthropic rejects weird unsupported request fields", () => {
	for (const field of ["tools", "response_format", "parallel_tool_calls"]) {
		expectProxyError(
			() =>
				translateOpenAiToAnthropic(
					{
						[field]: [],
						messages: [{ content: "hello", role: "user" }],
						model: "model",
					},
					"fallback",
					10,
				),
			field,
		);
	}
});

test("translateOpenAiToAnthropic rejects invalid choice counts and missing user content", () => {
	expectProxyError(
		() => translateOpenAiToAnthropic({ messages: [{ content: "hello", role: "user" }], n: 2 }, "fallback", 10),
		"n",
	);
	expectProxyError(
		() => translateOpenAiToAnthropic({ messages: [{ content: "system only", role: "system" }] }, "fallback", 10),
		"messages",
	);
	expectProxyError(
		() => translateOpenAiToAnthropic({ messages: [{ content: null, role: "user" }] }, "fallback", 10),
		"messages.user.content",
	);
});

test("translateOpenAiToAnthropic rejects tool/function message shapes", () => {
	const cases = [
		{ param: "messages.role", request: { messages: [{ content: "tool", role: "tool" }] } },
		{ param: "messages.role", request: { messages: [{ content: "function", role: "function" }] } },
		{
			param: "messages.tool_calls",
			request: { messages: [{ content: "assistant", role: "assistant", tool_calls: [] }] },
		},
		{
			param: "messages.function_call",
			request: { messages: [{ content: "assistant", function_call: {}, role: "assistant" }] },
		},
	] satisfies ReadonlyArray<{
		readonly param: string;
		readonly request: OpenAiChatCompletionRequest;
	}>;

	for (const { param, request } of cases) {
		expectProxyError(() => translateOpenAiToAnthropic(request, "fallback", 10), param);
	}
});

test("translateOpenAiToAnthropic validates token edge cases", () => {
	expectProxyError(
		() =>
			translateOpenAiToAnthropic(
				{ max_tokens: 0, messages: [{ content: "hello", role: "user" }] },
				"fallback",
				10,
			),
		"max_tokens",
	);
});

test("translateOpenAiToAnthropic supports text content arrays and string stop", () => {
	const translated = translateOpenAiToAnthropic(
		{
			messages: [
				{
					content: [
						{ text: "hello ", type: "text" },
						{ text: "world", type: "text" },
					],
					role: "user",
				},
			],
			stop: "END",
		},
		"fallback",
		10,
	);

	expect(translated.messages[0]?.content, "Expected text content parts to concatenate.").toBe("hello world");
	expect(translated.stop_sequences, "Expected string stop to normalize to Anthropic array.").toEqual(["END"]);
});

test("translateAnthropicToOpenAi ignores non-text blocks and maps fallback response fields", () => {
	const response = translateAnthropicToOpenAi(
		{
			content: [
				{ text: "hello", type: "text" },
				{ source: "ignored", type: "image" },
				{ text: " world", type: "text" },
			],
			id: "msg_1",
			model: "upstream-model",
			role: "assistant",
			stop_reason: "tool_use",
			type: "message",
			usage: {
				cache_creation_input_tokens: 2,
				cache_read_input_tokens: 3,
				input_tokens: 5,
				output_tokens: 7,
			},
		},
		"fallback-model",
	);

	expect(response.choices[0]?.message.content, "Expected only text blocks to be concatenated.").toBe("hello world");
	expect(response.choices[0]?.finish_reason, "Expected tool_use finish mapping.").toBe("tool_calls");
	expect(response.usage?.prompt_tokens, "Expected cache tokens to be included.").toBe(10);
	expect(response.usage?.total_tokens, "Expected total token mapping.").toBe(17);
});

test("Anthropic finish and usage mappers cover nullish and refusal edges", () => {
	expect(mapAnthropicFinishReason(undefined), "Expected undefined finish to become null.").toBeNull();
	expect(mapAnthropicFinishReason(null), "Expected null finish to stay null.").toBeNull();
	expect(mapAnthropicFinishReason("refusal"), "Expected refusal finish mapping.").toBe("content_filter");
	expect(mapAnthropicUsage(undefined), "Expected missing usage to stay undefined.").toBeUndefined();
});
