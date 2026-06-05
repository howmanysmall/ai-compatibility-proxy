import { type } from "arktype";

import { createAuthContext } from "./auth.ts";
import { ProxyError } from "./errors.ts";
import { isOpenAiChatCompletionRequest } from "./openai-types.ts";

import type { getProviderTarget } from "@providers/registry.ts";
import type { Hono } from "hono";

import type { ProxyConfiguration } from "./config.ts";
import type { OpenAiChatCompletionRequest } from "./openai-types.ts";
import type { Fetcher } from "./upstream.ts";

interface RouteDependencies {
	readonly fetcher: Fetcher;
	readonly providerTarget: ReturnType<typeof getProviderTarget>;
	readonly proxyConfiguration: ProxyConfiguration;
}

export function registerRoutes(app: Hono, dependencies: RouteDependencies): void {
	app.get("/health", () => createHealthResponse(dependencies.proxyConfiguration));

	app.get("/v1/models", async (context) => {
		const authContext = createAuthContext(context.req.raw, dependencies.proxyConfiguration);
		return Response.json(
			await dependencies.providerTarget.listModelsAsync({
				fetcher: dependencies.fetcher,
				headers: authContext.upstreamHeaders,
				proxyConfiguration: dependencies.proxyConfiguration,
			}),
		);
	});

	app.post("/v1/chat/completions", async (context) => {
		const authContext = createAuthContext(context.req.raw, dependencies.proxyConfiguration);
		const body = await readJsonBodyAsync(context.req.raw);
		return await dependencies.providerTarget.createChatCompletionAsync({
			fetcher: dependencies.fetcher,
			headers: authContext.upstreamHeaders,
			proxyConfiguration: dependencies.proxyConfiguration,
			request: body,
		});
	});
}

function createHealthResponse(proxyConfiguration: ProxyConfiguration): Response {
	return Response.json({
		status: "ok",
		upstream_protocol: proxyConfiguration.upstreamProtocol,
	});
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
