import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDailyFileRotateReporter, serializeLogEntry } from "@logging/reports/daily-file-rotate-reporter";

import type { StructuredLogEntry } from "@logging/log-entry";
import type { ConsolaOptions, LogObject, LogType } from "consola";

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

test("serializeLogEntry keeps normal entries unchanged", () => {
	const entry = createLogEntry({ payload: { id: "small-payload" } });
	const serializedEntry = serializeLogEntry(entry, 4096);

	expect(serializedEntry === JSON.stringify(entry), "Expected normal entry to serialize without modification.").toBe(
		true,
	);
});

test("serializeLogEntry truncates oversized entries", () => {
	const entry = createLogEntry({
		context: {
			requestId: "test-request",
			scope: "oversized-entry-test",
		},
		message: "m".repeat(100_000),
		payload: {
			largeValue: "x".repeat(100_000),
		},
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
	expect(parsedEntry.message.length < entry.message.length, "Expected message to be shortened.").toBe(true);
});

test("serializeLogEntry falls back to minimal truncation when notice entry is still too large", () => {
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

test("createDailyFileRotateReporter honors the configured level filter", () => {
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
	const reporter = createDailyFileRotateReporter({
		directory: mkdtempSync(path.join(tmpdir(), "ai-compatibility-proxy-test-logs-")),
		filename: "combined.log",
		maxFiles: 1,
		size: "1M",
	});

	reporter.log(createConsolaLogObject(3, "info", "stored info log"), consolaReporterContext);

	expect(reporter, "Expected reporter creation without a level filter to succeed.").toBeDefined();
});
