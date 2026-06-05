const STARTED_AT = performance.now();

export function getUnixSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

export function uptime(): number {
	return performance.now() - STARTED_AT;
}
