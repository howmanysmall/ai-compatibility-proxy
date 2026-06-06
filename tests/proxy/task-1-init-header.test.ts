import { expect, test } from "vitest";

import { getInitHeader } from "../utilities/test-utilities.ts";

test("getInitHeader reads Headers instances", () => {
	expect.hasAssertions();
	const init: RequestInit = { headers: new Headers({ authorization: "Bearer headers" }) };
	expect(getInitHeader(init, "authorization") === "Bearer headers", "Expected Headers instance lookup.").toBe(true);
});

test("getInitHeader reads plain object records", () => {
	expect.hasAssertions();
	const init: RequestInit = { headers: { Authorization: "Bearer record" } };
	expect(getInitHeader(init, "authorization") === "Bearer record", "Expected record lookup.").toBe(true);
});

test("getInitHeader reads array tuples", () => {
	expect.hasAssertions();
	const init: RequestInit = { headers: [["Authorization", "Bearer tuples"]] };
	expect(getInitHeader(init, "authorization") === "Bearer tuples", "Expected tuple lookup.").toBe(true);
});

test("getInitHeader returns null when init is undefined", () => {
	expect.hasAssertions();
	const missing = JSON.parse("null") as null;
	expect(getInitHeader(undefined, "authorization") === missing, "Expected null for undefined init.").toBe(true);
});
