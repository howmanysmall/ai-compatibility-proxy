import { createFetchHandler } from "@proxy/app.ts";
import { Predicate } from "effect";

import { assert, getInitHeader } from "../utilities/test-utilities.ts";

import type { ProxyConfiguration } from "@proxy/config.ts";

function createConfiguration(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
	return {
		cerebrasDropUnsupportedFields: true,
		cerebrasStrictRequestValidation: true,
		defaultMaxTokens: 4096,
		defaultModel: "minimax-m3",
		logLevel: "fatal",
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

Deno.test("fetch handler returns health status", async () => {
	const handler = createFetchHandler({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});

	const response = await handler(new Request("http://localhost/health"));
	const body = await readRecordAsync(response);

	assert(response.status === 200, "Expected health route to succeed.");
	assert(body.status === "ok", "Expected health status.");
	assert(body.upstream_protocol === "anthropic_messages", "Expected configured upstream protocol.");
});

Deno.test("fetch handler proxies model list", async () => {
	let seenUrl = "";
	let seenAuthorization = "";
	const handler = createFetchHandler({
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

	const response = await handler(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer upstream-key" },
		}),
	);
	const body = await readRecordAsync(response);
	const { data } = body;

	assert(seenUrl === "https://opencode.ai/zen/go/v1/models", "Expected /models upstream URL.");
	assert(seenAuthorization === "Bearer upstream-key", "Expected client bearer forwarding.");
	assert(Array.isArray(data), "Expected model data array.");
	assert(Predicate.isRecord(data[0]) && data[0].id === "minimax-m3", "Expected model id.");
});

Deno.test("fetch handler proxies chat completions", async () => {
	let seenUrl = "";
	const handler = createFetchHandler({
		fetcher: (input) => {
			seenUrl = String(input);
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
					model: "gpt-oss-120b",
					object: "chat.completion",
				}),
			);
		},
		proxyConfiguration: createConfiguration({
			defaultModel: "gpt-oss-120b",
			upstreamBaseUrl: "https://api.cerebras.ai/v1",
			upstreamProtocol: "cerebras_openai",
		}),
	});

	const response = await handler(
		createJsonRequest("/v1/chat/completions", {
			messages: [{ content: "Reply pong.", role: "user" }],
		}),
	);
	const body = await readRecordAsync(response);

	assert(response.status === 200, "Expected chat completion to succeed.");
	assert(seenUrl === "https://api.cerebras.ai/v1/chat/completions", "Expected OpenAI-compatible upstream URL.");
	assert(body.object === "chat.completion", "Expected OpenAI-compatible chat completion.");
});

Deno.test("fetch handler returns OpenAI-compatible not found errors", async () => {
	const handler = createFetchHandler({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});

	const response = await handler(new Request("http://localhost/not-found"));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 404, "Expected missing route to fail with 404.");
	assert(error.message === "Route not found.", "Expected route not found message.");
	assert(error.type === "invalid_request_error", "Expected OpenAI-compatible error type.");
});

Deno.test("fetch handler maps thrown errors", async () => {
	const handler = createFetchHandler({
		fetcher: () => Promise.reject(new Error("upstream exploded")),
		proxyConfiguration: createConfiguration(),
	});

	const response = await handler(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer upstream-key" },
		}),
	);
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 500, "Expected thrown error to map to 500.");
	assert(error.message === "Internal server error", "Expected generic server error.");
	assert(error.type === "server_error", "Expected server error type.");
});

Deno.test("fetch handler passes streaming responses through without buffering", async () => {
	const streamText = 'data: {"choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n';
	const handler = createFetchHandler({
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

	const response = await handler(
		createJsonRequest("/v1/chat/completions", {
			messages: [{ content: "Hello", role: "user" }],
			stream: true,
		}),
	);

	assert(response.status === 200, "Expected streaming response to succeed.");
	assert(response.headers.get("content-type") === "text/event-stream", "Expected upstream content type.");
	assert(response.headers.get("x-upstream-stream") === "raw", "Expected upstream headers to pass through.");
	assert((await response.text()) === streamText, "Expected raw stream body to pass through.");
});
