import { expect, describe, it } from "vitest";
import { createFetchHandler } from "$proxy/app";
import { Predicate } from "effect";

import { expectArray, expectRecord, getInitHeader } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "$proxy/config";

function createConfiguration(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
	return {
		allowedUpstreamHosts: [],
		cerebrasDropUnsupportedFields: true,
		cerebrasStrictRequestValidation: true,
		defaultMaxTokens: 4096,
		defaultModel: "minimax-m3",
		logLevel: "fatal",
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

function getInitHeaderOrEmpty(init: RequestInit | undefined, name: string): string {
	return getInitHeader(init, name) ?? "";
}

describe("fetch handler", () => {
	it("fetch handler returns health status", async () => {
		expect.assertions(3);
		const handler = createFetchHandler({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(new Request("http://localhost/health"));
		const body = await readRecordAsync(response);

		expect(response.status, "Expected health route to succeed.").toBe(200);
		expect(body.status, "Expected health status.").toBe("ok");
		expect(body.upstream_protocol, "Expected configured upstream protocol.").toBe("anthropic_messages");
	});

	it("fetch handler proxies model list", async () => {
		expect.assertions(5);
		let seenUrl = "";
		let seenAuthorization = "";
		const handler = createFetchHandler({
			fetcher: async (input, init) => {
				seenUrl = String(input);
				seenAuthorization = getInitHeaderOrEmpty(init, "authorization");
				return Response.json({
					data: [{ created: 0, id: "minimax-m3", object: "model", owned_by: "opencode" }],
					object: "list",
				});
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

		expect(seenUrl, "Expected /models upstream URL.").toBe("https://opencode.ai/zen/go/v1/models");
		expect(seenAuthorization, "Expected client bearer forwarding.").toBe("Bearer upstream-key");
		expectArray(data, "Expected model data array.");
		expectRecord(data[0], "Expected first model record.");
		expect(data[0].id, "Expected model id.").toBe("minimax-m3");
	});

	it("fetch handler proxies chat completions", async () => {
		expect.assertions(3);
		let seenUrl = "";
		const handler = createFetchHandler({
			fetcher: async (input) => {
				seenUrl = String(input);
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
					model: "gpt-oss-120b",
					object: "chat.completion",
				});
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

		expect(response.status, "Expected chat completion to succeed.").toBe(200);
		expect(seenUrl, "Expected OpenAI-compatible upstream URL.").toBe("https://api.cerebras.ai/v1/chat/completions");
		expect(body.object, "Expected OpenAI-compatible chat completion.").toBe("chat.completion");
	});

	it("fetch handler returns OpenAI-compatible not found errors", async () => {
		expect.assertions(3);
		const handler = createFetchHandler({
			fetcher: async () => {
				throw new Error("fetch should not be called");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(new Request("http://localhost/not-found"));
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected missing route to fail with 404.").toBe(404);
		expect(error.message, "Expected route not found message.").toBe("Route not found.");
		expect(error.type, "Expected OpenAI-compatible error type.").toBe("invalid_request_error");
	});

	it("fetch handler maps thrown errors", async () => {
		expect.assertions(3);
		const handler = createFetchHandler({
			fetcher: async () => {
				throw new Error("upstream exploded");
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			new Request("http://localhost/v1/models", {
				headers: { authorization: "Bearer upstream-key" },
			}),
		);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");

		expect(response.status, "Expected thrown error to map to 500.").toBe(500);
		expect(error.message, "Expected generic server error.").toBe("Internal server error");
		expect(error.type, "Expected server error type.").toBe("server_error");
	});

	it("fetch handler passes streaming responses through without buffering", async () => {
		expect.assertions(4);
		const streamText = 'data: {"choices":[{"delta":{"content":"Hi"},"index":0}]}\n\n';
		const handler = createFetchHandler({
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

		const response = await handler(
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

	it("request body exceeds limit via Content-Length", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration({ maxRequestBodySizeBytes: 10 }),
		});

		const response = await handler(
			new Request("http://localhost/v1/chat/completions", {
				body: JSON.stringify({ messages: [{ content: "Hello", role: "user" }] }),
				headers: {
					authorization: "Bearer test-token",
					"content-length": "100",
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(413);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected oversized Content-Length rejection.").toContain(
			"exceeds maximum allowed size",
		);
	});

	it("request body exceeds limit via stream", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration({ maxRequestBodySizeBytes: 5 }),
		});

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller): void {
				controller.enqueue(encoder.encode("some long text here"));
				controller.close();
			},
		});
		const requestInitialization: RequestInit & { duplex: "half" } = {
			body: stream,
			duplex: "half",
			headers: {
				authorization: "Bearer test-token",
				"content-type": "application/json",
			},
			method: "POST",
		};

		const response = await handler(new Request("http://localhost/v1/chat/completions", requestInitialization));

		expect(response.status).toBe(413);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected stream-size rejection.").toContain("exceeds maximum allowed size");
	});

	it("request body is empty", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			new Request("http://localhost/v1/chat/completions", {
				body: null,
				headers: {
					authorization: "Bearer test-token",
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(400);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected empty-body rejection.").toContain("body is empty");
	});

	it("request body has invalid JSON", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			new Request("http://localhost/v1/chat/completions", {
				body: "{ invalid json",
				headers: {
					authorization: "Bearer test-token",
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(400);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected JSON parse rejection.").toContain(
			"Failed to parse request body as JSON",
		);
	});

	it("message count exceeds limit", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration(),
		});

		const messages = Array.from({ length: 2049 }, () => ({ content: "hi", role: "user" }));
		const response = await handler(createJsonRequest("/v1/chat/completions", { messages }));

		expect(response.status).toBe(400);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected message-count rejection.").toContain(
			"Message count exceeds maximum allowed limit",
		);
	});

	it("message content string exceeds limit", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: "a".repeat(524_289), role: "user" }],
			}),
		);

		expect(response.status).toBe(400);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected content-length rejection.").toContain(
			"exceeds maximum allowed limit of 524288 characters",
		);
	});

	it("message content part text exceeds limit", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: [{ text: "a".repeat(524_289), type: "text" }], role: "user" }],
			}),
		);

		expect(response.status).toBe(400);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected part-text-length rejection.").toContain(
			"exceeds maximum allowed limit of 524288 characters",
		);
	});

	it("request body with invalid Content-Length header", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			new Request("http://localhost/v1/chat/completions", {
				body: JSON.stringify({ messages: [{ content: "Hello", role: "user" }] }),
				headers: {
					authorization: "Bearer test-token",
					"content-length": "not-a-number",
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(413);
		const body = await readRecordAsync(response);
		const error = getRecord(body, "error");
		expect(String(error.message), "Expected invalid Content-Length rejection.").toContain(
			"exceeds maximum allowed size",
		);
	});

	it("request with empty message content does not fail validation", async () => {
		expect.assertions(1);
		const handler = createFetchHandler({
			fetcher: async () => Response.json({ choices: [] }),
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: null, role: "user" }],
			}),
		);

		expect(response.status).toBe(200);
	});

	it("request with non-text content part in array does not fail length validation", async () => {
		expect.assertions(1);
		const handler = createFetchHandler({
			fetcher: async () => Response.json({ choices: [] }),
			proxyConfiguration: createConfiguration(),
		});

		const response = await handler(
			createJsonRequest("/v1/chat/completions", {
				messages: [{ content: [{ some_other_field: 123 }], role: "user" }],
			}),
		);

		expect(response.status).toBe(200);
	});

	it("request with valid Content-Length header within limit succeeds", async () => {
		expect.assertions(1);
		const handler = createFetchHandler({
			fetcher: async () => Response.json({ choices: [] }),
			proxyConfiguration: createConfiguration({ maxRequestBodySizeBytes: 1000 }),
		});

		const response = await handler(
			new Request("http://localhost/v1/chat/completions", {
				body: JSON.stringify({ messages: [{ content: "Hello", role: "user" }] }),
				headers: {
					authorization: "Bearer test-token",
					"content-length": "56",
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);

		expect(response.status).toBe(200);
	});
});
