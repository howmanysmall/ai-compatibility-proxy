import { logger } from "../../src/logging/logger.ts";
import { ProxyError } from "../../src/proxy/errors.ts";
import { UpstreamTimeoutError } from "../../src/proxy/upstream-errors.ts";
import { fetchUpstreamJsonAsync } from "../../src/proxy/upstream.ts";

import type { ProxyConfig } from "../../src/proxy/config.ts";
import type { Fetcher } from "../../src/proxy/upstream.ts";

declare const Deno: {
	readonly test: (name: string, fn: () => void | Promise<void>) => void;
};

const successFetcher: Fetcher = () => Promise.resolve(Response.json({ ok: true }));

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function assertEquals<Value>(actual: Value, expected: Value, message: string): void {
	if (actual !== expected) throw new Error(`${message} Expected ${String(expected)}, got ${String(actual)}.`);
}

function createNeverResolvingFetcher(): Fetcher {
	const deferred = Promise.withResolvers<Response>();
	return () => deferred.promise;
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
		upstreamBaseUrl: "https://upstream.example/v1",
		upstreamProtocol: "anthropic_messages",
		...overrides,
	};
}

Deno.test("Effect upstream POST returns parsed JSON on success", async () => {
	const response = await fetchUpstreamJsonAsync(
		successFetcher,
		"https://upstream.example/v1/messages?token=secret",
		new Headers(),
		{ message: "safe test body" },
		createConfig(),
	);
	const body = await response.json();

	assert(isRecord(body), "Expected response JSON object.");
	assertEquals(body["ok"], true, "Expected successful upstream JSON.");
});

Deno.test("Effect upstream POST timeout throws UpstreamTimeoutError", async () => {
	const fetcher = createNeverResolvingFetcher();

	try {
		await fetchUpstreamJsonAsync(
			fetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers(),
			{ message: "safe test body" },
			createConfig({ requestTimeoutMs: 10 }),
		);
	} catch (error) {
		assert(error instanceof UpstreamTimeoutError, "Expected an UpstreamTimeoutError.");
		assertEquals(error.url, "https://upstream.example/v1/messages?token=secret", "Expected timeout URL.");
		assertEquals(error.timeoutMs, 10, "Expected timeout duration.");
		return;
	}

	throw new Error("Expected timeout to throw.");
});

Deno.test("Effect upstream POST retries transient HTTP 500 then succeeds", async () => {
	let calls = 0;
	const fetcher: Fetcher = () => {
		calls += 1;
		if (calls === 1) {
			return Promise.resolve(
				Response.json({ error: { message: "temporary upstream failure" } }, { status: 500 }),
			);
		}
		return Promise.resolve(Response.json({ ok: true }));
	};

	const response = await fetchUpstreamJsonAsync(
		fetcher,
		"https://upstream.example/v1/messages?token=secret",
		new Headers(),
		{ message: "safe test body" },
		createConfig(),
	);
	const body = await response.json();

	assertEquals(calls, 2, "Expected one retry after HTTP 500.");
	assert(isRecord(body), "Expected response JSON object.");
	assertEquals(body["ok"], true, "Expected retry success JSON.");
});

Deno.test("Effect upstream POST does not retry client HTTP 400", async () => {
	let calls = 0;
	const fetcher: Fetcher = () => {
		calls += 1;
		return Promise.resolve(Response.json({ error: { message: "bad upstream request" } }, { status: 400 }));
	};

	try {
		await fetchUpstreamJsonAsync(
			fetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers(),
			{ message: "safe test body" },
			createConfig(),
		);
	} catch (error) {
		assert(error instanceof ProxyError, "Expected upstream 400 to throw ProxyError.");
		assertEquals(calls, 1, "Expected no retry for HTTP 400.");
		assertEquals(error.status, 400, "Expected upstream status to be preserved.");
		assertEquals(error.message, "bad upstream request", "Expected upstream message to be preserved.");
		return;
	}

	throw new Error("Expected upstream 400 to throw.");
});

Deno.test("Effect upstream POST retries network failures then succeeds", async () => {
	let calls = 0;
	const fetcher: Fetcher = () => {
		calls += 1;
		if (calls === 1) return Promise.reject(new TypeError("temporary network failure"));
		return Promise.resolve(Response.json({ ok: true }));
	};

	const response = await fetchUpstreamJsonAsync(
		fetcher,
		"https://upstream.example/v1/messages?token=secret",
		new Headers(),
		{ message: "safe test body" },
		createConfig(),
	);
	const body = await response.json();

	assertEquals(calls, 2, "Expected one retry after network failure.");
	assert(isRecord(body), "Expected response JSON object.");
	assertEquals(body["ok"], true, "Expected retry success JSON.");
});

Deno.test("Effect upstream logs only safe upstream metadata", async () => {
	const records: Array<LogRecord> = [];
	const originalInfo = logger.info;
	const originalError = logger.error;
	Object.defineProperty(logger, "info", {
		configurable: true,
		value: (message: unknown, properties?: unknown) => {
			records.push({ message, properties });
		},
	});
	Object.defineProperty(logger, "error", {
		configurable: true,
		value: (message: unknown, properties?: unknown) => {
			records.push({ message, properties });
		},
	});

	try {
		await fetchUpstreamJsonAsync(
			successFetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers({ authorization: "Bearer should-not-log" }),
			{ messages: [{ content: "should-not-log", role: "user" }] },
			createConfig(),
		);
	} finally {
		Object.defineProperty(logger, "info", { configurable: true, value: originalInfo });
		Object.defineProperty(logger, "error", { configurable: true, value: originalError });
	}

	assertEquals(records.length, 2, "Expected call and response logs.");
	const serializedLogs = JSON.stringify(records);
	assert(serializedLogs.includes("/v1/messages"), "Expected path-only upstream URL in logs.");
	assert(!serializedLogs.includes("token=secret"), "Expected query string to be omitted from logs.");
	assert(!serializedLogs.includes("should-not-log"), "Expected body and token values to be omitted from logs.");
	assert(!serializedLogs.includes("role"), "Expected role fields to be omitted from logs.");
	assert(!serializedLogs.includes("content"), "Expected content fields to be omitted from logs.");
	assert(serializedLogs.includes("POST"), "Expected method to be logged.");
	assert(serializedLogs.includes("200"), "Expected status to be logged.");
	assert(serializedLogs.includes("latencyMs"), "Expected latency to be logged.");
});

interface LogRecord {
	readonly message: unknown;
	readonly properties: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && Boolean(value) && !Array.isArray(value);
}
