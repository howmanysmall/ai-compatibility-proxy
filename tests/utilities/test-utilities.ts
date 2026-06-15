// biome-ignore-all lint/suspicious/noMisplacedAssertion: false positive -- these are used in tests.
import { expect } from "vitest";
import { type } from "arktype";
import { Predicate } from "effect";

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

export function expectRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
	expect(Predicate.isRecord(value), message).toBe(true);
}

export function expectArray(value: unknown, message: string): asserts value is ReadonlyArray<unknown> {
	expect(Array.isArray(value), message).toBe(true);
}

export function expectPresent<Value>(value: Value | null | undefined, message: string): asserts value is Value {
	expect(value, message).not.toBeNull();
	expect(value, message).not.toBeUndefined();
}
