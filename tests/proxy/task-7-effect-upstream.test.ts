import { logger } from "@logging/logger";
import { ProxyError } from "@proxy/errors";
import { fetchUpstreamJsonAsync } from "@proxy/upstream";
import { UpstreamTimeoutError } from "@proxy/upstream-errors";
import { Predicate } from "effect";

import { expectRecord } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "@proxy/config";
import type { Fetcher } from "@proxy/upstream";

const successFetcher: Fetcher = () => Promise.resolve(Response.json({ ok: true }));

const stringRejectingFetcher: Fetcher = () =>
	// oxlint-disable-next-line prefer-promise-reject-errors -- Covers upstream normalization of non-Error rejections.
	Promise.reject("string network failure");

const plainHttp500Fetcher: Fetcher = () => Promise.resolve(new Response("plain upstream failure", { status: 500 }));

function createNeverResolvingFetcher(): Fetcher {
	const deferred = Promise.withResolvers<Response>();
	return () => deferred.promise;
}

function createConfig(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
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
		upstreamBaseUrl: "https://upstream.example/v1",
		upstreamProtocol: "anthropic_messages",
		...overrides,
	};
}

function isUpstreamTimeoutError(error: unknown): error is UpstreamTimeoutError {
	return (
		error instanceof UpstreamTimeoutError || (Predicate.isRecord(error) && error._tag === "UpstreamTimeoutError")
	);
}

async function captureErrorAsync(callback: () => Promise<unknown>): Promise<Error> {
	try {
		await callback();
	} catch (error) {
		if (error instanceof Error) return error;
		throw error;
	}

	throw new Error("Expected Error.");
}

async function captureProxyErrorAsync(callback: () => Promise<unknown>): Promise<ProxyError> {
	const error = await captureErrorAsync(callback);
	if (error instanceof ProxyError) return error;

	throw error;
}

async function captureTimeoutErrorAsync(callback: () => Promise<unknown>): Promise<UpstreamTimeoutError> {
	const error = await captureErrorAsync(callback);
	if (isUpstreamTimeoutError(error)) return error;

	throw error;
}

test("Effect upstream POST returns parsed JSON on success", async () => {
	const response = await fetchUpstreamJsonAsync(
		successFetcher,
		"https://upstream.example/v1/messages?token=secret",
		new Headers(),
		{ message: "safe test body" },
		createConfig(),
	);
	const body = await response.json();

	expectRecord(body, "Expected response JSON object.");
	expect(body.ok, "Expected successful upstream JSON.").toBe(true);
});

test("Effect upstream POST timeout throws UpstreamTimeoutError", async () => {
	const fetcher = createNeverResolvingFetcher();

	const error = await captureTimeoutErrorAsync(() =>
		fetchUpstreamJsonAsync(
			fetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers(),
			{ message: "safe test body" },
			createConfig({ requestTimeoutMs: 10 }),
		),
	);

	expect(error.url, "Expected timeout URL.").toBe("https://upstream.example/v1/messages?token=secret");
	expect(error.timeoutMs, "Expected timeout duration.").toBe(10);
});

test("Effect upstream POST retries transient HTTP 500 then succeeds", async () => {
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

	expect(calls, "Expected one retry after HTTP 500.").toBe(2);
	expectRecord(body, "Expected response JSON object.");
	expect(body.ok, "Expected retry success JSON.").toBe(true);
});

test("Effect upstream POST does not retry client HTTP 400", async () => {
	let calls = 0;
	const fetcher: Fetcher = () => {
		calls += 1;
		return Promise.resolve(Response.json({ error: { message: "bad upstream request" } }, { status: 400 }));
	};

	const error = await captureProxyErrorAsync(() =>
		fetchUpstreamJsonAsync(
			fetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers(),
			{ message: "safe test body" },
			createConfig(),
		),
	);

	expect(calls, "Expected no retry for HTTP 400.").toBe(1);
	expect(error.status, "Expected upstream status to be preserved.").toBe(400);
	expect(error.message, "Expected upstream message to be preserved.").toBe("bad upstream request");
});

test("Effect upstream POST retries network failures then succeeds", async () => {
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

	expect(calls, "Expected one retry after network failure.").toBe(2);
	expectRecord(body, "Expected response JSON object.");
	expect(body.ok, "Expected retry success JSON.").toBe(true);
});

test("Effect upstream maps non-Error network failures to Error instances", async () => {
	const error = await captureErrorAsync(() =>
		fetchUpstreamJsonAsync(
			stringRejectingFetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers(),
			{ message: "safe test body" },
			createConfig({ requestTimeoutMs: 2_000 }),
		),
	);

	expect(error.message, "Expected string rejection to become Error message.").toBe("string network failure");
});

test("Effect upstream maps HTTP 500 text bodies without content type", async () => {
	const error = await captureProxyErrorAsync(() =>
		fetchUpstreamJsonAsync(
			plainHttp500Fetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers(),
			{ message: "safe test body" },
			createConfig(),
		),
	);

	expect(error.message, "Expected upstream text body message.").toBe("plain upstream failure");
	expect(error.status, "Expected upstream HTTP status.").toBe(500);
});

test("Effect upstream maps rejected HTTP error body reads to network errors", async () => {
	const response = new Response(null, { status: 500 });
	Object.defineProperty(response, "text", {
		// oxlint-disable-next-line prefer-promise-reject-errors -- Covers upstream normalization of body-read non-Error rejections.
		value: () => Promise.reject("body read failed"),
	});
	const fetcher: Fetcher = () => Promise.resolve(response);

	const error = await captureErrorAsync(() =>
		fetchUpstreamJsonAsync(
			fetcher,
			"https://upstream.example/v1/messages?token=secret",
			new Headers(),
			{ message: "safe test body" },
			createConfig({ requestTimeoutMs: 2_000 }),
		),
	);

	expect(error.message, "Expected body read rejection message.").toBe("body read failed");
});

test("Effect upstream logs only safe upstream metadata", async () => {
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

	expect(records.length, "Expected call and response logs.").toBe(2);
	const serializedLogs = JSON.stringify(records);
	expect(serializedLogs).toContain("/v1/messages");
	expect(!serializedLogs.includes("token=secret"), "Expected query string to be omitted from logs.").toBe(true);
	expect(!serializedLogs.includes("should-not-log"), "Expected body and token values to be omitted from logs.").toBe(
		true,
	);
	expect(!serializedLogs.includes("role"), "Expected role fields to be omitted from logs.").toBe(true);
	expect(!serializedLogs.includes("content"), "Expected content fields to be omitted from logs.").toBe(true);
	expect(serializedLogs).toContain("POST");
	expect(serializedLogs).toContain("200");
	expect(serializedLogs).toContain("latencyMs");
});

interface LogRecord {
	readonly message: unknown;
	readonly properties: unknown;
}
