const SENSITIVE_KEYS = [
	"password",
	"passphrase",
	"token",
	"secret",
	"key",
	"authorization",
	"authentication",
	"auth",
	"credential",
	"cookie",
	"session",
	"pass",
	"apiKey",
	"privateKey",
	"clientSecret",
	"access_token",
	"refreshToken",
];

const MAX_DEPTH = 8;
const CIRCULAR_REFERENCE_PLACEHOLDER = "[Circular]";
const DEPTH_LIMIT_PLACEHOLDER = "[MaxDepthExceeded]";

interface SanitizeContext {
	readonly currentDepth: number;
	readonly maxDepth: number;
	readonly seenObjects: WeakSet<object>;
}

interface ErrorLike {
	readonly cause?: unknown;
	readonly code?: unknown;
	readonly message: string;
	readonly name: string;
	readonly stack?: string;
}

export interface SanitizeOptions {
	readonly maxDepth?: number;
}

function isSensitiveKey(key: string): boolean {
	return SENSITIVE_KEYS.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey.toLowerCase()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isDate(value: unknown): value is Date {
	return value instanceof Date;
}

function isError(value: unknown): value is Error {
	return value instanceof Error;
}

function isErrorLike(value: unknown): value is ErrorLike {
	if (!isRecord(value)) return false;
	return typeof value.name === "string" && typeof value.message === "string";
}

function isURL(value: unknown): value is URL {
	return value instanceof URL;
}

function sanitizeArray(values: ReadonlyArray<unknown>, context: SanitizeContext): ReadonlyArray<unknown> {
	return values.map((value) => sanitizeInternal(value, createNextContext(context)));
}

function sanitizeError(error: ErrorLike, context: SanitizeContext): Record<string, unknown> {
	const nextContext = createNextContext(context);
	const serializedError: Record<string, unknown> = {
		message: error.message,
		name: error.name,
	};

	if (typeof error.stack === "string") serializedError.stack = error.stack;
	if (error.cause !== undefined) serializedError.cause = sanitizeInternal(error.cause, nextContext);
	if (error.code !== undefined) serializedError.code = sanitizeInternal(error.code, nextContext);

	for (const [key, value] of Object.entries(error)) {
		if (key === "cause" || key === "code" || key === "message" || key === "name" || key === "stack") continue;
		serializedError[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeInternal(value, nextContext);
	}

	return serializedError;
}

function sanitizeMap(map: ReadonlyMap<unknown, unknown>, context: SanitizeContext): Record<string, unknown> {
	const entries = Array.from(map.entries(), ([key, value]) => ({
		key: sanitizeInternal(key, createNextContext(context)),
		value: typeof key === "string" && isSensitiveKey(key) ?
			"[REDACTED]" :
			sanitizeInternal(value, createNextContext(context)),
	}));

	return {
		entries,
		type: "Map",
	};
}

function sanitizeObject(object: Record<string, unknown>, context: SanitizeContext): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const nextContext = createNextContext(context);

	for (const [key, value] of Object.entries(object)) {
		result[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeInternal(value, nextContext);
	}

	return result;
}

function sanitizeSet(set: ReadonlySet<unknown>, context: SanitizeContext): Record<string, unknown> {
	return {
		entries: Array.from(set, (value) => sanitizeInternal(value, createNextContext(context))),
		type: "Set",
	};
}

function createNextContext(context: SanitizeContext): SanitizeContext {
	return {
		...context,
		currentDepth: context.currentDepth + 1,
	};
}

function sanitizeInternal(value: unknown, context: SanitizeContext): unknown {
	if (value === null || value === undefined) return value;
	if (context.currentDepth >= context.maxDepth) return DEPTH_LIMIT_PLACEHOLDER;

	if (typeof value === "bigint") return value.toString();
	if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
	if (typeof value === "symbol") return value.toString();

	if (isDate(value)) return value.toISOString();
	if (isURL(value)) return value.toString();
	if (value instanceof RegExp) return value.toString();
	if (Array.isArray(value)) return sanitizeArray(value, context);
	if (value instanceof Map) return sanitizeMap(value, context);
	if (value instanceof Set) return sanitizeSet(value, context);

	if (!isRecord(value)) {
		const serializedValue = JSON.stringify(value);
		return serializedValue ?? "[UnserializableValue]";
	}
	if (context.seenObjects.has(value)) return CIRCULAR_REFERENCE_PLACEHOLDER;

	context.seenObjects.add(value);
	try {
		if (isError(value) || isErrorLike(value)) return sanitizeError(value, context);
		return sanitizeObject(value, context);
	} finally {
		context.seenObjects.delete(value);
	}
}

export function sanitize(value: unknown, options: SanitizeOptions = {}): unknown {
	return sanitizeInternal(value, {
		currentDepth: 0,
		maxDepth: options.maxDepth ?? MAX_DEPTH,
		seenObjects: new WeakSet<object>(),
	});
}
