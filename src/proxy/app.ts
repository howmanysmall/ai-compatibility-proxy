import { logger, parseLevel } from "$logging/logger";
import { getProviderTarget } from "$providers/registry";
import { Elysia } from "elysia";

import { createErrorResponse, ProxyError } from "./errors";
import { registerRoutes } from "./routes";

import type { ProxyConfiguration } from "./config";
import type { Fetcher } from "./upstream";

export interface AppOptions {
	readonly fetcher?: Fetcher;
	readonly proxyConfiguration: ProxyConfiguration;
}

export type ProxyApp = Elysia;
interface FetchCapableApp {
	readonly fetch: (request: Request) => Response | Promise<Response>;
}

export function createApp({ proxyConfiguration: config, fetcher = fetch }: AppOptions): ProxyApp {
	const providerTarget = getProviderTarget(config.upstreamProtocol);
	const app = new Elysia();

	registerRoutes(app, {
		fetcher,
		providerTarget,
		proxyConfiguration: config,
	});

	app.onError(({ code, error }) => {
		/* v8 ignore start -- route handlers normalize expected errors; non-404 framework errors are defensive. */
		if (code !== "NOT_FOUND") return createErrorResponse(error);
		/* v8 ignore stop */
		return createErrorResponse(createRouteNotFoundError());
	});

	return app;
}

export function createFetchHandler(options: AppOptions): (request: Request) => Promise<Response> {
	const app = createApp(options);
	return createFetchHandlerForApp(app, options.proxyConfiguration.logLevel);
}

export function createFetchHandlerForApp(
	app: FetchCapableApp,
	logLevel: string,
): (request: Request) => Promise<Response> {
	if (isFatalLogLevel(logLevel)) {
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
