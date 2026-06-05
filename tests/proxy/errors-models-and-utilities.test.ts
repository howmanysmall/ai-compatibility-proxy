import { createErrorBody, createErrorResponse, createUpstreamErrorAsync, ProxyError } from "@proxy/errors";
import { getModelsAsync } from "@proxy/models";
import { isOpenAiErrorBody } from "@proxy/openai-types";
import { UpstreamHttpError, UpstreamTimeoutError } from "@proxy/upstream-errors";
import { getFiniteNumber, getNumber } from "@utilities/default-utilities";
import { getUnixSeconds, uptime } from "@utilities/time-utilities";
import { isArrayOfStrings, isString } from "@validators/simple-types";

import type { ProxyConfiguration } from "@proxy/config";
import type { Fetcher } from "@proxy/upstream";

const proxyConfiguration: ProxyConfiguration = {
	cerebrasDropUnsupportedFields: true,
	cerebrasStrictRequestValidation: true,
	defaultMaxTokens: 4096,
	defaultModel: "fallback-model",
	logLevel: "error",
	opencodeModelsCacheTtlMs: 300_000,
	opencodeModelsFetchTimeoutMs: 2_000,
	opencodeModelsUrl: "https://models.test/api.json",
	port: 8000,
	proxyApiKey: undefined,
	requestTimeoutMs: 60_000,
	upstreamApiKey: undefined,
	upstreamAuthHeader: "Authorization",
	upstreamAuthMode: "client_bearer",
	upstreamBaseUrl: "https://upstream.test/v1",
	upstreamProtocol: "anthropic_messages",
};

test("ProxyError serializes OpenAI-compatible error responses", async () => {
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
	if (!isOpenAiErrorBody.allows(body)) return;
	expect(body.error.param, "Expected serialized param.").toBe("model");
	expect(response.headers.get("cache-control"), "Expected no-store error response.").toBe("no-store");
});

test("createErrorResponse maps unknown failures to server errors", async () => {
	const response = createErrorResponse(new Error("boom"));
	const body: unknown = await response.json();

	expect(response.status, "Expected unknown errors to map to 500.").toBe(500);
	expect(isOpenAiErrorBody.allows(body), "Expected OpenAI-compatible error body.").toBe(true);
	if (!isOpenAiErrorBody.allows(body)) return;
	expect(body.error.type, "Expected server error type.").toBe("server_error");
});

test("createUpstreamErrorAsync extracts upstream text and JSON errors", async () => {
	const textError = await createUpstreamErrorAsync(new Response(" upstream down ", { status: 502 }));
	expect(textError.message, "Expected text upstream error message.").toBe("upstream down");
	expect(textError.type, "Expected 5xx upstream error type.").toBe("upstream_error");

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
});

test("getModelsAsync normalizes string/object models and falls back on invalid payloads", async () => {
	const fetcher: Fetcher = async () =>
		Response.json({
			data: [
				"string-model",
				{ created: 123, id: "object-model", owned_by: "upstream" },
				{ created: "bad", id: "created-fallback" },
				{ id: 123 },
				null,
			],
		});

	const models = await getModelsAsync(fetcher, new Headers(), proxyConfiguration, "proxy");

	expect(models.data.length, "Expected invalid model entries to be skipped.").toBe(3);
	expect(models.data[0]?.id, "Expected string model id.").toBe("string-model");
	expect(models.data[1]?.owned_by, "Expected upstream owner to be preserved.").toBe("upstream");
	expect(models.data[2]?.created, "Expected invalid created timestamp fallback.").toBe(0);

	const fallback = await getModelsAsync(
		async () => Response.json({ data: "invalid" }),
		new Headers(),
		proxyConfiguration,
		"proxy",
	);
	expect(fallback.data[0]?.id, "Expected fallback model on invalid model list.").toBe("fallback-model");
});

test("utility validators and numeric helpers cover edge values", () => {
	expect(getNumber(1), "Expected number passthrough.").toBe(1);
	expect(getNumber("1"), "Expected non-number fallback.").toBe(0);
	expect(getFiniteNumber(Number.POSITIVE_INFINITY), "Expected infinite number fallback.").toBe(0);
	expect(getFiniteNumber(2), "Expected finite number passthrough.").toBe(2);
	expect(isString("value"), "Expected string guard.").toBe(true);
	expect(!isString(1), "Expected non-string guard failure.").toBe(true);
	expect(isArrayOfStrings(["a", "b"]), "Expected string array guard.").toBe(true);
	expect(!isArrayOfStrings(["a", 1]), "Expected mixed array guard failure.").toBe(true);
	expect(!isArrayOfStrings("a"), "Expected non-array guard failure.").toBe(true);
	expect(getUnixSeconds() > 0, "Expected positive Unix seconds.").toBe(true);
	expect(uptime() >= 0, "Expected non-negative uptime.").toBe(true);
});

test("upstream tagged errors expose structured fields", () => {
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
