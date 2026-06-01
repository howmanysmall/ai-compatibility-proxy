import { createApp } from "../../src/proxy/app.ts";
import { getInitHeader } from "./_test-helpers.ts";

import type { ProxyConfig } from "../../src/proxy/config.ts";

declare const Deno: {
	test(name: string, fn: () => void | Promise<void>): void;
};

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function createConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
	return {
		cerebrasDropUnsupportedFields: true,
		cerebrasStrictRequestValidation: true,
		defaultMaxTokens: 4096,
		defaultModel: "minimax-m3",
		logLevel: "info",
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

Deno.test("server_key mode rejects same-length wrong token", async () => {
	const app = createApp({
		config: createConfig(),
		fetcher: (_input, init) => {
			assert(getInitHeader(init, "authorization") === "Bearer upstream-key", "Expected upstream auth header.");
			return Promise.resolve(Response.json({ data: [], object: "list" }));
		},
	});

	const response = await app(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer wrong-key" },
		}),
	);

	assert(response.status === 401, "Expected same-length wrong token to fail.");
});

Deno.test("server_key mode rejects different-length wrong token", async () => {
	const app = createApp({
		config: createConfig(),
		fetcher: () => Promise.resolve(Response.json({ data: [], object: "list" })),
	});

	const response = await app(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer wrong-key-longer" },
		}),
	);

	assert(response.status === 401, "Expected different-length wrong token to fail.");
});

Deno.test("server_key mode accepts correct token", async () => {
	const app = createApp({
		config: createConfig(),
		fetcher: (_input, init) => {
			assert(getInitHeader(init, "authorization") === "Bearer upstream-key", "Expected upstream auth header.");
			return Promise.resolve(Response.json({ data: [], object: "list" }));
		},
	});

	const response = await app(
		new Request("http://localhost/v1/models", {
			headers: { authorization: "Bearer proxy-key" },
		}),
	);

	assert(response.status === 200, "Expected correct token to pass.");
});
