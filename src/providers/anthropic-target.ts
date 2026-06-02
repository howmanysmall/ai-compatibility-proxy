import { translateAnthropicToOpenAi, translateOpenAiToAnthropic } from "@proxy/anthropic-translator.ts";
import { getModelsAsync } from "@proxy/models.ts";
import { createOpenAIStreamResponseAsync } from "@proxy/sse.ts";
import { fetchUpstreamJsonAsync } from "@proxy/upstream.ts";

import type {
	ProviderChatCompletionInput,
	ProviderTarget,
	ProviderTargetDefaults,
	ProviderTargetInput,
} from "./provider-target.ts";

const anthropicDefaults: ProviderTargetDefaults = {
	authHeader: "x-api-key",
	baseUrl: "https://opencode.ai/zen/go/v1",
	model: "minimax-m3",
	ownedBy: "anthropic-compatible-upstream",
};

export const anthropicTarget: ProviderTarget = {
	async createChatCompletionAsync({
		fetcher,
		headers,
		proxyConfiguration,
		request,
	}: ProviderChatCompletionInput): Promise<Response> {
		const anthropicRequest = translateOpenAiToAnthropic(
			request,
			proxyConfiguration.defaultModel,
			proxyConfiguration.defaultMaxTokens,
		);
		const upstreamResponse = await fetchUpstreamJsonAsync(
			fetcher,
			`${proxyConfiguration.upstreamBaseUrl}/messages`,
			headers,
			anthropicRequest,
			proxyConfiguration,
		);

		if (anthropicRequest.stream) {
			return await createOpenAIStreamResponseAsync(upstreamResponse, anthropicRequest.model);
		}

		return Response.json(translateAnthropicToOpenAi(await upstreamResponse.json(), anthropicRequest.model), {
			headers: { "cache-control": "no-store" },
		});
	},
	defaults: anthropicDefaults,
	async listModelsAsync({ fetcher, headers, proxyConfiguration }: ProviderTargetInput) {
		return await getModelsAsync(fetcher, headers, proxyConfiguration, anthropicDefaults.ownedBy);
	},
	protocol: "anthropic_messages",
};
