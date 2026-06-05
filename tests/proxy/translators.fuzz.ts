import { translateOpenAiToAnthropic } from "@proxy/anthropic-translator";
import { normalizeCerebrasRequest } from "@proxy/cerebras-translator";
import { fuzz } from "@vitiate/core";
import { FuzzedDataProvider } from "@vitiate/fuzzed-data-provider";

import type { ProxyConfiguration } from "@proxy/config";
import type { OpenAiChatCompletionRequest, OpenAiChatMessage } from "@proxy/openai-types";

const DEFAULT_MODEL = "fuzz-model";
const DEFAULT_MAX_TOKENS = 4096;
const CEREBRAS_CONFIGURATION = {
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: false,
	defaultMaxTokens: DEFAULT_MAX_TOKENS,
	defaultModel: DEFAULT_MODEL,
	logLevel: "info",
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2000,
	opencodeModelsUrl: "https://models.dev/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "Authorization",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://api.cerebras.ai/v1",
	upstreamProtocol: "cerebras_openai",
} satisfies ProxyConfiguration;

const anthropicRoles = ["system", "developer", "user", "assistant"] as const;
const cerebrasRoles = ["system", "developer", "user", "assistant"] as const;

function consumeText(provider: FuzzedDataProvider): string {
	return provider.consumeString(provider.consumeIntegralInRange(0, 512), { printable: true });
}

function consumeChatMessage(provider: FuzzedDataProvider, roles: typeof anthropicRoles): OpenAiChatMessage {
	return {
		content: consumeText(provider),
		role: provider.pickValue(roles),
	};
}

function consumeStop(provider: FuzzedDataProvider): string | ReadonlyArray<string> | undefined {
	if (!provider.consumeBoolean()) return undefined;
	const firstStop = consumeText(provider);
	if (!provider.consumeBoolean()) return firstStop;
	return [firstStop, consumeText(provider)];
}

fuzz("Anthropic translator handles structured text request variants", (data) => {
	const provider = new FuzzedDataProvider(data);
	const stop = consumeStop(provider);
	const request: OpenAiChatCompletionRequest = {
		max_tokens: provider.consumeIntegralInRange(1, 8192),
		messages: [
			consumeChatMessage(provider, anthropicRoles),
			{
				content: consumeText(provider),
				role: "user",
			},
		],
		model: consumeText(provider),
		...(stop === undefined ? {} : { stop }),
		stream: provider.consumeBoolean(),
		temperature: provider.consumeNumberInRange(0, 2),
		top_p: provider.consumeNumberInRange(0, 1),
	};

	translateOpenAiToAnthropic(request, DEFAULT_MODEL, DEFAULT_MAX_TOKENS);
});

fuzz("Cerebras normalizer handles structured text request variants", (data) => {
	const provider = new FuzzedDataProvider(data);
	const messages: Array<OpenAiChatMessage> = [];
	const messageCount = provider.consumeIntegralInRange(1, 6);
	const stop = consumeStop(provider);

	for (let index = 0; index < messageCount; index += 1) {
		messages[index] = consumeChatMessage(provider, cerebrasRoles);
	}

	const request: OpenAiChatCompletionRequest = {
		max_tokens: provider.consumeIntegralInRange(1, 8192),
		messages,
		model: consumeText(provider),
		// oxlint-disable-next-line id-length -- `n` is the OpenAI wire-field name.
		n: 1,
		...(stop === undefined ? {} : { stop }),
		stream: provider.consumeBoolean(),
		temperature: provider.consumeNumberInRange(0, 2),
		top_p: provider.consumeNumberInRange(0, 1),
	};

	normalizeCerebrasRequest(request, CEREBRAS_CONFIGURATION);
});
