import { getInitHeader } from "./_test-helpers.ts";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

Deno.test("getInitHeader reads Headers instances", () => {
	const init: RequestInit = { headers: new Headers({ authorization: "Bearer headers" }) };
	assert(getInitHeader(init, "authorization") === "Bearer headers", "Expected Headers instance lookup.");
});

Deno.test("getInitHeader reads plain object records", () => {
	const init: RequestInit = { headers: { Authorization: "Bearer record" } };
	assert(getInitHeader(init, "authorization") === "Bearer record", "Expected record lookup.");
});

Deno.test("getInitHeader reads array tuples", () => {
	const init: RequestInit = { headers: [["Authorization", "Bearer tuples"]] };
	assert(getInitHeader(init, "authorization") === "Bearer tuples", "Expected tuple lookup.");
});

Deno.test("getInitHeader returns null when init is undefined", () => {
	const missing = JSON.parse("null") as null;
	assert(getInitHeader(undefined, "authorization") === missing, "Expected null for undefined init.");
});
