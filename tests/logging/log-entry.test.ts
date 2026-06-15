import { expect, describe, it } from "vitest";
import { runWithLogContext } from "$logging/log-context";
import { normalizeLogEntry } from "$logging/log-entry";

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

function restoreGlobalBun(previousBun: unknown): void {
	if (previousBun === undefined) {
		Reflect.deleteProperty(globalThis, "Bun");
		return;
	}

	Reflect.set(globalThis, "Bun", previousBun);
}

describe("log-entry", () => {
	it("normalizeLogEntry builds fallback messages from sanitized args", () => {
		expect.assertions(2);
		const entry = normalizeLogEntry(
			createLogObject({
				args: ["hello", { token: "secret" }],
				type: "log",
			}),
		);

		expect(entry.message, "Expected fallback message from args.").toContain("hello");
		expect(entry.payload, "Expected multi-arg payload.").toEqual(["hello", { token: "[REDACTED]" }]);
	});

	it("normalizeLogEntry uses explicit additional strings and arrays before fallback args", () => {
		expect.assertions(2);
		const stringAdditionalEntry = normalizeLogEntry(
			createLogObject({
				additional: "additional message",
				args: ["ignored fallback"],
				message: "primary message",
			}),
		);
		const arrayAdditionalEntry = normalizeLogEntry(
			createLogObject({
				additional: ["first", "", "second"],
				args: ["ignored fallback"],
			}),
		);

		expect(stringAdditionalEntry.message, "Expected string additional message to join with primary message.").toBe(
			"primary message additional message",
		);
		expect(arrayAdditionalEntry.message, "Expected additional array to skip empty messages.").toBe("first second");
	});

	it("normalizeLogEntry merges active and object context and extracts custom properties", () => {
		expect.assertions(5);
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

	it("normalizeLogEntry extracts primary and secondary errors", () => {
		expect.assertions(4);
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

	it("normalizeLogEntry maps severity from level when type is generic", () => {
		expect.assertions(7);
		const debugEntry = normalizeLogEntry(createLogObject({ level: 4, type: "log" }));
		const errorEntry = normalizeLogEntry(createLogObject({ level: 1, type: "log" }));
		const warnEntry = normalizeLogEntry(createLogObject({ level: 2, type: "log" }));
		const fallbackMessageEntry = normalizeLogEntry(createLogObject({ level: 3, type: "log" }));
		const debugTypeEntry = normalizeLogEntry(createLogObject({ level: 3, type: "debug" }));
		const traceTypeEntry = normalizeLogEntry(createLogObject({ level: 3, type: "trace" }));
		const verboseTypeEntry = normalizeLogEntry(createLogObject({ level: 3, type: "verbose" }));

		expect(debugEntry.level, "Expected debug level fallback.").toBe("debug");
		expect(errorEntry.level, "Expected error level fallback.").toBe("error");
		expect(warnEntry.level, "Expected warn level fallback.").toBe("warn");
		expect(debugTypeEntry.level, "Expected debug type severity.").toBe("debug");
		expect(traceTypeEntry.level, "Expected trace type severity.").toBe("trace");
		expect(verboseTypeEntry.level, "Expected verbose type severity.").toBe("verbose");
		expect(fallbackMessageEntry.message, "Expected no-args fallback message.").toBe("logger.log");
	});

	it("normalizeLogEntry wraps scalar custom properties and non-array args", () => {
		expect.assertions(3);
		const logObject = createLogObject({
			args: "not-array" as unknown as [],
			context: "not-context" as unknown as {},
			valueOf: () => 42,
		});
		Object.defineProperty(logObject, "custom", {
			enumerable: true,
			value: 1n,
		});

		const entry = normalizeLogEntry(logObject);

		expect(entry.payload, "Expected non-array args to produce no payload.").toBeUndefined();
		expect(entry.context, "Expected non-record context to be ignored.").toEqual({});
		expect(entry.customProperties, "Expected scalar sanitized custom property to be wrapped as a record.").toEqual({
			custom: "1",
			valueOf: "[Function valueOf]",
		});
	});

	it("normalizeLogEntry records Bun runtime version when Bun is available", () => {
		expect.hasAssertions();
		const previousBun = Reflect.get(globalThis, "Bun");
		Reflect.set(globalThis, "Bun", { version: "1.2.3-test" });

		try {
			const entry = normalizeLogEntry(createLogObject({ message: "runtime version", type: "info" }));

			expect(entry.process.version, "Expected Bun runtime version in process metadata.").toContain("1.2.3-test");
		} finally {
			restoreGlobalBun(previousBun);
		}
	});
});
