// oxlint-disable import/no-namespace unicorn/no-null sonar/void-use small-rules/no-commented-code
import { faker } from "@faker-js/faker";
import { type } from "arktype";
import { Schema } from "effect";
import { bench, run } from "mitata";
import * as sury from "sury";
import Typebox from "typebox";
import { Compile } from "typebox/compile";
import * as valibot from "valibot";
import { z } from "zod";

const fromArkType = type({
	content: type({
		text: "string",
		type: "'text' | 'thinking'",
	}).array(),
	id: "string",
	model: "string",
	"role?": "'assistant'",
	"stop_reason?": "string | null",
	"stop_sequence?": "string | null",
	type: "'message'",
	"usage?": {
		"cache_creation_input_tokens?": "number",
		"cache_read_input_tokens?": "number",
		input_tokens: "number",
		output_tokens: "number",
	},
});

const fromEffect = Schema.Struct({
	content: Schema.Array(
		Schema.Struct({
			text: Schema.String,
			type: Schema.Literal("text", "thinking"),
		}),
	),
	id: Schema.String,
	model: Schema.String,
	role: Schema.optional(Schema.Literal("assistant")),
	stop_reason: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
	stop_sequence: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
	usage: Schema.optional(
		Schema.Struct({
			cache_creation_input_tokens: Schema.optional(Schema.Int),
			cache_read_input_tokens: Schema.optional(Schema.Int),
			input_tokens: Schema.Int,
			output_tokens: Schema.Int,
		}),
	),
});

const fromTypebox = Compile(
	Typebox.Object({
		content: Typebox.Array(
			Typebox.Object({
				text: Typebox.String(),
				type: Typebox.Union([Typebox.Literal("text"), Typebox.Literal("thinking")] as const),
			}),
		),
		id: Typebox.String(),
		model: Typebox.String(),
		role: Typebox.Optional(Typebox.Literal("assistant")),
		stop_reason: Typebox.Optional(Typebox.Union([Typebox.String(), Typebox.Null()])),
		stop_sequence: Typebox.Optional(Typebox.Union([Typebox.String(), Typebox.Null()])),
		type: Typebox.Literal("message"),
		usage: Typebox.Optional(
			Typebox.Object({
				cache_creation_input_tokens: Typebox.Optional(Typebox.Number()),
				cache_read_input_tokens: Typebox.Optional(Typebox.Number()),
				input_tokens: Typebox.Number(),
				output_tokens: Typebox.Number(),
			}),
		),
	}),
);

const fromZod = z.object({
	content: z
		.object({
			text: z.string(),
			type: z.enum(["text", "thinking"]),
		})
		.array(),
	id: z.string(),
	model: z.string(),
	role: z.optional(z.literal("assistant")),
	stop_reason: z.optional(z.union([z.string(), z.null()])),
	stop_sequence: z.optional(z.union([z.string(), z.null()])),
	type: z.literal("message"),
	usage: z.optional(
		z.object({
			cache_creation_input_tokens: z.optional(z.number()),
			cache_read_input_tokens: z.optional(z.number()),
			input_tokens: z.number(),
			output_tokens: z.number(),
		}),
	),
});

const fromValibot = valibot.object({
	content: valibot.array(
		valibot.object({
			text: valibot.string(),
			type: valibot.union([valibot.literal("text"), valibot.literal("thinking")]),
		}),
	),
	id: valibot.string(),
	model: valibot.string(),
	role: valibot.optional(valibot.literal("assistant")),
	stop_reason: valibot.optional(valibot.union([valibot.string(), valibot.null()])),
	stop_sequence: valibot.optional(valibot.union([valibot.string(), valibot.null()])),
	type: valibot.literal("message"),
	usage: valibot.optional(
		valibot.object({
			cache_creation_input_tokens: valibot.optional(valibot.number()),
			cache_read_input_tokens: valibot.optional(valibot.number()),
			input_tokens: valibot.number(),
			output_tokens: valibot.number(),
		}),
	),
});

const surySchema = sury.schema({
	content: sury.array(
		sury.schema({
			text: sury.string,
			type: sury.union(["text", "thinking"]),
		}),
	),
	id: sury.string,
	model: sury.string,
	role: sury.optional(sury.schema("assistant")),
	stop_reason: sury.optional(sury.nullable(sury.string)),
	stop_sequence: sury.optional(sury.nullable(sury.string)),
	type: sury.schema("message"),
	usage: sury.optional(
		sury.schema({
			cache_creation_input_tokens: sury.optional(sury.number),
			cache_read_input_tokens: sury.optional(sury.number),
			input_tokens: sury.number,
			output_tokens: sury.number,
		}),
	),
});
const fromSury = sury.parser(surySchema);

function generateData1(): unknown {
	// oxlint-disable-next-line sonar/pseudo-random
	if (Math.random() < 0.5) return {};

	return {
		content: faker.helpers.multiple(
			() => ({
				text: faker.lorem.sentence(),
				type: faker.helpers.arrayElement(["text", "thinking"] as const),
			}),
			{ count: { max: 3, min: 1 } },
		),
		id: faker.string.uuid(),
		model: faker.helpers.arrayElement(["claude-3-5-sonnet", "claude-opus-4"]),
		role: faker.helpers.maybe(() => "assistant" as const),
		stop_reason: faker.helpers.maybe(() => faker.helpers.arrayElement(["end_turn", "max_tokens", null])),
		stop_sequence: faker.helpers.maybe(() => faker.helpers.arrayElement(["\n\nHuman:", null])),
		type: "message",
		usage: faker.helpers.maybe(() => ({
			cache_creation_input_tokens: faker.helpers.maybe(() => faker.number.int({ max: 1000 })),
			cache_read_input_tokens: faker.helpers.maybe(() => faker.number.int({ max: 1000 })),
			input_tokens: faker.number.int({ max: 2000, min: 10 }),
			output_tokens: faker.number.int({ max: 500, min: 10 }),
		})),
	};
}

function generateData2(): unknown {
	// oxlint-disable-next-line sonar/pseudo-random
	if (Math.random() < 0.5) return {};
	return {
		content: Array.from({ length: faker.number.int({ max: 3, min: 1 }) }, () => ({
			text: faker.lorem.sentence(),
			type: faker.helpers.arrayElement(["text", "thinking"]),
		})),
		id: faker.string.uuid(),
		model: faker.helpers.arrayElement(["claude-3-opus", "gpt-4"]),
		role: faker.helpers.maybe(() => "assistant" as const, { probability: 0.8 }),
		stop_reason: faker.helpers.maybe(() => "end_turn", { probability: 0.6 }) ?? null,
		stop_sequence: null,
		type: "message",
		usage: {
			cache_creation_input_tokens: faker.helpers.maybe(() => faker.number.int({ max: 500, min: 0 }), {
				probability: 0.3,
			}),
			cache_read_input_tokens: faker.helpers.maybe(() => faker.number.int({ max: 500, min: 0 }), {
				probability: 0.3,
			}),
			input_tokens: faker.number.int({ max: 2000, min: 100 }),
			output_tokens: faker.number.int({ max: 2000, min: 100 }),
		},
	};
}

const randomData = new Array<unknown>(10000);

for (let index = 0; index < 10000; index += 1) {
	// oxlint-disable-next-line sonar/pseudo-random
	randomData[index] = Math.random() < 0.5 ? generateData1() : generateData2();
}

function benchmarkArkType(): void {
	bench("ArkType", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			const result = fromArkType(data);
			if (result instanceof type.errors) continue;
			validData.push(result);
		}

		void validData;
	});

	bench("ArkType (.allows)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			if (!fromArkType.allows(data)) continue;
			validData.push(data);
		}

		void validData;
	});
}

function benchmarkEffect(): void {
	const fromEffectDecodeSync = Schema.decodeUnknownSync(fromEffect);
	const fromEffectDecodeEither = Schema.decodeUnknownEither(fromEffect);
	const fromEffectIs = Schema.is(fromEffect);
	// const fromEffectAssertion = Schema.asserts(fromEffect);

	bench("Effect Schema (decodeUnknownSync)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			try {
				validData.push(fromEffectDecodeSync(data));
			} catch {
				continue;
			}
		}

		void validData;
	});

	bench("Effect Schema (decodeUnknownEither)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			const result = fromEffectDecodeEither(data);
			if (result._tag === "Left") continue;
			validData.push(result.right);
		}

		void validData;
	});
	bench("Effect Schema (is)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			if (!fromEffectIs(data)) continue;
			validData.push(data);
		}

		void validData;
	});

	// bench("Effect Schema (asserts)", () => {
	// 	const validData = new Array<unknown>();
	// 	for (const data of randomData) {
	// 		try {
	// 			fromEffectAssertion(data);
	// 			validData.push(data);
	// 		} catch {
	// 			continue;
	// 		}
	// 	}
	// 	void validData;
	// });
}

function benchmarkSury(): void {
	bench("Sury (parser)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			try {
				validData.push(fromSury(data));
			} catch {
				continue;
			}
		}

		void validData;
	});

	bench("Sury (assert)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			try {
				sury.assert(surySchema, data);
				validData.push(data);
			} catch {
				continue;
			}
		}

		void validData;
	});

	bench("Sury (safe)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			const result = sury.safe(() => fromSury(data));
			if (!result.success) continue;
			validData.push(data);
		}

		void validData;
	});
}

function benchmarkZod(): void {
	bench("Zod (parse)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			try {
				validData.push(fromZod.parse(data));
			} catch {
				continue;
			}
		}

		void validData;
	});

	bench("Zod (safeParse)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			const result = fromZod.safeParse(data);
			if (!result.success) continue;
			validData.push(result.data);
		}

		void validData;
	});
}

function benchmarkValibot(): void {
	bench("Valibot (parse)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			try {
				validData.push(valibot.parse(fromValibot, data));
			} catch {
				continue;
			}
		}

		void validData;
	});

	bench("Valibot (safeParse)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			const result = valibot.safeParse(fromValibot, data);
			if (!result.success) continue;
			validData.push(result.output);
		}

		void validData;
	});

	bench("Valibot (is)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			if (!valibot.is(fromValibot, data)) continue;
			validData.push(data);
		}

		void validData;
	});
}

function benchmarkTypebox(): void {
	bench("Typebox (Check)", () => {
		const validData = new Array<unknown>();

		for (const data of randomData) {
			if (!fromTypebox.Check(data)) continue;
			validData.push(data);
		}

		void validData;
	});
}

benchmarkArkType();
benchmarkEffect();
benchmarkSury();
benchmarkZod();
benchmarkValibot();
benchmarkTypebox();

await run();
