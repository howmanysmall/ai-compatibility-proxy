import { expect, describe, it } from "vitest";
import { createApp } from "$proxy/app";
import {
	isOpenAiChatCompletionChunk,
	isOpenAiChatCompletionRequest,
	isOpenAiChatCompletionResponse,
	isOpenAiChatMessage,
	isOpenAiChatRole,
	isOpenAiErrorBody,
	isOpenAiFinishReason,
	isOpenAiModelListResponse,
	isOpenAiTextContentPart,
	isOpenAiUsage,
} from "$proxy/openai-types";
import { Predicate } from "effect";

import type { ProxyConfiguration } from "$proxy/config";

function createConfiguration(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
	return {
		allowedUpstreamHosts: [],
		cerebrasDropUnsupportedFields: true,
		cerebrasStrictRequestValidation: true,
		defaultMaxTokens: 4096,
		defaultModel: "minimax-m3",
		logLevel: "info",
		maxRequestBodySizeBytes: 1_048_576,
		opencodeModelsCacheTtlMs: 300_000,
		opencodeModelsFetchTimeoutMs: 2000,
		opencodeModelsUrl: "https://models.dev/api.json",
		port: 8000,
		proxyApiKey: undefined,
		requestTimeoutMs: 60_000,
		upstreamApiKey: undefined,
		upstreamAuthHeader: "Authorization",
		upstreamAuthMode: "client_bearer",
		upstreamBaseUrl: "https://opencode.ai/zen/go/v1",
		upstreamErrorTransparency: true,
		upstreamProtocol: "anthropic_messages",
		...overrides,
	};
}

function createJsonRequest(body: unknown): Request {
	return new Request("http://localhost/v1/chat/completions", {
		body: JSON.stringify(body),
		headers: {
			authorization: "Bearer test-token",
			"content-type": "application/json",
		},
		method: "POST",
	});
}

async function readRecordAsync(response: Response): Promise<Record<string, unknown>> {
	const body = await response.json();
	if (!Predicate.isRecord(body)) {
		const error = new Error("Expected response body to be an object.");
		Error.captureStackTrace(error, readRecordAsync);
		throw error;
	}
	return body;
}

function getRecord(value: Record<string, unknown>, key: string): Record<string, unknown> {
	const childValue = value[key];
	if (!Predicate.isRecord(childValue)) {
		const error = new Error(`Expected ${key} to be an object.`);
		Error.captureStackTrace(error, getRecord);
		throw error;
	}
	return childValue;
}

describe("openAI Schema", () => {
	it("rejects request bodies missing messages", async () => {
		expect.assertions(2);
		const app = createApp({
			fetcher: () => Promise.reject(new Error("fetch should not be called")),
			proxyConfiguration: createConfiguration(),
		});
		const response = await app.fetch(createJsonRequest({ model: "minimax-m3" }));
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected missing messages to fail.").toBe(400);
		expect(error.message).toBeTypeOf("string");
	});

	it("rejects request bodies with non-array messages", async () => {
		expect.assertions(2);
		const app = createApp({
			fetcher: () => Promise.reject(new Error("fetch should not be called")),
			proxyConfiguration: createConfiguration(),
		});
		const response = await app.fetch(createJsonRequest({ messages: "not an array" }));
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected non-array messages to fail.").toBe(400);
		expect(error.message).toBeTypeOf("string");
	});

	it("rejects request bodies with empty messages arrays", async () => {
		expect.assertions(2);
		const app = createApp({
			fetcher: () => Promise.reject(new Error("fetch should not be called")),
			proxyConfiguration: createConfiguration(),
		});
		const response = await app.fetch(createJsonRequest({ messages: [] }));
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected empty messages to fail.").toBe(400);
		expect(error.message).toBeTypeOf("string");
	});

	it("rejects empty request bodies", async () => {
		expect.assertions(2);
		const app = createApp({
			fetcher: () => Promise.reject(new Error("fetch should not be called")),
			proxyConfiguration: createConfiguration(),
		});
		const response = await app.fetch(createJsonRequest({}));
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected empty body to fail.").toBe(400);
		expect(error.message).toBeTypeOf("string");
	});

	it("openAI schemas accept valid wire-format payloads", () => {
		expect.assertions(10);
		const textPart = { text: "hello", type: "text" };
		const message = { content: [textPart], name: "logan", role: "user" };
		const usage = { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 };

		expect(isOpenAiChatRole.allows("developer"), "Expected developer role to be accepted.").toBe(true);
		expect(isOpenAiFinishReason.allows("tool_calls"), "Expected tool_calls finish reason.").toBe(true);
		expect(isOpenAiTextContentPart.allows(textPart), "Expected OpenAI text part.").toBe(true);
		expect(isOpenAiChatMessage.allows(message), "Expected OpenAI chat message.").toBe(true);
		expect(
			isOpenAiChatCompletionRequest.allows({
				max_completion_tokens: 128,
				max_tokens: 64,
				messages: [message],
				model: "gpt-test",
				stop: ["END"],
				stream: true,
				temperature: 0.2,
				top_p: 0.9,
				vendor_extension: { passthrough: true },
			}),
			"Expected OpenAI request with extension fields.",
		).toBe(true);
		expect(isOpenAiUsage.allows(usage), "Expected OpenAI usage.").toBe(true);
		expect(
			isOpenAiChatCompletionResponse.allows({
				choices: [{ finish_reason: "stop", index: 0, message: { content: "hello", role: "assistant" } }],
				created: 1,
				id: "chatcmpl_1",
				model: "gpt-test",
				object: "chat.completion",
				usage,
			}),
			"Expected OpenAI completion response.",
		).toBe(true);
		expect(
			isOpenAiChatCompletionChunk.allows({
				choices: [{ delta: { content: "hello", role: "assistant" }, finish_reason: null, index: 0 }],
				created: 1,
				id: "chatcmpl_1",
				model: "gpt-test",
				object: "chat.completion.chunk",
				usage,
			}),
			"Expected OpenAI streaming chunk.",
		).toBe(true);
		expect(
			isOpenAiErrorBody.allows({
				error: { code: null, message: "bad request", param: null, type: "invalid_request" },
			}),
			"Expected OpenAI error body.",
		).toBe(true);
		expect(
			isOpenAiModelListResponse.allows({
				data: [{ created: 1, id: "gpt-test", object: "model", owned_by: "proxy" }],
				object: "list",
			}),
			"Expected OpenAI model list.",
		).toBe(true);
	});

	it("openAI schemas reject invalid wire-format payloads", () => {
		expect.assertions(10);

		expect(isOpenAiChatRole.allows("admin"), "Expected unknown chat role rejection.").toBe(false);
		expect(isOpenAiFinishReason.allows("cancelled"), "Expected unknown finish reason rejection.").toBe(false);
		expect(isOpenAiTextContentPart.allows({ text: 1, type: "text" }), "Expected non-string text rejection.").toBe(
			false,
		);
		expect(
			isOpenAiChatMessage.allows({ content: "hello", role: "admin" }),
			"Expected invalid role rejection.",
		).toBe(false);
		expect(
			isOpenAiChatCompletionRequest.allows({ max_tokens: 1.5, messages: [{ content: "hello", role: "user" }] }),
			"Expected integer token constraint.",
		).toBe(false);
		expect(
			isOpenAiChatCompletionRequest.allows({ messages: [], model: "gpt-test" }),
			"Expected non-empty messages.",
		).toBe(false);
		expect(
			isOpenAiUsage.allows({ completion_tokens: 1, prompt_tokens: 2.5, total_tokens: 3 }),
			"Expected integer usage tokens.",
		).toBe(false);
		expect(
			isOpenAiChatCompletionResponse.allows({
				choices: [{ finish_reason: "stop", index: 0, message: { content: "hello", role: "user" } }],
				created: 1,
				id: "chatcmpl_1",
				model: "gpt-test",
				object: "chat.completion",
			}),
			"Expected assistant response role.",
		).toBe(false);
		expect(
			isOpenAiChatCompletionChunk.allows({
				choices: [{ delta: { role: "user" }, finish_reason: null, index: 0 }],
				created: 1,
				id: "chatcmpl_1",
				model: "gpt-test",
				object: "chat.completion.chunk",
			}),
			"Expected assistant chunk role.",
		).toBe(false);
		expect(
			isOpenAiModelListResponse.allows({
				data: [{ created: 1, id: "gpt-test", object: "deployment", owned_by: "proxy" }],
				object: "list",
			}),
			"Expected model object literal.",
		).toBe(false);
	});
});
