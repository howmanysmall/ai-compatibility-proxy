import { expect, describe, it } from "vitest";

import { getInitHeader } from "../utilities/test-utilities";

describe("initial headers", () => {
	it("getInitHeader reads Headers instances", () => {
		expect.assertions(1);
		const init: RequestInit = { headers: new Headers({ authorization: "Bearer headers" }) };
		expect(getInitHeader(init, "authorization"), "Expected Headers instance lookup.").toBe("Bearer headers");
	});

	it("getInitHeader reads plain object records", () => {
		expect.assertions(1);
		const init: RequestInit = { headers: { Authorization: "Bearer record" } };
		expect(getInitHeader(init, "authorization"), "Expected record lookup.").toBe("Bearer record");
	});

	it("getInitHeader reads array tuples", () => {
		expect.assertions(1);
		const init: RequestInit = { headers: [["Authorization", "Bearer tuples"]] };
		expect(getInitHeader(init, "authorization"), "Expected tuple lookup.").toBe("Bearer tuples");
	});

	it("getInitHeader returns null when init is undefined", () => {
		expect.assertions(1);
		expect(getInitHeader(undefined, "authorization"), "Expected null for undefined init.").toBeNull();
	});
});
