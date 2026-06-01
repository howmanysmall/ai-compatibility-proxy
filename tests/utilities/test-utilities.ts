import { type } from "arktype";

const isHeadersArray = type(["string", "string"]).readonly().array().readonly();
const isHeadersRecord = type("Record<string, string>").readonly();

export function getInitHeader(init: RequestInit | undefined, name: string): string | null {
	const headers = init?.headers;
	if (headers === undefined) return JSON.parse("null") as null;
	if (headers instanceof Headers) return headers.get(name);

	const target = name.toLowerCase();

	if (isHeadersArray.allows(headers)) {
		for (const [key, value] of headers) if (key.toLowerCase() === target) return value;
		return JSON.parse("null") as null;
	}

	if (isHeadersRecord.allows(headers)) {
		for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === target) return value;
	}

	return JSON.parse("null") as null;
}

export function assert(condition: boolean, message: string): asserts condition {
	if (condition) return;

	const error = new Error(message);
	Error.captureStackTrace(error, assert);
	throw error;
}

export function assertEquals<TValue>(actual: TValue, expected: TValue, message: string): void {
	if (actual === expected) return;

	const error = new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
	Error.captureStackTrace(error, assertEquals);
	throw error;
}
