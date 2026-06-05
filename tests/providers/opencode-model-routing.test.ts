import { clearOpenCodeModelRoutingCache, resolveOpenCodeModelRouteAsync } from "@providers/opencode-model-routing";

import { assert, assertEquals } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "@proxy/config";
import type { Fetcher } from "@proxy/upstream";

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
		upstreamAuthHeader: "x-api-key",
		upstreamAuthMode: "client_bearer",
		upstreamBaseUrl: "https://opencode.ai/zen/go/v1",
		upstreamProtocol: "anthropic_messages",
		...overrides,
	};
}

function createMetadataResponse(): Response {
	return Response.json({
		opencode: {
			models: {
				"claude-sonnet-4": { provider: { npm: "@ai-sdk/anthropic" } },
				"deepseek-v4-flash": { provider: { npm: "@ai-sdk/openai-compatible" } },
				"future-model": {},
			},
			npm: "@ai-sdk/openai-compatible",
		},
	});
}

test("routes anthropic models to messages from metadata", async () => {
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"claude-sonnet-4",
	);

	assertEquals(decision.route, "messages", "Expected anthropic npm to route to messages.");
	assertEquals(decision.source, "metadata", "Expected fresh metadata source.");
});

test("routes openai-compatible models to chat completions from metadata", async () => {
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"deepseek-v4-flash",
	);

	assertEquals(decision.route, "chat_completions", "Expected OpenAI-compatible npm to route to chat completions.");
	assertEquals(decision.source, "metadata", "Expected fresh metadata source.");
});

test("uses provider default npm when model-specific provider metadata is absent", async () => {
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"future-model",
	);

	assertEquals(decision.route, "chat_completions", "Expected provider default npm to route to chat completions.");
});

test("returns unknown when model is absent from metadata", async () => {
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"missing-model",
	);

	assertEquals(decision.route, "unknown", "Expected missing model to return unknown.");
	assertEquals(decision.source, "metadata", "Expected metadata source despite unknown model.");
});

test("reuses cached metadata before TTL expires", async () => {
	clearOpenCodeModelRoutingCache();
	let fetchCount = 0;
	const fetchMetadataAsync: Fetcher = async () => {
		fetchCount += 1;
		return createMetadataResponse();
	};
	const configuration = createConfiguration({ opencodeModelsCacheTtlMs: 10_000 });

	await resolveOpenCodeModelRouteAsync(fetchMetadataAsync, configuration, "deepseek-v4-flash");
	await resolveOpenCodeModelRouteAsync(fetchMetadataAsync, configuration, "claude-sonnet-4");

	assertEquals(fetchCount, 1, "Expected metadata response to be cached before TTL expiry.");
});

test("uses stale cache when metadata refresh fails", async () => {
	clearOpenCodeModelRoutingCache();
	let fetchCount = 0;
	const fetchMetadataAsync: Fetcher = async () => {
		fetchCount += 1;
		if (fetchCount === 1) return createMetadataResponse();
		throw new Error("metadata down");
	};
	const configuration = createConfiguration({ opencodeModelsCacheTtlMs: 0 });

	await resolveOpenCodeModelRouteAsync(fetchMetadataAsync, configuration, "deepseek-v4-flash");
	const decision = await resolveOpenCodeModelRouteAsync(fetchMetadataAsync, configuration, "deepseek-v4-flash");

	assertEquals(decision.route, "chat_completions", "Expected stale cache to preserve last known route.");
	assertEquals(decision.source, "stale_metadata", "Expected stale metadata source after refresh failure.");
	assert(fetchCount >= 2, "Expected refresh attempt after TTL expiry.");
});

test("returns unknown on cold metadata failure", async () => {
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => {
			throw new Error("metadata down");
		},
		createConfiguration(),
		"deepseek-v4-flash",
	);

	assertEquals(decision.route, "unknown", "Expected cold metadata failure to return unknown.");
	assertEquals(decision.source, "unknown", "Expected unknown source when metadata never loaded.");
});
