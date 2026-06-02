export function getNumber(value: unknown): number {
	return typeof value === "number" ? value : 0;
}

export function getFiniteNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
