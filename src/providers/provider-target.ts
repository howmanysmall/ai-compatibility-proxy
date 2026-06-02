import type { ProxyConfiguration, UpstreamProtocol } from "@proxy/config.ts";
import type { OpenAiChatCompletionRequest, OpenAiModelListResponse } from "@proxy/openai-types.ts";
import type { Fetcher } from "@proxy/upstream.ts";

export interface ProviderTargetDefaults {
	readonly authHeader: string;
	readonly baseUrl: string;
	readonly model: string;
	readonly ownedBy: string;
}

export interface ProviderTargetInput {
	readonly fetcher: Fetcher;
	readonly headers: Headers;
	readonly proxyConfiguration: ProxyConfiguration;
}

export interface ProviderChatCompletionInput extends ProviderTargetInput {
	readonly request: OpenAiChatCompletionRequest;
}

export interface ProviderTarget {
	readonly defaults: ProviderTargetDefaults;
	readonly protocol: UpstreamProtocol;
	createChatCompletionAsync(input: ProviderChatCompletionInput): Promise<Response>;
	listModelsAsync(input: ProviderTargetInput): Promise<OpenAiModelListResponse>;
}
