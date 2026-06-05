import { createFetchHandler } from "@proxy/app";

import type { ProxyConfiguration } from "@proxy/config";

const configuration: ProxyConfiguration = {
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "model",
	logLevel: "info",
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2_000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "x-api-key",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://upstream.test/v1",
	upstreamProtocol: "anthropic_messages",
};

test("createFetchHandler logs non-fatal successful requests", async () => {
	const handler = createFetchHandler({ proxyConfiguration: configuration });
	const response = await handler(new Request("https://proxy.test/health"));
	const body = await response.json();

	expect(response.status, "Expected health status.").toBe(200);
	expect(body, "Expected health response body.").toEqual({
		status: "ok",
		upstream_protocol: "anthropic_messages",
	});
});
