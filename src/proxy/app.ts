import { logger, parseLevel } from "@logging/logger.ts";
import { getProviderTarget } from "@providers/registry.ts";
import { Hono } from "hono";

import { createErrorResponse, ProxyError } from "./errors.ts";
import { registerRoutes } from "./routes.ts";

import type { ProxyConfiguration } from "./config.ts";
import type { Fetcher } from "./upstream.ts";

export interface AppOptions {
	readonly fetcher?: Fetcher;
	readonly proxyConfiguration: ProxyConfiguration;
}

export function createApp({ proxyConfiguration: config, fetcher = fetch }: AppOptions): Hono {
	const providerTarget = getProviderTarget(config.upstreamProtocol);
	const app = new Hono();

	registerRoutes(app, {
		fetcher,
		providerTarget,
		proxyConfiguration: config,
	});

	app.notFound(() => createErrorResponse(createRouteNotFoundError()));
	app.onError((error) => createErrorResponse(error));

	return app;
}

export function createFetchHandler(options: AppOptions): (request: Request) => Promise<Response> {
	const app = createApp(options);
	if (isFatalLogLevel(options.proxyConfiguration.logLevel)) {
		return async (request) => {
			try {
				return await app.fetch(request);
			} catch (error) {
				return createErrorResponse(error);
			}
		};
	}

	return async (request) => {
		const requestUrl = new URL(request.url);
		const requestLogger = logger.withContext({
			method: request.method,
			path: requestUrl.pathname,
			requestId: crypto.randomUUID(),
		});
		const startedAt = performance.now();
		requestLogger.info("incoming request");

		try {
			const response = await app.fetch(request);
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

function createRouteNotFoundError(): ProxyError {
	const error = new ProxyError("Route not found.", { status: 404, type: "invalid_request_error" });
	Error.captureStackTrace(error, createRouteNotFoundError);
	return error;
}

function isFatalLogLevel(logLevel: string): boolean {
	return parseLevel(logLevel) === 0;
}
