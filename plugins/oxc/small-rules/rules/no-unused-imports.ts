// oxlint-disable small-rules/prevent-abbreviations
import { defineRule } from "oxlint-plugin-utilities";

import type { Comment, ESTree, Visitor } from "oxlint-plugin-utilities";

type AnyImportSpecifier = ESTree.ImportDefaultSpecifier | ESTree.ImportNamespaceSpecifier | ESTree.ImportSpecifier;

interface ImportInfo {
	readonly identifierName: string;
	readonly parent: ESTree.ImportDeclaration;
	readonly specifier: AnyImportSpecifier;
}

const JSDOC_TAG_PATTERN =
	/(?:\{@|@)(link|linkcode|linkplain|see|type|typedef|param|returns?|template|augments|extends|implements)\b/gu;
const LINK_TAGS = new Set(["link", "linkcode", "linkplain", "see"]);
const TYPE_TAGS = new Set([
	"type",
	"typedef",
	"param",
	"return",
	"returns",
	"template",
	"augments",
	"extends",
	"implements",
]);

function isWordCharacter(character: string): boolean {
	return (
		(character >= "A" && character <= "Z") ||
		(character >= "a" && character <= "z") ||
		(character >= "0" && character <= "9") ||
		character === "_"
	);
}

function skipWhitespace(value: string, index: number): number {
	let current = index;
	while ((value[current] ?? "") === " " || (value[current] ?? "") === "\t" || (value[current] ?? "") === "\n") {
		current += 1;
	}
	return current;
}

function readIdentifier(value: string, index: number): { identifier: string; nextIndex: number } | undefined {
	let current = index;
	while (current < value.length && !isWordCharacter(value[current] ?? "")) current += 1;

	const start = current;
	while (current < value.length && isWordCharacter(value[current] ?? "")) current += 1;
	if (start === current) return undefined;

	return {
		identifier: value.slice(start, current),
		nextIndex: current,
	};
}

function addIdentifiersFromRange(value: string, start: number, end: number, identifiers: Set<string>): void {
	let current = start;
	while (current < end) {
		const match = readIdentifier(value, current);
		if (match === undefined || match.nextIndex > end) break;

		identifiers.add(match.identifier);
		current = match.nextIndex;
	}
}

function isImportSpecifier(node: ESTree.Node): node is AnyImportSpecifier {
	return (
		node.type === "ImportDefaultSpecifier" ||
		node.type === "ImportNamespaceSpecifier" ||
		node.type === "ImportSpecifier"
	);
}

function addLinkTagIdentifier(value: string, index: number, identifiers: Set<string>): void {
	if (value[index] !== "{") {
		const identifier = readIdentifier(value, index);
		if (identifier !== undefined) identifiers.add(identifier.identifier);
		return;
	}

	const end = value.indexOf("}", index + 1);
	const identifier = readIdentifier(value, index + 1);
	if (identifier === undefined) return;
	if (end !== -1 && identifier.nextIndex > end) return;
	identifiers.add(identifier.identifier);
}

function addTypeTagIdentifiers(value: string, index: number, identifiers: Set<string>): void {
	if (value[index] === "{") {
		const end = value.indexOf("}", index + 1);
		const endIndex = end === -1 ? value.length : end;
		addIdentifiersFromRange(value, index + 1, endIndex, identifiers);
		return;
	}

	const identifier = readIdentifier(value, index);
	if (identifier !== undefined) identifiers.add(identifier.identifier);
}

function collectJsDocIdentifiers(comments: ReadonlyArray<Comment>): Set<string> {
	const identifiers = new Set<string>();
	for (const comment of comments) {
		if (comment.type !== "Block" || !comment.value.includes("@")) continue;

		for (const match of comment.value.matchAll(JSDOC_TAG_PATTERN)) {
			const tag = match[1] ?? "";
			let index = (match.index ?? 0) + match[0].length;
			index = skipWhitespace(comment.value, index);

			if (LINK_TAGS.has(tag)) {
				addLinkTagIdentifier(comment.value, index, identifiers);
				continue;
			}
			if (!TYPE_TAGS.has(tag)) continue;
			addTypeTagIdentifiers(comment.value, index, identifiers);
		}
	}
	return identifiers;
}

const noUnusedImports = defineRule({
	create(context): Visitor {
		const { sourceCode } = context;
		const checkJsDoc = context.options[0]?.checkJSDoc ?? true;
		const jsdocIdentifiers = checkJsDoc ? collectJsDocIdentifiers(sourceCode.getAllComments()) : new Set<string>();

		const imports = new Array<ImportInfo>();
		let scopeReference: ESTree.ImportDeclaration | undefined;

		return {
			ImportDeclaration(node): void {
				scopeReference ??= node;
				for (const specifier of node.specifiers) {
					if (!isImportSpecifier(specifier)) continue;
					imports.push({
						identifierName: specifier.local.name,
						parent: node,
						specifier,
					});
				}
			},

			"Program:exit"(): void {
				if (scopeReference === undefined) return;
				const moduleScope = sourceCode.getScope(scopeReference);

				for (const { identifierName, parent, specifier: specifierNode } of imports) {
					const variable = moduleScope.set.get(identifierName);
					if (variable !== undefined && variable.references.length > 0) continue;
					if (checkJsDoc && jsdocIdentifiers.has(identifierName)) continue;

					context.report({
						data: { identifierName },
						fix(fixer) {
							if (parent.specifiers.length === 1) return fixer.remove(parent);
							const nextToken = sourceCode.getTokenAfter(specifierNode);
							const isFirstSpecifier = parent.specifiers[0] === specifierNode;
							if (isFirstSpecifier && nextToken?.value === ",") {
								const previousToken = sourceCode.getTokenBefore(specifierNode);
								if (previousToken !== null) {
									return [
										fixer.removeRange([previousToken.range[1], specifierNode.range[0]]),
										fixer.remove(specifierNode),
										fixer.remove(nextToken),
									];
								}
							}
							if (nextToken?.value === ",") {
								return fixer.removeRange([specifierNode.range[0], nextToken.range[1]]);
							}
							const previousToken = sourceCode.getTokenBefore(specifierNode);
							if (previousToken?.value === ",") {
								return fixer.removeRange([previousToken.range[0], specifierNode.range[1]]);
							}
							return fixer.remove(specifierNode);
						},
						messageId: "unusedImport",
						node: specifierNode,
					});
				}
			},
		} satisfies Visitor;
	},
	meta: {
		docs: {
			description: "Disallow unused imports",
		},
		fixable: "code",
		messages: {
			unusedImport: "Import '{{identifierName}}' is defined but never used.",
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					checkJSDoc: {
						default: true,
						description: "Check if imports are referenced in JSDoc comments",
						type: "boolean",
					},
				},
				type: "object",
			},
		],
		type: "problem",
	},
});

export default noUnusedImports;
