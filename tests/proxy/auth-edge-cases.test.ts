import { expect, test } from "vitest";
import { createAuthContext } from "@proxy/auth";
import { ProxyError } from "@proxy/errors";

import type { ProxyConfiguration } from "@proxy/config";

const baseConfiguration: ProxyConfiguration = {
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "model",
	logLevel: "fatal",
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2_000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: "proxy-key",
	requestTimeoutMs: 60_000,
	upstreamApiKey: "upstream-key",
	upstreamAuthHeader: "x-api-key",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://upstream.test/v1",
	upstreamProtocol: "anthropic_messages",
};

function createConfiguration(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
	return { ...baseConfiguration, ...overrides };
}

function createRequest(authorization?: string): Request {
	const headers = new Headers();
	if (authorization !== undefined) headers.set("authorization", authorization);
	return new Request("https://proxy.test/v1/models", { headers });
}

function captureProxyError(callback: () => unknown): ProxyError {
	try {
		callback();
	} catch (error) {
		if (error instanceof ProxyError) return error;
		throw error;
	}

	throw new Error("Expected ProxyError.");
}

function expectProxyError(callback: () => unknown, status: number, type: string): void {
	const error = captureProxyError(callback);

	expect(error.status, "Expected ProxyError status.").toBe(status);
	expect(error.type, "Expected ProxyError type.").toBe(type);
}

test("client_bearer mode accepts mixed-case bearer tokens and x-api-key upstream auth", () => {
	expect.hasAssertions();
	const context = createAuthContext(createRequest("  BeArEr client-token  "), baseConfiguration);

	expect(context.upstreamHeaders.get("content-type"), "Expected JSON content type.").toBe("application/json");
	expect(context.upstreamHeaders.get("x-api-key"), "Expected client token forwarding.").toBe("client-token");
});

test("client_bearer mode rejects missing, empty, and non-bearer authorization", () => {
	expect.hasAssertions();
	for (const authorization of [undefined, "", "Basic abc", "Bearer   "]) {
		expectProxyError(
			() => createAuthContext(createRequest(authorization), baseConfiguration),
			401,
			"authentication_error",
		);
	}
});

test("server_key mode validates required proxy and upstream keys", () => {
	expect.hasAssertions();
	expectProxyError(
		() =>
			createAuthContext(
				createRequest("Bearer proxy-key"),
				createConfiguration({
					proxyApiKey: undefined,
					upstreamAuthMode: "server_key",
				}),
			),
		500,
		"configuration_error",
	);
	expectProxyError(
		() =>
			createAuthContext(
				createRequest("Bearer proxy-key"),
				createConfiguration({
					upstreamApiKey: undefined,
					upstreamAuthMode: "server_key",
				}),
			),
		500,
		"configuration_error",
	);
});

test("server_key mode rejects missing bearer token before timing-safe comparison", () => {
	expect.hasAssertions();
	expectProxyError(
		() =>
			createAuthContext(
				createRequest(),
				createConfiguration({
					upstreamAuthMode: "server_key",
				}),
			),
		401,
		"authentication_error",
	);
});

test("server_key mode emits Authorization bearer header when configured", () => {
	expect.hasAssertions();
	const context = createAuthContext(
		createRequest("Bearer proxy-key"),
		createConfiguration({
			upstreamAuthHeader: "Authorization",
			upstreamAuthMode: "server_key",
		}),
	);

	expect(context.upstreamHeaders.get("authorization"), "Expected upstream bearer auth header.").toBe(
		"Bearer upstream-key",
	);
});
