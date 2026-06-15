import { expect, describe, it } from "vitest";
import { clearOpenCodeModelRoutingCache, resolveOpenCodeModelRouteAsync } from "$providers/opencode-model-routing";

import type { ProxyConfiguration } from "$proxy/config";
import type { Fetcher } from "$proxy/upstream";

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
		proxyApiKey: undefined,
		requestTimeoutMs: 60_000,
		upstreamApiKey: undefined,
		upstreamAuthHeader: "x-api-key",
		upstreamAuthMode: "client_bearer",
		upstreamBaseUrl: "https://opencode.ai/zen/go/v1",
		upstreamErrorTransparency: true,
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

interface RefreshFailureFetcher {
	readonly fetcher: Fetcher;
	readonly getFetchCount: () => number;
}

interface Resolver {
	readonly promise: Promise<Response>;
	readonly resolve: (response: Response) => void;
}
interface Rejector {
	readonly promise: Promise<Response>;
	readonly reject: (error: Error) => void;
}

function createPendingResponseResolver(): Resolver {
	const { promise, resolve } = Promise.withResolvers<Response>();
	return { promise, resolve };
}

function createPendingResponseRejecter(): Rejector {
	const { promise, reject } = Promise.withResolvers<Response>();
	return { promise, reject };
}

function createStaleRefreshFailureFetcher(): RefreshFailureFetcher {
	let fetchCount = 0;
	const fetcherAsync: Fetcher = async () => {
		fetchCount += 1;
		if (fetchCount === 1) return createMetadataResponse();
		const error = new Error("metadata down");
		Error.captureStackTrace(error, fetcherAsync);
		throw error;
	};

	return {
		fetcher: fetcherAsync,
		getFetchCount: () => fetchCount,
	};
}

function createSharedRefreshFailureFetcher(
	initialMetadata: Readonly<{ readonly promise: Promise<Response> }>,
	refreshFailure: Readonly<{ readonly promise: Promise<Response> }>,
): RefreshFailureFetcher {
	let fetchCount = 0;
	const fetcher: Fetcher = () => {
		fetchCount += 1;
		return fetchCount === 1 ? initialMetadata.promise : refreshFailure.promise;
	};

	return {
		fetcher,
		getFetchCount: () => fetchCount,
	};
}

describe("openCode model routing", () => {
	it("routes anthropic models to messages from metadata", async () => {
		expect.assertions(2);
		clearOpenCodeModelRoutingCache();
		const decision = await resolveOpenCodeModelRouteAsync(
			async () => createMetadataResponse(),
			createConfiguration(),
			"claude-sonnet-4",
		);

		expect(decision.route, "Expected anthropic npm to route to messages.").toBe("messages");
		expect(decision.source, "Expected fresh metadata source.").toBe("metadata");
	});

	it("routes openai-compatible models to chat completions from metadata", async () => {
		expect.assertions(2);
		clearOpenCodeModelRoutingCache();
		const decision = await resolveOpenCodeModelRouteAsync(
			async () => createMetadataResponse(),
			createConfiguration(),
			"deepseek-v4-flash",
		);

		expect(decision.route, "Expected OpenAI-compatible npm to route to chat completions.").toBe("chat_completions");
		expect(decision.source, "Expected fresh metadata source.").toBe("metadata");
	});

	it("uses provider default npm when model-specific provider metadata is absent", async () => {
		expect.assertions(1);
		clearOpenCodeModelRoutingCache();
		const decision = await resolveOpenCodeModelRouteAsync(
			async () => createMetadataResponse(),
			createConfiguration(),
			"future-model",
		);

		expect(decision.route, "Expected provider default npm to route to chat completions.").toBe("chat_completions");
	});

	it("returns unknown when model is absent from metadata", async () => {
		expect.assertions(2);
		clearOpenCodeModelRoutingCache();
		const decision = await resolveOpenCodeModelRouteAsync(
			async () => createMetadataResponse(),
			createConfiguration(),
			"missing-model",
		);

		expect(decision.route, "Expected missing model to return unknown.").toBe("unknown");
		expect(decision.source, "Expected metadata source despite unknown model.").toBe("metadata");
	});

	it("reuses cached metadata before TTL expires", async () => {
		expect.assertions(1);
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

	it("uses stale cache when metadata refresh fails", async () => {
		expect.assertions(3);
		clearOpenCodeModelRoutingCache();
		const metadataFetcher = createStaleRefreshFailureFetcher();
		const configuration = createConfiguration({ opencodeModelsCacheTtlMs: 0 });

		await resolveOpenCodeModelRouteAsync(metadataFetcher.fetcher, configuration, "deepseek-v4-flash");
		const decision = await resolveOpenCodeModelRouteAsync(
			metadataFetcher.fetcher,
			configuration,
			"deepseek-v4-flash",
		);

		expect(decision.route, "Expected stale cache to preserve last known route.").toBe("chat_completions");
		expect(decision.source, "Expected stale metadata source after refresh failure.").toBe("stale_metadata");
		expect(metadataFetcher.getFetchCount(), "Expected refresh attempt after TTL expiry.").toBe(2);
	});

	it("returns unknown on cold metadata failure", async () => {
		expect.assertions(2);
		clearOpenCodeModelRoutingCache();
		const decision = await resolveOpenCodeModelRouteAsync(
			async () => {
				const error = new Error("metadata down");
				Error.captureStackTrace(error);
				throw error;
			},
			createConfiguration(),
			"deepseek-v4-flash",
		);

		expect(decision.route, "Expected cold metadata failure to return unknown.").toBe("unknown");
		expect(decision.source, "Expected unknown source when metadata never loaded.").toBe("unknown");
	});

	it("returns unknown for malformed metadata payload shapes", async () => {
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

	it("skips malformed model metadata entries and models without npm metadata", async () => {
		expect.assertions(2);
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

	it("shares in-flight metadata requests and falls back to stale metadata when in-flight refresh fails", async () => {
		expect.assertions(7);
		clearOpenCodeModelRoutingCache();
		const initialMetadata = createPendingResponseResolver();
		const refreshFailure = createPendingResponseRejecter();
		const metadataFetcher = createSharedRefreshFailureFetcher(initialMetadata, refreshFailure);
		const configuration = createConfiguration({ opencodeModelsCacheTtlMs: 0 });

		const firstDecisionPromise = resolveOpenCodeModelRouteAsync(
			metadataFetcher.fetcher,
			configuration,
			"deepseek-v4-flash",
		);
		const secondDecisionPromise = resolveOpenCodeModelRouteAsync(
			metadataFetcher.fetcher,
			configuration,
			"claude-sonnet-4",
		);
		initialMetadata.resolve(createMetadataResponse());
		const [firstDecision, secondDecision] = await Promise.all([firstDecisionPromise, secondDecisionPromise]);
		const staleDecisionPromise = resolveOpenCodeModelRouteAsync(
			metadataFetcher.fetcher,
			configuration,
			"deepseek-v4-flash",
		);
		const sharedStaleDecisionPromise = resolveOpenCodeModelRouteAsync(
			metadataFetcher.fetcher,
			configuration,
			"claude-sonnet-4",
		);
		refreshFailure.reject(new Error("metadata refresh failed"));
		const [staleDecision, sharedStaleDecision] = await Promise.all([
			staleDecisionPromise,
			sharedStaleDecisionPromise,
		]);

		expect(
			metadataFetcher.getFetchCount(),
			"Expected concurrent requests to share the first metadata fetch and one stale refresh.",
		).toBe(2);
		expect(firstDecision.route, "Expected first in-flight decision.").toBe("chat_completions");
		expect(secondDecision.route, "Expected shared in-flight decision.").toBe("messages");
		expect(staleDecision.route, "Expected stale fallback after failed refresh.").toBe("chat_completions");
		expect(staleDecision.source, "Expected stale metadata source.").toBe("stale_metadata");
		expect(sharedStaleDecision.route, "Expected shared stale fallback after failed in-flight refresh.").toBe(
			"messages",
		);
		expect(sharedStaleDecision.source, "Expected shared stale metadata source.").toBe("stale_metadata");
	});

	it("returns unknown when a shared cold in-flight metadata request fails", async () => {
		expect.assertions(4);
		clearOpenCodeModelRoutingCache();
		const metadataFailure = createPendingResponseRejecter();
		let fetchCount = 0;
		const fetcher: Fetcher = () => {
			fetchCount += 1;
			return metadataFailure.promise;
		};

		const firstDecisionPromise = resolveOpenCodeModelRouteAsync(
			fetcher,
			createConfiguration(),
			"deepseek-v4-flash",
		);
		const secondDecisionPromise = resolveOpenCodeModelRouteAsync(fetcher, createConfiguration(), "claude-sonnet-4");
		metadataFailure.reject(new Error("metadata down"));
		const [firstDecision, secondDecision] = await Promise.all([firstDecisionPromise, secondDecisionPromise]);

		expect(fetchCount, "Expected failed cold in-flight metadata request to be shared.").toBe(1);
		expect(firstDecision.route, "Expected first failed in-flight decision to be unknown.").toBe("unknown");
		expect(secondDecision.route, "Expected second failed in-flight decision to be unknown.").toBe("unknown");
		expect(secondDecision.source, "Expected no stale source for cold in-flight failure.").toBe("unknown");
	});
});
