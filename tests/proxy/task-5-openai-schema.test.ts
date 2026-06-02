import { createApp } from "@proxy/app.ts";
import { Predicate } from "effect";

import { assert } from "../utilities/test-utilities.ts";

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

Deno.test("rejects request bodies missing messages", async () => {
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});
	const response = await app(createJsonRequest({ model: "minimax-m3" }));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 400, "Expected missing messages to fail.");
	assert(typeof error.message === "string", "Expected error message.");
});

Deno.test("rejects request bodies with non-array messages", async () => {
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});
	const response = await app(createJsonRequest({ messages: "not an array" }));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 400, "Expected non-array messages to fail.");
	assert(typeof error.message === "string", "Expected error message.");
});

Deno.test("rejects request bodies with empty messages arrays", async () => {
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});
	const response = await app(createJsonRequest({ messages: [] }));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 400, "Expected empty messages to fail.");
	assert(typeof error.message === "string", "Expected error message.");
});

Deno.test("rejects empty request bodies", async () => {
	const app = createApp({
		fetcher: () => Promise.reject(new Error("fetch should not be called")),
		proxyConfiguration: createConfiguration(),
	});
	const response = await app(createJsonRequest({}));
	const body = await readRecordAsync(response);
	const error = getRecord(body, "error");

	assert(response.status === 400, "Expected empty body to fail.");
	assert(typeof error.message === "string", "Expected error message.");
});
