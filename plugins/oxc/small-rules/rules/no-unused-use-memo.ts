import { isIdentifierNamed, isUseMemoCall } from "@oxlint-utilities/oxc-utilities.ts";
import { getEnvironment, getReactSources, isReactImport } from "@oxlint-utilities/react-utilities.ts";
import { defineRule } from "oxlint-plugin-utilities";

import type { ESTree, Visitor } from "oxlint-plugin-utilities";

function isStandaloneUseMemo(node: ESTree.CallExpression): boolean {
	if (node.parent.type === "ExpressionStatement") return true;
	if (node.parent.type !== "UnaryExpression" || node.parent.operator !== "void") return false;
	return node.parent.parent.type === "ExpressionStatement";
}

const noUnusedUseMemo = defineRule({
	create(context): Visitor {
		const memoIdentifiers = new Set<string>();
		const reactNamespaces = new Set<string>();
		const reactSources = getReactSources(getEnvironment(context.options[0]));

		return {
			CallExpression(node): void {
				if (!isUseMemoCall(node, memoIdentifiers, reactNamespaces)) return;
				if (!isStandaloneUseMemo(node)) return;

				context.report({
					messageId: "unusedUseMemo",
					node,
				});
			},
			ImportDeclaration(node): void {
				if (!isReactImport(node, reactSources)) return;

				for (const specifier of node.specifiers) {
					if (specifier.type === "ImportSpecifier") {
						if (isIdentifierNamed(specifier.imported, "useMemo")) memoIdentifiers.add(specifier.local.name);
						continue;
					}

					reactNamespaces.add(specifier.local.name);
				}
			},
		} satisfies Visitor;
	},
	meta: {
		docs: {
			description: "Disallow standalone useMemo calls that ignore the memoized value.",
			recommended: true,
		},
		messages: {
			unusedUseMemo:
				"useMemo results must be used. Standalone useMemo calls add overhead without preserving a value.",
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					environment: {
						default: "standard",
						enum: ["roblox-ts", "standard"],
						type: "string",
					},
				},
				type: "object",
			},
		],
		type: "problem",
	},
});

export default noUnusedUseMemo;
