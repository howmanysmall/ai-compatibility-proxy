import { type } from "arktype";

import { translateAnthropicToOpenAI, translateOpenAIToAnthropic } from "./anthropic-translator.ts";
import { createAuthContext } from "./auth.ts";
import { normalizeCerebrasRequest } from "./cerebras-translator.ts";
import { createErrorResponse, ProxyError } from "./errors.ts";
import { getModelsAsync } from "./models.ts";
import { fetchUpstreamJsonAsync } from "./upstream.ts";

import type { ProxyConfig } from "./config.ts";
import type { OpenAIChatCompletionRequest } from "./openai-types.ts";
import type { Fetcher } from "./upstream.ts";

const OpenAIChatCompletionRequestSchema = type({
	"max_completion_tokens?": "number",
	"max_tokens?": "number",
	messages: "unknown[] >= 1",
	"model?": "string",
	"stop?": "string | string[] | null",
	"stream?": "boolean",
	"temperature?": "number",
	"top_p?": "number",
});

export interface AppOptions {
	readonly config: ProxyConfig;
	readonly fetcher?: Fetcher;
}

export function createApp(options: AppOptions): (request: Request) => Promise<Response> {
	const { config } = options;
	const { fetcher = fetch } = options;

	return async (request: Request): Promise<Response> => {
		try {
			return await handleRequestAsync(request, config, fetcher);
		} catch (error) {
			return createErrorResponse(error);
		}
	};
}

async function handleRequestAsync(request: Request, config: ProxyConfig, fetcher: Fetcher): Promise<Response> {
	const url = new URL(request.url);

	if (request.method === "GET" && url.pathname === "/health") {
		return Response.json({
			status: "ok",
			upstream_protocol: config.upstreamProtocol,
		});
	}

	if (request.method === "GET" && url.pathname === "/v1/models") {
		const authContext = createAuthContext(request, config);
		return Response.json(await getModelsAsync(fetcher, authContext.upstreamHeaders, config));
	}

	if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
		const authContext = createAuthContext(request, config);
		const body = await readJsonBodyAsync(request);

		if (config.upstreamProtocol === "anthropic_messages") {
			const anthropicRequest = translateOpenAIToAnthropic(body, config.defaultModel, config.defaultMaxTokens);
			const upstreamResponse = await fetchUpstreamJsonAsync(
				fetcher,
				`${config.upstreamBaseUrl}/messages`,
				authContext.upstreamHeaders,
				anthropicRequest,
				config,
			);

			if (anthropicRequest.stream) {
				const { createOpenAIStreamResponseAsync } = await import("./sse.ts");
				return await createOpenAIStreamResponseAsync(upstreamResponse, anthropicRequest.model);
			}

			return Response.json(translateAnthropicToOpenAI(await upstreamResponse.json(), anthropicRequest.model), {
				headers: { "cache-control": "no-store" },
			});
		}

		const cerebrasRequest = normalizeCerebrasRequest(body, config);
		const upstreamResponse = await fetchUpstreamJsonAsync(
			fetcher,
			`${config.upstreamBaseUrl}/chat/completions`,
			authContext.upstreamHeaders,
			cerebrasRequest,
			config,
		);

		if (cerebrasRequest.stream) {
			return new Response(upstreamResponse.body, {
				headers: upstreamResponse.headers,
				status: upstreamResponse.status,
			});
		}

		return Response.json(await upstreamResponse.json(), { headers: { "cache-control": "no-store" } });
	}

	return createErrorResponse(new ProxyError("Route not found.", { status: 404, type: "invalid_request_error" }));
}

async function readJsonBodyAsync(request: Request): Promise<OpenAIChatCompletionRequest> {
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new ProxyError("Content-Type must be application/json.", { param: "content-type", status: 415 });
	}

	const body: unknown = await request.json();
	if (typeof body !== "object" || !body || Array.isArray(body)) {
		throw new ProxyError("Request body must be a JSON object.");
	}

	const validatedBody = OpenAIChatCompletionRequestSchema(body);
	if (validatedBody instanceof type.errors) {
		throw new ProxyError(validatedBody.summary);
	}

	return validatedBody as OpenAIChatCompletionRequest;
}
