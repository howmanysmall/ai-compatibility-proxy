import { hostname } from "node:os";
import path from "node:path";
import nodeProcess from "node:process";
import { inspect } from "node:util";
import { name, version } from "@constants/package-json";
import { getActiveLogContext, mergeLogContexts, sanitizeLogContext } from "@logging/log-context";
import { sanitize } from "@logging/sanitizer";
import { Predicate } from "effect";

import type { LogObject, LogType } from "consola";
import type { Writable } from "type-fest";

const UNKNOWN_HOST_NAME = "unknown";
const STANDARD_LOG_OBJECT_KEYS = new Set(["additional", "args", "context", "date", "level", "message", "tag", "type"]);
let currentSequenceNumber = 0;

export interface StructuredLogEntry {
	readonly application: {
		readonly name: string;
		readonly version: string;
	};
	readonly context: Readonly<Record<string, unknown>>;
	readonly customProperties?: Readonly<Record<string, unknown>>;
	readonly error?: unknown;
	readonly errors?: ReadonlyArray<unknown>;
	readonly level: string;
	readonly levelValue: number;
	readonly message: string;
	readonly payload?: unknown;
	readonly process: {
		readonly id: number;
		readonly platform: NodeJS.Platform;
		readonly title: string;
		readonly version: string;
	};
	readonly sequenceNumber: number;
	readonly tag?: string;
	readonly timestamp: string;
	readonly type: LogType;
	readonly host: {
		readonly name: string;
	};
}

function getHostName(): string {
	try {
		return hostname();
	} catch {
		return UNKNOWN_HOST_NAME;
	}
}

function getSeverityName(level: number, type: LogType): string {
	if (type === "fatal" || type === "error") return "error";
	if (type === "warn") return "warn";
	if (type === "debug") return "debug";
	if (type === "trace") return "trace";
	if (type === "verbose") return "verbose";
	if (level <= 1) return "error";
	if (level === 2) return "warn";
	if (level >= 4) return "debug";
	return "info";
}

function stringify(value: unknown): string {
	return Predicate.isString(value) ? value : JSON.stringify(value);
}

function buildMessage({ message, additional, type }: LogObject, sanitizedArguments: ReadonlyArray<unknown>): string {
	const explicitMessageParts: Array<string> = [];
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
	return fallbackMessage.length > 0 ? fallbackMessage : `logger.${type}`;
}

function extractCustomProperties(logObject: LogObject): Readonly<Record<string, unknown>> | undefined {
	const customProperties = Object.fromEntries(
		Object.entries(logObject).filter(([key]) => !STANDARD_LOG_OBJECT_KEYS.has(key)),
	);

	if (Object.keys(customProperties).length === 0) return undefined;

	const sanitizedCustomProperties = sanitize(customProperties);
	if (Predicate.isRecord(sanitizedCustomProperties)) return sanitizedCustomProperties;
	return { value: sanitizedCustomProperties };
}

function getLogParameters(logObject: LogObject): Array<unknown> {
	const parameters = Reflect.get(logObject, "args");
	return Array.isArray(parameters) ? parameters : [];
}

function extractErrors(logObject: LogObject): ReadonlyArray<unknown> {
	const errorValues: Array<unknown> = [];
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
			title: path.basename(nodeProcess.title),
			version: getVersion(),
		},
		sequenceNumber: ++currentSequenceNumber,
		timestamp: logObject.date.toISOString(),
		type: logObject.type,
	};
	if (customProperties !== undefined) normalizedEntry.customProperties = customProperties;
	// oxlint-disable-next-line prefer-destructuring
	if (errors[0] !== undefined) normalizedEntry.error = errors[0];
	if (errors.length > 1) normalizedEntry.errors = errors;
	if (payload !== undefined) normalizedEntry.payload = payload;
	if (logObject.tag.length > 0) normalizedEntry.tag = logObject.tag;

	return normalizedEntry;
}
