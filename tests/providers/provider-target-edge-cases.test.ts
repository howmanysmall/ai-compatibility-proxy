import { expect, test } from "vitest";
import { anthropicTarget } from "@providers/anthropic-target";
import { cerebrasTarget } from "@providers/cerebras-target";
import { clearOpenCodeModelRoutingCache } from "@providers/opencode-model-routing";

import { getInitHeader } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "@proxy/config";
import type { Fetcher } from "@proxy/upstream";

const baseConfiguration: ProxyConfiguration = {
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "fallback-model",
	logLevel: "fatal",
	opencodeModelsCacheTtlMs: 0,
	opencodeModelsFetchTimeoutMs: 2_000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "x-api-key",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://upstream.test/v1",
	upstreamProtocol: "anthropic_messages",
};

function createMetadataResponse(npm: string): Response {
	return Response.json({
		opencode: {
			models: {
				"target-model": { provider: { npm } },
			},
			npm,
		},
	});
}

function getInitHeaderOrEmpty(init: RequestInit | undefined, name: string): string {
	return getInitHeader(init, name) ?? "";
}

const rawCerebrasStreamFetcherAsync: Fetcher = async () =>
	new Response("data: raw\n\n", {
		headers: { "content-type": "text/event-stream", "x-test-stream": "raw" },
		status: 202,
	});

const cerebrasModelsFetcherAsync: Fetcher = async () => Response.json({ data: ["gpt-oss-120b"] });

function createOpenAiCompatibleHeaderCaptureFetcher(capture: { authorization: string; xApiKey: string }): Fetcher {
	return async function openAiCompatibleHeaderCaptureFetcherAsync(input, init) {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/openai-compatible");
		capture.authorization = getInitHeaderOrEmpty(init, "authorization");
		capture.xApiKey = getInitHeaderOrEmpty(init, "x-api-key");
		return Response.json({ id: "chatcmpl_1", model: "upstream-model", object: "chat.completion" });
	};
}

function createAnthropicStreamFetcher(capture: { url: string }): Fetcher {
	return async function anthropicStreamFetcherAsync(input) {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/anthropic");
		capture.url = url;
		return new Response('data: {"type":"content_block_delta","delta":{"text":"hello"}}\n\n');
	};
}

function createOpenAiCompatibleForwardingFetcher(capture: {
	authorization: string;
	url: string;
	xApiKey: string;
}): Fetcher {
	return async function openAiCompatibleForwardingFetcherAsync(input, init) {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/openai-compatible");
		capture.url = url;
		capture.authorization = getInitHeaderOrEmpty(init, "authorization");
		capture.xApiKey = getInitHeaderOrEmpty(init, "x-api-key");
		return Response.json({ id: "chatcmpl_1", model: "upstream-model", object: "chat.completion" });
	};
}

function createOpenAiCompatibleStreamFetcher(): Fetcher {
	return async function openAiCompatibleStreamFetcherAsync(input) {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/openai-compatible");
		return new Response("data: raw\n\n", {
			headers: { "content-type": "text/event-stream", "x-test-stream": "raw" },
			status: 202,
		});
	};
}

function createUnknownPassthroughFetcher(capture: { chatCompletionCalls: number; messageCalls: number }): Fetcher {
	return async function unknownPassthroughFetcherAsync(input) {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/not-used");
		if (url.endsWith("/chat/completions")) {
			capture.chatCompletionCalls += 1;
			return Response.json({ id: "chatcmpl_1", model: "unknown-model", object: "chat.completion" });
		}
		capture.messageCalls += 1;
		return Response.json({ id: "msg_1", model: "unknown-model", type: "message" });
	};
}

function createNonFallbackFetcher(): Fetcher {
	return async function nonFallbackFetcherAsync(input) {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/not-used");
		throw new Error("network failure");
	};
}

function createUnknownFallbackFetcher(capture: { chatCompletionCalls: number; messageCalls: number }): Fetcher {
	return async function unknownFallbackFetcherAsync(input) {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/not-used");
		if (url.endsWith("/chat/completions")) {
			capture.chatCompletionCalls += 1;
			return Response.json({ error: { message: "not compatible" } }, { status: 400 });
		}
		capture.messageCalls += 1;
		return Response.json({
			content: [{ text: "translated", type: "text" }],
			id: "msg_1",
			model: "unknown-fallback-model",
			role: "assistant",
			stop_reason: "end_turn",
			type: "message",
			usage: { input_tokens: 1, output_tokens: 1 },
		});
	};
}

test("anthropic target converts Anthropic streaming responses to OpenAI SSE", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const capture = { url: "" };

	const response = await anthropicTarget.createChatCompletionAsync({
		fetcher: createAnthropicStreamFetcher(capture),
		headers: new Headers({ "x-api-key": "token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "target-model",
			stream: true,
		},
	});

	expect(response.headers.get("content-type"), "Expected OpenAI SSE response.").toBe(
		"text/event-stream; charset=utf-8",
	);
	expect(capture.url, "Expected Anthropic messages endpoint.").toBe("https://upstream.test/v1/messages");
	expect(await response.text(), "Expected translated stream content.").toContain('"content":"hello"');
});

test("anthropic target forwards OpenAI-compatible requests and maps x-api-key to authorization", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const capture = { authorization: "", url: "", xApiKey: "" };

	const response = await anthropicTarget.createChatCompletionAsync({
		fetcher: createOpenAiCompatibleForwardingFetcher(capture),
		headers: new Headers({ "x-api-key": "token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "target-model",
		},
	});
	const body = await response.json();

	expect(capture.url, "Expected OpenAI-compatible endpoint.").toBe("https://upstream.test/v1/chat/completions");
	expect(capture.authorization, "Expected Authorization conversion.").toBe("Bearer token");
	expect(capture.xApiKey, "Expected x-api-key removal.").toBe("");
	expect(body, "Expected upstream response passthrough.").toMatchObject({ model: "upstream-model" });
});

test("anthropic target preserves existing authorization headers for OpenAI-compatible requests", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const capture = { authorization: "", xApiKey: "" };

	await anthropicTarget.createChatCompletionAsync({
		fetcher: createOpenAiCompatibleHeaderCaptureFetcher(capture),
		headers: new Headers({ authorization: "Bearer existing", "x-api-key": "token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "target-model",
		},
	});

	expect(capture.authorization, "Expected existing Authorization header to be preserved.").toBe("Bearer existing");
	expect(capture.xApiKey, "Expected x-api-key to remain when Authorization is already present.").toBe("token");
});

test("anthropic target forwards OpenAI-compatible requests without auth header rewrites when no x-api-key exists", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const capture = { authorization: "", xApiKey: "" };

	await anthropicTarget.createChatCompletionAsync({
		fetcher: createOpenAiCompatibleHeaderCaptureFetcher(capture),
		headers: new Headers(),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "target-model",
		},
	});

	expect(capture.authorization, "Expected missing x-api-key to leave Authorization absent.").toBe("");
	expect(capture.xApiKey, "Expected missing x-api-key to remain absent.").toBe("");
});

test("anthropic target passes OpenAI-compatible streaming responses through raw", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();

	const response = await anthropicTarget.createChatCompletionAsync({
		fetcher: createOpenAiCompatibleStreamFetcher(),
		headers: new Headers({ authorization: "Bearer token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "target-model",
			stream: true,
		},
	});

	expect(response.status, "Expected raw upstream stream status.").toBe(202);
	expect(response.headers.get("x-test-stream"), "Expected raw upstream stream headers.").toBe("raw");
	expect(await response.text(), "Expected raw upstream stream body.").toBe("data: raw\n\n");
});

test("anthropic target caches unknown model passthrough support and rethrows non-fallback errors", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const capture = { chatCompletionCalls: 0, messageCalls: 0 };
	const passthroughFetcherAsync = createUnknownPassthroughFetcher(capture);

	await anthropicTarget.createChatCompletionAsync({
		fetcher: passthroughFetcherAsync,
		headers: new Headers({ authorization: "Bearer token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "unknown-model",
		},
	});
	await anthropicTarget.createChatCompletionAsync({
		fetcher: passthroughFetcherAsync,
		headers: new Headers({ authorization: "Bearer token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello again", role: "user" }],
			model: "unknown-model",
		},
	});

	expect(capture.chatCompletionCalls, "Expected unknown model passthrough support to be cached as true.").toBe(2);
	expect(capture.messageCalls, "Expected no Anthropic fallback after passthrough support succeeds.").toBe(0);

	await expect(
		anthropicTarget.createChatCompletionAsync({
			fetcher: createNonFallbackFetcher(),
			headers: new Headers({ authorization: "Bearer token" }),
			proxyConfiguration: { ...baseConfiguration, opencodeModelsUrl: "https://models.test/other-api.json" },
			request: {
				messages: [{ content: "hello", role: "user" }],
				model: "another-unknown-model",
			},
		}),
	).rejects.toThrow("network failure");
});

test("anthropic target skips passthrough probe after an unknown model caches fallback support", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const capture = { chatCompletionCalls: 0, messageCalls: 0 };
	const fallbackFetcherAsync = createUnknownFallbackFetcher(capture);

	await anthropicTarget.createChatCompletionAsync({
		fetcher: fallbackFetcherAsync,
		headers: new Headers({ authorization: "Bearer token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "unknown-fallback-model",
		},
	});
	await anthropicTarget.createChatCompletionAsync({
		fetcher: fallbackFetcherAsync,
		headers: new Headers({ authorization: "Bearer token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello again", role: "user" }],
			model: "unknown-fallback-model",
		},
	});

	expect(capture.chatCompletionCalls, "Expected only first unknown request to probe passthrough.").toBe(1);
	expect(capture.messageCalls, "Expected both requests to use Anthropic messages after fallback is cached.").toBe(2);
});

test("cerebras target passes streaming responses through raw", async () => {
	expect.hasAssertions();
	const response = await cerebrasTarget.createChatCompletionAsync({
		fetcher: rawCerebrasStreamFetcherAsync,
		headers: new Headers({ authorization: "Bearer token" }),
		proxyConfiguration: {
			...baseConfiguration,
			defaultModel: "gpt-oss-120b",
			upstreamProtocol: "cerebras_openai",
		},
		request: {
			messages: [{ content: "hello", role: "user" }],
			stream: true,
		},
	});

	expect(response.status, "Expected upstream status passthrough.").toBe(202);
	expect(response.headers.get("x-test-stream"), "Expected upstream header passthrough.").toBe("raw");
	expect(await response.text(), "Expected raw upstream body.").toBe("data: raw\n\n");
});

test("cerebras target lists models with Cerebras owner fallback", async () => {
	expect.hasAssertions();
	const models = await cerebrasTarget.listModelsAsync({
		fetcher: cerebrasModelsFetcherAsync,
		headers: new Headers(),
		proxyConfiguration: {
			...baseConfiguration,
			defaultModel: "gpt-oss-120b",
			upstreamProtocol: "cerebras_openai",
		},
	});

	expect(models.data[0], "Expected Cerebras owned model.").toMatchObject({
		id: "gpt-oss-120b",
		owned_by: "cerebras",
	});
});
