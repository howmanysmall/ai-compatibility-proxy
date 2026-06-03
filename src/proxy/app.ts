import { logger } from "@logging/logger.ts";
import { getProviderTarget } from "@providers/registry.ts";
import { type } from "arktype";

import { createAuthContext } from "./auth.ts";
import { createErrorResponse, ProxyError } from "./errors.ts";
import { isOpenAiChatCompletionRequest } from "./openai-types.ts";

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
	const providerTarget = getProviderTarget(config.upstreamProtocol);

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
			const response = await handleRequestAsync(request, config, fetcher, providerTarget);
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
	providerTarget: ReturnType<typeof getProviderTarget>,
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
		return Response.json(
			await providerTarget.listModelsAsync({
				fetcher,
				headers: authContext.upstreamHeaders,
				proxyConfiguration,
			}),
		);
	}

	if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
		const authContext = createAuthContext(request, proxyConfiguration);
		const body = await readJsonBodyAsync(request);
		return await providerTarget.createChatCompletionAsync({
			fetcher,
			headers: authContext.upstreamHeaders,
			proxyConfiguration,
			request: body,
		});
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

	if (!Array.isArray(result.messages) || result.messages.length === 0) {
		const error = new ProxyError("At least one message is required.", { param: "messages" });
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	return result;
}
