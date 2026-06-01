import { translateAnthropicToOpenAI, translateOpenAIToAnthropic } from "../../src/proxy/anthropic-translator.ts";
import { createApp } from "../../src/proxy/app.ts";
import { normalizeCerebrasRequest } from "../../src/proxy/cerebras-translator.ts";
import { loadConfig } from "../../src/proxy/config.ts";
import { translateAnthropicSseText } from "../../src/proxy/sse.ts";

import type { ProxyConfig } from "../../src/proxy/config.ts";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function createConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
	return {
		cerebrasDropUnsupportedFields: true,
		cerebrasStrictRequestValidation: true,
		defaultMaxTokens: 4096,
		defaultModel: "minimax-m3",
		logLevel: "info",
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
	const body: unknown = await response.json();
	if (!isRecord(body)) throw new Error("Expected response body to be an object.");
	return body;
}

function getRecord(value: Record<string, unknown>, key: string): Record<string, unknown> {
	const childValue = value[key];
	if (!isRecord(childValue)) throw new Error(`Expected ${key} to be an object.`);
	return childValue;
}

function getArray(value: Record<string, unknown>, key: string): ReadonlyArray<unknown> {
	const childValue = value[key];
	if (!Array.isArray(childValue)) throw new Error(`Expected ${key} to be an array.`);
	return childValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && Boolean(value) && !Array.isArray(value);
}

Deno.test("translates OpenAI request to OpenCode Go Anthropic request", () => {
	const anthropicRequest = translateOpenAIToAnthropic(
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

	assert(anthropicRequest.model === "minimax-m3", "Expected default model.");
	assert(anthropicRequest.max_tokens === 128, "Expected max_completion_tokens to map to max_tokens.");
	assert(anthropicRequest.system === "Use terse answers.\n\nPrefer TypeScript.", "Expected system text to merge.");
	assert(anthropicRequest.messages.length === 1, "Expected one Anthropic message.");
	assert(anthropicRequest.messages[0]?.role === "user", "Expected user role.");
	assert(anthropicRequest.messages[0]?.content === "Hello", "Expected user content.");
	assert(anthropicRequest.stop_sequences?.[0] === "END", "Expected stop sequence.");
	assert(anthropicRequest.temperature === 0.2, "Expected temperature passthrough.");
	assert(anthropicRequest.top_p === 0.9, "Expected top_p passthrough.");
});

Deno.test("uses default token limit when OpenAI request omits one", () => {
	const anthropicRequest = translateOpenAIToAnthropic(
		{
			messages: [{ content: "Hello", role: "user" }],
		},
		"minimax-m3",
		1234,
	);

	assert(anthropicRequest.max_tokens === 1234, "Expected DEFAULT_MAX_TOKENS fallback.");
});

Deno.test("translates Anthropic response to OpenAI response with cache usage", () => {
	const openAIResponse = translateAnthropicToOpenAI(
		{
			content: [
				{ text: "Hello ", type: "text" },
				{ text: "hidden", type: "thinking" },
				{ text: "there.", type: "text" },
			],
			id: "msg_123",
			model: "minimax-m3",
			stop_reason: "max_tokens",
			usage: {
				cache_creation_input_tokens: 2,
				cache_read_input_tokens: 3,
				input_tokens: 10,
				output_tokens: 7,
			},
		},
		"fallback-model",
	);

	assert(openAIResponse.id === "msg_123", "Expected upstream id.");
	assert(openAIResponse.choices[0]?.message.content === "Hello there.", "Expected concatenated text blocks.");
	assert(openAIResponse.choices[0]?.finish_reason === "length", "Expected max_tokens to map to length.");
	assert(openAIResponse.usage?.prompt_tokens === 15, "Expected cache tokens to count toward prompt tokens.");
	assert(openAIResponse.usage?.completion_tokens === 7, "Expected output token mapping.");
	assert(openAIResponse.usage?.total_tokens === 22, "Expected total token mapping.");
});

Deno.test("translates Anthropic streaming events to OpenAI SSE", () => {
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

	assert(output.includes('"object":"chat.completion.chunk"'), "Expected OpenAI chunk object.");
	assert(output.includes('"role":"assistant"'), "Expected initial assistant role delta.");
	assert(output.includes('"content":"Hi"'), "Expected text content delta.");
	assert(output.includes('"finish_reason":"stop"'), "Expected finish chunk.");
	assert(output.includes('"prompt_tokens":4'), "Expected usage mapping.");
});

Deno.test("rejects unsupported Anthropic message content", () => {
	let didThrow = false;

	try {
		translateOpenAIToAnthropic(
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

	assert(didThrow, "Expected multimodal content to be rejected.");
});

Deno.test("rejects missing client bearer auth", async () => {
	const app = createApp({
		config: createConfig(),
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
	});

	const response = await app(new Request("http://localhost/v1/models"));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 401, "Expected missing auth to fail.");
	assert(error["type"] === "authentication_error", "Expected OpenAI-compatible authentication error.");
});

Deno.test("proxies model list from OpenCode Go model endpoint", async () => {
	let seenUrl = "";
	let seenAuthorization = "";
	const app = createApp({
		config: createConfig(),
		fetcher: (input, init) => {
			seenUrl = String(input);
			seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
			return Promise.resolve(
				Response.json({
					data: [{ created: 0, id: "minimax-m3", object: "model", owned_by: "opencode" }],
					object: "list",
				}),
			);
		},
	});

	const response = await app(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer upstream-key" },
		}),
	);
	const body = await readRecordAsync(response);
	const data = getArray(body, "data");
	const [firstModel] = data;

	assert(seenUrl === "https://opencode.ai/zen/go/v1/models", "Expected /models upstream URL.");
	assert(seenAuthorization === "Bearer upstream-key", "Expected client bearer forwarding.");
	assert(isRecord(firstModel) && firstModel["id"] === "minimax-m3", "Expected model id.");
});

Deno.test("maps upstream 400 errors to OpenAI-compatible errors", async () => {
	const app = createApp({
		config: createConfig(),
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
	});

	const response = await app(
		createJsonRequest("/v1/chat/completions", {
			messages: [{ content: "Hello", role: "user" }],
		}),
	);
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 400, "Expected upstream status to be preserved.");
	assert(error["message"] === "bad upstream request", "Expected upstream message.");
	assert(error["type"] === "invalid_request_error", "Expected client error type.");
});

Deno.test("normalizes Cerebras max_tokens and rejects unsupported fields", () => {
	const config = createConfig({
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

	assert(normalizedRequest.model === "gpt-oss-120b", "Expected default Cerebras model.");
	assert(normalizedRequest.max_completion_tokens === 100, "Expected max_tokens conversion.");
	assert(normalizedRequest.temperature === 0.4, "Expected temperature passthrough.");

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

	assert(didThrow, "Expected unsupported response_format to be rejected.");
});

Deno.test("server_key mode requires proxy token and uses upstream key", async () => {
	let seenAuthorization = "";
	const app = createApp({
		config: createConfig({
			proxyApiKey: "proxy-key",
			upstreamApiKey: "upstream-key",
			upstreamAuthMode: "server_key",
		}),
		fetcher: (_input, init) => {
			seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
			return Promise.resolve(Response.json({ data: [], object: "list" }));
		},
	});

	const invalidResponse = await app(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer wrong-key" },
		}),
	);
	assert(invalidResponse.status === 401, "Expected invalid proxy token to fail.");

	const validResponse = await app(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer proxy-key" },
		}),
	);
	assert(validResponse.status === 200, "Expected valid proxy token.");
	assert(seenAuthorization === "Bearer upstream-key", "Expected server upstream key forwarding.");
});

Deno.test("loads OpenCode Go MiniMax M3 defaults", () => {
	const config = loadConfig({});

	assert(config.upstreamProtocol === "anthropic_messages", "Expected Anthropic protocol default.");
	assert(config.upstreamBaseUrl === "https://opencode.ai/zen/go/v1", "Expected OpenCode Go base URL.");
	assert(config.defaultModel === "minimax-m3", "Expected MiniMax M3 default.");
	assert(config.defaultMaxTokens === 4096, "Expected token default.");
});
