import { serializeLogEntry } from "@logging/reports/daily-file-rotate-reporter.ts";

import type { StructuredLogEntry } from "@logging/log-entry.ts";

const textEncoder = new TextEncoder();

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

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
			platform: Deno.build.os,
			title: "deno",
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

Deno.test("serializeLogEntry keeps normal entries unchanged", () => {
	const entry = createLogEntry({ payload: { id: "small-payload" } });
	const serializedEntry = serializeLogEntry(entry, 4096);

	assert(serializedEntry === JSON.stringify(entry), "Expected normal entry to serialize without modification.");
});

Deno.test("serializeLogEntry truncates oversized entries", () => {
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

	assert(getByteLength(serializedEntry) <= maxEntryBytes, "Expected serialized entry to fit within the byte cap.");
	assert(parsedEntry.customProperties?.logEntryTruncated === true, "Expected entry to be marked as truncated.");
	assert(parsedEntry.payload === "[Truncated: log entry exceeded storage limit]", "Expected payload to be omitted.");
	assert(parsedEntry.message.length < entry.message.length, "Expected message to be shortened.");
});
