import { unwrapExpression } from "@oxlint-utilities/ast-utilities.ts";
import { isIdentifierNamed, isUseMemoCall } from "@oxlint-utilities/oxc-utilities.ts";
import { classifyDependencies, DependenciesKind } from "@oxlint-utilities/react-hook-utilities.ts";
import { getEnvironment, getReactSources, isReactImport } from "@oxlint-utilities/react-utilities.ts";
import { isRecord } from "@oxlint-utilities/type-utilities.ts";
import { defineRule } from "oxlint-plugin-utilities";

import type { Environment } from "@oxlint-utilities/react-utilities.ts";
import type { ESTree, Scope, SourceCode, Visitor } from "oxlint-plugin-utilities";

type ScopeVariable = Scope["set"] extends Map<string, infer VariableType> ? VariableType : never;

type DependencyMode = "aggressive" | "empty-or-omitted" | "non-updating";

interface NormalizedOptions {
	readonly dependencyMode: DependencyMode;
	readonly environment: Environment;
	readonly staticGlobalFactories: ReadonlySet<string>;
}

const DEFAULT_STATIC_GLOBAL_FACTORIES: ReadonlyArray<string> = [
	"Axes",
	"BrickColor",
	"CFrame",
	"Color3",
	"ColorSequence",
	"ColorSequenceKeypoint",
	"DateTime",
	"Faces",
	"NumberRange",
	"NumberSequence",
	"NumberSequenceKeypoint",
	"PathWaypoint",
	"PhysicalProperties",
	"Ray",
	"Rect",
	"Region3",
	"Region3int16",
	"TweenInfo",
	"UDim",
	"UDim2",
	"Vector2",
	"Vector3",
	"Vector3int16",
	"Vector3int32",
];

const STATIC_UNARY_OPERATORS = new Set(["!", "+", "-", "typeof", "void", "~"]);

function getDependencyMode(value: unknown): DependencyMode {
	if (!isRecord(value) || typeof value.dependencyMode !== "string") return "non-updating";
	if (value.dependencyMode === "empty-or-omitted" || value.dependencyMode === "aggressive") {
		return value.dependencyMode;
	}
	return "non-updating";
}

function isStaticGlobalFactories(value: unknown): value is ReadonlyArray<string> {
	if (!Array.isArray(value)) return false;
	for (const item of value) if (typeof item !== "string") return false;
	return true;
}

function normalizeOptions(raw: unknown): NormalizedOptions {
	const factories = isRecord(raw) && isStaticGlobalFactories(raw.staticGlobalFactories) ?
		raw.staticGlobalFactories :
		DEFAULT_STATIC_GLOBAL_FACTORIES;

	return {
		dependencyMode: getDependencyMode(raw),
		environment: getEnvironment(raw),
		staticGlobalFactories: new Set(factories),
	};
}

function getVariableByName(scope: null | Scope, name: string): ScopeVariable | undefined {
	let currentScope = scope;
	while (currentScope !== null) {
		const variable = currentScope.set.get(name);
		if (variable !== undefined) return variable;
		currentScope = currentScope.upper;
	}
	return undefined;
}

function isModuleLevelScope(scope: Scope): boolean {
	return scope.type === "module" || scope.type === "global";
}

function isImport(variable: ScopeVariable): boolean {
	for (const definition of variable.defs) if (definition.type === "ImportBinding") return true;
	return false;
}

function isVariableDefinition(definition: ScopeVariable["defs"][number]): boolean {
	return definition.type === "Variable";
}

function getConstInitializer(definition: ScopeVariable["defs"][number]): ESTree.Expression | undefined {
	if (!isVariableDefinition(definition)) return undefined;

	const declarator = definition.node;
	if (declarator.type !== "VariableDeclarator") return undefined;

	const { parent } = declarator;
	if (parent.type !== "VariableDeclaration" || parent.kind !== "const") return undefined;

	return declarator.init ?? undefined;
}

function isStaticMemberProperty(
	sourceCode: SourceCode,
	property: ESTree.Expression | ESTree.IdentifierName | ESTree.PrivateIdentifier,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	if (property.type === "Identifier") return true;
	if (!isExpression(property)) return false;
	return isStaticExpressionInner(sourceCode, property, seen, options);
}

function isStaticCallCallee(
	sourceCode: SourceCode,
	callee: ESTree.Expression,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	const unwrapped = unwrapExpression(callee);

	if (unwrapped.type === "Identifier") {
		return isStaticIdentifier(sourceCode, unwrapped, seen, options);
	}

	if (unwrapped.type !== "MemberExpression") return false;
	if (!isStaticExpression(sourceCode, unwrapped.object, seen, options)) return false;

	if (unwrapped.computed) {
		return isStaticExpression(sourceCode, unwrapped.property, seen, options);
	}

	return unwrapped.property.type === "Identifier";
}

function isStaticArrayExpression(
	sourceCode: SourceCode,
	{ elements }: ESTree.ArrayExpression,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	for (const element of elements) {
		if (element === null) return false;
		if (element.type === "SpreadElement" || !isStaticExpression(sourceCode, element, seen, options)) return false;
	}
	return true;
}

function isExpressionKey(key: ESTree.ObjectProperty["key"]): key is ESTree.Expression {
	return key.type !== "PrivateIdentifier" && key.type !== "Identifier";
}

function isStaticObjectExpression(
	sourceCode: SourceCode,
	objectExpr: ESTree.ObjectExpression,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	for (const property of objectExpr.properties) {
		if (property.type !== "Property") return false;
		if (property.kind !== "init") return false;

		if (
			(property.computed &&
				isExpressionKey(property.key) &&
				!isStaticExpression(sourceCode, property.key, seen, options)) ||
			!isStaticExpression(sourceCode, property.value, seen, options)
		) {
			return false;
		}
	}
	return true;
}

function isStaticIdentifier(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	const variable = getVariableByName(sourceCode.getScope(identifier), identifier.name);
	if (variable === undefined) return options.staticGlobalFactories.has(identifier.name);
	if (!isModuleLevelScope(variable.scope)) return false;
	if (isImport(variable)) return true;

	for (const definition of variable.defs) {
		const initializer = getConstInitializer(definition);
		if (initializer === undefined) continue;
		if (isStaticExpression(sourceCode, initializer, seen, options)) return true;
	}

	return false;
}

const VALID_EXPRESSIONS = new Set<ESTree.Expression["type"]>([
	"ArrayExpression",
	"ArrowFunctionExpression",
	"AssignmentExpression",
	"AwaitExpression",
	"BinaryExpression",
	"CallExpression",
	"ChainExpression",
	"ClassExpression",
	"ConditionalExpression",
	"FunctionExpression",
	"Identifier",
	"ImportExpression",
	"Literal",
	"LogicalExpression",
	"MemberExpression",
	"MetaProperty",
	"NewExpression",
	"ObjectExpression",
	"ParenthesizedExpression",
	"SequenceExpression",
	"Super",
	"TaggedTemplateExpression",
	"TemplateLiteral",
	"ThisExpression",
	"TSAsExpression",
	"TSInstantiationExpression",
	"TSNonNullExpression",
	"TSSatisfiesExpression",
	"TSTypeAssertion",
	"UnaryExpression",
	"UpdateExpression",
	"YieldExpression",
]);

function isExpression(node: ESTree.Node): node is ESTree.Expression {
	return VALID_EXPRESSIONS.has(node.type);
}

function checkStaticBinaryOrLogical(
	sourceCode: SourceCode,
	left: ESTree.Node,
	right: ESTree.Node,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	if (!isExpression(left) || !isExpression(right)) return false;
	return isStaticExpression(sourceCode, left, seen, options) && isStaticExpression(sourceCode, right, seen, options);
}

function isStaticExpressionInner(
	sourceCode: SourceCode,
	node: ESTree.Expression,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	return isStaticExpression(sourceCode, node, seen, options);
}

function isStaticExpression(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (seen.has(unwrapped)) return true;
	seen.add(unwrapped);

	switch (unwrapped.type) {
		case "ArrayExpression":
			return isStaticArrayExpression(sourceCode, unwrapped, seen, options);

		case "BinaryExpression":
		case "LogicalExpression":
			return checkStaticBinaryOrLogical(sourceCode, unwrapped.left, unwrapped.right, seen, options);

		case "CallExpression":
			return checkStaticCallOrNewExpression(sourceCode, unwrapped.arguments, unwrapped.callee, seen, options);

		case "ChainExpression":
			return isStaticExpression(sourceCode, unwrapped.expression, seen, options);

		case "ConditionalExpression": {
			return (
				isStaticExpression(sourceCode, unwrapped.test, seen, options) &&
				isStaticExpression(sourceCode, unwrapped.consequent, seen, options) &&
				isStaticExpression(sourceCode, unwrapped.alternate, seen, options)
			);
		}

		case "Identifier":
			return isStaticIdentifier(sourceCode, unwrapped, seen, options);

		case "Literal":
			return true;

		case "MemberExpression": {
			return (
				isStaticExpression(sourceCode, unwrapped.object, seen, options) &&
				(!unwrapped.computed || isStaticMemberProperty(sourceCode, unwrapped.property, seen, options))
			);
		}

		case "NewExpression":
			return checkStaticCallOrNewExpression(sourceCode, unwrapped.arguments, unwrapped.callee, seen, options);

		case "ObjectExpression":
			return isStaticObjectExpression(sourceCode, unwrapped, seen, options);

		case "SequenceExpression": {
			return (
				unwrapped.expressions.length > 0 &&
				unwrapped.expressions.every((expr) => isStaticExpression(sourceCode, expr, seen, options))
			);
		}

		case "TemplateLiteral":
			return unwrapped.expressions.length === 0;

		case "UnaryExpression": {
			return (
				STATIC_UNARY_OPERATORS.has(unwrapped.operator) &&
				isStaticExpression(sourceCode, unwrapped.argument, seen, options)
			);
		}

		default:
			return false;
	}
}

function checkStaticCallOrNewExpression(
	sourceCode: SourceCode,
	parameters: ReadonlyArray<ESTree.CallExpression["arguments"][number]>,
	callee: ESTree.Expression,
	seen: Set<ESTree.Node>,
	options: NormalizedOptions,
): boolean {
	if (!isStaticCallCallee(sourceCode, callee, seen, options)) return false;

	return parameters.every(
		(argument) => argument.type !== "SpreadElement" && isStaticExpression(sourceCode, argument, seen, options),
	);
}

function getReturnExpression(body: ESTree.BlockStatement): ESTree.Expression | undefined {
	if (body.body.length !== 1) return undefined;

	const [statement] = body.body;
	return statement?.type === "ReturnStatement" ? (statement.argument ?? undefined) : undefined;
}

function getMemoCallbackExpression(node: ESTree.CallExpression): ESTree.Expression | undefined {
	const [callback] = node.arguments;
	if (callback === undefined) return undefined;
	if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") return undefined;

	const { body } = callback;
	if (body === null) return undefined;

	return body.type === "BlockStatement" ? getReturnExpression(body) : body;
}

function dependenciesAreNonUpdating(dependenciesKind: DependenciesKind, options: NormalizedOptions): boolean {
	switch (options.dependencyMode) {
		case "aggressive":
			return true;

		case "empty-or-omitted": {
			return (
				dependenciesKind === DependenciesKind.MissingOrOmitted ||
				dependenciesKind === DependenciesKind.EmptyArray
			);
		}

		case "non-updating": {
			return (
				dependenciesKind === DependenciesKind.MissingOrOmitted ||
				dependenciesKind === DependenciesKind.EmptyArray ||
				dependenciesKind === DependenciesKind.StaticArray
			);
		}

		default: {
			const error = new Error(`Unknown dependency mode: ${String(options.dependencyMode)}`);
			Error.captureStackTrace(error, dependenciesAreNonUpdating);
			throw error;
		}
	}
}

function isStandaloneUseMemo(node: ESTree.CallExpression): boolean {
	if (node.parent.type === "ExpressionStatement") return true;
	if (node.parent.type !== "UnaryExpression" || node.parent.operator !== "void") return false;
	return node.parent.parent.type === "ExpressionStatement";
}

const noUselessUseMemo = defineRule({
	create(context): Visitor {
		const options = normalizeOptions(context.options[0]);
		const reactSources = getReactSources(options.environment);
		const memoIdentifiers = new Set<string>();
		const reactNamespaces = new Set<string>();

		return {
			CallExpression(node): void {
				if (
					!isUseMemoCall(node, memoIdentifiers, reactNamespaces) ||
					isStandaloneUseMemo(node) ||
					node.arguments.length === 0
				) {
					return;
				}

				const callbackExpression = getMemoCallbackExpression(node);
				if (callbackExpression === undefined) return;

				const seen = new Set<ESTree.Node>();
				if (!isStaticExpression(context.sourceCode, callbackExpression, seen, options)) return;

				const dependencies = classifyDependencies(
					context.sourceCode,
					node.arguments[1],
					seen,
					options,
					isStaticArrayExpression,
				);
				if (!dependenciesAreNonUpdating(dependencies, options)) return;

				context.report({
					messageId: "uselessUseMemo",
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
			description: "Disallow useMemo calls that only wrap values static enough to live at module scope.",
		},
		messages: {
			uselessUseMemo:
				"useMemo is wrapping a static value. Move the value to module scope instead of paying hook overhead for no runtime benefit.",
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					dependencyMode: {
						default: "non-updating",
						enum: ["empty-or-omitted", "non-updating", "aggressive"],
						type: "string",
					},
					environment: {
						default: "standard",
						enum: ["roblox-ts", "standard"],
						type: "string",
					},
					staticGlobalFactories: {
						items: { type: "string" },
						type: "array",
					},
				},
				type: "object",
			},
		],
		type: "suggestion",
	},
});

export default noUselessUseMemo;
