import cryptoNode from "node:crypto";
import { faker } from "@faker-js/faker";
import { bench, run } from "mitata";

function nextPassword(): string {
	return faker.internet.password({
		length: faker.number.int({ max: 20, min: 12 }),
		// oxlint-disable-next-line sonar/pseudo-random -- using Math.random() for password generation
		memorable: Math.random() < 0.5,
	});
}

const randomData = faker.helpers.multiple(nextPassword, {
	count: 10_000,
});

const textEncoder = new TextEncoder();

function hasSameTokenNode(clientBearerToken: string, expectedToken: string): boolean {
	const clientBearerTokenHash = cryptoNode.createHash("sha256").update(clientBearerToken, "utf8").digest();
	const expectedTokenHash = cryptoNode.createHash("sha256").update(expectedToken, "utf8").digest();
	return cryptoNode.timingSafeEqual(clientBearerTokenHash, expectedTokenHash);
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) return false;
	let result = 0;
	// biome-ignore lint/suspicious/noBitwiseOperators: lol
	for (let index = 0; index < left.length; index += 1) result |= left[index]! ^ right[index]!;
	return result === 0;
}

function hashWithBun(value: string): Uint8Array {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(value);
	return hasher.digest();
}

function hasSameTokenBun(clientBearerToken: string, expectedToken: string): boolean {
	return cryptoNode.timingSafeEqual(hashWithBun(clientBearerToken), hashWithBun(expectedToken));
}

async function hasSameTokenWebCryptoAsync(clientBearerToken: string, expectedToken: string): Promise<boolean> {
	const [clientHash, expectedHash] = await Promise.all([
		crypto.subtle.digest("SHA-256", textEncoder.encode(clientBearerToken)),
		crypto.subtle.digest("SHA-256", textEncoder.encode(expectedToken)),
	]);
	return timingSafeEqualBytes(new Uint8Array(clientHash), new Uint8Array(expectedHash));
}

for (const password of randomData) {
	const value = hasSameTokenNode(password, password);
	if (value !== hasSameTokenBun(password, password)) {
		const error = new Error("Hash mismatch");
		Error.captureStackTrace(error);
		throw error;
	}
}

bench("Node createHash", () => {
	for (const password of randomData) hasSameTokenNode(password, password);
});

bench("Bun.CryptoHasher", () => {
	for (const password of randomData) hasSameTokenBun(password, password);
});

bench("Web Crypto", async () => {
	for (const password of randomData) await hasSameTokenWebCryptoAsync(password, password);
});

await run();
