import { mapAnthropicFinishReason, mapAnthropicUsage } from "./anthropic-translator.ts";
import { OPENAI_NULL } from "./openai-constants.ts";

import type { OpenAIChatCompletionChunk, OpenAIUsage } from "./openai-types.ts";

const SSE_EVENT_SEPARATOR_PATTERN = /\n\n/u;

export async function createOpenAIStreamResponseAsync(upstreamResponse: Response, model: string): Promise<Response> {
	const upstreamBody = upstreamResponse.body;
	if (!upstreamBody) {
		return new Response("data: [DONE]\n\n", {
			headers: createSseHeaders(),
		});
	}

	const stream = upstreamBody
		.pipeThrough(new TextDecoderStream())
		.pipeThrough(createAnthropicSseTransform(model))
		.pipeThrough(new TextEncoderStream());

	return new Response(stream, {
		headers: createSseHeaders(),
	});
}

export function translateAnthropicSseText(input: string, model: string): string {
	let output = "";
	const translateEvent = createAnthropicEventTranslator(model);

	for (const event of parseSseEvents(input)) {
		output += translateEvent(event);
	}

	return output;
}

function createAnthropicSseTransform(model: string): TransformStream<string, string> {
	let buffer = "";
	const translateEvent = createAnthropicEventTranslator(model);

	return new TransformStream({
		flush(controller) {
			for (const event of parseSseEvents(buffer)) {
				controller.enqueue(translateEvent(event));
			}
			controller.enqueue("data: [DONE]\n\n");
		},
		transform(chunk, controller) {
			buffer += chunk;
			const lastEventBoundary = buffer.lastIndexOf("\n\n");
			if (lastEventBoundary === -1) return;

			const readyText = buffer.slice(0, lastEventBoundary + 2);
			buffer = buffer.slice(lastEventBoundary + 2);

			for (const event of parseSseEvents(readyText)) {
				controller.enqueue(translateEvent(event));
			}
		},
	});
}

function createAnthropicEventTranslator(fallbackModel: string): (event: Record<string, unknown>) => string {
	let streamId: string | undefined;
	let streamCreated: number | undefined;
	let streamModel: string | undefined;

	function getSharedId(): string {
		if (!streamId) streamId = `chatcmpl-${crypto.randomUUID()}`;
		return streamId;
	}

	function getSharedCreated(): number {
		if (!streamCreated) streamCreated = getUnixSeconds();
		return streamCreated;
	}

	function getSharedModel(): string {
		if (!streamModel) streamModel = fallbackModel;
		return streamModel;
	}

	return function translateEvent(event: Record<string, unknown>): string {
		const { type } = event;

		if (type === "message_start") {
			const message = getRecord(event["message"]);
			streamId = getString(message["id"]) ?? `chatcmpl-${crypto.randomUUID()}`;
			streamModel = getString(message["model"]) ?? fallbackModel;
			streamCreated = getUnixSeconds();
			return formatChunk({
				choices: [
					{
						delta: { role: "assistant" },
						finish_reason: OPENAI_NULL,
						index: 0,
					},
				],
				created: streamCreated,
				id: streamId,
				model: streamModel,
				object: "chat.completion.chunk",
			});
		}

		if (type === "content_block_start") {
			const block = getRecord(event["content_block"]);
			if (block["type"] !== "text") return "";
			const text = getString(block["text"]);
			if (!text) return "";
			return formatContentChunk(text, getSharedId(), getSharedCreated(), getSharedModel());
		}

		if (type === "content_block_delta") {
			const delta = getRecord(event["delta"]);
			const text = getString(delta["text"]);
			if (!text) return "";
			return formatContentChunk(text, getSharedId(), getSharedCreated(), getSharedModel());
		}

		if (type === "message_delta") {
			const delta = getRecord(event["delta"]);
			const usage = mapAnthropicUsage(getRecordOrUndefined(event["usage"]));
			return formatFinalChunk(
				getSharedId(),
				getSharedCreated(),
				getSharedModel(),
				mapAnthropicFinishReason(getString(delta["stop_reason"])),
				usage,
			);
		}

		return "";
	};
}

function parseSseEvents(input: string): Array<Record<string, unknown>> {
	return input
		.split(SSE_EVENT_SEPARATOR_PATTERN)
		.map((eventText) => eventText.trim())
		.filter(Boolean)
		.flatMap((eventText) => {
			const dataLines = eventText
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice("data:".length).trim());

			if (dataLines.length === 0) return [];

			const data = dataLines.join("\n");
			if (data === "[DONE]") return [];

			try {
				const parsedData: unknown = JSON.parse(data);
				return isRecord(parsedData) ? [parsedData] : [];
			} catch {
				return [];
			}
		});
}

function formatContentChunk(content: string, id: string, created: number, model: string): string {
	return formatChunk({
		choices: [
			{
				delta: { content },
				finish_reason: OPENAI_NULL,
				index: 0,
			},
		],
		created,
		id,
		model,
		object: "chat.completion.chunk",
	});
}

function formatFinalChunk(
	id: string,
	created: number,
	model: string,
	finishReason: OpenAIChatCompletionChunk["choices"][number]["finish_reason"],
	usage: OpenAIUsage | undefined,
): string {
	return formatChunk({
		choices: [
			{
				delta: {},
				finish_reason: finishReason,
				index: 0,
			},
		],
		created,
		id,
		model,
		object: "chat.completion.chunk",
		...(usage ? { usage } : {}),
	});
}

function formatChunk(chunk: OpenAIChatCompletionChunk): string {
	return `data: ${JSON.stringify(chunk)}\n\n`;
}

function createSseHeaders(): Headers {
	return new Headers({
		"cache-control": "no-cache, no-transform",
		connection: "keep-alive",
		"content-type": "text/event-stream; charset=utf-8",
		"x-accel-buffering": "no",
	});
}

function getRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function getRecordOrUndefined(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function getUnixSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && Boolean(value) && !Array.isArray(value);
}
