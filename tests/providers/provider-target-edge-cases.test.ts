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

test("anthropic target converts Anthropic streaming responses to OpenAI SSE", async () => {
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

test("cerebras target passes streaming responses through raw", async () => {
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
