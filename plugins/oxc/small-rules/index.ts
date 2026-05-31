import arrayTypeGeneric from "@oxlint-rules/array-type-generic.ts";
import banReactFc from "@oxlint-rules/ban-react-fc.ts";
import banTypes from "@oxlint-rules/ban-types.ts";
import memoizedEffectDependencies from "@oxlint-rules/memoized-effect-dependencies.ts";
import noArrayConstructorElements from "@oxlint-rules/no-array-constructor-elements.ts";
import noArraySizeAssignment from "@oxlint-rules/no-array-size-assignment.ts";
import noAsyncConstructor from "@oxlint-rules/no-async-constructor.ts";
import noCascadingSetState from "@oxlint-rules/no-cascading-set-state.ts";
import noCommentedCode from "@oxlint-rules/no-commented-code.ts";
import noConstantConditionWithBreak from "@oxlint-rules/no-constant-condition-with-break.ts";
import noGiantComponent from "@oxlint-rules/no-giant-component.ts";
import noInlinePropertyOnMemoComponent from "@oxlint-rules/no-inline-property-on-memo-component.ts";
import noInstanceMethodsWithoutThis from "@oxlint-rules/no-instance-methods-without-this.ts";
import noRenderHelperFunctions from "@oxlint-rules/no-render-helper-functions.ts";
import noUnderscoreReactProperties from "@oxlint-rules/no-underscore-react-properties.ts";
import noUnusedImports from "@oxlint-rules/no-unused-imports.ts";
import noUnusedUseMemo from "@oxlint-rules/no-unused-use-memo.ts";
import noUseMemoSimpleExpression from "@oxlint-rules/no-use-memo-simple-expression.ts";
import noUselessUseEffect from "@oxlint-rules/no-useless-use-effect.ts";
import noUselessUseMemo from "@oxlint-rules/no-useless-use-memo.ts";
import preferClassProperties from "@oxlint-rules/prefer-class-properties.ts";
import preferEarlyReturn from "@oxlint-rules/prefer-early-return.ts";
import preferExpectAssertions from "@oxlint-rules/prefer-expect-assertions.ts";
import preferModuleScopeConstants from "@oxlint-rules/prefer-module-scope-constants.ts";
import preferPascalCaseEnums from "@oxlint-rules/prefer-pascal-case-enums.ts";
import preferSingularEnums from "@oxlint-rules/prefer-singular-enums.ts";
import preferTernaryConditionalRendering from "@oxlint-rules/prefer-ternary-conditional-rendering.ts";
import preferUseReducer from "@oxlint-rules/prefer-use-reducer.ts";
import preventAbbreviations from "@oxlint-rules/prevent-abbreviations.ts";
import reactHooksStrictReturn from "@oxlint-rules/react-hooks-strict-return.ts";
import requireAsyncSuffix from "@oxlint-rules/require-async-suffix.ts";
import requireModuleLevelInstantiation from "@oxlint-rules/require-module-level-instantiation.ts";
import requireNamedEffectFunctions from "@oxlint-rules/require-named-effect-functions.ts";
import requireReactComponentKeys from "@oxlint-rules/require-react-component-keys.ts";
import requireReactDisplayNames from "@oxlint-rules/require-react-display-names.ts";
import requireSwitchCaseBraces from "@oxlint-rules/require-switch-case-braces.ts";
import requireUnicodeRegex from "@oxlint-rules/require-unicode-regex.ts";
import rerenderMemoWithDefaultValue from "@oxlint-rules/rerender-memo-with-default-value.ts";
import strictComponentBoundaries from "@oxlint-rules/strict-component-boundaries.ts";
import useExhaustiveDependencies from "@oxlint-rules/use-exhaustive-dependencies.ts";
import useHookAtTopLevel from "@oxlint-rules/use-hook-at-top-level.ts";
import { definePlugin } from "oxlint-plugin-utilities";

const smallRules = definePlugin({
	meta: { name: "small-rules" },
	rules: {
		"array-type-generic": arrayTypeGeneric,
		"ban-react-fc": banReactFc,
		"ban-types": banTypes,
		"memoized-effect-dependencies": memoizedEffectDependencies,
		"no-array-constructor-elements": noArrayConstructorElements,
		"no-array-size-assignment": noArraySizeAssignment,
		"no-async-constructor": noAsyncConstructor,
		"no-cascading-set-state": noCascadingSetState,
		"no-commented-code": noCommentedCode,
		"no-constant-condition-with-break": noConstantConditionWithBreak,
		"no-giant-component": noGiantComponent,
		"no-inline-property-on-memo-component": noInlinePropertyOnMemoComponent,
		"no-instance-methods-without-this": noInstanceMethodsWithoutThis,
		"no-render-helper-functions": noRenderHelperFunctions,
		"no-underscore-react-props": noUnderscoreReactProperties,
		"no-unused-imports": noUnusedImports,
		"no-unused-use-memo": noUnusedUseMemo,
		"no-use-memo-simple-expression": noUseMemoSimpleExpression,
		"no-useless-use-effect": noUselessUseEffect,
		"no-useless-use-memo": noUselessUseMemo,
		"prefer-class-properties": preferClassProperties,
		"prefer-early-return": preferEarlyReturn,
		"prefer-expect-assertions": preferExpectAssertions,
		"prefer-module-scope-constants": preferModuleScopeConstants,
		"prefer-pascal-case-enums": preferPascalCaseEnums,
		"prefer-singular-enums": preferSingularEnums,
		"prefer-ternary-conditional-rendering": preferTernaryConditionalRendering,
		"prefer-use-reducer": preferUseReducer,
		"prevent-abbreviations": preventAbbreviations,
		"react-hooks-strict-return": reactHooksStrictReturn,
		"require-async-suffix": requireAsyncSuffix,
		"require-module-level-instantiation": requireModuleLevelInstantiation,
		"require-named-effect-functions": requireNamedEffectFunctions,
		"require-react-component-keys": requireReactComponentKeys,
		"require-react-display-names": requireReactDisplayNames,
		"require-switch-case-braces": requireSwitchCaseBraces,
		"require-unicode-regex": requireUnicodeRegex,
		"rerender-memo-with-default-value": rerenderMemoWithDefaultValue,
		"strict-component-boundaries": strictComponentBoundaries,
		"use-exhaustive-dependencies": useExhaustiveDependencies,
		"use-hook-at-top-level": useHookAtTopLevel,
	},
});

export default smallRules;
