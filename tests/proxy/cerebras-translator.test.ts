import { normalizeCerebrasRequest } from "@proxy/cerebras-translator";
import { ProxyError } from "@proxy/errors";

import type { ProxyConfiguration } from "@proxy/config";
import type { OpenAiChatCompletionRequest } from "@proxy/openai-types";

const baseConfiguration: ProxyConfiguration = {
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "llama-test",
	logLevel: "error",
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2_000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "Authorization",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://api.cerebras.test/v1",
	upstreamProtocol: "cerebras_openai",
};

function withConfiguration(overrides: Partial<ProxyConfiguration>): ProxyConfiguration {
	return { ...baseConfiguration, ...overrides };
}

function captureProxyError(callback: () => unknown): ProxyError {
	try {
		callback();
	} catch (error) {
		if (error instanceof ProxyError) return error;
		throw error;
	}

	throw new Error("Expected ProxyError.");
}

test("normalizes max_tokens, fallback model, names, and text parts", () => {
	const request: OpenAiChatCompletionRequest = {
		max_tokens: 128,
		messages: [
			{ content: "system", role: "system" },
			{
				content: [
					{ text: "hello ", type: "text" },
					{ text: "world", type: "text" },
				],
				name: "logan",
				role: "user",
			},
		],
		model: "   ",
	};

	const normalized = normalizeCerebrasRequest(request, baseConfiguration);

	expect(normalized.model, "Expected default model fallback.").toBe("llama-test");
	expect(normalized.max_completion_tokens, "Expected max_tokens to normalize.").toBe(128);
	expect(normalized.messages?.[1]?.content, "Expected text parts to concatenate.").toBe("hello world");
	expect(normalized.messages?.[1]?.name, "Expected message name to be preserved.").toBe("logan");
});

test("prefers existing max_completion_tokens over max_tokens", () => {
	const normalized = normalizeCerebrasRequest(
		{
			max_completion_tokens: 256,
			max_tokens: 128,
			messages: [{ content: "hello", role: "user" }],
			model: "llama",
		},
		baseConfiguration,
	);

	expect(normalized.max_completion_tokens, "Expected existing max_completion_tokens to win.").toBe(256);
});

test("drops unsupported fields when loose dropping is configured", () => {
	const normalized = normalizeCerebrasRequest(
		{
			messages: [{ content: "hello", role: "user" }],
			model: "llama",
			response_format: { type: "json_object" },
		},
		withConfiguration({
			cerebrasDropUnsupportedFields: true,
			cerebrasStrictRequestValidation: false,
		}),
	);

	expect(!("response_format" in normalized), "Expected unsupported field to be dropped.").toBe(true);
});

test("rejects unsupported fields when strict validation is enabled", () => {
	const error = captureProxyError(() =>
		normalizeCerebrasRequest(
			{
				messages: [{ content: "hello", role: "user" }],
				model: "llama",
				tools: [],
			},
			baseConfiguration,
		),
	);

	expect(error.param, "Expected unsupported field param.").toBe("tools");
});

test("rejects invalid Cerebras message roles and tool calls", () => {
	for (const request of [
		{
			messages: [{ content: "hello", role: "tool" }],
			model: "llama",
		},
		{
			messages: [{ content: "hello", role: "assistant", tool_calls: [] }],
			model: "llama",
		},
	] satisfies ReadonlyArray<OpenAiChatCompletionRequest>) {
		expect(captureProxyError(() => normalizeCerebrasRequest(request, baseConfiguration)).status).toBe(400);
	}
});

test("rejects empty messages and unsupported content parts", () => {
	const imageContentPart: Record<string, unknown> = {
		image_url: { url: "https://example.test/image.png" },
		type: "image_url",
	};

	for (const request of [
		{ messages: [], model: "llama" },
		{ messages: [{ role: "user" }], model: "llama" },
		{
			messages: [{ content: [imageContentPart], role: "user" }],
			model: "llama",
		},
	] satisfies ReadonlyArray<OpenAiChatCompletionRequest>) {
		expect(captureProxyError(() => normalizeCerebrasRequest(request, baseConfiguration)).status).toBe(400);
	}
});
