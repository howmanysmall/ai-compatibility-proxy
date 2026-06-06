import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import nodeProcess from "node:process";
import { expect, test } from "vitest";
import { createDailyFileRotateReporter, serializeLogEntry } from "@logging/reports/daily-file-rotate-reporter";

import type { StructuredLogEntry } from "@logging/log-entry";
import type { ConsolaOptions, LogObject, LogType } from "consola";
import type { createStream } from "rotating-file-stream";

const textEncoder = new TextEncoder();
const consolaReporterContext = { options: {} as ConsolaOptions };

function createLogEntry(overrides: Partial<StructuredLogEntry> = {}): StructuredLogEntry {
	return {
		application: {
			name: "test-application",
			version: "0.0.0",
		},
		context: {},
		host: {
			name: "test-host",
		},
		level: "info",
		levelValue: 3,
		message: "Test message",
		process: {
			id: 1,
			platform: process.platform,
			title: "bun",
			version: "test-version",
		},
		sequenceNumber: 1,
		timestamp: "2026-05-31T00:00:00.000Z",
		type: "info",
		...overrides,
	};
}

function getByteLength(value: string): number {
	return textEncoder.encode(value).byteLength;
}

function createConsolaLogObject(level: number, type: LogType, message: string): LogObject {
	return {
		args: [],
		date: new Date("2026-05-31T00:00:00.000Z"),
		level,
		message,
		tag: "",
		type,
	};
}

type StreamHandler = (error: Error) => void;

test("serializeLogEntry keeps normal entries unchanged", () => {
	expect.hasAssertions();
	const entry = createLogEntry({ payload: { id: "small-payload" } });
	const serializedEntry = serializeLogEntry(entry, 4096);

	expect(serializedEntry === JSON.stringify(entry), "Expected normal entry to serialize without modification.").toBe(
		true,
	);
});

test("serializeLogEntry default byte limit preserves medium entries", () => {
	expect.hasAssertions();
	const entry = createLogEntry({
		context: { requestId: "default-byte-limit-test" },
		message: "m".repeat(1024),
		payload: { value: "x".repeat(1024) },
	});

	const serializedEntry = serializeLogEntry(entry);
	const parsedEntry = JSON.parse(serializedEntry) as StructuredLogEntry;

	expect(parsedEntry.customProperties?.logEntryTruncated, "Expected default byte limit to keep medium entries.").toBe(
		undefined,
	);
	expect(parsedEntry.message, "Expected default byte limit to preserve medium messages.").toBe(entry.message);
	expect(parsedEntry.payload, "Expected default byte limit to preserve medium payloads.").toEqual(entry.payload);
});

test("serializeLogEntry truncates oversized entries", () => {
	expect.hasAssertions();
	const entry = createLogEntry({
		context: {
			booleanValue: true,
			nullValue: null,
			numberValue: 42,
			objectValue: { nested: ["visible"] },
			requestId: "test-request",
			scope: "oversized-entry-test",
		},
		error: "Error: sensitive stack".repeat(100),
		message: "m".repeat(100_000),
		payload: {
			largeValue: "x".repeat(100_000),
		},
		tag: "oversized-test",
	});
	const maxEntryBytes = 4_096;
	const serializedEntry = serializeLogEntry(entry, maxEntryBytes);
	const parsedEntry = JSON.parse(serializedEntry) as StructuredLogEntry;

	expect(
		getByteLength(serializedEntry) <= maxEntryBytes,
		"Expected serialized entry to fit within the byte cap.",
	).toBe(true);
	expect(parsedEntry.customProperties?.logEntryTruncated === true, "Expected entry to be marked as truncated.").toBe(
		true,
	);
	expect(
		parsedEntry.payload === "[Truncated: log entry exceeded storage limit]",
		"Expected payload to be omitted.",
	).toBe(true);
	expect(parsedEntry.error, "Expected oversized error details to be omitted.").toBe(
		"[Truncated: log entry exceeded storage limit]",
	);
	expect(parsedEntry.tag, "Expected tag to survive truncation.").toBe("oversized-test");
	expect(parsedEntry.context.numberValue, "Expected numeric context to be preserved.").toBe(42);
	expect(parsedEntry.context.booleanValue, "Expected boolean context to be preserved.").toBe(true);
	expect(parsedEntry.context.nullValue, "Expected null context to be preserved.").toBeNull();
	expect(`${parsedEntry.context.objectValue}`, "Expected object context to be stringified safely.").toContain(
		"visible",
	);
	expect(parsedEntry.message.length < entry.message.length, "Expected message to be shortened.").toBe(true);
});

test("serializeLogEntry falls back to minimal truncation when notice entry is still too large", () => {
	expect.hasAssertions();
	const entry = createLogEntry({
		context: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`key-${index}`, "x".repeat(1000)])),
		message: "m".repeat(100_000),
		payload: {
			largeValue: "x".repeat(100_000),
		},
	});

	const parsedEntry = JSON.parse(serializeLogEntry(entry, 512)) as StructuredLogEntry;

	expect(parsedEntry.message, "Expected minimal truncation message.").toBe(
		"Log entry omitted because it exceeded the storage safety limit",
	);
	expect(parsedEntry.context, "Expected minimal truncation to drop context.").toEqual({});
});

test("serializeLogEntry records omitted context key counts for storage-safe truncation notices", () => {
	expect.hasAssertions();
	const entry = createLogEntry({
		context: Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`key-${index}`, index])),
		message: "m".repeat(100_000),
		payload: {
			largeValue: "x".repeat(100_000),
		},
	});

	const parsedEntry = JSON.parse(serializeLogEntry(entry, 8_192)) as StructuredLogEntry;

	expect(parsedEntry.customProperties?.logEntryTruncated, "Expected truncation metadata.").toBe(true);
	expect(parsedEntry.context.truncatedContextKeys, "Expected omitted context key count.").toBe(5);
	expect(
		Object.keys(parsedEntry.context),
		"Expected storage-safe context to include 20 keys plus omission count.",
	).toHaveLength(21);
});

test("createDailyFileRotateReporter honors the configured level filter", () => {
	expect.hasAssertions();
	let filterCalls = 0;
	const reporter = createDailyFileRotateReporter({
		directory: mkdtempSync(path.join(tmpdir(), "ai-compatibility-proxy-test-logs-")),
		filename: "combined.log",
		levelFilter: (level) => {
			filterCalls += 1;
			return level >= 3;
		},
		maxFiles: 1,
		size: "1M",
	});

	reporter.log(createConsolaLogObject(2, "debug", "ignored debug log"), consolaReporterContext);
	reporter.log(createConsolaLogObject(3, "info", "stored info log"), consolaReporterContext);

	expect(filterCalls, "Expected reporter to evaluate each log level.").toBe(2);
});

test("createDailyFileRotateReporter writes logs when no level filter is configured", () => {
	expect.hasAssertions();
	const writes: Array<string> = [];
	let streamFilename = "";
	let streamOptions: Parameters<typeof createStream>[1] | undefined;
	const reporter = createDailyFileRotateReporter({
		directory: mkdtempSync(path.join(tmpdir(), "ai-compatibility-proxy-test-logs-")),
		filename: "combined.log",
		maxFiles: 1,
		size: "1M",
		streamFactory: ((filename: string, options: Parameters<typeof createStream>[1]) => {
			streamFilename = filename;
			streamOptions = options;
			return {
				on: () => undefined,
				write: (message: string) => {
					writes.push(message);
					return true;
				},
			};
		}) as unknown as typeof createStream,
	});

	reporter.log(createConsolaLogObject(3, "info", "stored info log"), consolaReporterContext);

	expect(streamFilename, "Expected configured stream filename.").toBe("combined.log");
	expect(streamOptions, "Expected rotating file stream options.").toMatchObject({
		compress: "gzip",
		initialRotation: true,
		interval: "1d",
		intervalBoundary: true,
		maxFiles: 1,
		maxSize: "100M",
		size: "1M",
	});
	expect(writes, "Expected default level filter to write info logs.").toHaveLength(1);
	expect(writes[0], "Expected default level filter to serialize log message.").toContain("stored info log");
});

test("createDailyFileRotateReporter writes file stream warnings to stderr", () => {
	expect.hasAssertions();
	const stderrMessages: Array<string> = [];
	const handlers = new Map<string, StreamHandler>();
	const originalWrite = nodeProcess.stderr.write;
	Object.defineProperty(nodeProcess.stderr, "write", {
		configurable: true,
		value: (message: string) => {
			stderrMessages.push(message);
			return true;
		},
	});

	try {
		createDailyFileRotateReporter({
			directory: mkdtempSync(path.join(tmpdir(), "ai-compatibility-proxy-test-logs-")),
			filename: "combined.log",
			maxFiles: 1,
			size: "1M",
			streamFactory: ((_filename: string, _options: Parameters<typeof createStream>[1]) => ({
				on: (event: string, handler: StreamHandler) => {
					handlers.set(event, handler);
				},
				write: () => true,
			})) as unknown as typeof createStream,
		});

		handlers.get("error")?.(new Error("stream error"));
		handlers.get("warning")?.(new Error("stream warning"));
	} finally {
		Object.defineProperty(nodeProcess.stderr, "write", { configurable: true, value: originalWrite });
	}

	expect(stderrMessages, "Expected stream error and warning messages to be written to stderr.").toEqual([
		"[logging] stream error\n",
		"[logging] stream warning\n",
	]);
});
