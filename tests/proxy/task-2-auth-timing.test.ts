import { createApp } from "@proxy/app";

import { assert, getInitHeader } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "@proxy/config";

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
		proxyApiKey: "proxy-key",
		requestTimeoutMs: 60_000,
		upstreamApiKey: "upstream-key",
		upstreamAuthHeader: "Authorization",
		upstreamAuthMode: "server_key",
		upstreamBaseUrl: "https://opencode.ai/zen/go/v1",
		upstreamProtocol: "anthropic_messages",
		...overrides,
	};
}

test("server_key mode rejects same-length wrong token", async () => {
	const app = createApp({
		fetcher: (_input, init) => {
			assert(getInitHeader(init, "authorization") === "Bearer upstream-key", "Expected upstream auth header.");
			return Promise.resolve(Response.json({ data: [], object: "list" }));
		},
		proxyConfiguration: createConfiguration(),
	});

	const response = await app.fetch(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer wrong-key" },
		}),
	);

	assert(response.status === 401, "Expected same-length wrong token to fail.");
});

test("server_key mode rejects different-length wrong token", async () => {
	const app = createApp({
		fetcher: () => Promise.resolve(Response.json({ data: [], object: "list" })),
		proxyConfiguration: createConfiguration(),
	});

	const response = await app.fetch(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer wrong-key-longer" },
		}),
	);

	assert(response.status === 401, "Expected different-length wrong token to fail.");
});

test("server_key mode accepts correct token", async () => {
	const app = createApp({
		fetcher: (_input, init) => {
			assert(getInitHeader(init, "authorization") === "Bearer upstream-key", "Expected upstream auth header.");
			return Promise.resolve(Response.json({ data: [], object: "list" }));
		},
		proxyConfiguration: createConfiguration(),
	});

	const response = await app.fetch(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer proxy-key" },
		}),
	);

	assert(response.status === 200, "Expected correct token to pass.");
});
