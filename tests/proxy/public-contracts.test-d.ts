import { expectTypeOf, test } from "vitest";

import type { ProviderTarget, ProviderTargetDefaults } from "@providers/provider-target";
import type { ProxyConfiguration, UpstreamAuthMode, UpstreamProtocol } from "@proxy/config";
import type { OpenAiChatCompletionRequest, OpenAiErrorBody } from "@proxy/openai-types";
import type { Fetcher } from "@proxy/upstream";

const fetcherAsync: Fetcher = async (_input, _init) => new Response();

test("proxy configuration keeps literal protocol and auth-mode contracts", () => {
	expectTypeOf<UpstreamProtocol>().toEqualTypeOf<"anthropic_messages" | "cerebras_openai">();
	expectTypeOf<UpstreamAuthMode>().toEqualTypeOf<"client_bearer" | "server_key">();

	const proxyConfiguration = {
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
		upstreamAuthHeader: "Authorization",
		upstreamAuthMode: "client_bearer",
		upstreamBaseUrl: "https://upstream.test/v1",
		upstreamProtocol: "anthropic_messages",
	} satisfies ProxyConfiguration;

	expectTypeOf(proxyConfiguration).toMatchTypeOf<ProxyConfiguration>();
});

test("provider target and fetcher contracts stay request-boundary focused", () => {
	expectTypeOf(fetcherAsync).toMatchTypeOf<Fetcher>();

	expectTypeOf<ProviderTargetDefaults>().toEqualTypeOf<{
		readonly authHeader: string;
		readonly baseUrl: string;
		readonly model: string;
		readonly ownedBy: string;
	}>();

	expectTypeOf<ProviderTarget>().toHaveProperty("createChatCompletionAsync").toBeFunction();
	expectTypeOf<ProviderTarget>().toHaveProperty("listModelsAsync").toBeFunction();
});

test("OpenAI request and error wire shapes remain nullable where required", () => {
	expectTypeOf<OpenAiChatCompletionRequest>()
		.toHaveProperty("messages")
		.toEqualTypeOf<OpenAiChatCompletionRequest["messages"]>();

	expectTypeOf<OpenAiErrorBody>().toEqualTypeOf<{
		readonly error: {
			readonly code: string | null;
			readonly message: string;
			readonly param: string | null;
			readonly type: string;
		};
	}>();
});
