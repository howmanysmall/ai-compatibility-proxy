import { expect, test } from "vitest";

import { translateAnthropicToOpenAi, translateOpenAiToAnthropic } from "@proxy/anthropic-translator";
import { createApp } from "@proxy/app";
import { normalizeCerebrasRequest } from "@proxy/cerebras-translator";
import { loadConfiguration } from "@proxy/config";
import { translateAnthropicSseText } from "@proxy/sse";
import { Predicate } from "effect";

import { expectRecord, getInitHeader } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "@proxy/config";

function createConfiguration(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
	return {
		cerebrasDropUnsupportedFields: true,
		cerebrasStrictRequestValidation: true,
		defaultMaxTokens: 4096,
		defaultModel: "minimax-m3",
		logLevel: "info",
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

test("translates OpenAI request to OpenCode Go Anthropic request", () => {
	expect.hasAssertions();
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

	expect(anthropicRequest.model === "minimax-m3", "Expected default model.").toBe(true);
	expect(anthropicRequest.max_tokens === 128, "Expected max_completion_tokens to map to max_tokens.").toBe(true);
	expect(
		anthropicRequest.system === "Use terse answers.\n\nPrefer TypeScript.",
		"Expected system text to merge.",
	).toBe(true);
	expect(anthropicRequest.messages.length === 1, "Expected one Anthropic message.").toBe(true);
	expect(anthropicRequest.messages[0]?.role === "user", "Expected user role.").toBe(true);
	expect(anthropicRequest.messages[0]?.content === "Hello", "Expected user content.").toBe(true);
	expect(anthropicRequest.stop_sequences?.[0] === "END", "Expected stop sequence.").toBe(true);
	expect(anthropicRequest.temperature === 0.2, "Expected temperature passthrough.").toBe(true);
	expect(anthropicRequest.top_p === 0.9, "Expected top_p passthrough.").toBe(true);
});

test("uses default token limit when OpenAI request omits one", () => {
	expect.hasAssertions();
	const anthropicRequest = translateOpenAiToAnthropic(
		{
			messages: [{ content: "Hello", role: "user" }],
		},
		"minimax-m3",
		1234,
	);

	expect(anthropicRequest.max_tokens === 1234, "Expected DEFAULT_MAX_TOKENS fallback.").toBe(true);
});

test("translates Anthropic response to OpenAI response with cache usage", () => {
	expect.hasAssertions();
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

	expect(openAIResponse.id === "msg_123", "Expected upstream id.").toBe(true);
	expect(openAIResponse.model === "MiniMax-M2.7", "Expected upstream model.").toBe(true);
	expect(openAIResponse.choices[0]?.message.content === "Hello there.", "Expected concatenated text blocks.").toBe(
		true,
	);
	expect(openAIResponse.choices[0]?.finish_reason === "length", "Expected max_tokens to map to length.").toBe(true);
	expect(openAIResponse.usage?.prompt_tokens === 15, "Expected cache tokens to count toward prompt tokens.").toBe(
		true,
	);
	expect(openAIResponse.usage?.completion_tokens === 7, "Expected output token mapping.").toBe(true);
	expect(openAIResponse.usage?.total_tokens === 22, "Expected total token mapping.").toBe(true);
});

test("translates Anthropic streaming events to OpenAI SSE", () => {
	expect.hasAssertions();
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

test("rejects unsupported Anthropic message content", () => {
	expect.hasAssertions();
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

test("rejects missing client bearer auth", async () => {
	expect.hasAssertions();
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});

	const response = await app.fetch(new Request("http://localhost/v1/models"));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	expect(response.status === 401, "Expected missing auth to fail.").toBe(true);
	expect(error.type === "authentication_error", "Expected OpenAI-compatible authentication error.").toBe(true);
});

test("returns health status through Elysia route", async () => {
	expect.hasAssertions();
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});

	const response = await app.fetch(new Request("http://localhost/health"));
	const body = await readRecordAsync(response);

	expect(response.status === 200, "Expected health route to succeed.").toBe(true);
	expect(body.status === "ok", "Expected health status.").toBe(true);
	expect(body.upstream_protocol === "anthropic_messages", "Expected configured upstream protocol.").toBe(true);
});

test("returns OpenAI-compatible not found errors", async () => {
	expect.hasAssertions();
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});

	const response = await app.fetch(new Request("http://localhost/not-found"));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	expect(response.status === 404, "Expected missing route to fail with 404.").toBe(true);
	expect(error.message === "Route not found.", "Expected route not found message.").toBe(true);
	expect(error.type === "invalid_request_error", "Expected OpenAI-compatible error type.").toBe(true);
});

test("rejects chat requests without JSON content type", async () => {
	expect.hasAssertions();
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
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

	expect(response.status === 415, "Expected non-JSON request to fail.").toBe(true);
	expect(error.message === "Content-Type must be application/json.", "Expected content type error.").toBe(true);
	expect(error.param === "content-type", "Expected content-type param.").toBe(true);
});

test("rejects chat requests with missing content type before reading the body", async () => {
	expect.hasAssertions();
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
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

test("rejects chat requests with non-object JSON bodies", async () => {
	expect.hasAssertions();
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
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

test("proxies model list from OpenCode Go model endpoint", async () => {
	expect.hasAssertions();
	let seenUrl = "";
	let seenAuthorization = "";
	const app = createApp({
		fetcher: (input, init) => {
			seenUrl = String(input);
			seenAuthorization = getInitHeader(init, "authorization") ?? "";
			return Promise.resolve(
				Response.json({
					data: [{ created: 0, id: "minimax-m3", object: "model", owned_by: "opencode" }],
					object: "list",
				}),
			);
		},
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

	expect(seenUrl === "https://opencode.ai/zen/go/v1/models", "Expected /models upstream URL.").toBe(true);
	expect(seenAuthorization === "Bearer upstream-key", "Expected client bearer forwarding.").toBe(true);
	expect(Predicate.isRecord(firstModel) && firstModel.id === "minimax-m3", "Expected model id.").toBe(true);
});

test("probes OpenCode Go passthrough dynamically without hardcoded model ids", async () => {
	expect.hasAssertions();
	let seenAuthorization = "";
	let seenBody: Record<string, unknown> = {};
	let seenXApiKey = "";
	let seenUrl = "";
	const app = createApp({
		fetcher: (input, init) => {
			if (String(input) === "https://models.dev/api.json") {
				return Promise.resolve(
					Response.json({
						opencode: {
							models: {
								"future-openai-model": { provider: { npm: "@ai-sdk/openai-compatible" } },
							},
							npm: "@ai-sdk/openai-compatible",
						},
					}),
				);
			}
			seenAuthorization = getInitHeader(init, "authorization") ?? "";
			seenUrl = String(input);
			seenXApiKey = getInitHeader(init, "x-api-key") ?? "";
			const body = init?.body;
			if (typeof body === "string") {
				const parsedBody = JSON.parse(body);
				if (Predicate.isRecord(parsedBody)) seenBody = parsedBody;
			}
			return Promise.resolve(
				Response.json({
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
				}),
			);
		},
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

	expect(response.status === 200, "Expected OpenAI-compatible response to pass through.").toBe(true);
	expect(
		seenUrl === "https://opencode.ai/zen/go/v1/chat/completions",
		"Expected OpenAI-compatible upstream URL.",
	).toBe(true);
	expect(seenAuthorization === "Bearer test-token", "Expected OpenAI-compatible auth header.").toBe(true);
	expect(seenXApiKey === "", "Expected Anthropic x-api-key header to be removed.").toBe(true);
	expect(seenBody.model === "future-openai-model", "Expected model to pass through.").toBe(true);
	expect(Predicate.isRecord(seenBody.response_format), "Expected Anthropic-unsupported field to pass through.").toBe(
		true,
	);
	expect(body.model === "deepseek-v4-flash", "Expected upstream response body to pass through.").toBe(true);
});

test("falls back to Anthropic translation when passthrough returns a client error", async () => {
	expect.hasAssertions();
	const seenUrls: Array<string> = [];
	const app = createApp({
		fetcher: (input, init) => {
			const url = String(input);
			if (url === "https://models.dev/api.json") {
				return Promise.resolve(
					Response.json({
						opencode: {
							models: {},
							npm: "@ai-sdk/openai-compatible",
						},
					}),
				);
			}
			seenUrls.push(url);
			if (url.endsWith("/chat/completions")) {
				return Promise.resolve(Response.json({ error: { message: "unsupported route" } }, { status: 404 }));
			}

			let model = "minimax-m3";
			if (typeof init?.body === "string") {
				const parsedBody = JSON.parse(init.body);
				if (Predicate.isRecord(parsedBody)) {
					const { model: parsedModel } = parsedBody;
					if (typeof parsedModel === "string") model = parsedModel;
				}
			}
			return Promise.resolve(
				Response.json({
					content: [{ text: `fallback:${model}`, type: "text" }],
					id: "msg_fallback",
					model,
					role: "assistant",
					stop_reason: "end_turn",
					type: "message",
					usage: { input_tokens: 1, output_tokens: 1 },
				}),
			);
		},
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

	expect(seenUrls[0] === "https://opencode.ai/zen/go/v1/chat/completions", "Expected passthrough probe first.").toBe(
		true,
	);
	expect(seenUrls[1] === "https://opencode.ai/zen/go/v1/messages", "Expected Anthropic fallback second.").toBe(true);
	expectRecord(firstChoice, "Expected first choice record.");
	expect(
		Predicate.isRecord(firstChoice.message) && firstChoice.message.content === "fallback:fallback-model",
		"Expected Anthropic fallback response.",
	).toBe(true);
});

test("maps upstream 400 errors to OpenAI-compatible errors", async () => {
	expect.hasAssertions();
	const app = createApp({
		fetcher: () =>
			Promise.resolve(
				Response.json(
					{
						error: {
							message: "bad upstream request",
						},
					},
					{ status: 400 },
				),
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

	expect(response.status === 400, "Expected upstream status to be preserved.").toBe(true);
	expect(error.message === "bad upstream request", "Expected upstream message.").toBe(true);
	expect(error.type === "invalid_request_error", "Expected client error type.").toBe(true);
});

test("passes OpenAI-compatible streaming responses through without buffering", async () => {
	expect.hasAssertions();
	const streamText = 'data: {"choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n';
	const app = createApp({
		fetcher: () =>
			Promise.resolve(
				new Response(streamText, {
					headers: {
						"content-type": "text/event-stream",
						"x-upstream-stream": "raw",
					},
				}),
			),
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

	expect(response.status === 200, "Expected streaming response to succeed.").toBe(true);
	expect(response.headers.get("content-type") === "text/event-stream", "Expected upstream content type.").toBe(true);
	expect(response.headers.get("x-upstream-stream") === "raw", "Expected upstream headers to pass through.").toBe(
		true,
	);
	expect((await response.text()) === streamText, "Expected raw stream body to pass through.").toBe(true);
});

test("normalizes Cerebras max_tokens and rejects unsupported fields", () => {
	expect.hasAssertions();
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

	expect(normalizedRequest.model === "gpt-oss-120b", "Expected default Cerebras model.").toBe(true);
	expect(normalizedRequest.max_completion_tokens === 100, "Expected max_tokens conversion.").toBe(true);
	expect(normalizedRequest.temperature === 0.4, "Expected temperature passthrough.").toBe(true);

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

test("server_key mode requires proxy token and uses upstream key", async () => {
	expect.hasAssertions();
	let seenAuthorization = "";
	const app = createApp({
		fetcher: (_input, init) => {
			seenAuthorization = getInitHeader(init, "authorization") ?? "";
			return Promise.resolve(Response.json({ data: [], object: "list" }));
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
	expect(invalidResponse.status === 401, "Expected invalid proxy token to fail.").toBe(true);

	const validResponse = await app.fetch(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer proxy-key" },
		}),
	);
	expect(validResponse.status === 200, "Expected valid proxy token.").toBe(true);
	expect(seenAuthorization === "Bearer upstream-key", "Expected server upstream key forwarding.").toBe(true);
});

test("loads OpenCode Go MiniMax M3 defaults", () => {
	expect.hasAssertions();
	const config = loadConfiguration({});

	expect(config.upstreamProtocol === "anthropic_messages", "Expected Anthropic protocol default.").toBe(true);
	expect(config.upstreamBaseUrl === "https://opencode.ai/zen/go/v1", "Expected OpenCode Go base URL.").toBe(true);
	expect(config.upstreamAuthHeader === "x-api-key", "Expected OpenCode Go x-api-key default.").toBe(true);
	expect(config.defaultModel === "minimax-m3", "Expected MiniMax M3 default.").toBe(true);
	expect(config.defaultMaxTokens === 4096, "Expected token default.").toBe(true);
});

test("loads Cerebras defaults", () => {
	expect.hasAssertions();
	const config = loadConfiguration({ UPSTREAM_PROTOCOL: "cerebras_openai" });

	expect(config.upstreamProtocol === "cerebras_openai", "Expected Cerebras protocol.").toBe(true);
	expect(config.upstreamBaseUrl === "https://api.cerebras.ai/v1", "Expected Cerebras base URL.").toBe(true);
	expect(config.upstreamAuthHeader === "Authorization", "Expected Cerebras Authorization default.").toBe(true);
	expect(config.defaultModel === "gpt-oss-120b", "Expected Cerebras default model.").toBe(true);
});
