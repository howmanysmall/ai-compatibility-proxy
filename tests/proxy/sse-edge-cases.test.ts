import { expect, describe, it } from "vitest";
import { textEncoder } from "$constants/constant-classes";
import { createOpenAiStreamResponseAsync, translateAnthropicSseText } from "$proxy/sse";
import { type } from "arktype";

const CHAT_COMPLETION_ID_PATTERN = /^chatcmpl-/u;

const isRecord = type("Record<string, unknown>");

function parseOpenAiChunks(text: string): ReadonlyArray<Record<string, unknown>> {
	return text
		.split("\n\n")
		.filter((event) => event.startsWith("data: ") && event !== "data: [DONE]")
		.map((event) => isRecord.assert(JSON.parse(event.slice(6))));
}

describe("sSE edge cases", () => {
	it("createOpenAIStreamResponseAsync emits done for empty upstream bodies", async () => {
		expect.assertions(5);
		const response = await createOpenAiStreamResponseAsync(new Response(null), "fallback-model");

		expect(response.headers.get("content-type"), "Expected SSE content type.").toBe(
			"text/event-stream; charset=utf-8",
		);
		expect(response.headers.get("cache-control"), "Expected proxy-safe SSE cache policy.").toBe(
			"no-cache, no-transform",
		);
		expect(response.headers.get("connection"), "Expected streaming connection header.").toBe("keep-alive");
		expect(response.headers.get("x-accel-buffering"), "Expected reverse-proxy buffering to be disabled.").toBe(
			"no",
		);
		await expect(response.text()).resolves.toBe("data: [DONE]\n\n");
	});

	it("createOpenAIStreamResponseAsync flushes buffered partial SSE events", async () => {
		expect.assertions(2);
		const upstream = new Response(
			new ReadableStream<Uint8Array>({
				start(controller): void {
					controller.enqueue(
						textEncoder.encode('data: {"type":"content_block_delta","delta":{"text":"hello"}}'),
					);
					controller.close();
				},
			}),
		);

		const response = await createOpenAiStreamResponseAsync(upstream, "fallback-model");
		const text = await response.text();

		expect(text).toContain('"content":"hello"');
		expect(text.endsWith("data: [DONE]\n\n"), "Expected stream done sentinel.").toBe(true);
	});

	it("translateAnthropicSseText ignores malformed and non-object SSE data", () => {
		expect.assertions(1);
		const translated = translateAnthropicSseText(
			[
				"event: ping",
				"",
				"data: not-json",
				"",
				"data: 1",
				"",
				'data: {"type":"ping"}',
				"",
				"data: [DONE]",
				"",
			].join("\n"),
			"fallback-model",
		);

		expect(translated, "Expected malformed SSE data to be ignored.").toBe("");
	});

	it("translateAnthropicSseText preserves multi-line JSON data and trims SSE data prefixes", () => {
		expect.assertions(3);
		const translated = translateAnthropicSseText(
			[
				'data: {"type":"content_block_delta",',
				'data: "delta":{"text":"hello"}}',
				"",
				'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}',
				"",
			].join("\n"),
			"fallback-model",
		);
		const chunks = parseOpenAiChunks(translated);

		expect(chunks, "Expected content and final chunks.").toHaveLength(2);
		expect(chunks[0]).toMatchObject({
			choices: [{ delta: { content: "hello" }, finish_reason: null, index: 0 }],
			model: "fallback-model",
			object: "chat.completion.chunk",
		});
		expect(chunks[1]).toMatchObject({
			choices: [{ delta: {}, finish_reason: "length", index: 0 }],
			model: "fallback-model",
			object: "chat.completion.chunk",
		});
	});

	it("translateAnthropicSseText handles message_start fallbacks and non-text blocks", () => {
		expect.assertions(4);
		const translated = translateAnthropicSseText(
			[
				'data: {"type":"message_start"}',
				"",
				'data: {"type":"content_block_start","content_block":{"type":"image","text":"ignored"}}',
				"",
				'data: {"type":"content_block_start","content_block":{"type":"text","text":""}}',
				"",
				'data: {"type":"content_block_delta","delta":{"text":""}}',
				"",
				'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":2}}',
				"",
			].join("\n"),
			"fallback-model",
		);

		expect(translated).toContain('"model":"fallback-model"');
		expect(translated).toContain('"role":"assistant"');
		expect(translated).toContain('"finish_reason":"stop"');
		expect(translated).toContain('"usage"');
	});

	it("translateAnthropicSseText emits content_block_start text before any message_start", () => {
		expect.assertions(3);
		const translated = translateAnthropicSseText(
			['data: {"type":"content_block_start","content_block":{"type":"text","text":"preface"}}', ""].join("\n"),
			"fallback-model",
		);
		const chunks = parseOpenAiChunks(translated);

		expect(chunks, "Expected text block to become an OpenAI content chunk.").toHaveLength(1);
		expect(chunks[0]?.id, "Expected fallback stream id to be generated.").toStrictEqual(
			expect.stringMatching(CHAT_COMPLETION_ID_PATTERN),
		);
		expect(chunks[0]).toMatchObject({
			choices: [{ delta: { content: "preface" }, finish_reason: null, index: 0 }],
			model: "fallback-model",
			object: "chat.completion.chunk",
		});
	});

	it("translateAnthropicSseText omits usage when Anthropic message_delta usage is absent", () => {
		expect.assertions(3);
		const translated = translateAnthropicSseText(
			[
				'data: {"type":"message_start","message":{"id":"msg_123","model":"claude-test"}}',
				"",
				'data: {"type":"message_delta","delta":{}}',
				"",
			].join("\n"),
			"fallback-model",
		);
		const chunks = parseOpenAiChunks(translated);

		expect(chunks, "Expected role and final chunks.").toHaveLength(2);
		expect(chunks[1]).toMatchObject({
			choices: [{ delta: {}, finish_reason: null, index: 0 }],
			id: "msg_123",
			model: "claude-test",
			object: "chat.completion.chunk",
		});
		expect(chunks[1], "Expected no usage field when Anthropic omitted usage.").not.toHaveProperty("usage");
	});
});
