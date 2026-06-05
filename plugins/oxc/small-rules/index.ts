import arrayTypeGeneric from "./rules/array-type-generic";
import banReactFc from "./rules/ban-react-fc";
import banTypes from "./rules/ban-types";
import memoizedEffectDependencies from "./rules/memoized-effect-dependencies";
import noArrayConstructorElements from "./rules/no-array-constructor-elements";
import noArraySizeAssignment from "./rules/no-array-size-assignment";
import noAsyncConstructor from "./rules/no-async-constructor";
import noCascadingSetState from "./rules/no-cascading-set-state";
import noCommentedCode from "./rules/no-commented-code";
import noConstantConditionWithBreak from "./rules/no-constant-condition-with-break";
import noGiantComponent from "./rules/no-giant-component";
import noInlinePropertyOnMemoComponent from "./rules/no-inline-property-on-memo-component";
import noInstanceMethodsWithoutThis from "./rules/no-instance-methods-without-this";
import noRenderHelperFunctions from "./rules/no-render-helper-functions";
import noUnderscoreReactProperties from "./rules/no-underscore-react-properties";
import noUnusedImports from "./rules/no-unused-imports";
import noUnusedUseMemo from "./rules/no-unused-use-memo";
import noUseMemoSimpleExpression from "./rules/no-use-memo-simple-expression";
import noUselessUseEffect from "./rules/no-useless-use-effect";
import noUselessUseMemo from "./rules/no-useless-use-memo";
import preferClassProperties from "./rules/prefer-class-properties";
import preferEarlyReturn from "./rules/prefer-early-return";
import preferExpectAssertions from "./rules/prefer-expect-assertions";
import preferModuleScopeConstants from "./rules/prefer-module-scope-constants";
import preferPascalCaseEnums from "./rules/prefer-pascal-case-enums";
import preferSingularEnums from "./rules/prefer-singular-enums";
import preferTernaryConditionalRendering from "./rules/prefer-ternary-conditional-rendering";
import preferUseReducer from "./rules/prefer-use-reducer";
import preventAbbreviations from "./rules/prevent-abbreviations";
import reactHooksStrictReturn from "./rules/react-hooks-strict-return";
import requireAsyncSuffix from "./rules/require-async-suffix";
import requireModuleLevelInstantiation from "./rules/require-module-level-instantiation";
import requireNamedEffectFunctions from "./rules/require-named-effect-functions";
import requireReactComponentKeys from "./rules/require-react-component-keys";
import requireReactDisplayNames from "./rules/require-react-display-names";
import requireSwitchCaseBraces from "./rules/require-switch-case-braces";
import requireUnicodeRegex from "./rules/require-unicode-regex";
import rerenderMemoWithDefaultValue from "./rules/rerender-memo-with-default-value";
import strictComponentBoundaries from "./rules/strict-component-boundaries";
import useExhaustiveDependencies from "./rules/use-exhaustive-dependencies";
import useHookAtTopLevel from "./rules/use-hook-at-top-level";
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
