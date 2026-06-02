export function getUnixSeconds(): number {
	return Math.floor(Date.now() / 1000);
}
