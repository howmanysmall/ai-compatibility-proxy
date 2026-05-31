import { defineRule } from "oxlint-plugin-utilities";

import type { ESTree, Visitor } from "oxlint-plugin-utilities";

const WORD_PATTERN = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/gv;
const NORMALIZE_1 = /([a-z0-9])([A-Z])/gv;
const NORMALIZE_2 = /[_\-\s]+/gv;

function isAsciiAlphaNumeric(character: string): boolean {
	return (
		(character >= "A" && character <= "Z") ||
		(character >= "a" && character <= "z") ||
		(character >= "0" && character <= "9")
	);
}

function trimNonAlphaNumericEdges(value: string): string {
	let start = 0;
	let end = value.length;

	while (start < end && !isAsciiAlphaNumeric(value[start] ?? "")) start += 1;
	while (end > start && !isAsciiAlphaNumeric(value[end - 1] ?? "")) end -= 1;

	return value.slice(start, end);
}

function splitIntoWords(value: string): ReadonlyArray<string> {
	const normalized = trimNonAlphaNumericEdges(value).replaceAll(NORMALIZE_1, "$1 $2").replaceAll(NORMALIZE_2, " ");
	return normalized.match(WORD_PATTERN) ?? [];
}

function toPascalCase(value: string): string {
	const words = splitIntoWords(value);
	let result = "";

	for (const word of words) {
		if (word.length === 0) continue;
		result += `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
	}

	return result;
}

const IS_INTEGER = /^\d/u;

function getEnumMemberName(node: ESTree.TSEnumMember): string | undefined {
	if (node.id.type === "Identifier") return node.id.name;
	if (node.id.type !== "Literal" || typeof node.id.value !== "string") return undefined;
	return IS_INTEGER.test(node.id.value) ? undefined : node.id.value;
}

const preferPascalCaseEnums = defineRule({
	create(context): Visitor {
		return {
			TSEnumDeclaration(node): void {
				const identifier = node.id.name;
				if (toPascalCase(identifier) === identifier) return;

				context.report({
					data: { identifier },
					messageId: "notPascalCase",
					node: node.id,
				});
			},
			TSEnumMember(node): void {
				const identifier = getEnumMemberName(node);
				if (identifier === undefined || toPascalCase(identifier) === identifier) return;

				context.report({
					data: { identifier },
					messageId: "notPascalCase",
					node: node.id,
				});
			},
		} satisfies Visitor;
	},
	meta: {
		docs: {
			description: "Enforce Pascal case when naming enums.",
			recommended: true,
		},
		messages: {
			notPascalCase:
				"Enum '{{ identifier }}' uses non-standard casing. TypeScript convention requires PascalCase for enum names and members to distinguish them from variables (camelCase) and constants (UPPER_CASE). Rename to PascalCase: capitalize first letter of each word, no underscores.",
		},
		schema: [] as const,
		type: "suggestion",
	},
});

export default preferPascalCaseEnums;
