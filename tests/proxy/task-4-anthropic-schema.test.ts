import { expect, test } from "vitest";
import { translateAnthropicToOpenAi } from "@proxy/anthropic-translator";
import {
	isAnthropicMessage,
	isAnthropicMessagesRequest,
	isAnthropicMessagesResponse,
	isAnthropicMessageRole,
	isAnthropicStopReason,
	isAnthropicTextBlock,
	isAnthropicUsage,
} from "@proxy/anthropic-types";

test("translates a valid Anthropic message response", () => {
	expect.hasAssertions();
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
	expect.hasAssertions();
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
	expect.hasAssertions();
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
	expect.hasAssertions();
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
	expect.hasAssertions();
	const openAiResponse = translateAnthropicToOpenAi({}, "fallback-model");

	expect(openAiResponse.model === "fallback-model", "Expected request model fallback.").toBe(true);
	expect(openAiResponse.choices[0]?.message.content === "", "Expected empty assistant content.").toBe(true);
	expect(openAiResponse.choices[0]?.finish_reason === null, "Expected no finish reason.").toBe(true);
	expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
});

test("Anthropic schemas accept valid Messages wire-format payloads", () => {
	expect.hasAssertions();
	const textBlock = { text: "Hello", type: "text" };
	const message = { content: [textBlock], role: "user" };
	const usage = {
		cache_creation_input_tokens: 2,
		cache_read_input_tokens: 3,
		input_tokens: 5,
		output_tokens: 7,
		vendor_extension: "allowed",
	};

	expect(isAnthropicMessageRole.allows("assistant"), "Expected assistant role.").toBe(true);
	expect(isAnthropicStopReason.allows("pause_turn"), "Expected known stop reason.").toBe(true);
	expect(isAnthropicStopReason.allows("provider_specific_reason"), "Expected provider stop reason passthrough.").toBe(
		true,
	);
	expect(isAnthropicTextBlock.allows(textBlock), "Expected text block.").toBe(true);
	expect(isAnthropicMessage.allows(message), "Expected Anthropic message.").toBe(true);
	expect(
		isAnthropicMessagesRequest.allows({
			max_tokens: 128,
			messages: [message],
			model: "claude-test",
			stop_sequences: ["END"],
			stream: true,
			system: "be precise",
			temperature: 0.2,
			top_p: 0.9,
		}),
		"Expected Anthropic request.",
	).toBe(true);
	expect(isAnthropicUsage.allows(usage), "Expected Anthropic usage with extension fields.").toBe(true);
	expect(
		isAnthropicMessagesResponse.allows({
			content: [textBlock],
			id: "msg_123",
			model: "claude-test",
			role: "assistant",
			stop_reason: null,
			stop_sequence: null,
			type: "message",
			usage,
			vendor_extension: "allowed",
		}),
		"Expected Anthropic response.",
	).toBe(true);
});

test("Anthropic schemas reject invalid and unknown request fields", () => {
	expect.hasAssertions();

	expect(isAnthropicMessageRole.allows("system"), "Expected unsupported role rejection.").toBe(false);
	expect(
		isAnthropicTextBlock.allows({ extra: true, text: "Hello", type: "text" }),
		"Expected strict text block.",
	).toBe(false);
	expect(
		isAnthropicMessage.allows({ content: [{ text: "Hello", type: "text" }], extra: true, role: "user" }),
		"Expected strict message object.",
	).toBe(false);
	expect(
		isAnthropicMessagesRequest.allows({
			extra: true,
			max_tokens: 128,
			messages: [{ content: "Hello", role: "user" }],
			model: "claude-test",
		}),
		"Expected request unknown field rejection.",
	).toBe(false);
	expect(
		isAnthropicMessagesRequest.allows({
			max_tokens: 1.5,
			messages: [{ content: "Hello", role: "user" }],
			model: "claude-test",
		}),
		"Expected integer max_tokens.",
	).toBe(false);
	expect(
		isAnthropicUsage.allows({ input_tokens: 1.5, output_tokens: 2 }),
		"Expected integer usage token counts.",
	).toBe(false);
	expect(
		isAnthropicMessagesResponse.allows({
			content: [{ text: "Hello", type: "text" }],
			role: "user",
			type: "message",
		}),
		"Expected assistant response role.",
	).toBe(false);
});
