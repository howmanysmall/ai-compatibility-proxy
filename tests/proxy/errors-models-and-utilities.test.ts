import { expect, describe, it } from "vitest";
import { createErrorBody, createErrorResponse, createUpstreamErrorAsync, ProxyError } from "$proxy/errors";
import { getModelsAsync } from "$proxy/models";
import { isOpenAiErrorBody } from "$proxy/openai-types";
import { UpstreamHttpError, UpstreamTimeoutError } from "$proxy/upstream-errors";
import { getFiniteNumber, getNumber } from "$utilities/default-utilities";
import { getUnixSeconds, uptime } from "$utilities/time-utilities";
import { isArrayOfStrings, isString } from "$validators/simple-types";

import { expectRecord } from "../utilities/test-utilities";

import type { ProxyConfiguration } from "$proxy/config";
import type { Fetcher } from "$proxy/upstream";

const proxyConfiguration: ProxyConfiguration = {
	allowedUpstreamHosts: [],
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "fallback-model",
	logLevel: "error",
	maxRequestBodySizeBytes: 1_048_576,
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "Authorization",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://upstream.test/v1",
	upstreamErrorTransparency: true,
	upstreamProtocol: "anthropic_messages",
};

const mixedModelsFetcherAsync: Fetcher = async () =>
	Response.json({
		data: [
			"string-model",
			{ created: 123, id: "object-model", owned_by: "upstream" },
			{ created: "bad", id: "created-fallback" },
			{ id: 123 },
			null,
		],
	});

const invalidModelsFetcherAsync: Fetcher = async () => Response.json({ data: "invalid" });

describe("errors, models, and utilities", () => {
	it("proxyError serializes OpenAI-compatible error responses", async () => {
		expect.assertions(7);
		const proxyError = new ProxyError("bad request", {
			code: "bad_code",
			param: "model",
			status: 422,
			type: "invalid_request_error",
		});

		expect(createErrorBody(proxyError).error.message, "Expected error body message.").toBe("bad request");

		const response = createErrorResponse(proxyError);
		const body: unknown = await response.json();

		expect(response.status, "Expected proxy error status.").toBe(422);
		expect(isOpenAiErrorBody.allows(body), "Expected OpenAI-compatible error body.").toBe(true);
		expectRecord(body, "Expected error body record.");
		expectRecord(body.error, "Expected nested error record.");
		expect(body.error.param, "Expected serialized param.").toBe("model");
		expect(response.headers.get("cache-control"), "Expected no-store error response.").toBe("no-store");
	});

	it("createErrorResponse maps unknown failures to server errors", async () => {
		expect.assertions(5);
		const response = createErrorResponse(new Error("boom"));
		const body: unknown = await response.json();

		expect(response.status, "Expected unknown errors to map to 500.").toBe(500);
		expect(isOpenAiErrorBody.allows(body), "Expected OpenAI-compatible error body.").toBe(true);
		expectRecord(body, "Expected error body record.");
		expectRecord(body.error, "Expected nested error record.");
		expect(body.error.type, "Expected server error type.").toBe("server_error");
	});

	it("createUpstreamErrorAsync extracts upstream text and JSON errors", async () => {
		expect.assertions(15);
		const textError = await createUpstreamErrorAsync(new Response(" upstream down ", { status: 502 }));
		expect(textError.message, "Expected text upstream error message.").toBe("upstream down");
		expect(textError.type, "Expected 5xx upstream error type.").toBe("upstream_error");

		const emptyTextError = await createUpstreamErrorAsync(new Response("   ", { status: 503 }));
		expect(emptyTextError.message, "Expected empty text upstream fallback message.").toBe(
			"Upstream request failed with HTTP 503.",
		);

		const noContentTypeError = await createUpstreamErrorAsync(new Response(null, { status: 502 }));
		expect(noContentTypeError.message, "Expected missing content type fallback message.").toBe(
			"Upstream request failed with HTTP 502.",
		);

		const jsonError = await createUpstreamErrorAsync(
			Response.json(
				{
					error: {
						code: "invalid_model",
						message: "missing model",
						param: "model",
					},
				},
				{ status: 400 },
			),
		);

		expect(jsonError.message, "Expected nested JSON upstream message.").toBe("missing model");
		expect(jsonError.code, "Expected nested JSON code.").toBe("invalid_model");
		expect(jsonError.param, "Expected nested JSON param.").toBe("model");

		const stringJsonError = await createUpstreamErrorAsync(
			Response.json({ error: "plain JSON error" }, { status: 500 }),
		);
		expect(stringJsonError.message, "Expected string JSON error.").toBe("plain JSON error");
		expect(stringJsonError.type, "Expected 5xx JSON error type.").toBe("upstream_error");

		const topLevelJsonError = await createUpstreamErrorAsync(
			Response.json({ code: "bad_code", message: "top-level message", param: "body" }, { status: 400 }),
		);
		expect(topLevelJsonError.message, "Expected top-level JSON message.").toBe("top-level message");
		expect(topLevelJsonError.code, "Expected top-level JSON code.").toBe("bad_code");
		expect(topLevelJsonError.param, "Expected top-level JSON param.").toBe("body");

		const fallbackJsonError = await createUpstreamErrorAsync(Response.json(1, { status: 418 }));
		expect(fallbackJsonError.message, "Expected non-object JSON fallback message.").toBe(
			"Upstream request failed with HTTP 418.",
		);
		expect(fallbackJsonError.code, "Expected missing JSON code to map to null.").toBeNull();

		const nestedErrorWithoutMessage = await createUpstreamErrorAsync(
			Response.json({ error: { message: 123 }, message: "top-level fallback" }, { status: 400 }),
		);
		expect(
			nestedErrorWithoutMessage.message,
			"Expected top-level message when nested error message is not string.",
		).toBe("top-level fallback");
	});

	it("getModelsAsync normalizes string/object models and falls back on invalid payloads", async () => {
		expect.assertions(5);
		const models = await getModelsAsync(mixedModelsFetcherAsync, new Headers(), proxyConfiguration, "proxy");

		expect(models.data).toHaveLength(3);
		expect(models.data[0]?.id, "Expected string model id.").toBe("string-model");
		expect(models.data[1]?.owned_by, "Expected upstream owner to be preserved.").toBe("upstream");
		expect(models.data[2]?.created, "Expected invalid created timestamp fallback.").toBe(0);

		const fallback = await getModelsAsync(invalidModelsFetcherAsync, new Headers(), proxyConfiguration, "proxy");
		expect(fallback.data[0]?.id, "Expected fallback model on invalid model list.").toBe("fallback-model");
	});

	it("utility validators and numeric helpers cover edge values", () => {
		expect.assertions(11);
		expect(getNumber(1), "Expected number passthrough.").toBe(1);
		expect(getNumber("1"), "Expected non-number fallback.").toBe(0);
		expect(getFiniteNumber(Number.POSITIVE_INFINITY), "Expected infinite number fallback.").toBe(0);
		expect(getFiniteNumber(2), "Expected finite number passthrough.").toBe(2);
		expect(isString("value"), "Expected string guard.").toBe(true);
		expect(!isString(1), "Expected non-string guard failure.").toBe(true);
		expect(isArrayOfStrings(["a", "b"]), "Expected string array guard.").toBe(true);
		expect(!isArrayOfStrings(["a", 1]), "Expected mixed array guard failure.").toBe(true);
		expect(!isArrayOfStrings("a"), "Expected non-array guard failure.").toBe(true);
		expect(getUnixSeconds(), "Expected positive Unix seconds.").toBeGreaterThan(0);
		expect(uptime(), "Expected non-negative uptime.").toBeGreaterThanOrEqual(0);
	});

	it("upstream tagged errors expose structured fields", () => {
		expect.assertions(4);
		const timeout = new UpstreamTimeoutError({ timeoutMs: 100, url: "https://example.test" });
		const http = new UpstreamHttpError({
			body: "bad",
			contentType: "text/plain",
			status: 503,
			url: "https://example.test",
		});

		expect(timeout._tag, "Expected timeout tag.").toBe("UpstreamTimeoutError");
		expect(timeout.timeoutMs, "Expected timeout field.").toBe(100);
		expect(http._tag, "Expected HTTP tag.").toBe("UpstreamHttpError");
		expect(http.status, "Expected HTTP status field.").toBe(503);
	});

	it("createUpstreamErrorAsync respects error transparency", async () => {
		expect.assertions(6);
		const config: ProxyConfiguration = {
			...proxyConfiguration,
			upstreamErrorTransparency: false,
		};

		const opaqueError = await createUpstreamErrorAsync(
			new Response("upstream failed with DB connection error", { status: 500 }),
			config,
		);
		expect(opaqueError.message, "Expected generic error message.").toBe(
			"An error occurred with the upstream provider.",
		);
		expect(opaqueError.status, "Expected status to be preserved.").toBe(500);
		expect(opaqueError.type, "Expected 500 status to map to upstream_error.").toBe("upstream_error");

		const opaqueError400 = await createUpstreamErrorAsync(
			new Response("upstream bad request details", { status: 400 }),
			config,
		);
		expect(opaqueError400.message, "Expected generic error message.").toBe(
			"An error occurred with the upstream provider.",
		);
		expect(opaqueError400.status, "Expected status to be preserved.").toBe(400);
		expect(opaqueError400.type, "Expected 400 status to map to invalid_request_error.").toBe(
			"invalid_request_error",
		);
	});
});
