import { mergeLogContexts, sanitizeLogContext } from "@logging/log-context";
import {
	getActiveLogContext,
	measure,
	measureAsync,
	runWithLogContext,
	tryGarbageCollection,
	withContext,
} from "@logging/logger-utilities";
import { sanitize } from "@logging/sanitizer";
import { createConsola } from "consola";

import { expectRecord } from "../utilities/test-utilities";

const SECRET_PATTERN = /secret/u;

function createSilentLogger() {
	return createConsola({ reporters: [] });
}

function getRecordValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
	return record[key];
}

function namedCallback(): undefined {
	return undefined;
}

test("sanitize redacts sensitive keys and serializes uncommon values", () => {
	const circular: Record<string, unknown> = {};
	circular.self = circular;

	const error = new Error("boom", { cause: { token: "nested-secret" } });
	Object.assign(error, { apiKey: "secret", publicValue: new URL("https://example.test/path") });

	const sanitized = sanitize(
		{
			bigint: 10n,
			circular,
			error,
			fn: namedCallback,
			map: new Map<unknown, unknown>([["authorization", "Bearer secret"]]),
			regexp: SECRET_PATTERN,
			set: new Set<unknown>(["value"]),
			symbol: Symbol.for("test"),
		},
		{ maxDepth: 6 },
	);

	expect(typeof sanitized === "object" && sanitized !== null, "Expected object sanitization result.").toBe(true);
	expectRecord(sanitized, "Expected sanitized value to be a record.");
	expect("error" in sanitized, "Expected serialized error.").toBe(true);
	expect("map" in sanitized, "Expected serialized map.").toBe(true);
	expect("circular" in sanitized, "Expected serialized circular object.").toBe(true);

	expect(getRecordValue(sanitized, "bigint"), "Expected bigint string serialization.").toBe("10");
	expect(getRecordValue(sanitized, "fn"), "Expected named function serialization.").toBe("[Function namedCallback]");
	expect(getRecordValue(sanitized, "regexp"), "Expected regexp serialization.").toBe("/secret/u");
	expect(getRecordValue(sanitized, "symbol"), "Expected symbol serialization.").toBe("Symbol(test)");

	const serializedError = sanitized.error;
	expectRecord(serializedError, "Expected error object.");
	expect(serializedError.apiKey, "Expected error secret redaction.").toBe("[REDACTED]");
});

test("sanitizeLogContext removes undefined values and redacts nested secrets", () => {
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

test("mergeLogContexts ignores undefined inputs and values", () => {
	const merged = mergeLogContexts(undefined, { first: "a", skipped: undefined }, { first: "b", second: "c" });

	expect(merged.first, "Expected later context to override earlier context.").toBe("b");
	expect(merged.second, "Expected later context value.").toBe("c");
	expect(!("skipped" in merged), "Expected undefined context value to be skipped.").toBe(true);
});

test("runWithLogContext scopes active context and withContext binds tags", () => {
	const logger = createSilentLogger();

	const result = runWithLogContext({ requestId: "req-1" }, () => {
		const activeContext = getActiveLogContext();
		const child = withContext({ namespace: "proxy", operation: "test", scope: "unit", tag: "case" }, logger);
		return { activeContext, child };
	});

	expect(result.activeContext.requestId, "Expected active log context.").toBe("req-1");
	const { defaults } = result.child.options;
	expectRecord(defaults, "Expected child logger defaults.");
	expect(defaults.context !== undefined, "Expected child logger context defaults.").toBe(true);
});

test("measure logs success and rethrows failures", () => {
	const logger = createSilentLogger();
	const value = measure("sync-success", () => 42, { context: { operation: "sync" }, logger });

	expect(value, "Expected measured sync value.").toBe(42);

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

test("measureAsync logs success and rethrows failures", async () => {
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

test("tryGarbageCollection handles missing and exposed collectors", () => {
	const logger = createSilentLogger();
	const previousCollector = Reflect.get(globalThis, "gc");

	Reflect.deleteProperty(globalThis, "gc");
	tryGarbageCollection(logger);

	Reflect.set(globalThis, "gc", () => undefined);
	tryGarbageCollection(logger);

	if (previousCollector === undefined) {
		Reflect.deleteProperty(globalThis, "gc");
		return;
	}

	Reflect.set(globalThis, "gc", previousCollector);
});
