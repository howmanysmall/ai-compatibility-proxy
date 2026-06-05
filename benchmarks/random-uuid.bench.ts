import cryptoNode from "node:crypto";
import { bench, run } from "mitata";

bench("Node", () => {
	cryptoNode.randomUUID();
});

bench("Web Crypto", () => {
	crypto.randomUUID();
});

bench("Bun UUID v7", () => {
	Bun.randomUUIDv7();
});

await run();
