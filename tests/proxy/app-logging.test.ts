import { expect, it, describe } from "vitest";
import { createFetchHandler, createFetchHandlerForApp } from "$proxy/app";

import type { ProxyConfiguration } from "$proxy/config";

const configuration: ProxyConfiguration = {
	allowedUpstreamHosts: [],
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "model",
	logLevel: "info",
	maxRequestBodySizeBytes: 1_048_576,
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "x-api-key",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://upstream.test/v1",
	upstreamErrorTransparency: true,
	upstreamProtocol: "anthropic_messages",
};

describe("app logging", () => {
	it("createFetchHandler logs non-fatal successful requests", async () => {
		expect.assertions(2);
		const handler = createFetchHandler({ proxyConfiguration: configuration });
		const response = await handler(new Request("https://proxy.test/health"));
		const body = await response.json();

		expect(response.status, "Expected health status.").toBe(200);
		expect(body, "Expected health response body.").toStrictEqual({
			status: "ok",
			upstream_protocol: "anthropic_messages",
		});
	});

	it("createFetchHandlerForApp maps thrown fetch errors in fatal mode", async () => {
		expect.assertions(2);
		const handler = createFetchHandlerForApp(
			{
				fetch: () => {
					const error = new Error("unexpected fatal fetch failure");
					Error.captureStackTrace(error, fetch);
					throw error;
				},
			},
			"fatal",
		);

		const response = await handler(new Request("https://proxy.test/health"));
		const body = await response.json();

		expect(response.status, "Expected thrown fatal fetch errors to become 500 responses.").toBe(500);
		expect(body).toMatchObject({
			error: {
				message: "Internal server error",
				type: "server_error",
			},
		});
	});

	it("createFetchHandlerForApp logs and maps thrown fetch errors in non-fatal mode", async () => {
		expect.assertions(2);
		const handler = createFetchHandlerForApp(
			{
				fetch: () => {
					const error = new Error("unexpected logged fetch failure");
					Error.captureStackTrace(error, fetch);
					throw error;
				},
			},
			"info",
		);

		const response = await handler(new Request("https://proxy.test/health"));
		const body = await response.json();

		expect(response.status, "Expected thrown non-fatal fetch errors to become 500 responses.").toBe(500);
		expect(body).toMatchObject({
			error: {
				message: "Internal server error",
				type: "server_error",
			},
		});
	});
});
