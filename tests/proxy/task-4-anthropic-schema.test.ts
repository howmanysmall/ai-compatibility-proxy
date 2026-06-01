import { translateAnthropicToOpenAI } from "../../src/proxy/anthropic-translator.ts";

declare const Deno: {
	test(name: string, fn: () => void | Promise<void>): void;
};

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

Deno.test("translates a valid Anthropic message response", () => {
	const openAIResponse = translateAnthropicToOpenAI(
		{
			content: [
				{ text: "Hello ", type: "text" },
				{ text: "hidden", type: "thinking" },
				{ text: "there.", type: "text" },
			],
			id: "msg_123",
			model: "minimax-m3",
			role: "assistant",
			stop_reason: "max_tokens",
			type: "message",
			usage: {
				cache_creation_input_tokens: 2,
				cache_read_input_tokens: 3,
				input_tokens: 10,
				output_tokens: 7,
			},
		},
		"fallback-model",
	);

	assert(openAIResponse.id === "msg_123", "Expected upstream id.");
	assert(openAIResponse.model === "minimax-m3", "Expected upstream model.");
	assert(openAIResponse.choices[0]?.message.content === "Hello there.", "Expected concatenated text blocks.");
	assert(openAIResponse.choices[0]?.finish_reason === "length", "Expected max_tokens to map to length.");
	assert(openAIResponse.usage?.prompt_tokens === 15, "Expected cache tokens to count toward prompt tokens.");
	assert(openAIResponse.usage?.completion_tokens === 7, "Expected output token mapping.");
	assert(openAIResponse.usage?.total_tokens === 22, "Expected total token mapping.");
});

Deno.test("falls through to the fallback for Anthropic error responses", () => {
	const openAIResponse = translateAnthropicToOpenAI(
		{ error: { message: "bad request", type: "error" }, type: "error" },
		"fallback-model",
	);

	assert(openAIResponse.model === "fallback-model", "Expected request model fallback.");
	assert(openAIResponse.choices[0]?.message.content === "", "Expected empty assistant content.");
	assert(openAIResponse.choices[0]?.finish_reason === null, "Expected no finish reason.");
	assert(openAIResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.");
});

Deno.test("falls through to the fallback for empty Anthropic payloads", () => {
	const openAIResponse = translateAnthropicToOpenAI({}, "fallback-model");

	assert(openAIResponse.model === "fallback-model", "Expected request model fallback.");
	assert(openAIResponse.choices[0]?.message.content === "", "Expected empty assistant content.");
	assert(openAIResponse.choices[0]?.finish_reason === null, "Expected no finish reason.");
	assert(openAIResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.");
});
