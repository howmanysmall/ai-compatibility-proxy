import { AsyncLocalStorage } from "node:async_hooks";
import { sanitize } from "@logging/sanitizer.ts";

export type LogContext = Readonly<Record<string, unknown>>;

const logContextStorage = new AsyncLocalStorage<LogContext>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeUndefinedValues(context: Readonly<LogContext>): Record<string, unknown> {
	const normalizedContext: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(context)) {
		if (value !== undefined) normalizedContext[key] = value;
	}

	return normalizedContext;
}

export function sanitizeLogContext(context: Readonly<LogContext> | undefined): Readonly<LogContext> {
	if (context === undefined) return {};

	const sanitizedContext = sanitize(removeUndefinedValues(context));
	return isRecord(sanitizedContext) ? sanitizedContext : {};
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
