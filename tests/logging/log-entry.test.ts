import { runWithLogContext } from "@logging/log-context";
import { normalizeLogEntry } from "@logging/log-entry";

import { expectRecord } from "../utilities/test-utilities";

import type { LogObject } from "consola";

function createLogObject(overrides: Partial<LogObject> = {}): LogObject {
	return {
		additional: "",
		args: [],
		context: {},
		date: new Date("2026-01-01T00:00:00.000Z"),
		level: 3,
		message: "",
		tag: "",
		type: "info",
		...overrides,
	};
}

test("normalizeLogEntry builds fallback messages from sanitized args", () => {
	const entry = normalizeLogEntry(
		createLogObject({
			args: ["hello", { token: "secret" }],
			type: "log",
		}),
	);

	expect(entry.message, "Expected fallback message from args.").toContain("hello");
	expect(entry.payload, "Expected multi-arg payload.").toEqual(["hello", { token: "[REDACTED]" }]);
});

test("normalizeLogEntry merges active and object context and extracts custom properties", () => {
	const entry = runWithLogContext({ requestId: "req-1" }, () =>
		normalizeLogEntry(
			createLogObject({
				context: { password: "secret", route: "/v1/models" },
				level: 2,
				message: "warn message",
				tag: "proxy",
				type: "warn",
				userId: "user-1",
			}),
		),
	);

	expect(entry.level, "Expected warn severity.").toBe("warn");
	expect(entry.context.requestId, "Expected active context.").toBe("req-1");
	expect(entry.context.password, "Expected context secret redaction.").toBe("[REDACTED]");
	expect(entry.customProperties?.userId, "Expected custom property extraction.").toBe("user-1");
	expect(entry.tag, "Expected tag preservation.").toBe("proxy");
});

test("normalizeLogEntry extracts primary and secondary errors", () => {
	const primaryError = new Error("primary");
	const secondaryError = new Error("secondary");
	const entry = normalizeLogEntry(
		createLogObject({
			args: [secondaryError],
			error: primaryError,
			level: 0,
			message: "",
			type: "error",
		}),
	);

	expectRecord(entry.error, "Expected primary error record.");
	expect(entry.error.message, "Expected primary error to be first.").toBe("primary");
	expect(entry.errors?.length, "Expected secondary errors collection.").toBe(2);
	expect(entry.message, "Expected fallback message to include sanitized error args.").toContain("secondary");
});

test("normalizeLogEntry maps severity from level when type is generic", () => {
	const debugEntry = normalizeLogEntry(createLogObject({ level: 4, type: "log" }));
	const errorEntry = normalizeLogEntry(createLogObject({ level: 1, type: "log" }));
	const fallbackMessageEntry = normalizeLogEntry(createLogObject({ level: 3, type: "log" }));

	expect(debugEntry.level, "Expected debug level fallback.").toBe("debug");
	expect(errorEntry.level, "Expected error level fallback.").toBe("error");
	expect(fallbackMessageEntry.message, "Expected no-args fallback message.").toBe("logger.log");
});
