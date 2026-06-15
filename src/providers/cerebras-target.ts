import { normalizeCerebrasRequest } from "$proxy/cerebras-translator";
import { getModelsAsync } from "$proxy/models";
import { fetchUpstreamJsonAsync } from "$proxy/upstream";

import type { OpenAiModelListResponse } from "$proxy/openai-types";

import type {
	ProviderChatCompletionInput,
	ProviderTarget,
	ProviderTargetDefaults,
	ProviderTargetInput,
} from "./provider-target";

const cerebrasDefaults: ProviderTargetDefaults = {
	authHeader: "Authorization",
	baseUrl: "https://api.cerebras.ai/v1",
	model: "gpt-oss-120b",
	ownedBy: "cerebras",
};

export const cerebrasTarget: ProviderTarget = {
	async createChatCompletionAsync({
		fetcher,
		headers,
		proxyConfiguration,
		request,
	}: ProviderChatCompletionInput): Promise<Response> {
		const cerebrasRequest = normalizeCerebrasRequest(request, proxyConfiguration);
		const upstreamResponse = await fetchUpstreamJsonAsync({
			body: cerebrasRequest,
			fetcher,
			headers,
			proxyConfiguration,
			url: `${proxyConfiguration.upstreamBaseUrl}/chat/completions`,
		});

		if (cerebrasRequest.stream) {
			return new Response(upstreamResponse.body, {
				headers: upstreamResponse.headers,
				status: upstreamResponse.status,
			});
		}

		return Response.json(await upstreamResponse.json(), { headers: { "cache-control": "no-store" } });
	},
	defaults: cerebrasDefaults,
	async listModelsAsync({
		fetcher,
		headers,
		proxyConfiguration,
	}: ProviderTargetInput): Promise<OpenAiModelListResponse> {
		return await getModelsAsync(fetcher, headers, proxyConfiguration, cerebrasDefaults.ownedBy);
	},
	protocol: "cerebras_openai",
};
