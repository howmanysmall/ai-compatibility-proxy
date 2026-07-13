import { expect, describe, it } from "vitest";
import { translateAnthropicToOpenAi, translateOpenAiToAnthropic } from "$proxy/anthropic-translator.ts";
import { createApp } from "$proxy/app.ts";
import { normalizeCerebrasRequest } from "$proxy/cerebras-translator.ts";
import { loadConfiguration } from "$proxy/config.ts";
import { translateAnthropicSseText } from "$proxy/sse.ts";
import { Predicate } from "effect";

import { expectRecord, getInitHeader } from "../utilities/test-utilities.ts";

import type { ProxyConfiguration } from "$proxy/config.ts";
import type { Fetcher } from "$proxy/upstream.ts";

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

function createJsonRequest(path: string, body: unknown, token = "test-token"): Request {
	return new Request(`http://localhost${path}`, {
		body: JSON.stringify(body),
		headers: {
			authorization: `Bearer ${token}`,
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

function getArray(value: Record<string, unknown>, key: string): ReadonlyArray<unknown> {
	const childValue = value[key];
	if (!Array.isArray(childValue)) {
		const error = new Error(`Expected ${key} to be an array.`);
		Error.captureStackTrace(error, getArray);
		throw error;
	}
	return childValue;
}

function getInitHeaderOrEmpty(init: RequestInit | undefined, name: string): string {
	return getInitHeader(init, name) ?? "";
}

function getRecordBody(init: RequestInit | undefined): Record<string, unknown> {
	const body = init?.body;
	if (typeof body !== "string") return {};

	const parsedBody = JSON.parse(body);
	if (!Predicate.isRecord(parsedBody)) return {};

	return parsedBody;
}

function getRequestModel(init: RequestInit | undefined, fallbackModel: string): string {
	const parsedModel = getRecordBody(init).model;
	return typeof parsedModel === "string" ? parsedModel : fallbackModel;
}

function createModelListFetcher(capture: { authorization: string; url: string }): Fetcher {
	return async (input, init) => {
		capture.url = String(input);
		capture.authorization = getInitHeaderOrEmpty(init, "authorization");
		return Response.json({
			data: [{ created: 0, id: "minimax-m3", object: "model", owned_by: "opencode" }],
			object: "list",
		});
	};
}

function createOpenAiCompatibleProbeFetcher(capture: {
	authorization: string;
	body: Record<string, unknown>;
	url: string;
	xApiKey: string;
}): Fetcher {
	return async (input, init) => {
		const url = String(input);
		if (url === "https://models.dev/api.json") {
			return Response.json({
				opencode: {
					models: {
						"future-openai-model": { provider: { npm: "@ai-sdk/openai-compatible" } },
					},
					npm: "@ai-sdk/openai-compatible",
				},
			});
		}

		capture.authorization = getInitHeaderOrEmpty(init, "authorization");
		capture.url = url;
		capture.xApiKey = getInitHeaderOrEmpty(init, "x-api-key");
		capture.body = getRecordBody(init);
		return Response.json({
			choices: [
				{
					finish_reason: "stop",
					index: 0,
					message: { content: "pong", role: "assistant" },
				},
			],
			created: 0,
			id: "chatcmpl_1",
			model: "deepseek-v4-flash",
			object: "chat.completion",
		});
	};
}

function createAnthropicFallbackFetcher(seenUrls: Array<string>): Fetcher {
	return async (input, init) => {
		const url = String(input);
		if (url === "https://models.dev/api.json") {
			return Response.json({
				opencode: {
					models: {},
					npm: "@ai-sdk/openai-compatible",
				},
			});
		}

		seenUrls.push(url);
		if (url.endsWith("/chat/completions")) {
			return Response.json({ error: { message: "unsupported route" } }, { status: 404 });
		}

		const model = getRequestModel(init, "minimax-m3");
		return Response.json({
			content: [{ text: `fallback:${model}`, type: "text" }],
			id: "msg_fallback",
			model,
			role: "assistant",
			stop_reason: "end_turn",
			type: "message",
			usage: { input_tokens: 1, output_tokens: 1 },
		});
	};
}

describe("proxy", () => {
	it("translates OpenAI request to OpenCode Go Anthropic request", () => {
		expect.assertions(9);
		const anthropicRequest = translateOpenAiToAnthropic(
			{
				max_completion_tokens: 128,
				messages: [
					{ content: "Use terse answers.", role: "system" },
					{ content: "Prefer TypeScript.", role: "developer" },
					{ content: "Hello", role: "user" },
				],
				stop: ["END"],
				stream: false,
				temperature: 0.2,
				top_p: 0.9,
			},
			"minimax-m3",
			4096,
		);

		expect(anthropicRequest.model, "Expected default model.").toBe("minimax-m3");
		expect(anthropicRequest.max_tokens, "Expected max_completion_tokens to map to max_tokens.").toBe(128);
		expect(anthropicRequest.system, "Expected system text to merge.").toBe(
			"Use terse answers.\n\nPrefer TypeScript.",
		);
		expect(anthropicRequest.messages).toHaveLength(1);
		expect(anthropicRequest.messages[0]?.role, "Expected user role.").toBe("user");
		expect(anthropicRequest.messages[0]?.content, "Expected user content.").toBe("Hello");
		expect(anthropicRequest.stop_sequences?.[0], "Expected stop sequence.").toBe("END");
		expect(anthropicRequest.temperature, "Expected temperature passthrough.").toBe(0.2);
		expect(anthropicRequest.top_p, "Expected top_p passthrough.").toBe(0.9);
	});

	it("uses default token limit when OpenAI request omits one", () => {
		expect.assertions(1);
		const anthropicRequest = translateOpenAiToAnthropic(
			{
				messages: [{ content: "Hello", role: "user" }],
			},
			"minimax-m3",
			1234,
		);

		expect(anthropicRequest.max_tokens, "Expected DEFAULT_MAX_TOKENS fallback.").toBe(1234);
	});

	it("translates Anthropic response to OpenAI response with cache usage", () => {
		expect.assertions(7);
		const openAIResponse = translateAnthropicToOpenAi(
			{
				base_resp: { status_code: 0, status_msg: "success" },
				content: [
					{ text: "Hello ", type: "text" },
					{ signature: "opaque", thinking: "hidden", type: "thinking" },
					{ text: "there.", type: "text" },
				],
				cost: "0",
				id: "msg_123",
				model: "MiniMax-M2.7",
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

		expect(openAIResponse.id, "Expected upstream id.").toBe("msg_123");
		expect(openAIResponse.model, "Expected upstream model.").toBe("MiniMax-M2.7");
		expect(openAIResponse.choices[0]?.message.content, "Expected concatenated text blocks.").toBe("Hello there.");
		expect(openAIResponse.choices[0]?.finish_reason, "Expected max_tokens to map to length.").toBe("length");
		expect(openAIResponse.usage?.prompt_tokens, "Expected cache tokens to count toward prompt tokens.").toBe(15);
		expect(openAIResponse.usage?.completion_tokens, "Expected output token mapping.").toBe(7);
		expect(openAIResponse.usage?.total_tokens, "Expected total token mapping.").toBe(22);
	});

	it("translates Anthropic streaming events to OpenAI SSE", () => {
		expect.assertions(5);
		const output = translateAnthropicSseText(
			[
				'data: {"type":"message_start","message":{"id":"msg_1","model":"minimax-m3"}}',
				"",
				'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
				"",
				'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":4,"output_tokens":1}}',
				"",
			].join("\n"),
			"minimax-m3",
		);

		expect(output).toContain('"object":"chat.completion.chunk"');
		expect(output).toContain('"role":"assistant"');
		expect(output).toContain('"content":"Hi"');
		expect(output).toContain('"finish_reason":"stop"');
		expect(output).toContain('"prompt_tokens":4');
	});

	it("rejects unsupported Anthropic message content", () => {
		expect.assertions(1);
		let didThrow = false;

		try {
			translateOpenAiToAnthropic(
				{
					messages: [
						{
							content: [{ image_url: { url: "https://example.test/image.png" }, type: "image_url" }],
							role: "user",
						},
					],
				},
				"minimax-m3",
				4096,
			);
		} catch {
			didThrow = true;
		}

		expect(didThrow, "Expected multimodal content to be rejected.").toBe(true);
	});

	it("rejects missing client bearer auth", async () => {
		expect.assertions(2);
		const app = createApp({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(new Request("http://localhost/v1/models"));
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected missing auth to fail.").toBe(401);
		expect(error.type, "Expected OpenAI-compatible authentication error.").toBe("authentication_error");
	});

	it("returns health status through Elysia route", async () => {
		expect.assertions(3);
		const app = createApp({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(new Request("http://localhost/health"));
		const body = await readRecordAsync(response);

		expect(response.status, "Expected health route to succeed.").toBe(200);
		expect(body.status, "Expected health status.").toBe("ok");
		expect(body.upstream_protocol, "Expected configured upstream protocol.").toBe("anthropic_messages");
	});

	it("returns OpenAI-compatible not found errors", async () => {
		expect.assertions(3);
		const app = createApp({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(new Request("http://localhost/not-found"));
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected missing route to fail with 404.").toBe(404);
		expect(error.message, "Expected route not found message.").toBe("Route not found.");
		expect(error.type, "Expected OpenAI-compatible error type.").toBe("invalid_request_error");
	});

	it("rejects chat requests without JSON content type", async () => {
		expect.assertions(3);
		const app = createApp({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			new Request("http://localhost/v1/chat/completions", {
				body: JSON.stringify({ messages: [{ content: "Hello", role: "user" }] }),
				headers: {
					authorization: "Bearer test-token",
					"content-type": "text/plain",
				},
				method: "POST",
			}),
		);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected non-JSON request to fail.").toBe(415);
		expect(error.message, "Expected content type error.").toBe("Content-Type must be application/json.");
		expect(error.param, "Expected content-type param.").toBe("content-type");
	});

	it("rejects chat requests with missing content type before reading the body", async () => {
		expect.assertions(3);
		const app = createApp({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			new Request("http://localhost/v1/chat/completions", {
				headers: {
					authorization: "Bearer test-token",
				},
				method: "POST",
			}),
		);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected missing content-type to fail.").toBe(415);
		expect(error.message, "Expected content type error.").toBe("Content-Type must be application/json.");
		expect(error.param, "Expected content-type param.").toBe("content-type");
	});

	it("rejects chat requests with non-object JSON bodies", async () => {
		expect.hasAssertions();
		const app = createApp({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		await Promise.all(
			["null", "[]"].map(async (requestBody) => {
				const response = await app.fetch(
					new Request("http://localhost/v1/chat/completions", {
						body: requestBody,
						headers: {
							authorization: "Bearer test-token",
							"content-type": "application/json",
						},
						method: "POST",
					}),
				);
				const body = await readRecordAsync(response);
				const error = getRecord(body, "error");

				expect(response.status, "Expected non-object JSON body to fail.").toBe(400);
				expect(error.message, "Expected non-object body error.").toBe("Request body must be a JSON object.");
			}),
		);
	});

	it("proxies model list from OpenCode Go model endpoint", async () => {
		expect.assertions(4);
		const capture = { authorization: "", url: "" };
		const app = createApp({
			fetcher: createModelListFetcher(capture),
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			new Request("http://localhost/v1/models", {
				headers: { authorization: "Bearer upstream-key" },
			}),
		);
		const body = await readRecordAsync(response);
		const data = getArray(body, "data");
		const [firstModel] = data;

		expect(capture.url, "Expected /models upstream URL.").toBe("https://opencode.ai/zen/go/v1/models");
		expect(capture.authorization, "Expected client bearer forwarding.").toBe("Bearer upstream-key");
		expectRecord(firstModel, "Expected first model record.");
		expect(firstModel.id, "Expected model id.").toBe("minimax-m3");
	});

	it("probes OpenCode Go passthrough dynamically without hardcoded model ids", async () => {
		expect.assertions(7);
		const capture: { authorization: string; body: Record<string, unknown>; url: string; xApiKey: string } = {
			authorization: "",
			body: {},
			url: "",
			xApiKey: "",
		};
		const app = createApp({
			fetcher: createOpenAiCompatibleProbeFetcher(capture),
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: "Reply pong.", role: "user" }],
				model: "future-openai-model",
				response_format: { type: "json_object" },
				stream: false,
			}),
		);
		const body = await readRecordAsync(response);

		expect(response.status, "Expected OpenAI-compatible response to pass through.").toBe(200);
		expect(capture.url, "Expected OpenAI-compatible upstream URL.").toBe(
			"https://opencode.ai/zen/go/v1/chat/completions",
		);
		expect(capture.authorization, "Expected OpenAI-compatible auth header.").toBe("Bearer test-token");
		expect(capture.xApiKey, "Expected Anthropic x-api-key header to be removed.").toBe("");
		expect(capture.body.model, "Expected model to pass through.").toBe("future-openai-model");
		expect(
			Predicate.isRecord(capture.body.response_format),
			"Expected Anthropic-unsupported field to pass through.",
		).toBe(true);
		expect(body.model, "Expected upstream response body to pass through.").toBe("deepseek-v4-flash");
	});

	it("falls back to Anthropic translation when passthrough returns a client error", async () => {
		expect.assertions(5);
		const seenUrls: Array<string> = [];
		const app = createApp({
			fetcher: createAnthropicFallbackFetcher(seenUrls),
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: "Reply pong.", role: "user" }],
				model: "fallback-model",
			}),
		);
		const body = await readRecordAsync(response);
		const choices = getArray(body, "choices");
		const [firstChoice] = choices;

		expect(seenUrls[0], "Expected passthrough probe first.").toBe("https://opencode.ai/zen/go/v1/chat/completions");
		expect(seenUrls[1], "Expected Anthropic fallback second.").toBe("https://opencode.ai/zen/go/v1/messages");
		expectRecord(firstChoice, "Expected first choice record.");
		expectRecord(firstChoice.message, "Expected first choice message record.");
		expect(firstChoice.message.content, "Expected Anthropic fallback response.").toBe("fallback:fallback-model");
	});

	it("maps upstream 400 errors to OpenAI-compatible errors", async () => {
		expect.assertions(3);
		const app = createApp({
			fetcher: async () =>
				Response.json(
					{
						error: {
							message: "bad upstream request",
						},
					},
					{ status: 400 },
				),
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: "Hello", role: "user" }],
			}),
		);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected upstream status to be preserved.").toBe(400);
		expect(error.message, "Expected upstream message.").toBe("bad upstream request");
		expect(error.type, "Expected client error type.").toBe("invalid_request_error");
	});

	it("passes OpenAI-compatible streaming responses through without buffering", async () => {
		expect.assertions(4);
		const streamText = 'data: {"choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n';
		const app = createApp({
			fetcher: async () =>
				new Response(streamText, {
					headers: {
						"content-type": "text/event-stream",
						"x-upstream-stream": "raw",
					},
				}),
			proxyConfiguration: createConfiguration({
				defaultModel: "gpt-oss-120b",
				upstreamBaseUrl: "https://api.cerebras.ai/v1",
				upstreamProtocol: "cerebras_openai",
			}),
		});

		const response = await app.fetch(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: "Hello", role: "user" }],
				stream: true,
			}),
		);

		expect(response.status, "Expected streaming response to succeed.").toBe(200);
		expect(response.headers.get("content-type"), "Expected upstream content type.").toBe("text/event-stream");
		expect(response.headers.get("x-upstream-stream"), "Expected upstream headers to pass through.").toBe("raw");
		await expect(response.text()).resolves.toBe(streamText);
	});

	it("normalizes Cerebras max_tokens and rejects unsupported fields", () => {
		expect.assertions(4);
		const config = createConfiguration({
			defaultModel: "gpt-oss-120b",
			upstreamBaseUrl: "https://api.cerebras.ai/v1",
			upstreamProtocol: "cerebras_openai",
		});
		const normalizedRequest = normalizeCerebrasRequest(
			{
				max_tokens: 100,
				messages: [
					{ content: "Be concise.", role: "developer" },
					{ content: "Hello", role: "user" },
				],
				temperature: 0.4,
			},
			config,
		);

		expect(normalizedRequest.model, "Expected default Cerebras model.").toBe("gpt-oss-120b");
		expect(normalizedRequest.max_completion_tokens, "Expected max_tokens conversion.").toBe(100);
		expect(normalizedRequest.temperature, "Expected temperature passthrough.").toBe(0.4);

		let didThrow = false;
		try {
			normalizeCerebrasRequest(
				{
					messages: [{ content: "Hello", role: "user" }],
					response_format: { type: "json_object" },
				},
				config,
			);
		} catch {
			didThrow = true;
		}

		expect(didThrow, "Expected unsupported response_format to be rejected.").toBe(true);
	});

	it("server_key mode requires proxy token and uses upstream key", async () => {
		expect.assertions(3);
		let seenAuthorization = "";
		const app = createApp({
			fetcher: async (_input, init) => {
				seenAuthorization = getInitHeaderOrEmpty(init, "authorization");
				return Response.json({ data: [], object: "list" });
			},
			proxyConfiguration: createConfiguration({
				proxyApiKey: "proxy-key",
				upstreamApiKey: "upstream-key",
				upstreamAuthMode: "server_key",
			}),
		});

		const invalidResponse = await app.fetch(
			new Request("http://localhost/v1/models", {
				headers: { authorization: "Bearer wrong-key" },
			}),
		);
		expect(invalidResponse.status, "Expected invalid proxy token to fail.").toBe(401);

		const validResponse = await app.fetch(
			new Request("http://localhost/v1/models", {
				headers: { authorization: "Bearer proxy-key" },
			}),
		);
		expect(validResponse.status, "Expected valid proxy token.").toBe(200);
		expect(seenAuthorization, "Expected server upstream key forwarding.").toBe("Bearer upstream-key");
	});

	it("loads OpenCode Go MiniMax M3 defaults", () => {
		expect.assertions(5);
		const config = loadConfiguration({});

		expect(config.upstreamProtocol, "Expected Anthropic protocol default.").toBe("anthropic_messages");
		expect(config.upstreamBaseUrl, "Expected OpenCode Go base URL.").toBe("https://opencode.ai/zen/go/v1");
		expect(config.upstreamAuthHeader, "Expected OpenCode Go x-api-key default.").toBe("x-api-key");
		expect(config.defaultModel, "Expected MiniMax M3 default.").toBe("minimax-m3");
		expect(config.defaultMaxTokens, "Expected token default.").toBe(4096);
	});

	it("loads Cerebras defaults", () => {
		expect.assertions(4);
		const config = loadConfiguration({ UPSTREAM_PROTOCOL: "cerebras_openai" });

		expect(config.upstreamProtocol, "Expected Cerebras protocol.").toBe("cerebras_openai");
		expect(config.upstreamBaseUrl, "Expected Cerebras base URL.").toBe("https://api.cerebras.ai/v1");
		expect(config.upstreamAuthHeader, "Expected Cerebras Authorization default.").toBe("Authorization");
		expect(config.defaultModel, "Expected Cerebras default model.").toBe("gpt-oss-120b");
	});
});
