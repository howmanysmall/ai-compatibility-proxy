import { isTsTypeAnnotation } from "@oxlint-utilities/oxc-utilities";
import { walkAstSlop } from "@oxlint-utilities/react-hook-utilities";
import { isUppercaseName } from "@oxlint-utilities/string-utilities";
import { defineRule } from "oxlint-plugin-utilities";

import type { CallbackFunction } from "@oxlint-types/missing-types";
import type { ESTree, Visitor } from "oxlint-plugin-utilities";

const REACT_NODE_TYPE_NAMES = new Set(["JSXElement", "ReactElement", "ReactNode"]);

const HOOK_PATTERN = /^use[A-Z]/u;

function isHookName(name: string): boolean {
	return HOOK_PATTERN.test(name);
}

function getTypeAnnotationFromBinding(binding: ESTree.BindingPattern): ESTree.TSTypeAnnotation | undefined {
	if (!("typeAnnotation" in binding)) return undefined;
	const { typeAnnotation } = binding;
	return isTsTypeAnnotation(typeAnnotation) ? typeAnnotation : undefined;
}

function isReactNodeTypeAnnotation(node?: ESTree.TSType): boolean {
	if (node?.type !== "TSTypeReference") return false;

	const { typeName } = node;
	if (typeName.type === "Identifier") return REACT_NODE_TYPE_NAMES.has(typeName.name);
	if (typeName.type === "TSQualifiedName") return REACT_NODE_TYPE_NAMES.has(typeName.right.name);

	return false;
}

function getReturnTypeAnnotation(node: CallbackFunction): ESTree.TSType | undefined {
	const { returnType } = node;
	if (returnType === null || returnType === undefined) return undefined;
	return returnType.typeAnnotation;
}

function hasJsxReturn(node: CallbackFunction): boolean {
	if (
		node.type === "ArrowFunctionExpression" &&
		(node.body.type === "JSXElement" || node.body.type === "JSXFragment")
	) {
		return true;
	}

	if (node.body === null) return false;

	let foundJsx = false;

	walkAstSlop(node.body, (child) => {
		if (foundJsx) return;
		if (child.type !== "ReturnStatement") return;

		const { argument } = child;
		if (argument !== null && (argument.type === "JSXElement" || argument.type === "JSXFragment")) {
			foundJsx = true;
		}
	});

	return foundJsx;
}

function isInlineCallback({ parent }: CallbackFunction): boolean {
	return (
		parent.type === "CallExpression" ||
		parent.type === "JSXExpressionContainer" ||
		parent.type === "ArrayExpression"
	);
}

function getVariableDeclaratorFunctionName(node: ESTree.Node): string | undefined {
	if (node.parent?.type !== "VariableDeclarator" || node.parent.id.type !== "Identifier") {
		return undefined;
	}

	return node.parent.id.name;
}

function getBindingIdentifierName(binding: ESTree.BindingPattern): string | undefined {
	return binding.type === "Identifier" ? binding.name : undefined;
}

const noRenderHelperFunctions = defineRule({
	create(context): Visitor {
		let componentDepth = 0;

		function reportRenderHelper(node: ESTree.Node, functionName: string): void {
			context.report({
				data: { functionName },
				messageId: "noRenderHelper",
				node,
			});
		}

		function checkVariableFunctionExit(node: CallbackFunction): void {
			const { parent } = node;
			const functionName = getVariableDeclaratorFunctionName(node);

			if (functionName !== undefined && isUppercaseName(functionName)) {
				componentDepth -= 1;
				return;
			}

			if (componentDepth > 0 || isInlineCallback(node) || parent.type !== "VariableDeclarator") return;

			const variableName = getBindingIdentifierName(parent.id);
			if (variableName === undefined || isUppercaseName(variableName) || isHookName(variableName)) return;

			const typeAnnotation = getTypeAnnotationFromBinding(parent.id);
			const hasReactNodeAnnotation = typeAnnotation !== undefined &&
				isReactNodeTypeAnnotation(typeAnnotation.typeAnnotation);

			const returnTypeAnnotation = getReturnTypeAnnotation(node);
			const hasReturnType = isReactNodeTypeAnnotation(returnTypeAnnotation);

			if (hasReactNodeAnnotation || hasReturnType || hasJsxReturn(node)) {
				reportRenderHelper(parent, variableName);
			}
		}

		return {
			ArrowFunctionExpression(node): void {
				const functionName = getVariableDeclaratorFunctionName(node);
				if (functionName !== undefined && isUppercaseName(functionName)) componentDepth += 1;
			},
			"ArrowFunctionExpression:exit": checkVariableFunctionExit,
			FunctionDeclaration({ id }): void {
				if (id === null) return;
				if (isUppercaseName(id.name)) componentDepth += 1;
			},
			"FunctionDeclaration:exit"(node): void {
				if (node.id === null) return;

				const functionName = node.id.name;
				if (isUppercaseName(functionName)) {
					componentDepth -= 1;
					return;
				}

				if (componentDepth > 0) return;
				if (isHookName(functionName)) return;

				const returnTypeAnnotation = getReturnTypeAnnotation(node);
				const hasReturnType = isReactNodeTypeAnnotation(returnTypeAnnotation);

				if (hasReturnType || hasJsxReturn(node)) reportRenderHelper(node, functionName);
			},
			FunctionExpression(node): void {
				const functionName = getVariableDeclaratorFunctionName(node);
				if (functionName !== undefined && isUppercaseName(functionName)) componentDepth += 1;
			},
			"FunctionExpression:exit": checkVariableFunctionExit,
		};
	},
	meta: {
		docs: {
			description: "Disallow non-component functions that return JSX or React elements.",
		},
		messages: {
			noRenderHelper:
				"Convert render helper '{{functionName}}' to a React component. Functions that return JSX should be PascalCase components, not camelCase helpers.",
		},
		schema: [] as const,
		type: "suggestion",
	},
});

export default noRenderHelperFunctions;
