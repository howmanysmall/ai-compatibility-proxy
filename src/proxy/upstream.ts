import { logger } from "@logging/logger.ts";

import { createUpstreamErrorAsync } from "./errors.ts";

import type { ProxyConfig } from "./config.ts";

export type Fetcher = typeof fetch;

export async function fetchUpstreamJsonAsync(
	fetcher: Fetcher,
	url: string,
	headers: Headers,
	body: unknown,
	config: ProxyConfig,
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);
	const upstreamUrl = getPathOnlyUrl(url);
	const startedAt = performance.now();
	logger.info("upstream call", { method: "POST", url: upstreamUrl });

	try {
		const response = await fetcher(url, {
			body: JSON.stringify(body),
			headers,
			method: "POST",
			signal: controller.signal,
		});

		logger.info("upstream response", {
			latencyMs: Math.round(performance.now() - startedAt),
			status: response.status,
		});
		if (!response.ok) {
			logger.error("upstream error", { status: response.status, url: upstreamUrl });
			throw await createUpstreamErrorAsync(response);
		}
		return response;
	} catch (error) {
		if (error instanceof Error && error.name === "ProxyError") throw error;
		logger.error("upstream error", { status: undefined, url: upstreamUrl });
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function fetchUpstreamGetAsync(
	fetcher: Fetcher,
	url: string,
	headers: Headers,
	config: ProxyConfig,
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);
	const upstreamUrl = getPathOnlyUrl(url);
	const startedAt = performance.now();
	logger.info("upstream call", { method: "GET", url: upstreamUrl });

	try {
		const response = await fetcher(url, {
			headers,
			method: "GET",
			signal: controller.signal,
		});

		logger.info("upstream response", {
			latencyMs: Math.round(performance.now() - startedAt),
			status: response.status,
		});
		if (!response.ok) {
			logger.error("upstream error", { status: response.status, url: upstreamUrl });
			throw await createUpstreamErrorAsync(response);
		}
		return response;
	} catch (error) {
		if (error instanceof Error && error.name === "ProxyError") throw error;
		logger.error("upstream error", { status: undefined, url: upstreamUrl });
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

function getPathOnlyUrl(url: string): string {
	return new URL(url).pathname;
}
