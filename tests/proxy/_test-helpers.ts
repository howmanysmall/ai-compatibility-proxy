export function getInitHeader(init: RequestInit | undefined, name: string): string | null {
	const headers = init?.headers;
	if (headers === undefined) return JSON.parse("null") as null;

	if (headers instanceof Headers) {
		return headers.get(name);
	}

	const target = name.toLowerCase();

	if (Array.isArray(headers)) {
		for (const [key, value] of headers as Array<readonly [string, string]>) {
			if (key.toLowerCase() === target) return value;
		}
		return JSON.parse("null") as null;
	}

	for (const [key, value] of Object.entries(headers as Record<string, string>)) {
		if (key.toLowerCase() === target) return value;
	}

	return JSON.parse("null") as null;
}
