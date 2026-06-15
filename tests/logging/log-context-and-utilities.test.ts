import { expect, describe, it } from "vitest";
import { getActiveLogContext, runWithLogContext, mergeLogContexts, sanitizeLogContext } from "$logging/log-context";
import { logSystemStats, measure, measureAsync, tryGarbageCollection, withContext } from "$logging/logger-utilities";
import { sanitize } from "$logging/sanitizer";
import { createConsola } from "consola";

import { expectRecord } from "../utilities/test-utilities";

import type { ConsolaInstance } from "consola";

const SECRET_PATTERN = /secret/u;

function createSilentLogger(): ConsolaInstance {
	return createConsola({ reporters: [] });
}

function getRecordValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
	return record[key];
}

function namedCallback(): undefined {
	return undefined;
}

function anonymousCallback(): undefined {
	return undefined;
}

function namelessFunction(): undefined {
	return undefined;
}

function restoreGarbageCollector(previousCollector: unknown): void {
	if (previousCollector === undefined) {
		Reflect.deleteProperty(globalThis, "gc");
		return;
	}

	Reflect.set(globalThis, "gc", previousCollector);
}

describe("log-context and log-utilities", () => {
	it("sanitize redacts sensitive keys and serializes uncommon values", () => {
		expect.assertions(13);
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		const error = new Error("boom", { cause: { token: "nested-secret" } });
		Object.assign(error, { apiKey: "secret", publicValue: new URL("https://example.test/path") });

		const sanitized = sanitize(
			{
				bigint: 10n,
				circular,
				date: new Date("2026-01-01T00:00:00.000Z"),
				error,
				fn: anonymousCallback,
				map: new Map<unknown, unknown>([
					["authorization", "Bearer secret"],
					["public", "visible"],
				]),
				namedFn: namedCallback,
				regexp: SECRET_PATTERN,
				set: new Set<unknown>(["value", { token: "secret" }]),
				symbol: Symbol.for("test"),
				url: new URL("https://example.test/path"),
			},
			{ maxDepth: 6 },
		);

		expectRecord(sanitized, "Expected sanitized value to be a record.");
		expect("error" in sanitized, "Expected serialized error.").toBe(true);
		expect("map" in sanitized, "Expected serialized map.").toBe(true);
		expect("circular" in sanitized, "Expected serialized circular object.").toBe(true);

		expect(getRecordValue(sanitized, "bigint"), "Expected bigint string serialization.").toBe("10");
		expect(getRecordValue(sanitized, "date"), "Expected date serialization.").toBe("2026-01-01T00:00:00.000Z");
		expect(getRecordValue(sanitized, "fn"), "Expected anonymous function serialization.").toBe(
			"[Function anonymousCallback]",
		);
		expect(getRecordValue(sanitized, "namedFn"), "Expected named function serialization.").toBe(
			"[Function namedCallback]",
		);
		expect(getRecordValue(sanitized, "regexp"), "Expected regexp serialization.").toBe("/secret/u");
		expect(getRecordValue(sanitized, "symbol"), "Expected symbol serialization.").toBe("Symbol(test)");
		expect(getRecordValue(sanitized, "url"), "Expected URL serialization.").toBe("https://example.test/path");

		const serializedError = sanitized.error;
		expectRecord(serializedError, "Expected error object.");
		expect(serializedError.apiKey, "Expected error secret redaction.").toBe("[REDACTED]");
	});

	it("sanitize handles depth limits, arrays, error-like records, and non-record objects", () => {
		expect.assertions(6);
		const errorLike = {
			cause: { password: "secret" },
			code: { token: "secret" },
			message: "plain object error",
			name: "PlainError",
			stack: "stack",
			token: "secret",
		};
		const errorLikeWithoutStack = {
			message: "plain object error without stack",
			name: "PlainError",
		};

		expect(
			sanitize({ nested: { value: "hidden" } }, { maxDepth: 1 }),
			"Expected depth limit placeholder.",
		).toStrictEqual({
			nested: "[MaxDepthExceeded]",
		});
		expect(sanitize([1, { token: "secret" }]), "Expected array entries to sanitize.").toStrictEqual([
			1,
			{ token: "[REDACTED]" },
		]);
		expect(sanitize(errorLike), "Expected error-like records to sanitize like errors.").toMatchObject({
			cause: { password: "[REDACTED]" },
			code: { token: "[REDACTED]" },
			message: "plain object error",
			name: "PlainError",
			stack: "stack",
			token: "[REDACTED]",
		});
		expect(sanitize(errorLikeWithoutStack), "Expected missing stack to be omitted.").toStrictEqual({
			message: "plain object error without stack",
			name: "PlainError",
		});
		Object.defineProperty(namelessFunction, "name", { value: "" });
		expect(sanitize(namelessFunction), "Expected nameless functions to use anonymous fallback.").toBe(
			"[Function anonymous]",
		);
		expect(sanitize(Object.create(null)), "Expected null-prototype records to sanitize as objects.").toStrictEqual(
			{},
		);
	});

	it("sanitizeLogContext removes undefined values and redacts nested secrets", () => {
		expect.assertions(3);
		const sanitized = sanitizeLogContext({
			authorization: "Bearer secret",
			keep: "value",
			nested: { password: "secret" },
			omit: undefined,
		});

		expect(sanitized.authorization, "Expected sensitive top-level context redaction.").toBe("[REDACTED]");
		expect(!("omit" in sanitized), "Expected undefined context values to be removed.").toBe(true);
		expect(sanitized.keep, "Expected non-sensitive context values to remain.").toBe("value");
	});

	it("sanitizeLogContext handles missing and non-record sanitized contexts", () => {
		expect.assertions(2);
		expect(sanitizeLogContext(), "Expected missing context to become empty object.").toStrictEqual({});
		expect(
			sanitizeLogContext(Object.create(null)),
			"Expected non-record context to become empty object.",
		).toStrictEqual({});
	});

	it("mergeLogContexts ignores undefined inputs and values", () => {
		expect.assertions(3);
		const merged = mergeLogContexts(undefined, { first: "a", skipped: undefined }, { first: "b", second: "c" });

		expect(merged.first, "Expected later context to override earlier context.").toBe("b");
		expect(merged.second, "Expected later context value.").toBe("c");
		expect(!("skipped" in merged), "Expected undefined context value to be skipped.").toBe(true);
	});

	it("runWithLogContext scopes active context and withContext binds tags", () => {
		expect.assertions(3);
		const logger = createSilentLogger();

		const result = runWithLogContext({ requestId: "req-1" }, () => {
			const activeContext = getActiveLogContext();
			const child = withContext({ namespace: "proxy", operation: "test", scope: "unit", tag: "case" }, logger);
			return { activeContext, child };
		});

		expect(result.activeContext.requestId, "Expected active log context.").toBe("req-1");
		const { defaults } = result.child.options;
		expectRecord(defaults, "Expected child logger defaults.");
		expect(defaults.context, "Expected child logger context defaults.").toBeDefined();
	});

	it("measure logs success and rethrows failures", () => {
		expect.assertions(3);
		const logger = createSilentLogger();
		const value = measure("sync-success", () => 42, { context: { operation: "sync" }, logger });
		const defaultLoggerValue = measure("sync-default-logger", () => 7);

		expect(value, "Expected measured sync value.").toBe(42);
		expect(defaultLoggerValue, "Expected default logger measurement value.").toBe(7);

		const expectedError = new Error("expected failure");

		expect(() =>
			measure(
				"sync-failure",
				() => {
					throw expectedError;
				},
				{ logger },
			),
		).toThrow(expectedError);
	});

	it("measureAsync logs success and rethrows failures", async () => {
		expect.assertions(2);
		const logger = createSilentLogger();
		const value = await measureAsync("async-success", async () => 42, { context: { operation: "async" }, logger });

		expect(value, "Expected measured async value.").toBe(42);

		const expectedError = new Error("expected async failure");

		await expect(
			measureAsync(
				"async-failure",
				async () => {
					throw expectedError;
				},
				{ logger },
			),
		).rejects.toThrow(expectedError);
	});

	it("tryGarbageCollection handles missing and exposed collectors", () => {
		expect.assertions(1);
		const logger = createSilentLogger();
		const previousCollector = Reflect.get(globalThis, "gc");
		let collectCount = 0;

		Reflect.deleteProperty(globalThis, "gc");
		tryGarbageCollection(logger);

		Reflect.set(globalThis, "gc", () => {
			collectCount += 1;
		});
		tryGarbageCollection(logger);

		expect(collectCount, "Expected exposed garbage collector to be called.").toBe(1);

		restoreGarbageCollector(previousCollector);
	});

	it("logSystemStats emits memory and uptime fields", () => {
		expect.assertions(3);
		const records: Array<{ readonly message: unknown; readonly properties: unknown }> = [];
		const logger = {
			info: (message: unknown, properties?: unknown) => {
				records.push({ message, properties });
			},
		} as ReturnType<typeof createSilentLogger>;

		logSystemStats(logger);

		expect(records, "Expected one system statistics log entry.").toHaveLength(1);
		expect(records[0]?.message, "Expected system statistics message.").toBe("System statistics");
		expect(records[0]?.properties, "Expected system statistics payload.").toMatchObject({
			memory: {
				external: { bytes: expect.any(Number), formatted: expect.any(String) },
				heapTotal: { bytes: expect.any(Number), formatted: expect.any(String) },
				heapUsed: { bytes: expect.any(Number), formatted: expect.any(String) },
				residentSetSize: { bytes: expect.any(Number), formatted: expect.any(String) },
			},
			uptimeSeconds: expect.any(Number),
		});
	});
});
