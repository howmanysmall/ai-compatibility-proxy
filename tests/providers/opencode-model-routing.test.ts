import { expect, test } from "vitest";

import { clearOpenCodeModelRoutingCache, resolveOpenCodeModelRouteAsync } from "@providers/opencode-model-routing";

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

function createInvalidMetadataResponse(body: unknown): Response {
	return Response.json(body);
}

function createPendingResponseResolver(): {
	readonly promise: Promise<Response>;
	resolve(response: Response): void;
} {
	const { promise, resolve } = Promise.withResolvers<Response>();

	return {
		promise,
		resolve,
	};
}

function createPendingResponseRejecter(): {
	readonly promise: Promise<Response>;
	reject(error: Error): void;
} {
	const { promise, reject } = Promise.withResolvers<Response>();

	return {
		promise,
		reject,
	};
}

test("routes anthropic models to messages from metadata", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"claude-sonnet-4",
	);

	expect(decision.route, "Expected anthropic npm to route to messages.").toBe("messages");
	expect(decision.source, "Expected fresh metadata source.").toBe("metadata");
});

test("routes openai-compatible models to chat completions from metadata", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"deepseek-v4-flash",
	);

	expect(decision.route, "Expected OpenAI-compatible npm to route to chat completions.").toBe("chat_completions");
	expect(decision.source, "Expected fresh metadata source.").toBe("metadata");
});

test("uses provider default npm when model-specific provider metadata is absent", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"future-model",
	);

	expect(decision.route, "Expected provider default npm to route to chat completions.").toBe("chat_completions");
});

test("returns unknown when model is absent from metadata", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => createMetadataResponse(),
		createConfiguration(),
		"missing-model",
	);

	expect(decision.route, "Expected missing model to return unknown.").toBe("unknown");
	expect(decision.source, "Expected metadata source despite unknown model.").toBe("metadata");
});

test("reuses cached metadata before TTL expires", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	let fetchCount = 0;
	const fetchMetadataAsync: Fetcher = async () => {
		fetchCount += 1;
		return createMetadataResponse();
	};
	const configuration = createConfiguration({ opencodeModelsCacheTtlMs: 10_000 });

	await resolveOpenCodeModelRouteAsync(fetchMetadataAsync, configuration, "deepseek-v4-flash");
	await resolveOpenCodeModelRouteAsync(fetchMetadataAsync, configuration, "claude-sonnet-4");

	expect(fetchCount, "Expected metadata response to be cached before TTL expiry.").toBe(1);
});

test("uses stale cache when metadata refresh fails", async () => {
	expect.hasAssertions();
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

	expect(decision.route, "Expected stale cache to preserve last known route.").toBe("chat_completions");
	expect(decision.source, "Expected stale metadata source after refresh failure.").toBe("stale_metadata");
	expect(fetchCount >= 2, "Expected refresh attempt after TTL expiry.").toBe(true);
});

test("returns unknown on cold metadata failure", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () => {
			throw new Error("metadata down");
		},
		createConfiguration(),
		"deepseek-v4-flash",
	);

	expect(decision.route, "Expected cold metadata failure to return unknown.").toBe("unknown");
	expect(decision.source, "Expected unknown source when metadata never loaded.").toBe("unknown");
});

test("returns unknown for malformed metadata payload shapes", async () => {
	expect.hasAssertions();
	const decisions = await Promise.all(
		[null, {}, { opencode: {} }].map(async (body) => {
			clearOpenCodeModelRoutingCache();
			return resolveOpenCodeModelRouteAsync(
				async () => createInvalidMetadataResponse(body),
				createConfiguration(),
				"model",
			);
		}),
	);

	for (const decision of decisions) {
		expect(decision.route, "Expected malformed metadata payload to return unknown.").toBe("unknown");
		expect(decision.source, "Expected malformed metadata source to be unknown.").toBe("unknown");
	}
});

test("skips malformed model metadata entries and models without npm metadata", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const decision = await resolveOpenCodeModelRouteAsync(
		async () =>
			createInvalidMetadataResponse({
				opencode: {
					models: {
						"missing-npm": {},
						"not-record": null,
						"provider-npm-not-string": { provider: { npm: 123 } },
					},
				},
			}),
		createConfiguration(),
		"missing-npm",
	);

	expect(decision.route, "Expected model without provider/default npm metadata to be unknown.").toBe("unknown");
	expect(decision.source, "Expected valid but empty metadata source.").toBe("metadata");
});

test("shares in-flight metadata requests and falls back to stale metadata when in-flight refresh fails", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const initialMetadata = createPendingResponseResolver();
	const refreshFailure = createPendingResponseRejecter();
	let fetchCount = 0;
	const fetcher: Fetcher = () => {
		fetchCount += 1;
		return fetchCount === 1 ? initialMetadata.promise : refreshFailure.promise;
	};
	const configuration = createConfiguration({ opencodeModelsCacheTtlMs: 0 });

	const firstDecisionPromise = resolveOpenCodeModelRouteAsync(fetcher, configuration, "deepseek-v4-flash");
	const secondDecisionPromise = resolveOpenCodeModelRouteAsync(fetcher, configuration, "claude-sonnet-4");
	initialMetadata.resolve(createMetadataResponse());
	const [firstDecision, secondDecision] = await Promise.all([firstDecisionPromise, secondDecisionPromise]);
	const staleDecisionPromise = resolveOpenCodeModelRouteAsync(fetcher, configuration, "deepseek-v4-flash");
	const sharedStaleDecisionPromise = resolveOpenCodeModelRouteAsync(fetcher, configuration, "claude-sonnet-4");
	refreshFailure.reject(new Error("metadata refresh failed"));
	const [staleDecision, sharedStaleDecision] = await Promise.all([staleDecisionPromise, sharedStaleDecisionPromise]);

	expect(fetchCount, "Expected concurrent requests to share the first metadata fetch and one stale refresh.").toBe(2);
	expect(firstDecision.route, "Expected first in-flight decision.").toBe("chat_completions");
	expect(secondDecision.route, "Expected shared in-flight decision.").toBe("messages");
	expect(staleDecision.route, "Expected stale fallback after failed refresh.").toBe("chat_completions");
	expect(staleDecision.source, "Expected stale metadata source.").toBe("stale_metadata");
	expect(sharedStaleDecision.route, "Expected shared stale fallback after failed in-flight refresh.").toBe(
		"messages",
	);
	expect(sharedStaleDecision.source, "Expected shared stale metadata source.").toBe("stale_metadata");
});

test("returns unknown when a shared cold in-flight metadata request fails", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const metadataFailure = createPendingResponseRejecter();
	let fetchCount = 0;
	const fetcher: Fetcher = () => {
		fetchCount += 1;
		return metadataFailure.promise;
	};

	const firstDecisionPromise = resolveOpenCodeModelRouteAsync(fetcher, createConfiguration(), "deepseek-v4-flash");
	const secondDecisionPromise = resolveOpenCodeModelRouteAsync(fetcher, createConfiguration(), "claude-sonnet-4");
	metadataFailure.reject(new Error("metadata down"));
	const [firstDecision, secondDecision] = await Promise.all([firstDecisionPromise, secondDecisionPromise]);

	expect(fetchCount, "Expected failed cold in-flight metadata request to be shared.").toBe(1);
	expect(firstDecision.route, "Expected first failed in-flight decision to be unknown.").toBe("unknown");
	expect(secondDecision.route, "Expected second failed in-flight decision to be unknown.").toBe("unknown");
	expect(secondDecision.source, "Expected no stale source for cold in-flight failure.").toBe("unknown");
});
