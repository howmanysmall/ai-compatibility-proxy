import nodeProcess from "node:process";
import { name, version } from "@constants/package-json.ts";
import { getActiveLogContext, mergeLogContexts, sanitizeLogContext } from "@logging/log-context.ts";
import { sanitize } from "@logging/sanitizer.ts";
import { basename } from "@std/path";

import type { LogObject, LogType } from "consola";

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
		readonly platform: typeof Deno.build.os;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getHostName(): string {
	try {
		return Deno.hostname();
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
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

function buildMessage(logObject: LogObject, sanitizedArguments: ReadonlyArray<unknown>): string {
	const explicitMessageParts: Array<string> = [];

	if (typeof logObject.message === "string" && logObject.message.length > 0) {
		explicitMessageParts.push(logObject.message);
	}
	if (typeof logObject.additional === "string" && logObject.additional.length > 0) {
		explicitMessageParts.push(logObject.additional);
	}
	if (Array.isArray(logObject.additional)) {
		explicitMessageParts.push(...logObject.additional.filter((value) => value.length > 0));
	}

	if (explicitMessageParts.length > 0) return explicitMessageParts.join(" ");

	const fallbackMessage = sanitizedArguments.map(stringify).join(" ").trim();
	return fallbackMessage.length > 0 ? fallbackMessage : `logger.${logObject.type}`;
}

function extractCustomProperties(logObject: LogObject): Readonly<Record<string, unknown>> | undefined {
	const customProperties = Object.fromEntries(
		Object.entries(logObject).filter(([key]) => !STANDARD_LOG_OBJECT_KEYS.has(key)),
	);

	if (Object.keys(customProperties).length === 0) return undefined;

	const sanitizedCustomProperties = sanitize(customProperties);
	return isRecord(sanitizedCustomProperties) ? sanitizedCustomProperties : { value: sanitizedCustomProperties };
}

function getLogParameters(logObject: LogObject): Array<unknown> {
	return Reflect.get(logObject, "args") as Array<unknown>;
}

function extractErrors(logObject: LogObject): ReadonlyArray<unknown> {
	const errorValues = getLogParameters(logObject)
		.filter((value) => value instanceof Error)
		.map((value) => sanitize(value));
	if ("error" in logObject && logObject.error !== undefined) errorValues.unshift(sanitize(logObject.error));
	return errorValues;
}

function isEmptyArray(array: ReadonlyArray<unknown>): array is readonly [] {
	return array.length === 0;
}
function isOneArray(array: ReadonlyArray<unknown>): array is readonly [unknown] {
	return array.length === 1;
}
function getPayload(sanitizedArguments: ReadonlyArray<unknown>): unknown {
	if (isEmptyArray(sanitizedArguments)) return undefined;
	if (isOneArray(sanitizedArguments)) return sanitizedArguments[0];
	return sanitizedArguments;
}

function getVersion(): string {
	return Deno.inspect(Deno.version, {
		depth: 1,
		sorted: true,
	});
}

export function normalizeLogEntry(logObject: LogObject): StructuredLogEntry {
	const sanitizedArguments = getLogParameters(logObject).map((value) => sanitize(value));
	const errors = extractErrors(logObject);
	const context = mergeLogContexts(
		getActiveLogContext(),
		isRecord(logObject.context) ? sanitizeLogContext(logObject.context) : undefined,
	);
	const customProperties = extractCustomProperties(logObject);
	const payload = getPayload(sanitizedArguments);

	const normalizedEntry: StructuredLogEntry = {
		application: { name, version },
		context,
		host: { name: getHostName() },
		level: getSeverityName(logObject.level, logObject.type),
		levelValue: logObject.level,
		message: buildMessage(logObject, sanitizedArguments),
		process: {
			id: Deno.pid,
			platform: Deno.build.os,
			title: basename(nodeProcess.title),
			version: getVersion(),
		},
		sequenceNumber: ++currentSequenceNumber,
		timestamp: logObject.date.toISOString(),
		type: logObject.type,
		...(customProperties === undefined ? {} : { customProperties }),
		...(errors[0] === undefined ? {} : { error: errors[0] }),
		...(errors.length > 1 ? { errors } : {}),
		...(payload === undefined ? {} : { payload }),
		...(logObject.tag.length > 0 ? { tag: logObject.tag } : {}),
	};

	return normalizedEntry;
}
