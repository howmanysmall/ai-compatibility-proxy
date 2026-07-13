import { type } from "arktype";
import { Predicate } from "effect";

import { createAuthContext } from "./auth";
import { createErrorResponse, ProxyError } from "./errors";
import { isOpenAiChatCompletionRequest } from "./openai-types";

import type { getProviderTarget } from "$providers/registry";

import type { ProxyApp } from "./app";
import type { ProxyConfiguration } from "./config";
import type { OpenAiChatCompletionRequest } from "./openai-types";
import type { Fetcher } from "./upstream";

interface RouteDependencies {
	readonly fetcher: Fetcher;
	readonly providerTarget: ReturnType<typeof getProviderTarget>;
	readonly proxyConfiguration: ProxyConfiguration;
}

export function registerRoutes(app: ProxyApp, dependencies: RouteDependencies): void {
	app.get("/health", () => createHealthResponse(dependencies.proxyConfiguration));

	app.get("/v1/models", async ({ request }) =>
		handleRouteAsync(async () => {
			const authContext = createAuthContext(request, dependencies.proxyConfiguration);
			return Response.json(
				await dependencies.providerTarget.listModelsAsync({
					fetcher: dependencies.fetcher,
					headers: authContext.upstreamHeaders,
					proxyConfiguration: dependencies.proxyConfiguration,
				}),
			);
		}),
	);

	app.post("/v1/chat/completions", async ({ request }) =>
		handleRouteAsync(async () => {
			const authContext = createAuthContext(request, dependencies.proxyConfiguration);
			const body = await readJsonBodyAsync(request, dependencies.proxyConfiguration);
			return dependencies.providerTarget.createChatCompletionAsync({
				fetcher: dependencies.fetcher,
				headers: authContext.upstreamHeaders,
				proxyConfiguration: dependencies.proxyConfiguration,
				request: body,
			});
		}),
	);
}

async function handleRouteAsync(callback: () => Promise<Response>): Promise<Response> {
	try {
		return await callback();
	} catch (error) {
		return createErrorResponse(error);
	}
}

function createHealthResponse(proxyConfiguration: ProxyConfiguration): Response {
	return Response.json({
		status: "ok",
		upstream_protocol: proxyConfiguration.upstreamProtocol,
	});
}

async function readJsonBodyAsync(
	request: Request,
	{ maxRequestBodySizeBytes }: ProxyConfiguration,
): Promise<OpenAiChatCompletionRequest> {
	validateContentType(request);
	validateContentLengthHeader(request, maxRequestBodySizeBytes);
	const bodyBytes = await readBodyBytesAsync(request, maxRequestBodySizeBytes);
	const body = parseJsonBody(new TextDecoder().decode(bodyBytes));
	return validateChatCompletionRequest(body);
}

function validateContentType(request: Request): void {
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		const error = new ProxyError("Content-Type must be application/json.", { param: "content-type", status: 415 });
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}
}

function validateContentLengthHeader(request: Request, maxRequestBodySizeBytes: number): void {
	const contentLengthHeader = request.headers.get("content-length");
	if (contentLengthHeader === null || contentLengthHeader.length === 0) return;

	const contentLength = Math.trunc(Number(contentLengthHeader));
	if (Number.isNaN(contentLength) || contentLength > maxRequestBodySizeBytes) {
		const error = new ProxyError("Request body exceeds maximum allowed size.", { status: 413 });
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}
}

async function readBodyBytesAsync(request: Request, maxRequestBodySizeBytes: number): Promise<Uint8Array> {
	if (!request.body) {
		const error = new ProxyError("Request body is empty.");
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	const reader = request.body.getReader();
	const chunks = new Array<Uint8Array>();
	let totalBytes = 0;
	try {
		while (true) {
			// oxlint-disable-next-line no-await-in-loop -- reading from stream
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.length;
			if (totalBytes > maxRequestBodySizeBytes) {
				const error = new ProxyError("Request body exceeds maximum allowed size.", { status: 413 });
				Error.captureStackTrace(error, readJsonBodyAsync);
				throw error;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bodyBytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bodyBytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bodyBytes;
}

function parseJsonBody(bodyText: string): unknown {
	try {
		return JSON.parse(bodyText);
	} catch (error) {
		const exception = new ProxyError("Failed to parse request body as JSON.", { cause: error });
		Error.captureStackTrace(exception, readJsonBodyAsync);
		throw exception;
	}
}

function validateChatCompletionRequest(body: unknown): OpenAiChatCompletionRequest {
	if (typeof body !== "object" || !body || Array.isArray(body)) {
		const error = new ProxyError("Request body must be a JSON object.");
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	const result = isOpenAiChatCompletionRequest(body);
	if (result instanceof type.errors) {
		const error = new ProxyError(result.summary);
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	validateMessages(result.messages);
	return result;
}

function validateMessages(messages: OpenAiChatCompletionRequest["messages"]): void {
	if (!Array.isArray(messages) || messages.length === 0) {
		const error = new ProxyError("At least one message is required.", { param: "messages" });
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	if (messages.length > 2048) {
		const error = new ProxyError("Message count exceeds maximum allowed limit of 2048 messages.", {
			param: "messages",
			status: 400,
		});
		Error.captureStackTrace(error, readJsonBodyAsync);
		throw error;
	}

	for (let index = 0; index < messages.length; index += 1) {
		validateMessageContent(messages[index], index);
	}
}

function validateMessageContent(message: unknown, index: number): void {
	if (!Predicate.isRecord(message)) return;

	const { content } = message;
	if (content === undefined || content === null) return;

	if (typeof content === "string") {
		if (content.length > 524_288) {
			const error = new ProxyError(
				`Message content at index ${index} exceeds maximum allowed limit of 524288 characters.`,
				{ param: `messages[${index}].content`, status: 400 },
			);
			Error.captureStackTrace(error, readJsonBodyAsync);
			throw error;
		}
		return;
	}

	if (!Array.isArray(content)) return;

	for (let jndex = 0; jndex < content.length; jndex += 1) {
		validateMessageContentPart(content[jndex], index, jndex);
	}
}

function validateMessageContentPart(part: unknown, index: number, jndex: number): void {
	if (!Predicate.isRecord(part) || typeof part.text !== "string" || part.text.length <= 524_288) return;

	const error = new ProxyError(
		`Message content part text at index ${index}.${jndex} exceeds maximum allowed limit of 524288 characters.`,
		{ param: `messages[${index}].content[${jndex}].text`, status: 400 },
	);
	Error.captureStackTrace(error, readJsonBodyAsync);
	throw error;
}
