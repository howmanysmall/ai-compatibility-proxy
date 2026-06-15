import { logger } from "$logging/logger";
import { Duration, Effect, Either, Schedule } from "effect";

import { createUpstreamErrorAsync, ProxyError } from "./errors";
import { UpstreamHttpError, UpstreamNetworkError, UpstreamTimeoutError } from "./upstream-errors";

import type { ProxyConfiguration } from "./config";

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
interface FetchUpstreamInput {
	readonly body?: unknown;
	readonly fetcher: Fetcher;
	readonly headers: Headers;
	readonly proxyConfiguration: ProxyConfiguration;
	readonly url: string;
}
const retryTransientHttpFailures = Schedule.addDelay(Schedule.recurs(2), () => Duration.millis(500));

export async function fetchUpstreamJsonAsync({
	body,
	fetcher,
	headers,
	proxyConfiguration,
	url,
}: FetchUpstreamInput): Promise<Response> {
	return await runUpstreamEffectAsync(
		fetchUpstreamJsonEffect({ body, fetcher, headers, proxyConfiguration, url }),
		"POST",
		url,
		proxyConfiguration,
	);
}

export async function fetchUpstreamGetAsync({
	fetcher,
	headers,
	proxyConfiguration,
	url,
}: FetchUpstreamInput): Promise<Response> {
	return await runUpstreamEffectAsync(
		fetchUpstreamGetEffect({ fetcher, headers, proxyConfiguration, url }),
		"GET",
		url,
		proxyConfiguration,
	);
}

const fetchUpstreamJsonEffect = Effect.fn("fetchUpstreamJson")(function* fetchUpstreamJsonGenerator({
	body,
	fetcher,
	headers,
	proxyConfiguration,
	url,
}: FetchUpstreamInput) {
	return yield* fetchWithRetryEffect(
		fetcher,
		url,
		{
			body: JSON.stringify(body),
			headers,
			method: "POST",
		},
		proxyConfiguration,
	);
});

const fetchUpstreamGetEffect = Effect.fn("fetchUpstreamGet")(function* fetchUpstreamGetGenerator({
	fetcher,
	headers,
	proxyConfiguration,
	url,
}: FetchUpstreamInput) {
	return yield* fetchWithRetryEffect(
		fetcher,
		url,
		{
			headers,
			method: "GET",
		},
		proxyConfiguration,
	);
});

function fetchWithRetryEffect(
	fetcher: Fetcher,
	url: string,
	requestInit: RequestInit,
	proxyConfiguration: ProxyConfiguration,
): Effect.Effect<Response, Error | ProxyError | UpstreamHttpError | UpstreamTimeoutError> {
	return fetchOnceEffect(fetcher, url, requestInit, proxyConfiguration).pipe(
		Effect.retry({
			schedule: retryTransientHttpFailures,
			while: isRetryableUpstreamError,
		}),
		Effect.timeoutFail({
			duration: Duration.millis(proxyConfiguration.requestTimeoutMs),
			onTimeout: () => new UpstreamTimeoutError({ timeoutMs: proxyConfiguration.requestTimeoutMs, url }),
		}),
	);
}

function fetchOnceEffect(
	fetcher: Fetcher,
	url: string,
	requestInit: RequestInit,
	proxyConfiguration: ProxyConfiguration,
): Effect.Effect<Response, Error | ProxyError | UpstreamHttpError | UpstreamNetworkError> {
	return Effect.gen(function* fetchOnceGenerator() {
		const response = yield* Effect.tryPromise({
			catch: (cause) => new UpstreamNetworkError({ cause, url }),
			try: () => fetcher(url, requestInit),
		});

		if (response.ok) return response;

		if (response.status >= 500) {
			const body = yield* Effect.tryPromise({
				catch: (cause) => new UpstreamNetworkError({ cause, url }),
				try: () => response.text(),
			});
			return yield* Effect.fail(
				new UpstreamHttpError({
					body,
					contentType: response.headers.get("content-type"),
					status: response.status,
					url,
				}),
			);
		}

		return yield* Effect.fail(
			yield* Effect.tryPromise({
				catch: createError,
				try: () => createUpstreamErrorAsync(response, proxyConfiguration),
			}),
		);
	});
}

async function runUpstreamEffectAsync(
	effect: Effect.Effect<Response, Error | ProxyError | UpstreamHttpError | UpstreamTimeoutError>,
	method: string,
	url: string,
	proxyConfiguration: ProxyConfiguration,
): Promise<Response> {
	const upstreamUrl = getPathOnlyUrl(url);
	const startedAt = performance.now();
	logger.info("upstream call", { method, url: upstreamUrl });

	const result = await Effect.runPromise(Effect.either(effect));
	if (Either.isRight(result)) {
		const response = result.right;
		logger.info("upstream response", {
			latencyMs: Math.round(performance.now() - startedAt),
			method,
			status: response.status,
			url: upstreamUrl,
		});
		return response;
	}

	const error = result.left;
	logger.error("upstream error", {
		latencyMs: Math.round(performance.now() - startedAt),
		method,
		status: getErrorStatus(error),
		url: upstreamUrl,
	});
	throw await mapUpstreamErrorAsync(error, proxyConfiguration);
}

async function mapUpstreamErrorAsync(error: unknown, proxyConfiguration: ProxyConfiguration): Promise<unknown> {
	if (error instanceof UpstreamHttpError) {
		return await createProxyErrorFromUpstreamHttpErrorAsync(error, proxyConfiguration);
	}
	if (error instanceof UpstreamTimeoutError) return error;
	if (error instanceof UpstreamNetworkError) return getNetworkCause(error);
	return error;
}

async function createProxyErrorFromUpstreamHttpErrorAsync(
	error: UpstreamHttpError,
	proxyConfiguration: ProxyConfiguration,
): Promise<ProxyError> {
	return await createUpstreamErrorAsync(
		new Response(error.body, createUpstreamErrorResponseInit(error)),
		proxyConfiguration,
	);
}

function createUpstreamErrorResponseInit(error: UpstreamHttpError): ResponseInit {
	if (error.contentType === null) return { status: error.status };
	return {
		headers: new Headers({ "content-type": error.contentType }),
		status: error.status,
	};
}

function getErrorStatus(error: unknown): number | undefined {
	if (error instanceof UpstreamHttpError) return error.status;
	if (error instanceof ProxyError) return error.status;
	return undefined;
}

function isRetryableUpstreamError(error: unknown): error is UpstreamHttpError | UpstreamNetworkError {
	if (error instanceof UpstreamHttpError) return error.status >= 500;
	return error instanceof UpstreamNetworkError;
}

function getNetworkCause(error: UpstreamNetworkError): unknown {
	return error.cause instanceof Error ? error.cause : new Error(String(error.cause));
}

function createError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function getPathOnlyUrl(url: string): string {
	return new URL(url).pathname;
}
