import { expect, test } from "vitest";

import {
	mapAnthropicFinishReason,
	mapAnthropicUsage,
	translateAnthropicToOpenAi,
	translateOpenAiToAnthropic,
} from "@proxy/anthropic-translator";
import { ProxyError } from "@proxy/errors";

import type { OpenAiChatCompletionRequest } from "@proxy/openai-types";

function captureProxyError(callback: () => unknown): ProxyError {
	try {
		callback();
	} catch (error) {
		if (error instanceof ProxyError) return error;
		throw error;
	}

	throw new Error("Expected ProxyError.");
}

function expectProxyError(callback: () => unknown, param: string): void {
	const error = captureProxyError(callback);

	expect(error.param, "Expected ProxyError param.").toBe(param);
}

test("translateOpenAiToAnthropic rejects weird unsupported request fields", () => {
	expect.hasAssertions();
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
	expect.hasAssertions();
	expectProxyError(
		// oxlint-disable-next-line id-length -- `n` is the OpenAI wire-field name.
		() => translateOpenAiToAnthropic({ messages: [{ content: "hello", role: "user" }], n: 2 }, "fallback", 10),
		"n",
	);
	expectProxyError(
		() => translateOpenAiToAnthropic({ messages: [{ content: "system only", role: "system" }] }, "fallback", 10),
		"messages",
	);
	expectProxyError(() => translateOpenAiToAnthropic({} as OpenAiChatCompletionRequest, "fallback", 10), "messages");
	expectProxyError(
		() => translateOpenAiToAnthropic({ messages: [{ content: null, role: "user" }] }, "fallback", 10),
		"messages.user.content",
	);
	expectProxyError(
		() => translateOpenAiToAnthropic({ messages: [{ role: "user" }] }, "fallback", 10),
		"messages.user.content",
	);
	expectProxyError(
		() =>
			translateOpenAiToAnthropic(
				{ messages: [{ content: "hello", role: "user" }], stop: [1] as unknown as ReadonlyArray<string> },
				"fallback",
				10,
			),
		"stop",
	);
	expectProxyError(
		() =>
			translateOpenAiToAnthropic(
				{ messages: [{ content: { text: "bad object" } as unknown as string, role: "user" }] },
				"fallback",
				10,
			),
		"messages.user.content",
	);
});

test("translateOpenAiToAnthropic rejects tool/function message shapes", () => {
	expect.hasAssertions();
	const cases = [
		{ param: "messages.role", request: { messages: [{ content: "tool", role: "tool" }] } },
		{ param: "messages.role", request: { messages: [{ content: "function", role: "function" }] } },
		{
			param: "messages.role",
			request: { messages: [{ content: "unknown", role: "alien" as "user" }] },
		},
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
	expect.hasAssertions();
	expectProxyError(
		() =>
			translateOpenAiToAnthropic(
				{ max_tokens: 0, messages: [{ content: "hello", role: "user" }] },
				"fallback",
				10,
			),
		"max_tokens",
	);
	expectProxyError(
		() =>
			translateOpenAiToAnthropic(
				{
					max_completion_tokens: 0,
					max_tokens: 128,
					messages: [{ content: "hello", role: "user" }],
				},
				"fallback",
				10,
			),
		"max_tokens",
	);
	expectProxyError(
		() => translateOpenAiToAnthropic({ messages: [{ content: "hello", role: "user" }], model: "   " }, "", 10),
		"model",
	);
});

test("translateOpenAiToAnthropic supports text content arrays and string stop", () => {
	expect.hasAssertions();
	const translated = translateOpenAiToAnthropic(
		{
			messages: [
				{ content: "", role: "system" },
				{ content: "system instruction", role: "system" },
				{ content: "developer instruction", role: "developer" },
				{
					content: [
						{ text: "hello ", type: "text" },
						{ text: "world", type: "text" },
					],
					role: "user",
				},
			],
			stop: ["END", "STOP"],
			stream: false,
			temperature: 0,
			top_p: 1,
		},
		"fallback",
		10,
	);

	expect(translated.messages[0]?.content, "Expected text content parts to concatenate.").toBe("hello world");
	expect(translated.stop_sequences, "Expected string array stop to pass through.").toEqual(["END", "STOP"]);
	expect(translated.system, "Expected system and developer messages to merge without empty system content.").toBe(
		"system instruction\n\ndeveloper instruction",
	);
	expect(translated.stream, "Expected explicit false stream value to be preserved.").toBe(false);
	expect(translated.temperature, "Expected zero temperature to be preserved.").toBe(0);
	expect(translated.top_p, "Expected top_p to be preserved.").toBe(1);

	const stringStopRequest = translateOpenAiToAnthropic(
		{
			messages: [{ content: "hello", role: "user" }],
			stop: "END",
		},
		"fallback",
		10,
	);

	expect(stringStopRequest.stop_sequences, "Expected string stop to normalize to Anthropic array.").toEqual(["END"]);
});

test("translateAnthropicToOpenAi ignores non-text blocks and maps fallback response fields", () => {
	expect.hasAssertions();
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
	expect.hasAssertions();
	expect(mapAnthropicFinishReason(undefined), "Expected undefined finish to become null.").toBeNull();
	expect(mapAnthropicFinishReason(null), "Expected null finish to stay null.").toBeNull();
	expect(mapAnthropicFinishReason("refusal"), "Expected refusal finish mapping.").toBe("content_filter");
	expect(mapAnthropicFinishReason("max_tokens"), "Expected max_tokens finish mapping.").toBe("length");
	expect(mapAnthropicFinishReason("end_turn"), "Expected default finish mapping.").toBe("stop");
	expect(mapAnthropicUsage(undefined), "Expected missing usage to stay undefined.").toBeUndefined();
	expect(
		mapAnthropicUsage({
			cache_creation_input_tokens: Number.NaN,
			cache_read_input_tokens: Number.POSITIVE_INFINITY,
			input_tokens: -3,
			output_tokens: Number.NEGATIVE_INFINITY,
		}),
		"Expected non-finite Anthropic token values to be normalized safely.",
	).toEqual({
		completion_tokens: 0,
		prompt_tokens: -3,
		total_tokens: -3,
	});
});
