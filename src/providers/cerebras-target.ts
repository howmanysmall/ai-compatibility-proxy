import { normalizeCerebrasRequest } from "@proxy/cerebras-translator";
import { getModelsAsync } from "@proxy/models";
import { fetchUpstreamJsonAsync } from "@proxy/upstream";

import type {
	ProviderChatCompletionInput,
	ProviderTarget,
	ProviderTargetDefaults,
	ProviderTargetInput,
} from "./provider-target.ts";

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
		const upstreamResponse = await fetchUpstreamJsonAsync(
			fetcher,
			`${proxyConfiguration.upstreamBaseUrl}/chat/completions`,
			headers,
			cerebrasRequest,
			proxyConfiguration,
		);

		if (cerebrasRequest.stream) {
			return new Response(upstreamResponse.body, {
				headers: upstreamResponse.headers,
				status: upstreamResponse.status,
			});
		}

		return Response.json(await upstreamResponse.json(), { headers: { "cache-control": "no-store" } });
	},
	defaults: cerebrasDefaults,
	async listModelsAsync({ fetcher, headers, proxyConfiguration }: ProviderTargetInput) {
		return await getModelsAsync(fetcher, headers, proxyConfiguration, cerebrasDefaults.ownedBy);
	},
	protocol: "cerebras_openai",
};
