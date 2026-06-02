import { Predicate } from "effect";

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

function isErrorLike(value: unknown): value is ErrorLike {
	if (!Predicate.isRecord(value)) return false;
	return typeof value.name === "string" && typeof value.message === "string";
}

function isURL(value: unknown): value is URL {
	return value instanceof URL;
}

function sanitizeArray(values: ReadonlyArray<unknown>, sanitizeContext: SanitizeContext): ReadonlyArray<unknown> {
	return values.map((value) => sanitizeInternal(value, createNextContext(sanitizeContext)));
}

function sanitizeError(error: ErrorLike, sanitizeContext: SanitizeContext): Record<string, unknown> {
	const nextContext = createNextContext(sanitizeContext);
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

function sanitizeMap(map: ReadonlyMap<unknown, unknown>, sanitizeContext: SanitizeContext): Record<string, unknown> {
	const entries = Array.from(map.entries(), ([key, value]) => ({
		key: sanitizeInternal(key, createNextContext(sanitizeContext)),
		value: typeof key === "string" && isSensitiveKey(key) ?
			"[REDACTED]" :
			sanitizeInternal(value, createNextContext(sanitizeContext)),
	}));

	return {
		entries,
		type: "Map",
	};
}

function sanitizeObject(object: Record<string, unknown>, sanitizeContext: SanitizeContext): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const nextContext = createNextContext(sanitizeContext);

	for (const [key, value] of Object.entries(object)) {
		result[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeInternal(value, nextContext);
	}

	return result;
}

function sanitizeSet(set: ReadonlySet<unknown>, sanitizeContext: SanitizeContext): Record<string, unknown> {
	return {
		entries: Array.from(set, (value) => sanitizeInternal(value, createNextContext(sanitizeContext))),
		type: "Set",
	};
}

function createNextContext(sanitizeContext: SanitizeContext): SanitizeContext {
	return {
		...sanitizeContext,
		currentDepth: sanitizeContext.currentDepth + 1,
	};
}

function sanitizeInternal(value: unknown, sanitizeContext: SanitizeContext): unknown {
	if (value === null || value === undefined) return value;
	if (sanitizeContext.currentDepth >= sanitizeContext.maxDepth) return DEPTH_LIMIT_PLACEHOLDER;

	if (typeof value === "bigint") return value.toString();
	if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
	if (typeof value === "symbol") return value.toString();

	if (Predicate.isDate(value)) return value.toISOString();
	if (isURL(value)) return value.toString();
	if (value instanceof RegExp) return value.toString();
	if (Array.isArray(value)) return sanitizeArray(value, sanitizeContext);
	if (value instanceof Map) return sanitizeMap(value, sanitizeContext);
	if (value instanceof Set) return sanitizeSet(value, sanitizeContext);

	if (!Predicate.isRecord(value)) {
		const serializedValue = JSON.stringify(value);
		return serializedValue ?? "[UnserializableValue]";
	}
	if (sanitizeContext.seenObjects.has(value)) return CIRCULAR_REFERENCE_PLACEHOLDER;

	sanitizeContext.seenObjects.add(value);
	try {
		if (Predicate.isError(value) || isErrorLike(value)) return sanitizeError(value, sanitizeContext);
		return sanitizeObject(value, sanitizeContext);
	} finally {
		sanitizeContext.seenObjects.delete(value);
	}
}

export function sanitize(value: unknown, sanitizeOptions: SanitizeOptions = {}): unknown {
	return sanitizeInternal(value, {
		currentDepth: 0,
		maxDepth: sanitizeOptions.maxDepth ?? MAX_DEPTH,
		seenObjects: new WeakSet<object>(),
	});
}
