import { translateAnthropicToOpenAi } from "@proxy/anthropic-translator";

test("translates a valid Anthropic message response", () => {
	const openAiResponse = translateAnthropicToOpenAi(
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

	expect(openAiResponse.id === "msg_123", "Expected upstream id.").toBe(true);
	expect(openAiResponse.model === "minimax-m3", "Expected upstream model.").toBe(true);
	expect(openAiResponse.choices[0]?.message.content === "Hello there.", "Expected concatenated text blocks.").toBe(
		true,
	);
	expect(openAiResponse.choices[0]?.finish_reason === "length", "Expected max_tokens to map to length.").toBe(true);
	expect(openAiResponse.usage?.prompt_tokens === 15, "Expected cache tokens to count toward prompt tokens.").toBe(
		true,
	);
	expect(openAiResponse.usage?.completion_tokens === 7, "Expected output token mapping.").toBe(true);
	expect(openAiResponse.usage?.total_tokens === 22, "Expected total token mapping.").toBe(true);
});

test("falls through to the fallback for Anthropic message responses missing type", () => {
	const openAiResponse = translateAnthropicToOpenAi(
		{
			content: [{ text: "Hello", type: "text" }],
			id: "msg_missing_type",
			model: "minimax-m3",
			role: "assistant",
		},
		"fallback-model",
	);

	expect(openAiResponse.model === "fallback-model", "Expected request model fallback.").toBe(true);
	expect(openAiResponse.choices[0]?.message.content === "", "Expected empty assistant content.").toBe(true);
	expect(openAiResponse.choices[0]?.finish_reason === null, "Expected no finish reason.").toBe(true);
	expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
});

test("falls through to the fallback for Anthropic message responses with wrong type", () => {
	const openAiResponse = translateAnthropicToOpenAi(
		{
			content: [{ text: "Hello", type: "text" }],
			id: "msg_wrong_type",
			model: "minimax-m3",
			role: "assistant",
			type: "error",
		},
		"fallback-model",
	);

	expect(openAiResponse.model === "fallback-model", "Expected request model fallback.").toBe(true);
	expect(openAiResponse.choices[0]?.message.content === "", "Expected empty assistant content.").toBe(true);
	expect(openAiResponse.choices[0]?.finish_reason === null, "Expected no finish reason.").toBe(true);
	expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
});

test("falls through to the fallback for Anthropic error responses", () => {
	const openAiResponse = translateAnthropicToOpenAi(
		{ error: { message: "bad request", type: "error" }, type: "error" },
		"fallback-model",
	);

	expect(openAiResponse.model === "fallback-model", "Expected request model fallback.").toBe(true);
	expect(openAiResponse.choices[0]?.message.content === "", "Expected empty assistant content.").toBe(true);
	expect(openAiResponse.choices[0]?.finish_reason === null, "Expected no finish reason.").toBe(true);
	expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
});

test("falls through to the fallback for empty Anthropic payloads", () => {
	const openAiResponse = translateAnthropicToOpenAi({}, "fallback-model");

	expect(openAiResponse.model === "fallback-model", "Expected request model fallback.").toBe(true);
	expect(openAiResponse.choices[0]?.message.content === "", "Expected empty assistant content.").toBe(true);
	expect(openAiResponse.choices[0]?.finish_reason === null, "Expected no finish reason.").toBe(true);
	expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
});
