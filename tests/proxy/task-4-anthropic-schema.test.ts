import { expect, describe, it } from "vitest";
import { translateAnthropicToOpenAi } from "$proxy/anthropic-translator";
import {
	isAnthropicMessage,
	isAnthropicMessagesRequest,
	isAnthropicMessagesResponse,
	isAnthropicMessageRole,
	isAnthropicStopReason,
	isAnthropicTextBlock,
	isAnthropicUsage,
} from "$proxy/anthropic-types";

describe("anthropic Schema", () => {
	it("translates a valid Anthropic message response", () => {
		expect.assertions(7);
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

		expect(openAiResponse.id, "Expected upstream id.").toBe("msg_123");
		expect(openAiResponse.model, "Expected upstream model.").toBe("minimax-m3");
		expect(openAiResponse.choices[0]?.message.content, "Expected concatenated text blocks.").toBe("Hello there.");
		expect(openAiResponse.choices[0]?.finish_reason, "Expected max_tokens to map to length.").toBe("length");
		expect(openAiResponse.usage?.prompt_tokens, "Expected cache tokens to count toward prompt tokens.").toBe(15);
		expect(openAiResponse.usage?.completion_tokens, "Expected output token mapping.").toBe(7);
		expect(openAiResponse.usage?.total_tokens, "Expected total token mapping.").toBe(22);
	});

	it("falls through to the fallback for Anthropic message responses missing type", () => {
		expect.assertions(4);
		const openAiResponse = translateAnthropicToOpenAi(
			{
				content: [{ text: "Hello", type: "text" }],
				id: "msg_missing_type",
				model: "minimax-m3",
				role: "assistant",
			},
			"fallback-model",
		);

		expect(openAiResponse.model, "Expected request model fallback.").toBe("fallback-model");
		expect(openAiResponse.choices[0]?.message.content, "Expected empty assistant content.").toBe("");
		expect(openAiResponse.choices[0]?.finish_reason, "Expected no finish reason.").toBeNull();
		expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
	});

	it("falls through to the fallback for Anthropic message responses with wrong type", () => {
		expect.assertions(4);
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

		expect(openAiResponse.model, "Expected request model fallback.").toBe("fallback-model");
		expect(openAiResponse.choices[0]?.message.content, "Expected empty assistant content.").toBe("");
		expect(openAiResponse.choices[0]?.finish_reason, "Expected no finish reason.").toBeNull();
		expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
	});

	it("falls through to the fallback for Anthropic error responses", () => {
		expect.assertions(4);
		const openAiResponse = translateAnthropicToOpenAi(
			{ error: { message: "bad request", type: "error" }, type: "error" },
			"fallback-model",
		);

		expect(openAiResponse.model, "Expected request model fallback.").toBe("fallback-model");
		expect(openAiResponse.choices[0]?.message.content, "Expected empty assistant content.").toBe("");
		expect(openAiResponse.choices[0]?.finish_reason, "Expected no finish reason.").toBeNull();
		expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
	});

	it("falls through to the fallback for empty Anthropic payloads", () => {
		expect.assertions(4);
		const openAiResponse = translateAnthropicToOpenAi({}, "fallback-model");

		expect(openAiResponse.model, "Expected request model fallback.").toBe("fallback-model");
		expect(openAiResponse.choices[0]?.message.content, "Expected empty assistant content.").toBe("");
		expect(openAiResponse.choices[0]?.finish_reason, "Expected no finish reason.").toBeNull();
		expect(openAiResponse.id.startsWith("chatcmpl-"), "Expected generated id fallback.").toBe(true);
	});

	it("anthropic schemas accept valid Messages wire-format payloads", () => {
		expect.assertions(8);
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
		expect(
			isAnthropicStopReason.allows("provider_specific_reason"),
			"Expected provider stop reason passthrough.",
		).toBe(true);
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

	it("anthropic schemas reject invalid and unknown request fields", () => {
		expect.assertions(7);

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
});
