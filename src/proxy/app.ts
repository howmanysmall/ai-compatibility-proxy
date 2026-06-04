import { getProviderTarget } from "@providers/registry.ts";
import { Hono } from "hono";

import { createErrorResponse, ProxyError } from "./errors.ts";
import { createRequestLoggingMiddleware } from "./middleware.ts";
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

	app.use("*", createRequestLoggingMiddleware());
	registerRoutes(app, {
		fetcher,
		providerTarget,
		proxyConfiguration: config,
	});

	app.notFound(() => createErrorResponse(createRouteNotFoundError()));
	app.onError((error) => createErrorResponse(error));

	return app;
}

function createRouteNotFoundError(): ProxyError {
	const error = new ProxyError("Route not found.", { status: 404, type: "invalid_request_error" });
	Error.captureStackTrace(error, createRouteNotFoundError);
	return error;
}
