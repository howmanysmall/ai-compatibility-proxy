import { Predicate } from "effect";

import { OPENAI_NULL } from "./openai-constants.ts";

import type { OpenAiErrorBody } from "./openai-types.ts";

interface ProxyErrorOptions {
	readonly code?: string | null;
	readonly param?: string | null;
	readonly status?: number;
	readonly type?: string;
}

export class ProxyError extends Error {
	public readonly status: number;
	public readonly type: string;
	public readonly param: string | null;
	public readonly code: string | null;
	public override readonly name = "ProxyError";

	public constructor(message: string, proxyErrorOptions: ProxyErrorOptions = {}) {
		super(message);
		this.status = proxyErrorOptions.status ?? 400;
		this.type = proxyErrorOptions.type ?? "invalid_request_error";
		this.param = proxyErrorOptions.param ?? OPENAI_NULL;
		this.code = proxyErrorOptions.code ?? OPENAI_NULL;
	}
}

export function createErrorBody(proxyError: ProxyError): OpenAiErrorBody {
	return {
		error: {
			code: proxyError.code,
			message: proxyError.message,
			param: proxyError.param,
			type: proxyError.type,
		},
	};
}

export function createErrorResponse(error: unknown): Response {
	const proxyError = getProxyError(error);

	return Response.json(createErrorBody(proxyError), {
		headers: { "cache-control": "no-store" },
		status: proxyError.status,
	});
}

function getProxyError(error: unknown): ProxyError {
	if (error instanceof ProxyError) return error;
	const exception = new ProxyError("Internal server error", { status: 500, type: "server_error" });
	Error.captureStackTrace(exception, getProxyError);
	return exception;
}

export async function createUpstreamErrorAsync(response: Response): Promise<ProxyError> {
	const contentType = response.headers.get("content-type") ?? "";
	const fallbackMessage = `Upstream request failed with HTTP ${response.status}.`;

	if (!contentType.includes("application/json")) {
		const text = await response.text();
		const error = new ProxyError(text.trim() || fallbackMessage, {
			status: response.status,
			type: "upstream_error",
		});
		Error.captureStackTrace(error, createUpstreamErrorAsync);
		return error;
	}

	const body = await response.json();
	const upstreamError = Predicate.isRecord(body) ? body : {};
	const message = getUpstreamErrorMessage(upstreamError) ?? fallbackMessage;

	const error = new ProxyError(message, {
		code: getStringValue(upstreamError, "code"),
		param: getStringValue(upstreamError, "param"),
		status: response.status,
		type: response.status >= 500 ? "upstream_error" : "invalid_request_error",
	});
	Error.captureStackTrace(error, createUpstreamErrorAsync);
	return error;
}

function getUpstreamErrorMessage(body: Record<string, unknown>): string | undefined {
	const { error } = body;

	if (typeof error === "string") return error;
	if (Predicate.isRecord(error)) {
		const { message } = error;
		if (typeof message === "string") return message;
	}

	const { message } = body;
	return typeof message === "string" ? message : undefined;
}

function getStringValue(body: Record<string, unknown>, key: string): string | null {
	const { error } = body;
	if (Predicate.isRecord(error) && typeof error[key] === "string") return error[key];
	if (typeof body[key] === "string") return body[key];
	return OPENAI_NULL;
}
