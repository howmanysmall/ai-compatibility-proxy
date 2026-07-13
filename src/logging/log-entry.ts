import { hostname } from "node:os";
import nodePath from "node:path";
import nodeProcess from "node:process";
import { inspect } from "node:util";
import { name, version } from "$constants/package-json";
import { getActiveLogContext, mergeLogContexts, sanitizeLogContext } from "$logging/log-context";
import { sanitize, sanitizeRecord } from "$logging/sanitizer";
import { type } from "arktype";
import { Predicate } from "effect";

import type { LogObject, LogType } from "consola";
import type { Writable } from "type-fest";

const UNKNOWN_HOST_NAME = "unknown";
const STANDARD_LOG_OBJECT_KEYS = new Set(["additional", "args", "context", "date", "level", "message", "tag", "type"]);
let currentSequenceNumber = 0;

const isApplication = type({
	name: "string",
	version: "string",
}).readonly();

const isRecord = type("Record<string, unknown>").readonly();
const isPlatform = type(
	'"aix" | "android" | "darwin" | "freebsd" | "haiku" | "linux" | "openbsd" | "sunos" | "win32" | "cygwin" | "netbsd"',
);
const isLogType = type(
	'"silent" | "fatal" | "error" | "warn" | "log" | "info" | "success" | "fail" | "ready" | "start" | "box" | "debug" | "trace" | "verbose"',
);

const isHost = type({ name: "string" }).readonly();
const isProcess = type({
	id: "number",
	platform: isPlatform,
	title: "string",
	version: "string",
}).readonly();

export const isStructuredLogEntry = type({
	application: isApplication,
	context: isRecord,
	"customProperties?": isRecord,
	"error?": "unknown",
	"errors?": type("unknown[]").readonly(),
	host: isHost,
	level: "string",
	levelValue: "number",
	message: "string",
	"payload?": "unknown",
	process: isProcess,
	sequenceNumber: "number",
	"tag?": "string",
	timestamp: "string",
	type: isLogType,
})
	.readonly()
	.onDeepUndeclaredKey("reject");

export type StructuredLogEntry = typeof isStructuredLogEntry.infer;

function getHostName(): string {
	try {
		return hostname();
		/* v8 ignore start -- hostname() failure is platform defensive and not reproducible through public API. */
	} catch {
		return UNKNOWN_HOST_NAME;
	}
	/* v8 ignore stop */
}

function getSeverityName(level: number, logType: LogType): string {
	if (logType === "fatal" || logType === "error") return "error";
	if (logType === "warn") return "warn";
	if (logType === "debug") return "debug";
	if (logType === "trace") return "trace";
	if (logType === "verbose") return "verbose";
	if (level <= 1) return "error";
	if (level === 2) return "warn";
	if (level >= 4) return "debug";
	return "info";
}

function stringify(value: unknown): string {
	return Predicate.isString(value) ? value : JSON.stringify(value);
}

function buildMessage(
	{ message, additional, type: logType }: LogObject,
	sanitizedArguments: ReadonlyArray<unknown>,
): string {
	const explicitMessageParts = new Array<string>();
	let size = 0;

	if (Predicate.isString(message) && message.length > 0) explicitMessageParts[size++] = message;
	if (Predicate.isString(additional) && additional.length > 0) explicitMessageParts[size++] = additional;
	if (Array.isArray(additional)) {
		for (const value of additional) {
			if (value.length === 0) continue;
			explicitMessageParts[size++] = value;
		}
	}

	if (explicitMessageParts.length > 0) return explicitMessageParts.join(" ");

	const fallbackMessage = sanitizedArguments.map(stringify).join(" ").trim();
	return fallbackMessage.length > 0 ? fallbackMessage : `logger.${logType}`;
}

function extractCustomProperties(logObject: LogObject): Readonly<Record<string, unknown>> | undefined {
	const customProperties = Object.fromEntries(
		Object.entries(logObject).filter(([key]) => !STANDARD_LOG_OBJECT_KEYS.has(key)),
	);

	if (Object.keys(customProperties).length === 0) return undefined;

	return sanitizeRecord(customProperties);
}

function getLogParameters(logObject: LogObject): Array<unknown> {
	const parameters = Reflect.get(logObject, "args");
	return Array.isArray(parameters) ? parameters : [];
}

function extractErrors(logObject: LogObject): ReadonlyArray<unknown> {
	const errorValues = new Array<unknown>();
	let size = 0;

	for (const value of getLogParameters(logObject)) {
		if (!Predicate.isError(value)) continue;
		errorValues[size++] = sanitize(value);
	}

	if ("error" in logObject && logObject.error !== undefined) errorValues.unshift(sanitize(logObject.error));
	return errorValues;
}

function getPayload(sanitizedArguments: ReadonlyArray<unknown>): unknown {
	if (sanitizedArguments.length === 0) return undefined;
	if (sanitizedArguments.length === 1) return sanitizedArguments[0];
	return sanitizedArguments;
}

function getVersion(): string {
	return inspect(
		{
			bun: typeof Bun === "undefined" ? "unavailable" : Bun.version,
			node: nodeProcess.version,
		},
		{
			depth: 1,
			sorted: true,
		},
	);
}

export function normalizeLogEntry(logObject: LogObject): StructuredLogEntry {
	const sanitizedArguments = getLogParameters(logObject).map((value) => sanitize(value));
	const errors = extractErrors(logObject);
	const context = mergeLogContexts(
		getActiveLogContext(),
		Predicate.isRecord(logObject.context) ? sanitizeLogContext(logObject.context) : undefined,
	);
	const customProperties = extractCustomProperties(logObject);
	const payload = getPayload(sanitizedArguments);

	const normalizedEntry: Writable<StructuredLogEntry> = {
		application: { name, version },
		context,
		host: { name: getHostName() },
		level: getSeverityName(logObject.level, logObject.type),
		levelValue: logObject.level,
		message: buildMessage(logObject, sanitizedArguments),
		process: {
			id: nodeProcess.pid,
			platform: nodeProcess.platform,
			title: nodePath.basename(nodeProcess.title),
			version: getVersion(),
		},
		sequenceNumber: ++currentSequenceNumber,
		timestamp: logObject.date.toISOString(),
		type: logObject.type,
	};
	if (customProperties !== undefined) normalizedEntry.customProperties = customProperties;
	// oxlint-disable-next-line prefer-destructuring -- not applicable for array access
	if (errors[0] !== undefined) normalizedEntry.error = errors[0];
	if (errors.length > 1) normalizedEntry.errors = errors;
	if (payload !== undefined) normalizedEntry.payload = payload;
	if (logObject.tag.length > 0) normalizedEntry.tag = logObject.tag;

	return normalizedEntry;
}
