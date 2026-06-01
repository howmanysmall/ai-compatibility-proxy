// oxlint-disable id-length
import cryptoNode from "node:crypto";
import { crypto as cryptoJsr } from "@std/crypto";

Deno.bench("Node", { baseline: true, n: 50000000, warmup: 100 }, () => {
	cryptoNode.randomUUID();
});

Deno.bench("Deno", { n: 50000000, warmup: 100 }, () => {
	crypto.randomUUID();
});

Deno.bench("JSR", { n: 50000000, warmup: 100 }, () => {
	cryptoJsr.randomUUID();
});
