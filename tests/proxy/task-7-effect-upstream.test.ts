// oxlint-disable typescript/only-throw-error no-throw-literal -- coal!
import { expect, it, describe } from "vitest";
import { logger } from "$logging/logger";
import { ProxyError } from "$proxy/errors";
import { fetchUpstreamGetAsync, fetchUpstreamJsonAsync } from "$proxy/upstream";
import { UpstreamTimeoutError } from "$proxy/upstream-errors";
import { Predicate } from "effect";

import { expectRecord } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "$proxy/config";
import type { Fetcher } from "$proxy/upstream";

const successFetcher: Fetcher = async () => Response.json({ ok: true });

const stringRejectingFetcher: Fetcher = async () => {
	throw "string network failure";
};

const plainHttp500Fetcher: Fetcher = async () => new Response("plain upstream failure", { status: 500 });

function createNeverResolvingFetcher(): Fetcher {
	const deferred = Promise.withResolvers<Response>();
	return async () => deferred.promise;
}

function createHttp500ThenSuccessFetcher(getCalls: (calls: number) => void): Fetcher {
	let calls = 0;
	return async () => {
		calls += 1;
		getCalls(calls);
		if (calls === 1) {
			return Response.json({ error: { message: "temporary upstream failure" } }, { status: 500 });
		}
		return Response.json({ ok: true });
	};
}

function createNetworkFailureThenSuccessFetcher(getCalls: (calls: number) => void): Fetcher {
	let calls = 0;
	return async () => {
		calls += 1;
		getCalls(calls);
		if (calls === 1) throw new TypeError("temporary network failure");
		return Response.json({ ok: true });
	};
}

function createConfig(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
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
		upstreamBaseUrl: "https://upstream.example/v1",
		upstreamErrorTransparency: true,
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

	const error = new Error("Expected Error.");
	Error.captureStackTrace(error, captureErrorAsync);
	throw error;
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

describe("effect upstream", () => {
	it("effect upstream POST returns parsed JSON on success", async () => {
		expect.assertions(7);
		let requestInit: RequestInit | undefined;
		const fetcher: Fetcher = async (_input, init) => {
			requestInit = init;
			return Response.json({ ok: true });
		};

		const response = await fetchUpstreamJsonAsync({
			body: { message: "safe test body" },
			fetcher,
			headers: new Headers({ authorization: "Bearer test-token" }),
			proxyConfiguration: createConfig(),
			url: "https://upstream.example/v1/messages?token=secret",
		});
		const body = await response.json();

		expect(requestInit?.method, "Expected JSON upstream call to use POST.").toBe("POST");
		expect(requestInit?.body, "Expected JSON upstream body to be serialized exactly once.").toBe(
			'{"message":"safe test body"}',
		);
		expect(requestInit?.headers, "Expected caller headers to be forwarded.").toBeInstanceOf(Headers);
		const headers = requestInit?.headers;
		expect(headers, "Expected request headers to be present.").toBeInstanceOf(Headers);
		expect((headers as Headers).get("authorization"), "Expected authorization header to be forwarded.").toBe(
			"Bearer test-token",
		);
		expectRecord(body, "Expected response JSON object.");
		expect(body.ok, "Expected successful upstream JSON.").toBe(true);
	});

	it("effect upstream GET forwards headers without a body", async () => {
		expect.assertions(6);
		let requestInit: RequestInit | undefined;
		const fetcher: Fetcher = async (_input, init) => {
			requestInit = init;
			return Response.json({ data: [] });
		};

		const response = await fetchUpstreamGetAsync({
			fetcher,
			headers: new Headers({ authorization: "Bearer model-token" }),
			proxyConfiguration: createConfig(),
			url: "https://upstream.example/v1/models?token=secret",
		});
		const body = await response.json();

		expect(requestInit?.method, "Expected model list upstream call to use GET.").toBe("GET");
		expect(requestInit?.body, "Expected GET upstream call to omit body.").toBeUndefined();
		const headers = requestInit?.headers;
		expect(headers, "Expected request headers to be present.").toBeInstanceOf(Headers);
		expect((headers as Headers).get("authorization"), "Expected authorization header to be forwarded.").toBe(
			"Bearer model-token",
		);
		expectRecord(body, "Expected response JSON object.");
		expect(body.data, "Expected response payload to be preserved.").toStrictEqual([]);
	});

	it("effect upstream POST timeout throws UpstreamTimeoutError", async () => {
		expect.assertions(2);
		const fetcher = createNeverResolvingFetcher();

		const error = await captureTimeoutErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher,
				headers: new Headers(),
				proxyConfiguration: createConfig({ requestTimeoutMs: 10 }),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error.url, "Expected timeout URL.").toBe("https://upstream.example/v1/messages?token=secret");
		expect(error.timeoutMs, "Expected timeout duration.").toBe(10);
	});

	it("effect upstream POST retries transient HTTP 500 then succeeds", async () => {
		expect.assertions(3);
		let calls = 0;
		const fetcher = createHttp500ThenSuccessFetcher((callCount) => {
			calls = callCount;
		});

		const response = await fetchUpstreamJsonAsync({
			body: { message: "safe test body" },
			fetcher,
			headers: new Headers(),
			proxyConfiguration: createConfig(),
			url: "https://upstream.example/v1/messages?token=secret",
		});
		const body = await response.json();

		expect(calls, "Expected one retry after HTTP 500.").toBe(2);
		expectRecord(body, "Expected response JSON object.");
		expect(body.ok, "Expected retry success JSON.").toBe(true);
	});

	it("effect upstream POST does not retry client HTTP 400", async () => {
		expect.assertions(3);
		let calls = 0;
		const fetcher: Fetcher = async () => {
			calls += 1;
			return Response.json({ error: { message: "bad upstream request" } }, { status: 400 });
		};

		const error = await captureProxyErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher,
				headers: new Headers(),
				proxyConfiguration: createConfig(),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(calls, "Expected no retry for HTTP 400.").toBe(1);
		expect(error.status, "Expected upstream status to be preserved.").toBe(400);
		expect(error.message, "Expected upstream message to be preserved.").toBe("bad upstream request");
	});

	it("effect upstream POST maps HTTP 500 JSON errors while preserving content type", async () => {
		expect.assertions(3);
		const error = await captureProxyErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher: async () =>
					Response.json({ error: { code: "overloaded", message: "provider overloaded" } }, { status: 500 }),
				headers: new Headers(),
				proxyConfiguration: createConfig(),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error.message, "Expected JSON upstream error message.").toBe("provider overloaded");
		expect(error.status, "Expected upstream HTTP status.").toBe(500);
		expect(error.code, "Expected upstream error code.").toBe("overloaded");
	});

	it("effect upstream POST retries network failures then succeeds", async () => {
		expect.assertions(3);
		let calls = 0;
		const fetcher = createNetworkFailureThenSuccessFetcher((callCount) => {
			calls = callCount;
		});

		const response = await fetchUpstreamJsonAsync({
			body: { message: "safe test body" },
			fetcher,
			headers: new Headers(),
			proxyConfiguration: createConfig(),
			url: "https://upstream.example/v1/messages?token=secret",
		});
		const body = await response.json();

		expect(calls, "Expected one retry after network failure.").toBe(2);
		expectRecord(body, "Expected response JSON object.");
		expect(body.ok, "Expected retry success JSON.").toBe(true);
	});

	it("effect upstream maps non-Error network failures to Error instances", async () => {
		expect.assertions(1);
		const error = await captureErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher: stringRejectingFetcher,
				headers: new Headers(),
				proxyConfiguration: createConfig({ requestTimeoutMs: 2000 }),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error.message, "Expected string rejection to become Error message.").toBe("string network failure");
	});

	it("effect upstream maps HTTP 500 text bodies without content type", async () => {
		expect.assertions(2);
		const error = await captureProxyErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher: plainHttp500Fetcher,
				headers: new Headers(),
				proxyConfiguration: createConfig(),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error.message, "Expected upstream text body message.").toBe("plain upstream failure");
		expect(error.status, "Expected upstream HTTP status.").toBe(500);
	});

	it("effect upstream maps HTTP 500 empty bodies without content type", async () => {
		expect.assertions(2);
		const error = await captureProxyErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher: async () => new Response(null, { status: 500 }),
				headers: new Headers(),
				proxyConfiguration: createConfig(),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error.message, "Expected empty upstream body fallback message.").toBe(
			"Upstream request failed with HTTP 500.",
		);
		expect(error.status, "Expected upstream HTTP status.").toBe(500);
	});

	it("effect upstream maps rejected HTTP error body reads to network errors", async () => {
		expect.assertions(1);
		const response = new Response(null, { status: 500 });
		Object.defineProperty(response, "text", {
			value: async () => {
				throw "body read failed";
			},
		});
		const fetcher: Fetcher = async () => response;

		const error = await captureErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher,
				headers: new Headers(),
				proxyConfiguration: createConfig({ requestTimeoutMs: 2000 }),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error.message, "Expected body read rejection message.").toBe("body read failed");
	});

	it("effect upstream maps rejected client error parsing to thrown Error instances", async () => {
		expect.assertions(2);
		const expectedError = new Error("client error body failed");
		const response = new Response(null, { status: 400 });
		Object.defineProperty(response, "text", {
			value: async () => {
				throw expectedError;
			},
		});
		const fetcher: Fetcher = async () => response;

		const error = await captureErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher,
				headers: new Headers(),
				proxyConfiguration: createConfig({ requestTimeoutMs: 2000 }),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error, "Expected body parsing failure to throw an Error.").toBeInstanceOf(Error);
		expect(error.message, "Expected body parsing Error message to be preserved.").toBe(expectedError.message);
	});

	it("effect upstream maps non-Error client error parsing failures to Error instances", async () => {
		expect.assertions(2);
		const response = new Response(null, { status: 400 });
		Object.defineProperty(response, "text", {
			value: async () => {
				// oxlint-disable-next-line typescript/only-throw-error no-throw-literal -- What?
				throw "client body read failed";
			},
		});
		const fetcher: Fetcher = async () => response;

		const error = await captureErrorAsync(async () =>
			fetchUpstreamJsonAsync({
				body: { message: "safe test body" },
				fetcher,
				headers: new Headers(),
				proxyConfiguration: createConfig({ requestTimeoutMs: 2000 }),
				url: "https://upstream.example/v1/messages?token=secret",
			}),
		);

		expect(error, "Expected non-Error body parsing failure to become an Error.").toBeInstanceOf(Error);
		expect(error.message, "Expected non-Error body parsing failure message.").toBe("client body read failed");
	});

	it("effect upstream logs only safe upstream metadata", async () => {
		expect.assertions(9);
		const records = new Array<LogRecord>();
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
			await fetchUpstreamJsonAsync({
				body: { messages: [{ content: "should-not-log", role: "user" }] },
				fetcher: successFetcher,
				headers: new Headers({ authorization: "Bearer should-not-log" }),
				proxyConfiguration: createConfig(),
				url: "https://upstream.example/v1/messages?token=secret",
			});
		} finally {
			Object.defineProperty(logger, "info", { configurable: true, value: originalInfo });
			Object.defineProperty(logger, "error", { configurable: true, value: originalError });
		}

		expect(records).toHaveLength(2);
		const serializedLogs = JSON.stringify(records);
		expect(serializedLogs).toContain("/v1/messages");
		expect(!serializedLogs.includes("token=secret"), "Expected query string to be omitted from logs.").toBe(true);
		expect(
			!serializedLogs.includes("should-not-log"),
			"Expected body and token values to be omitted from logs.",
		).toBe(true);
		expect(!serializedLogs.includes("role"), "Expected role fields to be omitted from logs.").toBe(true);
		expect(!serializedLogs.includes("content"), "Expected content fields to be omitted from logs.").toBe(true);
		expect(serializedLogs).toContain("POST");
		expect(serializedLogs).toContain("200");
		expect(serializedLogs).toContain("latencyMs");
	});

	it("effect upstream error logs include safe method, path, and status only", async () => {
		expect.assertions(3);
		const records = new Array<LogRecord>();
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
			await captureProxyErrorAsync(async () =>
				fetchUpstreamJsonAsync({
					body: { messages: [{ content: "should-not-log", role: "user" }] },
					fetcher: async () => Response.json({ error: { message: "invalid request" } }, { status: 400 }),
					headers: new Headers({ authorization: "Bearer should-not-log" }),
					proxyConfiguration: createConfig(),
					url: "https://upstream.example/v1/messages?token=secret",
				}),
			);
		} finally {
			Object.defineProperty(logger, "info", { configurable: true, value: originalInfo });
			Object.defineProperty(logger, "error", { configurable: true, value: originalError });
		}

		expect(records, "Expected call and error logs.").toStrictEqual([
			{
				message: "upstream call",
				properties: { method: "POST", url: "/v1/messages" },
			},
			{
				message: "upstream error",
				properties: {
					latencyMs: expect.any(Number),
					method: "POST",
					status: 400,
					url: "/v1/messages",
				},
			},
		]);
		const serializedLogs = JSON.stringify(records);
		expect(!serializedLogs.includes("token=secret"), "Expected query string to be omitted from error logs.").toBe(
			true,
		);
		expect(
			!serializedLogs.includes("should-not-log"),
			"Expected body and token values to be omitted from error logs.",
		).toBe(true);
	});
});

interface LogRecord {
	readonly message: unknown;
	readonly properties: unknown;
}
