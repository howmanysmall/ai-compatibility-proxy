import { expect, describe, it } from "vitest";
import { createApp } from "$proxy/app";

import { getInitHeader } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "$proxy/config";

function createConfiguration(overrides: Partial<ProxyConfiguration> = {}): ProxyConfiguration {
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
		proxyApiKey: "proxy-key",
		requestTimeoutMs: 60_000,
		upstreamApiKey: "upstream-key",
		upstreamAuthHeader: "Authorization",
		upstreamAuthMode: "server_key",
		upstreamBaseUrl: "https://opencode.ai/zen/go/v1",
		upstreamErrorTransparency: false,
		upstreamProtocol: "anthropic_messages",
		...overrides,
	};
}

describe("auth timing", () => {
	it("server_key mode rejects same-length wrong token", async () => {
		expect.hasAssertions();
		const app = createApp({
			fetcher: async (_input, init) => {
				expect(getInitHeader(init, "authorization"), "Expected upstream auth header.").toBe(
					"Bearer upstream-key",
				);
				return Response.json({ data: [], object: "list" });
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			new Request("http://localhost/v1/models", {
				headers: { authorization: "Bearer wrong-key" },
			}),
		);

		expect(response.status, "Expected same-length wrong token to fail.").toBe(401);
	});

	it("server_key mode rejects different-length wrong token", async () => {
		expect.assertions(1);
		const app = createApp({
			fetcher: async () => Response.json({ data: [], object: "list" }),
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			new Request("http://localhost/v1/models", {
				headers: { authorization: "Bearer wrong-key-longer" },
			}),
		);

		expect(response.status, "Expected different-length wrong token to fail.").toBe(401);
	});

	it("server_key mode accepts correct token", async () => {
		expect.hasAssertions();
		const app = createApp({
			fetcher: async (_input, init) => {
				expect(getInitHeader(init, "authorization"), "Expected upstream auth header.").toBe(
					"Bearer upstream-key",
				);
				return Response.json({ data: [], object: "list" });
			},
			proxyConfiguration: createConfiguration(),
		});

		const response = await app.fetch(
			new Request("http://localhost/v1/models", {
				headers: { authorization: "Bearer proxy-key" },
			}),
		);

		expect(response.status, "Expected correct token to pass.").toBe(200);
	});
});
