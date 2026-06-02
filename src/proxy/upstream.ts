import { logger } from "@logging/logger.ts";
import { Data, Duration, Effect, Either, Schedule } from "effect";

import { createUpstreamErrorAsync, ProxyError } from "./errors.ts";
import { UpstreamHttpError, UpstreamTimeoutError } from "./upstream-errors.ts";

import type { ProxyConfiguration } from "./config.ts";

export type Fetcher = typeof fetch;

const retryTransientHttpFailures = Schedule.addDelay(Schedule.recurs(2), () => Duration.millis(500));

class UpstreamNetworkError extends Data.TaggedError("UpstreamNetworkError")<{
	readonly cause: unknown;
	readonly url: string;
}> {}

export async function fetchUpstreamJsonAsync(
	fetcher: Fetcher,
	url: string,
	headers: Headers,
	body: unknown,
	{ requestTimeoutMs }: ProxyConfiguration,
): Promise<Response> {
	return await runUpstreamEffectAsync(
		fetchUpstreamJsonEffect(fetcher, url, headers, body, requestTimeoutMs),
		"POST",
		url,
	);
}

export async function fetchUpstreamGetAsync(
	fetcher: Fetcher,
	url: string,
	headers: Headers,
	{ requestTimeoutMs }: ProxyConfiguration,
): Promise<Response> {
	return await runUpstreamEffectAsync(fetchUpstreamGetEffect(fetcher, url, headers, requestTimeoutMs), "GET", url);
}

const fetchUpstreamJsonEffect = Effect.fn("fetchUpstreamJson")(function* fetchUpstreamJsonGenerator(
	fetcher: Fetcher,
	url: string,
	headers: Headers,
	body: unknown,
	timeoutMs: number,
) {
	return yield* fetchWithRetryEffect(
		fetcher,
		url,
		{
			body: JSON.stringify(body),
			headers,
			method: "POST",
		},
		timeoutMs,
	);
});

const fetchUpstreamGetEffect = Effect.fn("fetchUpstreamGet")(function* fetchUpstreamGetGenerator(
	fetcher: Fetcher,
	url: string,
	headers: Headers,
	timeoutMs: number,
) {
	return yield* fetchWithRetryEffect(
		fetcher,
		url,
		{
			headers,
			method: "GET",
		},
		timeoutMs,
	);
});

function fetchWithRetryEffect(
	fetcher: Fetcher,
	url: string,
	requestInit: RequestInit,
	timeoutMs: number,
): Effect.Effect<Response, Error | ProxyError | UpstreamHttpError | UpstreamTimeoutError> {
	return fetchOnceEffect(fetcher, url, requestInit).pipe(
		Effect.retry({
			schedule: retryTransientHttpFailures,
			while: isRetryableUpstreamError,
		}),
		Effect.timeoutFail({
			duration: Duration.millis(timeoutMs),
			onTimeout: () => new UpstreamTimeoutError({ timeoutMs, url }),
		}),
	);
}

function fetchOnceEffect(
	fetcher: Fetcher,
	url: string,
	requestInit: RequestInit,
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
				try: () => createUpstreamErrorAsync(response),
			}),
		);
	});
}

async function runUpstreamEffectAsync(
	effect: Effect.Effect<Response, Error | ProxyError | UpstreamHttpError | UpstreamTimeoutError>,
	method: string,
	url: string,
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
	throw await mapUpstreamErrorAsync(error);
}

async function mapUpstreamErrorAsync(error: unknown): Promise<unknown> {
	if (error instanceof UpstreamHttpError) return await createProxyErrorFromUpstreamHttpErrorAsync(error);
	if (error instanceof UpstreamTimeoutError) return error;
	if (error instanceof UpstreamNetworkError) return getNetworkCause(error);
	return error;
}

async function createProxyErrorFromUpstreamHttpErrorAsync(error: UpstreamHttpError): Promise<ProxyError> {
	return await createUpstreamErrorAsync(new Response(error.body, createUpstreamErrorResponseInit(error)));
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
