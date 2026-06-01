import { translateAnthropicSseText } from "../../src/proxy/sse.ts";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function assertEquals<Value>(actual: Value, expected: Value, message: string): void {
	if (actual !== expected) {
		throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
	}
}

function parseChunks(output: string): Array<Record<string, unknown>> {
	return output
		.split("\n\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("data:") && !line.includes("[DONE]"))
		.map((line) => JSON.parse(line.slice("data:".length).trim()) as Record<string, unknown>);
}

Deno.test("all chunks in one Anthropic stream share a single id, created, and model", () => {
	const input = [
		'data: {"type":"message_start","message":{"id":"msg_abc123","model":"minimax-m3"}}',
		"",
		'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
		"",
		'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
		"",
		'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":5,"output_tokens":2}}',
		"",
	].join("\n");

	const output = translateAnthropicSseText(input, "minimax-m3");
	const chunks = parseChunks(output);

	assert(chunks.length >= 3, `Expected at least 3 chunks, got ${chunks.length}`);

	const chunkIds = chunks.map((chunk) => chunk["id"]);
	const chunkCreated = chunks.map((chunk) => chunk["created"]);
	const chunkModels = chunks.map((chunk) => chunk["model"]);

	assertEquals(new Set(chunkIds).size, 1, `All chunks must share one id; got: ${JSON.stringify(chunkIds)}`);
	assertEquals(
		new Set(chunkCreated).size,
		1,
		`All chunks must share one created; got: ${JSON.stringify(chunkCreated)}`,
	);
	assertEquals(new Set(chunkModels).size, 1, `All chunks must share one model; got: ${JSON.stringify(chunkModels)}`);
});

Deno.test("stream id is taken from message_start, not generated per-chunk", () => {
	const input = [
		'data: {"type":"message_start","message":{"id":"msg_xyz","model":"test-model"}}',
		"",
		'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
		"",
		'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":1}}',
		"",
	].join("\n");

	const output = translateAnthropicSseText(input, "fallback-model");
	const chunks = parseChunks(output);

	for (const chunk of chunks) {
		assertEquals(chunk["id"], "msg_xyz", "All chunks must use the id from message_start");
		assertEquals(chunk["model"], "test-model", "All chunks must use the model from message_start");
	}
});

Deno.test("falls back to generated UUID and configured model when message_start is absent", () => {
	const input = [
		'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
		"",
		'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":1}}',
		"",
	].join("\n");

	const output = translateAnthropicSseText(input, "my-model");
	const chunks = parseChunks(output);

	assert(chunks.length >= 2, "Expected at least 2 chunks");

	const ids = chunks.map((chunk) => chunk["id"] as string);
	const models = chunks.map((chunk) => chunk["model"]);

	assertEquals(new Set(ids).size, 1, "All chunks must share one id even without message_start");
	assert(ids[0]?.startsWith("chatcmpl-") === true, "Fallback id should be chatcmpl-<uuid>");
	assertEquals(new Set(models).size, 1, "All chunks must share one model");
	assertEquals(models[0], "my-model", "Model should fall back to configured model");
});
