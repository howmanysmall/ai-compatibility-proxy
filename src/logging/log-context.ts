import { AsyncLocalStorage } from "node:async_hooks";
import { sanitize } from "@logging/sanitizer";
import { Predicate } from "effect";

import type { ReadonlyRecord } from "@ts-types/utility-types";

export type LogContext = ReadonlyRecord<string, unknown>;

const logContextStorage = new AsyncLocalStorage<LogContext>();

function removeUndefinedValues(context: Readonly<LogContext>): Record<string, unknown> {
	const normalizedContext: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(context)) {
		if (value !== undefined) normalizedContext[key] = value;
	}

	return normalizedContext;
}

export function sanitizeLogContext(context?: Readonly<LogContext>): Readonly<LogContext> {
	if (context === undefined) return {};

	const sanitizedContext = sanitize(removeUndefinedValues(context));
	return Predicate.isRecord(sanitizedContext) ? sanitizedContext : {};
}

export function mergeLogContexts(...contexts: ReadonlyArray<Readonly<LogContext> | undefined>): Readonly<LogContext> {
	const mergedContext: Record<string, unknown> = {};

	for (const context of contexts) {
		if (context === undefined) continue;

		for (const [key, value] of Object.entries(context)) {
			if (value !== undefined) mergedContext[key] = value;
		}
	}

	return mergedContext;
}

export function getActiveLogContext(): Readonly<LogContext> {
	return logContextStorage.getStore() ?? {};
}

export function runWithLogContext<Value>(context: Readonly<LogContext>, callback: () => Value): Value {
	const mergedContext = mergeLogContexts(getActiveLogContext(), sanitizeLogContext(context));
	return logContextStorage.run(mergedContext, callback);
}
