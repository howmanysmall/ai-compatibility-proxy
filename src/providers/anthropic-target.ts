import { translateAnthropicToOpenAi, translateOpenAiToAnthropic } from "@proxy/anthropic-translator.ts";
import { ProxyError } from "@proxy/errors.ts";
import { getModelsAsync } from "@proxy/models.ts";
import { createOpenAIStreamResponseAsync } from "@proxy/sse.ts";
import { fetchUpstreamJsonAsync } from "@proxy/upstream.ts";
import { Predicate } from "effect";

import { resolveOpenCodeModelRouteAsync } from "./opencode-model-routing.ts";

import type { OpenAiChatCompletionRequest } from "@proxy/openai-types.ts";
import type { Writable } from "type-fest";

import type {
	ProviderChatCompletionInput,
	ProviderTarget,
	ProviderTargetDefaults,
	ProviderTargetInput,
} from "./provider-target.ts";

const unknownModelPassthroughSupport = new Map<string, boolean>();

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
		const model = getRequestModel(request, proxyConfiguration.defaultModel);
		const routeDecision = await resolveOpenCodeModelRouteAsync(fetcher, proxyConfiguration, model);
		if (routeDecision.route === "chat_completions") {
			return await forwardOpenAiCompatibleRequestAsync({ fetcher, headers, proxyConfiguration, request });
		}
		if (routeDecision.route === "messages") {
			return await forwardAnthropicRequestAsync({ fetcher, headers, proxyConfiguration, request });
		}

		const knownPassthroughSupport = unknownModelPassthroughSupport.get(model);

		if (knownPassthroughSupport !== false) {
			try {
				const response = await forwardOpenAiCompatibleRequestAsync({
					fetcher,
					headers,
					proxyConfiguration,
					request,
				});
				unknownModelPassthroughSupport.set(model, true);
				return response;
			} catch (error) {
				if (!shouldFallbackToAnthropicTranslation(error)) throw error;
				unknownModelPassthroughSupport.set(model, false);
			}
		}

		return await forwardAnthropicRequestAsync({ fetcher, headers, proxyConfiguration, request });
	},
	defaults: anthropicDefaults,
	async listModelsAsync({ fetcher, headers, proxyConfiguration }: ProviderTargetInput) {
		return await getModelsAsync(fetcher, headers, proxyConfiguration, anthropicDefaults.ownedBy);
	},
	protocol: "anthropic_messages",
};

async function forwardAnthropicRequestAsync({
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
}

async function forwardOpenAiCompatibleRequestAsync({
	fetcher,
	headers,
	proxyConfiguration,
	request,
}: ProviderChatCompletionInput): Promise<Response> {
	const upstreamRequest = getOpenAiCompatibleRequest(request, proxyConfiguration.defaultModel);
	const upstreamResponse = await fetchUpstreamJsonAsync(
		fetcher,
		`${proxyConfiguration.upstreamBaseUrl}/chat/completions`,
		getOpenAiCompatibleHeaders(headers),
		upstreamRequest,
		proxyConfiguration,
	);

	if (upstreamRequest.stream) {
		return new Response(upstreamResponse.body, {
			headers: upstreamResponse.headers,
			status: upstreamResponse.status,
		});
	}

	return Response.json(await upstreamResponse.json(), { headers: { "cache-control": "no-store" } });
}

function getOpenAiCompatibleRequest(
	request: OpenAiChatCompletionRequest,
	defaultModel: string,
): OpenAiChatCompletionRequest {
	const model = getRequestModel(request, defaultModel);
	if (Predicate.isString(request.model) && request.model.trim().length > 0) return request;

	const requestWithDefaultModel: Writable<OpenAiChatCompletionRequest> = {
		...request,
		model,
	};
	return requestWithDefaultModel;
}

function getRequestModel(request: OpenAiChatCompletionRequest, defaultModel: string): string {
	return request.model?.trim() || defaultModel;
}

function getOpenAiCompatibleHeaders(headers: Headers): Headers {
	if (headers.has("authorization")) return headers;

	const apiKey = headers.get("x-api-key");
	if (!apiKey) return headers;

	const openAiHeaders = new Headers(headers);
	openAiHeaders.delete("x-api-key");
	openAiHeaders.set("authorization", `Bearer ${apiKey}`);
	return openAiHeaders;
}

function shouldFallbackToAnthropicTranslation(error: unknown): boolean {
	if (!(error instanceof ProxyError)) return false;
	return error.status >= 400 && error.status < 500;
}
