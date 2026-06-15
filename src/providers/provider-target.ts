import type { ProxyConfiguration, UpstreamProtocol } from "$proxy/config";
import type { OpenAiChatCompletionRequest, OpenAiModelListResponse } from "$proxy/openai-types";
import type { Fetcher } from "$proxy/upstream";

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
	readonly createChatCompletionAsync: (input: ProviderChatCompletionInput) => Promise<Response>;
	readonly listModelsAsync: (input: ProviderTargetInput) => Promise<OpenAiModelListResponse>;
}
