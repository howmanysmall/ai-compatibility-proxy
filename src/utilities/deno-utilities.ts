const STARTED_AT = performance.now();

export function uptime(): number {
	return performance.now() - STARTED_AT;
}
