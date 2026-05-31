import { textEncoder } from "@constants/constant-classes.ts";
import { normalizeLogEntry } from "@logging/log-entry.ts";
import { createStream } from "rotating-file-stream";

import type { StructuredLogEntry } from "@logging/log-entry.ts";
import type { ConsolaReporter, LogObject } from "consola";
import type { FileSize, Interval } from "rotating-file-stream";

const DEFAULT_MAX_ENTRY_BYTES = 256 * 1024;
const DEFAULT_MAX_ROTATED_LOG_SIZE: FileSize = "100M";
const LOG_ENTRY_TRUNCATED_PLACEHOLDER = "[Truncated: log entry exceeded storage limit]";
const MAX_NOTICE_CONTEXT_KEYS = 20;
const MAX_NOTICE_CONTEXT_VALUE_LENGTH = 512;
const MAX_NOTICE_MESSAGE_LENGTH = 2048;

function alwaysTrue(): boolean {
	return true;
}

async function writeFileLoggingWarningAsync(error: Error): Promise<void> {
	await Deno.stderr.write(textEncoder.encode(`[logging] ${error.message}\n`));
}

function getByteLength(value: string): number {
	return textEncoder.encode(value).byteLength;
}

function truncateString(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}…[truncated]`;
}

function stringifyContextValue(value: unknown): unknown {
	if (typeof value === "string") return truncateString(value, MAX_NOTICE_CONTEXT_VALUE_LENGTH);
	if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
	return truncateString(Deno.inspect(value, { depth: 1, iterableLimit: 5 }), MAX_NOTICE_CONTEXT_VALUE_LENGTH);
}

function createStorageSafeContext(context: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	const entries = Object.entries(context);
	const safeContext: Record<string, unknown> = {};

	for (const [key, value] of entries.slice(0, MAX_NOTICE_CONTEXT_KEYS)) {
		safeContext[key] = stringifyContextValue(value);
	}
	if (entries.length > MAX_NOTICE_CONTEXT_KEYS) {
		safeContext.truncatedContextKeys = entries.length - MAX_NOTICE_CONTEXT_KEYS;
	}

	return safeContext;
}

function createTruncatedEntry(
	entry: StructuredLogEntry,
	originalEntrySizeBytes: number,
	maxEntryBytes: number,
): StructuredLogEntry {
	return {
		application: entry.application,
		context: createStorageSafeContext(entry.context),
		customProperties: {
			logEntryTruncated: true,
			maxEntryBytes,
			originalEntrySizeBytes,
		},
		...(entry.error === undefined ? {} : { error: LOG_ENTRY_TRUNCATED_PLACEHOLDER }),
		host: entry.host,
		level: entry.level,
		levelValue: entry.levelValue,
		message: truncateString(entry.message, MAX_NOTICE_MESSAGE_LENGTH),
		payload: LOG_ENTRY_TRUNCATED_PLACEHOLDER,
		process: entry.process,
		sequenceNumber: entry.sequenceNumber,
		...(entry.tag === undefined ? {} : { tag: entry.tag }),
		timestamp: entry.timestamp,
		type: entry.type,
	};
}

function createMinimalTruncatedEntry(
	entry: StructuredLogEntry,
	originalEntrySizeBytes: number,
	maxEntryBytes: number,
): StructuredLogEntry {
	return {
		application: entry.application,
		context: {},
		customProperties: {
			logEntryTruncated: true,
			maxEntryBytes,
			originalEntrySizeBytes,
		},
		host: entry.host,
		level: entry.level,
		levelValue: entry.levelValue,
		message: "Log entry omitted because it exceeded the storage safety limit",
		process: entry.process,
		sequenceNumber: entry.sequenceNumber,
		timestamp: entry.timestamp,
		type: entry.type,
	};
}

export interface DailyFileRotateReporterOptions {
	readonly directory: string;
	readonly filename: string;
	readonly interval?: Interval;
	readonly levelFilter?: (level: number) => boolean;
	readonly maxEntryBytes?: number;
	readonly maxFiles?: number;
	readonly maxSize?: FileSize;
	readonly size?: FileSize;
}

export function serializeLogEntry(entry: StructuredLogEntry, maxEntryBytes: number = DEFAULT_MAX_ENTRY_BYTES): string {
	const serializedEntry = JSON.stringify(entry);
	const serializedEntrySizeBytes = getByteLength(serializedEntry);
	if (serializedEntrySizeBytes <= maxEntryBytes) return serializedEntry;

	const truncatedEntry = createTruncatedEntry(entry, serializedEntrySizeBytes, maxEntryBytes);
	const serializedTruncatedEntry = JSON.stringify(truncatedEntry);
	if (getByteLength(serializedTruncatedEntry) <= maxEntryBytes) return serializedTruncatedEntry;

	return JSON.stringify(createMinimalTruncatedEntry(entry, serializedEntrySizeBytes, maxEntryBytes));
}

export function createDailyFileRotateReporter({
	directory,
	filename,
	interval = "1d",
	levelFilter = alwaysTrue,
	maxEntryBytes = DEFAULT_MAX_ENTRY_BYTES,
	maxFiles = 14,
	maxSize = DEFAULT_MAX_ROTATED_LOG_SIZE,
	size = "20M",
}: DailyFileRotateReporterOptions): ConsolaReporter {
	const stream = createStream(filename, {
		compress: "gzip",
		initialRotation: true,
		interval,
		intervalBoundary: true,
		maxFiles,
		maxSize,
		path: directory,
		size,
	});
	stream.on("error", function onFileStreamError(error): void {
		void writeFileLoggingWarningAsync(error);
	});
	stream.on("warning", function onFileStreamWarning(error): void {
		void writeFileLoggingWarningAsync(error);
	});

	return {
		log: ({ level, ...logObject }: LogObject): void => {
			if (!levelFilter(level)) return;
			const normalizedEntry = normalizeLogEntry({ ...logObject, level });
			stream.write(`${serializeLogEntry(normalizedEntry, maxEntryBytes)}\n`);
		},
	};
}
