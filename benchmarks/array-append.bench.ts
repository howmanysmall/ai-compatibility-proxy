// oxlint-disable sonar/void-use
const ITERATIONS = 100_000;

Deno.bench("[] + push", { baseline: true }, () => {
	const array: Array<number> = [];
	for (let index = 0; index < ITERATIONS; index += 1) {
		array.push(index);
	}
	void array;
});

Deno.bench("[] + [.length] =", {}, () => {
	const array: Array<number> = [];
	for (let index = 0; index < ITERATIONS; index += 1) {
		array[array.length] = index;
	}
	void array;
});

Deno.bench("[] + length++", {}, () => {
	const array: Array<number> = [];
	let length = 0;
	for (let index = 0; index < ITERATIONS; index += 1) {
		array[length++] = index;
	}
	void array;
});

Deno.bench("new Array() + push", {}, () => {
	const array = new Array<number>();
	for (let index = 0; index < ITERATIONS; index += 1) {
		array.push(index);
	}
	void array;
});

Deno.bench("new Array() + [.length] =", {}, () => {
	const array = new Array<number>();
	for (let index = 0; index < ITERATIONS; index += 1) {
		array[array.length] = index;
	}
	void array;
});

Deno.bench("new Array() + length++", {}, () => {
	const array = new Array<number>();
	let length = 0;
	for (let index = 0; index < ITERATIONS; index += 1) {
		array[length++] = index;
	}
	void array;
});
