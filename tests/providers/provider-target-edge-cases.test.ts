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
		capture.authorization = getInitHeader(init, "authorization") ?? "";
		capture.xApiKey = getInitHeader(init, "x-api-key") ?? "";
		return Response.json({ id: "chatcmpl_1", model: "upstream-model", object: "chat.completion" });
	};
}

test("anthropic target converts Anthropic streaming responses to OpenAI SSE", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	const anthropicStreamFetcherAsync: Fetcher = async (input) => {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/anthropic");
		expect(url, "Expected Anthropic messages endpoint.").toBe("https://upstream.test/v1/messages");
		return new Response('data: {"type":"content_block_delta","delta":{"text":"hello"}}\n\n');
	};

	const response = await anthropicTarget.createChatCompletionAsync({
		fetcher: anthropicStreamFetcherAsync,
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
	expect(await response.text(), "Expected translated stream content.").toContain('"content":"hello"');
});

test("anthropic target forwards OpenAI-compatible requests and maps x-api-key to authorization", async () => {
	expect.hasAssertions();
	clearOpenCodeModelRoutingCache();
	let seenAuthorization = "";
	let seenXApiKey = "";
	const openAiCompatibleFetcherAsync: Fetcher = async (input, init) => {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/openai-compatible");
		expect(url, "Expected OpenAI-compatible endpoint.").toBe("https://upstream.test/v1/chat/completions");
		seenAuthorization = getInitHeader(init, "authorization") ?? "";
		seenXApiKey = getInitHeader(init, "x-api-key") ?? "";
		return Response.json({ id: "chatcmpl_1", model: "upstream-model", object: "chat.completion" });
	};

	const response = await anthropicTarget.createChatCompletionAsync({
		fetcher: openAiCompatibleFetcherAsync,
		headers: new Headers({ "x-api-key": "token" }),
		proxyConfiguration: baseConfiguration,
		request: {
			messages: [{ content: "hello", role: "user" }],
			model: "target-model",
		},
	});
	const body = await response.json();

	expect(seenAuthorization, "Expected Authorization conversion.").toBe("Bearer token");
	expect(seenXApiKey, "Expected x-api-key removal.").toBe("");
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
	const streamFetcherAsync: Fetcher = async (input) => {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/openai-compatible");
		return new Response("data: raw\n\n", {
			headers: { "content-type": "text/event-stream", "x-test-stream": "raw" },
			status: 202,
		});
	};

	const response = await anthropicTarget.createChatCompletionAsync({
		fetcher: streamFetcherAsync,
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
	let chatCompletionCalls = 0;
	let messageCalls = 0;
	const passthroughFetcherAsync: Fetcher = async (input) => {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/not-used");
		if (url.endsWith("/chat/completions")) {
			chatCompletionCalls += 1;
			return Response.json({ id: "chatcmpl_1", model: "unknown-model", object: "chat.completion" });
		}
		messageCalls += 1;
		return Response.json({ id: "msg_1", model: "unknown-model", type: "message" });
	};

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

	expect(chatCompletionCalls, "Expected unknown model passthrough support to be cached as true.").toBe(2);
	expect(messageCalls, "Expected no Anthropic fallback after passthrough support succeeds.").toBe(0);

	const nonFallbackFetcherAsync: Fetcher = async (input) => {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/not-used");
		throw new Error("network failure");
	};

	await expect(
		anthropicTarget.createChatCompletionAsync({
			fetcher: nonFallbackFetcherAsync,
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
	let chatCompletionCalls = 0;
	let messageCalls = 0;
	const fallbackFetcherAsync: Fetcher = async (input) => {
		const url = String(input);
		if (url === "https://models.test/api.json") return createMetadataResponse("@ai-sdk/not-used");
		if (url.endsWith("/chat/completions")) {
			chatCompletionCalls += 1;
			return Response.json({ error: { message: "not compatible" } }, { status: 400 });
		}
		messageCalls += 1;
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

	expect(chatCompletionCalls, "Expected only first unknown request to probe passthrough.").toBe(1);
	expect(messageCalls, "Expected both requests to use Anthropic messages after fallback is cached.").toBe(2);
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
