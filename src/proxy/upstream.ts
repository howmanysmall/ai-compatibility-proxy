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

	try {
		const response = await fetcher(url, {
			body: JSON.stringify(body),
			headers,
			method: "POST",
			signal: controller.signal,
		});

		if (!response.ok) throw await createUpstreamErrorAsync(response);
		return response;
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

	try {
		const response = await fetcher(url, {
			headers,
			method: "GET",
			signal: controller.signal,
		});

		if (!response.ok) throw await createUpstreamErrorAsync(response);
		return response;
	} finally {
		clearTimeout(timeoutId);
	}
}
