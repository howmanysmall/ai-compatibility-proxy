import { OPENAI_NULL } from "./openai-constants.ts";

import type { OpenAIErrorBody } from "./openai-types.ts";

export class ProxyError extends Error {
	readonly status: number;
	readonly type: string;
	readonly param: string | null;
	readonly code: string | null;
	override name = "ProxyError";

	constructor(
		message: string,
		options: {
			status?: number;
			type?: string;
			param?: string | null;
			code?: string | null;
		} = {},
	) {
		super(message);
		this.status = options.status ?? 400;
		this.type = options.type ?? "invalid_request_error";
		this.param = options.param ?? OPENAI_NULL;
		this.code = options.code ?? OPENAI_NULL;
	}
}

export function createErrorBody(error: ProxyError): OpenAIErrorBody {
	return {
		error: {
			code: error.code,
			message: error.message,
			param: error.param,
			type: error.type,
		},
	};
}

export function createErrorResponse(error: unknown): Response {
	const proxyError = getProxyError(error);

	return Response.json(createErrorBody(proxyError), {
		headers: {
			"cache-control": "no-store",
		},
		status: proxyError.status,
	});
}

function getProxyError(error: unknown): ProxyError {
	if (error instanceof ProxyError) return error;
	return new ProxyError("Internal server error", { status: 500, type: "server_error" });
}

export async function createUpstreamErrorAsync(response: Response): Promise<ProxyError> {
	const contentType = response.headers.get("content-type") ?? "";
	const fallbackMessage = `Upstream request failed with HTTP ${response.status}.`;

	if (!contentType.includes("application/json")) {
		const text = await response.text();
		return new ProxyError(text.trim() || fallbackMessage, {
			status: response.status,
			type: "upstream_error",
		});
	}

	const body: unknown = await response.json();
	const upstreamError = isRecord(body) ? body : {};
	const message = getUpstreamErrorMessage(upstreamError) ?? fallbackMessage;

	return new ProxyError(message, {
		code: getStringValue(upstreamError, "code"),
		param: getStringValue(upstreamError, "param"),
		status: response.status,
		type: response.status >= 500 ? "upstream_error" : "invalid_request_error",
	});
}

function getUpstreamErrorMessage(body: Record<string, unknown>): string | undefined {
	const { error } = body;

	if (typeof error === "string") return error;
	if (isRecord(error)) {
		const { message } = error;
		if (typeof message === "string") return message;
	}

	const { message } = body;
	return typeof message === "string" ? message : undefined;
}

function getStringValue(body: Record<string, unknown>, key: string): string | null {
	const { error } = body;
	if (isRecord(error) && typeof error[key] === "string") return error[key];
	if (typeof body[key] === "string") return body[key];
	return OPENAI_NULL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && Boolean(value) && !Array.isArray(value);
}
