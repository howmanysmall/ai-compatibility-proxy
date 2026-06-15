import { expect, describe, it } from "vitest";
import { normalizeCerebrasRequest } from "$proxy/cerebras-translator";
import { ProxyError } from "$proxy/errors";

import type { ProxyConfiguration } from "$proxy/config";
import type { OpenAiChatCompletionRequest } from "$proxy/openai-types";

const baseConfiguration: ProxyConfiguration = {
	allowedUpstreamHosts: [],
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "llama-test",
	logLevel: "error",
	maxRequestBodySizeBytes: 1_048_576,
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "Authorization",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://api.cerebras.test/v1",
	upstreamErrorTransparency: true,
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

	const error = new Error("Expected ProxyError.");
	Error.captureStackTrace(error, captureProxyError);
	throw error;
}

describe("cerebras translator", () => {
	it("normalizes max_tokens, fallback model, names, and text parts", () => {
		expect.assertions(6);
		const request: OpenAiChatCompletionRequest = {
			frequency_penalty: 0,
			logprobs: true,
			max_tokens: 128,
			messages: [
				{ content: "system", role: "system" },
				{ content: "developer", role: "developer" },
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
			presence_penalty: 0,
			seed: 42,
			stop: "END",
			stream: false,
			temperature: 0,
			top_logprobs: 0,
			top_p: 1,
			user: "customer-123",
		};

		const normalized = normalizeCerebrasRequest(request, baseConfiguration);

		expect(normalized.model, "Expected default model fallback.").toBe("llama-test");
		expect(normalized.max_completion_tokens, "Expected max_tokens to normalize.").toBe(128);
		expect(normalized.messages?.[1]?.content, "Expected developer messages to be preserved.").toBe("developer");
		expect(normalized.messages?.[2]?.content, "Expected text parts to concatenate.").toBe("hello world");
		expect(normalized.messages?.[2]?.name, "Expected message name to be preserved.").toBe("logan");
		expect(normalized, "Expected allowed Cerebras passthrough fields to be preserved.").toMatchObject({
			frequency_penalty: 0,
			logprobs: true,
			presence_penalty: 0,
			seed: 42,
			stop: "END",
			stream: false,
			temperature: 0,
			top_logprobs: 0,
			top_p: 1,
			user: "customer-123",
		});
	});

	it("prefers existing max_completion_tokens over max_tokens", () => {
		expect.assertions(1);
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

	it("drops unsupported fields when loose dropping is configured", () => {
		expect.assertions(3);
		const normalized = normalizeCerebrasRequest(
			{
				experimental_passthrough: "drop-me",
				messages: [{ content: "hello", role: "user" }],
				model: "llama",
				// oxlint-disable-next-line id-length -- `n` is the OpenAI wire-field name.
				n: 2,
				response_format: { type: "json_object" },
			},
			withConfiguration({
				cerebrasDropUnsupportedFields: true,
				cerebrasStrictRequestValidation: false,
			}),
		);

		expect(!("response_format" in normalized), "Expected unsupported field to be dropped.").toBe(true);
		expect(!("experimental_passthrough" in normalized), "Expected unknown loose field to be dropped.").toBe(true);
		expect(!("n" in normalized), "Expected unsupported n field to be dropped in loose mode.").toBe(true);
	});

	it("rejects unsupported fields when strict validation is enabled", () => {
		expect.assertions(3);
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

		const unknownFieldError = captureProxyError(() =>
			normalizeCerebrasRequest(
				{
					experimental_passthrough: "reject-me",
					messages: [{ content: "hello", role: "user" }],
					model: "llama",
				},
				baseConfiguration,
			),
		);

		expect(unknownFieldError.param, "Expected strict unknown field param.").toBe("experimental_passthrough");

		const choiceCountError = captureProxyError(() =>
			normalizeCerebrasRequest(
				{
					messages: [{ content: "hello", role: "user" }],
					model: "llama",
					// oxlint-disable-next-line id-length -- `n` is the OpenAI wire-field name.
					n: 2,
				},
				baseConfiguration,
			),
		);

		expect(choiceCountError.param, "Expected invalid choice count param.").toBe("n");
	});

	it("rejects invalid Cerebras message roles and tool calls", () => {
		expect.hasAssertions();
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

	it("rejects empty messages and unsupported content parts", () => {
		expect.hasAssertions();
		const imageContentPart: Record<string, unknown> = {
			image_url: { url: "https://example.test/image.png" },
			type: "image_url",
		};

		for (const request of [
			{ messages: [], model: "llama" },
			{ messages: [{ role: "user" }], model: "llama" },
			{ messages: [{ content: null, role: "user" }], model: "llama" },
			{
				messages: [{ content: [imageContentPart], role: "user" }],
				model: "llama",
			},
		] satisfies ReadonlyArray<OpenAiChatCompletionRequest>) {
			expect(captureProxyError(() => normalizeCerebrasRequest(request, baseConfiguration)).status).toBe(400);
		}
	});
});
