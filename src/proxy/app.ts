import { logger } from "@logging/logger.ts";
import { type } from "arktype";

import { translateAnthropicToOpenAi, translateOpenAiToAnthropic } from "./anthropic-translator.ts";
import { createAuthContext } from "./auth.ts";
import { normalizeCerebrasRequest } from "./cerebras-translator.ts";
import { createErrorResponse, ProxyError } from "./errors.ts";
import { getModelsAsync } from "./models.ts";
import { isOpenAiChatCompletionRequest } from "./openai-types.ts";
import { fetchUpstreamJsonAsync } from "./upstream.ts";

import type { ProxyConfiguration } from "./config.ts";
import type { OpenAiChatCompletionRequest } from "./openai-types.ts";
import type { Fetcher } from "./upstream.ts";

export interface AppOptions {
	readonly fetcher?: Fetcher;
	readonly proxyConfiguration: ProxyConfiguration;
}

export function createApp({
	proxyConfiguration: config,
	fetcher = fetch,
}: AppOptions): (request: Request) => Promise<Response> {
	return async (request: Request): Promise<Response> => {
		const requestUrl = new URL(request.url);
		const requestLogger = logger.withContext({
			method: request.method,
			path: requestUrl.pathname,
			requestId: crypto.randomUUID(),
		});
		const startedAt = performance.now();
		requestLogger.info("incoming request");

		try {
			const response = await handleRequestAsync(request, config, fetcher);
			requestLogger.info("request completed", {
				latencyMs: Math.round(performance.now() - startedAt),
				status: response.status,
			});
			return response;
		} catch (error) {
			requestLogger.error("request failed", { error: String(error) });
			const response = createErrorResponse(error);
			requestLogger.info("request completed", {
				latencyMs: Math.round(performance.now() - startedAt),
				status: response.status,
			});
			return response;
		}
	};
}

async function handleRequestAsync(
	request: Request,
	proxyConfiguration: ProxyConfiguration,
	fetcher: Fetcher,
): Promise<Response> {
	const url = new URL(request.url);

	if (request.method === "GET" && url.pathname === "/health") {
		return Response.json({
			status: "ok",
			upstream_protocol: proxyConfiguration.upstreamProtocol,
		});
	}

	if (request.method === "GET" && url.pathname === "/v1/models") {
		const authContext = createAuthContext(request, proxyConfiguration);
		return Response.json(await getModelsAsync(fetcher, authContext.upstreamHeaders, proxyConfiguration));
	}

	if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
		const authContext = createAuthContext(request, proxyConfiguration);
		const body = await readJsonBodyAsync(request);

		if (proxyConfiguration.upstreamProtocol === "anthropic_messages") {
			const anthropicRequest = translateOpenAiToAnthropic(
				body,
				proxyConfiguration.defaultModel,
				proxyConfiguration.defaultMaxTokens,
			);
			const upstreamResponse = await fetchUpstreamJsonAsync(
				fetcher,
				`${proxyConfiguration.upstreamBaseUrl}/messages`,
				authContext.upstreamHeaders,
				anthropicRequest,
				proxyConfiguration,
			);

			if (anthropicRequest.stream) {
				const { createOpenAIStreamResponseAsync } = await import("./sse.ts");
				return await createOpenAIStreamResponseAsync(upstreamResponse, anthropicRequest.model);
			}

			return Response.json(translateAnthropicToOpenAi(await upstreamResponse.json(), anthropicRequest.model), {
				headers: { "cache-control": "no-store" },
			});
		}

		const cerebrasRequest = normalizeCerebrasRequest(body, proxyConfiguration);
		const upstreamResponse = await fetchUpstreamJsonAsync(
			fetcher,
			`${proxyConfiguration.upstreamBaseUrl}/chat/completions`,
			authContext.upstreamHeaders,
			cerebrasRequest,
			proxyConfiguration,
		);

		if (cerebrasRequest.stream) {
			return new Response(upstreamResponse.body, {
				headers: upstreamResponse.headers,
				status: upstreamResponse.status,
			});
		}

		return Response.json(await upstreamResponse.json(), { headers: { "cache-control": "no-store" } });
	}

	const error = new ProxyError("Route not found.", { status: 404, type: "invalid_request_error" });
	Error.captureStackTrace(error, handleRequestAsync);
	return createErrorResponse(error);
}

async function readJsonBodyAsync(request: Request): Promise<OpenAiChatCompletionRequest> {
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		const error = new ProxyError("Content-Type must be application/json.", { param: "content-type", status: 415 });
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	const body = await request.json();
	if (typeof body !== "object" || !body || Array.isArray(body)) {
		const error = new ProxyError("Request body must be a JSON object.");
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	const result = isOpenAiChatCompletionRequest(body);
	if (result instanceof type.errors) {
		const error = new ProxyError(result.summary);
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	return result;
}
