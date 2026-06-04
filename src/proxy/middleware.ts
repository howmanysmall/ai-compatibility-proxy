import { logger } from "@logging/logger.ts";

import { createErrorResponse } from "./errors.ts";

import type { MiddlewareHandler } from "hono";

export function createRequestLoggingMiddleware(): MiddlewareHandler {
	return async (context, next) => {
		const requestUrl = new URL(context.req.raw.url);
		const requestLogger = logger.withContext({
			method: context.req.raw.method,
			path: requestUrl.pathname,
			requestId: crypto.randomUUID(),
		});
		const startedAt = performance.now();
		requestLogger.info("incoming request");

		try {
			await next();
			requestLogger.info("request completed", {
				latencyMs: Math.round(performance.now() - startedAt),
				status: context.res.status,
			});
			return context.res;
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
