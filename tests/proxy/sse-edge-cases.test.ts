import { createOpenAIStreamResponseAsync, translateAnthropicSseText } from "@proxy/sse";

async function readResponseTextAsync(response: Response): Promise<string> {
	return await response.text();
}

test("createOpenAIStreamResponseAsync emits done for empty upstream bodies", async () => {
	const response = await createOpenAIStreamResponseAsync(new Response(null), "fallback-model");

	expect(response.headers.get("content-type"), "Expected SSE content type.").toBe("text/event-stream; charset=utf-8");
	expect(await readResponseTextAsync(response), "Expected empty stream done event.").toBe("data: [DONE]\n\n");
});

test("createOpenAIStreamResponseAsync flushes buffered partial SSE events", async () => {
	const upstream = new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"hello"}}'),
				);
				controller.close();
			},
		}),
	);

	const response = await createOpenAIStreamResponseAsync(upstream, "fallback-model");
	const text = await readResponseTextAsync(response);

	expect(text).toContain('"content":"hello"');
	expect(text.endsWith("data: [DONE]\n\n"), "Expected stream done sentinel.").toBe(true);
});

test("translateAnthropicSseText ignores malformed and non-object SSE data", () => {
	const translated = translateAnthropicSseText(
		["event: ping", "data: not-json", "", "data: 1", "", "data: [DONE]", ""].join("\n"),
		"fallback-model",
	);

	expect(translated, "Expected malformed SSE data to be ignored.").toBe("");
});

test("translateAnthropicSseText handles message_start fallbacks and non-text blocks", () => {
	const translated = translateAnthropicSseText(
		[
			'data: {"type":"message_start","message":{}}',
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
