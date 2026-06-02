import { translateAnthropicToOpenAi, translateOpenAiToAnthropic } from "@proxy/anthropic-translator.ts";
import { createApp } from "@proxy/app.ts";
import { normalizeCerebrasRequest } from "@proxy/cerebras-translator.ts";
import { loadConfiguration } from "@proxy/config.ts";
import { translateAnthropicSseText } from "@proxy/sse.ts";
import { Predicate } from "effect";

import { assert, getInitHeader } from "../utilities/test-utilities.ts";

import type { ProxyConfiguration } from "@proxy/config.ts";

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

Deno.test("translates OpenAI request to OpenCode Go Anthropic request", () => {
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
	const anthropicRequest = translateOpenAiToAnthropic(
		{
			messages: [{ content: "Hello", role: "user" }],
		},
		"minimax-m3",
		1234,
	);

	assert(anthropicRequest.max_tokens === 1234, "Expected DEFAULT_MAX_TOKENS fallback.");
});

Deno.test("translates Anthropic response to OpenAI response with cache usage", () => {
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

	assert(openAIResponse.id === "msg_123", "Expected upstream id.");
	assert(openAIResponse.model === "MiniMax-M2.7", "Expected upstream model.");
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

	assert(didThrow, "Expected multimodal content to be rejected.");
});

Deno.test("rejects missing client bearer auth", async () => {
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});

	const response = await app(new Request("http://localhost/v1/models"));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 401, "Expected missing auth to fail.");
	assert(error.type === "authentication_error", "Expected OpenAI-compatible authentication error.");
});

Deno.test("proxies model list from OpenCode Go model endpoint", async () => {
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
	assert(Predicate.isRecord(firstModel) && firstModel.id === "minimax-m3", "Expected model id.");
});

Deno.test("probes OpenCode Go passthrough dynamically without hardcoded model ids", async () => {
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

	const response = await app(
		createJsonRequest("/v1/chat/completions", {
			messages: [{ content: "Reply pong.", role: "user" }],
			model: "future-openai-model",
			response_format: { type: "json_object" },
			stream: false,
		}),
	);
	const body = await readRecordAsync(response);

	assert(response.status === 200, "Expected OpenAI-compatible response to pass through.");
	assert(seenUrl === "https://opencode.ai/zen/go/v1/chat/completions", "Expected OpenAI-compatible upstream URL.");
	assert(seenAuthorization === "Bearer test-token", "Expected OpenAI-compatible auth header.");
	assert(seenXApiKey === "", "Expected Anthropic x-api-key header to be removed.");
	assert(seenBody.model === "future-openai-model", "Expected model to pass through.");
	assert(Predicate.isRecord(seenBody.response_format), "Expected Anthropic-unsupported field to pass through.");
	assert(body.model === "deepseek-v4-flash", "Expected upstream response body to pass through.");
});

Deno.test("falls back to Anthropic translation when passthrough returns a client error", async () => {
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

	const response = await app(
		createJsonRequest("/v1/chat/completions", {
			messages: [{ content: "Reply pong.", role: "user" }],
			model: "fallback-model",
		}),
	);
	const body = await readRecordAsync(response);
	const choices = getArray(body, "choices");
	const [firstChoice] = choices;

	assert(seenUrls[0] === "https://opencode.ai/zen/go/v1/chat/completions", "Expected passthrough probe first.");
	assert(seenUrls[1] === "https://opencode.ai/zen/go/v1/messages", "Expected Anthropic fallback second.");
	assert(Predicate.isRecord(firstChoice), "Expected first choice record.");
	assert(
		Predicate.isRecord(firstChoice.message) && firstChoice.message.content === "fallback:fallback-model",
		"Expected Anthropic fallback response.",
	);
});

Deno.test("maps upstream 400 errors to OpenAI-compatible errors", async () => {
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

	const response = await app(
		createJsonRequest("/v1/chat/completions", {
			messages: [{ content: "Hello", role: "user" }],
		}),
	);
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 400, "Expected upstream status to be preserved.");
	assert(error.message === "bad upstream request", "Expected upstream message.");
	assert(error.type === "invalid_request_error", "Expected client error type.");
});

Deno.test("normalizes Cerebras max_tokens and rejects unsupported fields", () => {
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
	const config = loadConfiguration({});

	assert(config.upstreamProtocol === "anthropic_messages", "Expected Anthropic protocol default.");
	assert(config.upstreamBaseUrl === "https://opencode.ai/zen/go/v1", "Expected OpenCode Go base URL.");
	assert(config.upstreamAuthHeader === "x-api-key", "Expected OpenCode Go x-api-key default.");
	assert(config.defaultModel === "minimax-m3", "Expected MiniMax M3 default.");
	assert(config.defaultMaxTokens === 4096, "Expected token default.");
});

Deno.test("loads Cerebras defaults", () => {
	const config = loadConfiguration({ UPSTREAM_PROTOCOL: "cerebras_openai" });

	assert(config.upstreamProtocol === "cerebras_openai", "Expected Cerebras protocol.");
	assert(config.upstreamBaseUrl === "https://api.cerebras.ai/v1", "Expected Cerebras base URL.");
	assert(config.upstreamAuthHeader === "Authorization", "Expected Cerebras Authorization default.");
	assert(config.defaultModel === "gpt-oss-120b", "Expected Cerebras default model.");
});
