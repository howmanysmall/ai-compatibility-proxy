import cryptoNode from "node:crypto";
import { faker } from "@faker-js/faker";
// deno-lint-ignore no-import-prefix
import { crypto, timingSafeEqual } from "jsr:@std/crypto@1.1.0";

function nextPassword(): string {
	return faker.internet.password({
		length: faker.number.int({ max: 20, min: 12 }),
		// oxlint-disable-next-line sonar/pseudo-random
		memorable: Math.random() < 0.5,
	});
}

const randomData = faker.helpers.multiple(nextPassword, {
	count: 10_000,
});

const textEncoder = new TextEncoder();

function hasSameTokenNode(clientBearerToken: string, expectedToken: string): boolean {
	const clientBearerTokenHash = cryptoNode
		.createHash("sha256")
		.update(textEncoder.encode(clientBearerToken))
		.digest();
	const expectedTokenHash = cryptoNode.createHash("sha256").update(textEncoder.encode(expectedToken)).digest();
	return cryptoNode.timingSafeEqual(clientBearerTokenHash, expectedTokenHash);
}

function timingSafeEqualDeno(a: ArrayBuffer, b: ArrayBuffer): boolean {
	if (a.byteLength !== b.byteLength) return false;
	const va = new Uint8Array(a);
	const vb = new Uint8Array(b);
	let result = 0;
	for (let index = 0; index < va.length; index += 1) result |= va[index]! ^ vb[index]!;
	return result === 0;
}

function hasSameTokenPartialDeno(clientBearerToken: string, expectedToken: string): boolean {
	const clientHash = crypto.subtle.digestSync("SHA-256", textEncoder.encode(clientBearerToken));
	const expectedHash = crypto.subtle.digestSync("SHA-256", textEncoder.encode(expectedToken));
	return timingSafeEqualDeno(clientHash, expectedHash);
}

function hasSameTokenDeno(clientBearerToken: string, expectedToken: string): boolean {
	const clientHash = crypto.subtle.digestSync("SHA-256", textEncoder.encode(clientBearerToken));
	const expectedHash = crypto.subtle.digestSync("SHA-256", textEncoder.encode(expectedToken));
	return timingSafeEqual(clientHash, expectedHash);
}

for (const password of randomData) {
	const value = hasSameTokenNode(password, password);
	if (value !== hasSameTokenDeno(password, password)) {
		throw new Error("Hash (Full) mismatch");
	}
	if (value !== hasSameTokenPartialDeno(password, password)) {
		throw new Error("Hash (Partial) mismatch");
	}
}

Deno.bench("Node", { baseline: true }, () => {
	for (const password of randomData) hasSameTokenNode(password, password);
});

Deno.bench("Deno (Partial)", () => {
	for (const password of randomData) hasSameTokenPartialDeno(password, password);
});

Deno.bench("Deno (Full)", () => {
	for (const password of randomData) hasSameTokenDeno(password, password);
});
