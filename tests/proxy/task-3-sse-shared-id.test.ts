import { expect, test } from "vitest";

import { translateAnthropicSseText } from "@proxy/sse";
import { Predicate } from "effect";

import type { ReadonlyRecord } from "@ts-types/utility-types";

function parseChunks(output: string): ReadonlyArray<ReadonlyRecord<string, unknown>> {
	const chunks: Array<ReadonlyRecord<string, unknown>> = [];
	let size = 0;

	for (const baseLine of output.split("\n\n")) {
		const line = baseLine.trim();
		if (!line.startsWith("data:") || line.includes("[DONE]")) continue;

		const json = JSON.parse(line.slice(5).trim());
		if (Predicate.isReadonlyRecord(json)) chunks[size++] = json;
	}

	return chunks;
}

test("all chunks in one Anthropic stream share a single id, created, and model", () => {
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

	expect(chunks.length >= 3, `Expected at least 3 chunks, got ${chunks.length}`).toBe(true);

	const chunkIds: Array<unknown> = [];
	const chunkCreated: Array<unknown> = [];
	const chunkModels: Array<unknown> = [];

	let size = 0;

	for (const { id, created, model } of chunks) {
		chunkIds[size] = id;
		chunkCreated[size] = created;
		chunkModels[size++] = model;
	}

	expect(new Set(chunkIds).size, `All chunks must share one id; got: ${JSON.stringify(chunkIds)}`).toBe(1);
	expect(new Set(chunkCreated).size, `All chunks must share one created; got: ${JSON.stringify(chunkCreated)}`).toBe(
		1,
	);
	expect(new Set(chunkModels).size, `All chunks must share one model; got: ${JSON.stringify(chunkModels)}`).toBe(1);
});

test("stream id is taken from message_start, not generated per-chunk", () => {
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
		expect(chunk.id, "All chunks must use the id from message_start").toBe("msg_xyz");
		expect(chunk.model, "All chunks must use the model from message_start").toBe("test-model");
	}
});

test("falls back to generated UUID and configured model when message_start is absent", () => {
	expect.hasAssertions();
	const input = [
		'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
		"",
		'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":1,"output_tokens":1}}',
		"",
	].join("\n");

	const output = translateAnthropicSseText(input, "my-model");
	const chunks = parseChunks(output);

	expect(chunks.length >= 2, "Expected at least 2 chunks").toBe(true);

	const ids: Array<string> = [];
	const models: Array<unknown> = [];

	let size = 0;

	for (const { id, model } of chunks) {
		ids[size] = id as string;
		models[size++] = model;
	}

	expect(new Set(ids).size, "All chunks must share one id even without message_start").toBe(1);
	expect(ids[0]?.startsWith("chatcmpl-") === true, "Fallback id should be chatcmpl-<uuid>").toBe(true);
	expect(new Set(models).size, "All chunks must share one model").toBe(1);
	expect(models[0], "Model should fall back to configured model").toBe("my-model");
});
