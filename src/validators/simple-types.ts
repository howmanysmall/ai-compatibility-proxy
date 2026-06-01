export function isString(value: unknown): value is string {
	return typeof value === "string";
}

export function isArrayOfStrings(object: unknown): object is ReadonlyArray<string> {
	if (!Array.isArray(object)) return false;

	for (const value of object) if (typeof value !== "string") return false;
	return true;
}
