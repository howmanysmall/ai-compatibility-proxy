import { getActiveLogContext, mergeLogContexts, sanitizeLogContext } from "$logging/log-context";
import { logger } from "$logging/logger";
import { uptime } from "$utilities/time-utilities";
import prettyBytes from "pretty-bytes";

import type { ConsolaInstance, InputLogObject } from "consola";

export type Context = Readonly<Record<string, unknown>> & {
	readonly namespace?: string;
	readonly operation?: string;
	readonly scope?: string;
	readonly tag?: string;
};

export interface MeasureOptions {
	readonly context?: Context;
	readonly logger?: ConsolaInstance;
}

interface LoggerDefaults extends InputLogObject {
	readonly context?: Readonly<Record<string, unknown>>;
}

interface SerializableMemoryUsage {
	readonly external: {
		readonly bytes: number;
		readonly formatted: string;
	};
	readonly heapTotal: {
		readonly bytes: number;
		readonly formatted: string;
	};
	readonly heapUsed: {
		readonly bytes: number;
		readonly formatted: string;
	};
	readonly residentSetSize: {
		readonly bytes: number;
		readonly formatted: string;
	};
}

function createTag(context: Context): string | undefined {
	const tags = [context.namespace, context.scope, context.tag].filter(
		(value): value is string => typeof value === "string" && value.length > 0,
	);

	return tags.length > 0 ? tags.join(":") : undefined;
}

function getLoggerContext(loggerInstance: ConsolaInstance): Readonly<Record<string, unknown>> {
	const defaults = loggerInstance.options.defaults as LoggerDefaults;
	return defaults.context ?? {};
}

function serializeMemoryUsage(currentMemoryUsage: NodeJS.MemoryUsage): SerializableMemoryUsage {
	return {
		external: {
			bytes: currentMemoryUsage.external,
			formatted: prettyBytes(currentMemoryUsage.external),
		},
		heapTotal: {
			bytes: currentMemoryUsage.heapTotal,
			formatted: prettyBytes(currentMemoryUsage.heapTotal),
		},
		heapUsed: {
			bytes: currentMemoryUsage.heapUsed,
			formatted: prettyBytes(currentMemoryUsage.heapUsed),
		},
		residentSetSize: {
			bytes: currentMemoryUsage.rss,
			formatted: prettyBytes(currentMemoryUsage.rss),
		},
	};
}

function getMeasureLogger(options: MeasureOptions | undefined): ConsolaInstance {
	const baseLogger = options?.logger ?? logger;
	return options?.context ? withContext(options.context, baseLogger) : baseLogger;
}

function logOperationResult(parameters: {
	readonly durationMilliseconds: number;
	readonly error?: unknown;
	readonly loggerInstance: ConsolaInstance;
	readonly operationName: string;
}): void {
	const operation = {
		durationMilliseconds: parameters.durationMilliseconds,
		name: parameters.operationName,
		succeeded: parameters.error === undefined,
	};

	if (parameters.error === undefined) {
		parameters.loggerInstance.debug("Operation completed", { operation });
		return;
	}

	parameters.loggerInstance.error("Operation failed", {
		error: parameters.error,
		operation,
	});
}

/**
 * Creates a child logger bound to the provided context.
 *
 * @param context - Key-value pairs to attach to every log emitted by this logger.
 * @param loggerInstance - An optional base logger to extend.
 * @returns A Consola Logger instance with the bound context.
 */
export function withContext(context: Context, loggerInstance: ConsolaInstance = logger): ConsolaInstance {
	const mergedContext = mergeLogContexts(
		getActiveLogContext(),
		getLoggerContext(loggerInstance),
		sanitizeLogContext(context),
	);
	let instance = loggerInstance.withDefaults({ context: mergedContext } as LoggerDefaults);

	const tag = createTag(context);
	if (tag !== undefined) instance = instance.withTag(tag);

	return instance;
}

/**
 * Measures the duration of a synchronous function and logs it.
 *
 * @param name - The name of the operation to measure.
 * @param callback - The function to execute.
 * @param options - Optional measurement configuration.
 * @returns The result of the function.
 */
export function measure<Value>(name: string, callback: () => Value, options?: MeasureOptions): Value {
	const loggerInstance = getMeasureLogger(options);
	const start = performance.now();

	try {
		const value = callback();
		logOperationResult({
			durationMilliseconds: performance.now() - start,
			loggerInstance,
			operationName: name,
		});
		return value;
	} catch (error) {
		logOperationResult({
			durationMilliseconds: performance.now() - start,
			error,
			loggerInstance,
			operationName: name,
		});
		throw error;
	}
}

/**
 * Measures the duration of an asynchronous function and logs it.
 *
 * @param name - The name of the operation to measure.
 * @param callback - The async function to execute.
 * @param options - Optional measurement configuration.
 * @returns The result of the function.
 */
export async function measureAsync<Value>(
	name: string,
	callback: () => Promise<Value>,
	options?: MeasureOptions,
): Promise<Value> {
	const loggerInstance = getMeasureLogger(options);
	const start = performance.now();

	try {
		const value = await callback();
		logOperationResult({
			durationMilliseconds: performance.now() - start,
			loggerInstance,
			operationName: name,
		});
		return value;
	} catch (error) {
		logOperationResult({
			durationMilliseconds: performance.now() - start,
			error,
			loggerInstance,
			operationName: name,
		});
		throw error;
	}
}

/**
 * Logs current system statistics (memory usage and uptime).
 *
 * @param loggerInstance - The logger instance to use.
 */
export function logSystemStats(loggerInstance: ConsolaInstance = logger): void {
	loggerInstance.info("System statistics", {
		memory: serializeMemoryUsage(process.memoryUsage()),
		uptimeSeconds: uptime(),
	});
}

function isCallback(value: unknown): value is () => void {
	return typeof value === "function";
}

/**
 * Attempts to force garbage collection if the environment allows it. Useful for debugging memory leaks.
 *
 * @param loggerInstance - The logger instance to use.
 */
export function tryGarbageCollection(loggerInstance: ConsolaInstance = logger): void {
	const garbageCollector = Reflect.get(globalThis, "gc");
	if (!isCallback(garbageCollector)) {
		loggerInstance.warn("Garbage collection is not exposed. Run with --expose-gc to enable.");
		return;
	}

	const memoryBeforeCollection = process.memoryUsage();
	garbageCollector();
	const memoryAfterCollection = process.memoryUsage();

	loggerInstance.debug("Garbage collection completed", {
		memoryAfterCollection: serializeMemoryUsage(memoryAfterCollection),
		memoryBeforeCollection: serializeMemoryUsage(memoryBeforeCollection),
		memoryReclaimed: {
			heapUsedBytes: memoryBeforeCollection.heapUsed - memoryAfterCollection.heapUsed,
			heapUsedFormatted: prettyBytes(memoryBeforeCollection.heapUsed - memoryAfterCollection.heapUsed),
			residentSetSizeBytes: memoryBeforeCollection.rss - memoryAfterCollection.rss,
			residentSetSizeFormatted: prettyBytes(memoryBeforeCollection.rss - memoryAfterCollection.rss),
		},
	});
}
