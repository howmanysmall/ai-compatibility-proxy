---
name: oxlint-rule-creator
description: Use when creating a new Oxlint JS plugin rule from scratch, or porting an existing ESLint rule to Oxlint. Covers createOnce, before/after hooks, all context/SourceCode APIs, fixes, suggestions, rule schemas, scope analysis, and RuleTester patterns. Do NOT use this for fixing existing rules — use the `fix-oxlint-rules` skill instead.
---

# Creating and Porting Oxlint JS Plugin Rules

## Overview

Oxlint JS plugins use an ESLint-compatible API. Rules live under `plugins/oxc/small-rules/rules/` in the anime-rush repo and are registered in `plugins/oxc/small-rules/index.ts`.

New rules must be created with TDD. Write the tests first, implement the rule until the tests pass, and keep the rule tests under `tests/small-rules/`.

---

## Types Reference

All types come from `oxlint-plugin-utilities`. The most important:

```ts
import { definePlugin, defineRule } from "oxlint-plugin-utilities";
import type {
  Context,
  Visitor,          // AST node visitor map — returned by `create`
  VisitorWithHooks, // Visitor & { before?: BeforeHook; after?: AfterHook }
  BeforeHook,       // () => boolean | void
  AfterHook,        // () => void
  ESTree,
} from "oxlint-plugin-utilities";
```

`defineRule` and `definePlugin` are **identity no-ops** that exist purely for
TypeScript inference. They pass their argument through unchanged.

---

## `create` Vs `createOnce`

Both are valid. Choose based on what the rule actually needs.

### `create` - Called Once Per File

```ts
defineRule({
  create(context): Visitor {
    // Everything here runs fresh for each file.
    // Per-file state is naturally scoped — no reset needed.
    let count = 0;

    return {
      CallExpression(node) {
        count += 1;
      },
    };
  },
  meta: { ... },
});
```

**Use `create` when:**

- The rule has no state, or per-file state initialization is simpler inlined.
- The rule is ported from ESLint and the existing `create` shape is correct
  with no changes needed.
- The visitor object returned needs to differ between files.

### `createOnce` - Called Once Total; Per-File Setup Goes In `before`

```ts
import type { VisitorWithHooks } from "oxlint-plugin-utilities";

defineRule({
  createOnce(context): VisitorWithHooks {
    // Variables declared here are SHARED across all files.
    // Per-file state MUST be reset inside `before`.
    let count: number;

    return {
      before() {
        count = 0;
        // Optionally skip the entire file:
        // if (context.sourceCode.text.startsWith("// @generated")) return false;
      },

      CallExpression(node) {
        count += 1;
        if (count > 10) {
          context.report({
            messageId: "tooMany",
            data: { count: String(count) },
            node,
          });
        }
      },

      // after() runs once per file, after Program:exit.
      // Use it to release expensive resources acquired during traversal.
      after() {
        /* cleanup */
      },
    };
  },
  meta: { ... },
});
```

**Use `createOnce` when:**

- The rule accumulates per-file state across multiple node visits (counters,
  sets, maps) that needs a clean reset between files.
- The rule can benefit from early file-skipping via `before() { return false; }`.
- Writing a new rule from scratch where the `before`-init model is a natural
  fit for the state.

**Do NOT use `createOnce` just because it sounds more performant.** A `create`
rule with no per-file state is already optimal — adding a pointless `before`
hook to a `createOnce` rule is strictly more overhead than plain `create`.
The performance advantage of `createOnce` is primarily forward-looking:
Oxlint's Rust layer plans to statically analyze the returned visitor to skip
files that contain none of the rule's target nodes, an optimization that
requires `createOnce` to be viable. That optimization does not exist in the
current release.

---

## Project Layout

```text
plugins/oxc/small-rules/
├── index.ts                  ← registers all rules via definePlugin
├── reset.d.ts
├── rules/
|   └── {rule-name}.ts        ← one file per rule
└── utilities/
    ├── component-utilities.ts
    ├── lint-utilities.ts
    ├── oxc-utilities.ts
    ├── react-hook-utilities.ts
    └── string-utilities.ts
```

---

## Full Rule File — `create`

```ts
import { defineRule } from "oxlint-plugin-utilities";
import type { Visitor } from "oxlint-plugin-utilities";

const myRule = defineRule({
  create(context): Visitor {
    return {
      Identifier(node): void {
        if (node.name === "forbidden") {
          context.report({ messageId: "noForbidden", node });
        }
      },
    } satisfies Visitor;
  },
  meta: {
    type: "problem",
    docs: {
      description: "Disallow the identifier 'forbidden'.",
      recommended: true,
    },
    messages: {
      noForbidden: "The identifier 'forbidden' is not allowed.",
    },
    schema: [],
  },
});

export default myRule;
```

---

## Full Rule File — `createOnce`

```ts
import { defineRule } from "oxlint-plugin-utilities";
import type { VisitorWithHooks } from "oxlint-plugin-utilities";

const myRule = defineRule({
  createOnce(context): VisitorWithHooks {
    let count: number;

    return {
      before() {
        count = 0;
      },

      CallExpression(node) {
        count += 1;
        if (count > 10) {
          context.report({
            messageId: "tooMany",
            data: { count: String(count) },
            node,
          });
        }
      },

      after() {
        /* release any expensive per-file resources */
      },
    };
  },
  meta: {
    type: "problem",
    docs: {
      description: "Limit call count per file.",
      recommended: true,
    },
    messages: {
      tooMany: "{{count}} calls detected — consider refactoring",
    },
    schema: [],
  },
});

export default myRule;
```

---

## `before` Hook — Details

`before()` runs before AST traversal for a file.

- Return `false` → skip traversal AND `after` for this file.
- Return `void` / `undefined` → proceed normally.

**Critical caveat:** `before` is NOT guaranteed to run on every file in future
Oxlint releases. Oxlint plans to skip entire rule execution (including `before`)
for files whose AST contains none of the node types the rule visits. If code
must run unconditionally for every file, use a `Program` visitor — it always
fires regardless of other content.

```ts
return {
  Program(node) {
    // Always runs for every file, even if no FunctionDeclaration is present.
  },
  FunctionDeclaration(node) {
    // Only runs when a FunctionDeclaration exists in the file.
  },
};
```

---

## Registering In `index.ts`

```ts
import { definePlugin } from "oxlint-plugin-utilities";
import myRule from "./my-rule";

const smallRules = definePlugin({
  meta: { name: "small-rules" },
  rules: {
    "my-rule": myRule,
  },
});

export default smallRules;
```

---

## Registering in Configuration

You MUST run `aube run build:oxc -- --minify` BEFORE testing the rule in the codebase. You MUST include `--minify`.
You MUST run `aube run lint plugins/oxc/small-rules` to lint with Oxlint. You MUST also run it on `tests/small-rules/` as well.

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["./plugins/oxc/small-rules.js"],
  "rules": { "small-rules/my-rule": "error" }
}
```

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";
export default defineConfig({
  jsPlugins: ["./plugins/oxc/small-rules.js"],
  rules: { "small-rules/my-rule": "error" },
});
```

---

## `context.report`

`Diagnostic` requires at least one of `node`/`loc` AND one of `message`/`messageId`.

### Basic

```ts
context.report({ messageId: "myMessage", node });
context.report({ message: "Literal string message", node });
```

### With Data Interpolation

```ts
// meta.messages.tooMany = "{{count}} calls found"
context.report({ messageId: "tooMany", data: { count: String(n) }, node });
```

### With a Fixer (Auto-Fix)

`meta.fixable` must be `"code"` or `"whitespace"`.

```ts
context.report({
  messageId: "useConst",
  node,
  fix(fixer) {
    return fixer.replaceText(node, "const");
    // Other methods:
    // fixer.insertTextBefore(node, "/* before */ ")
    // fixer.insertTextAfter(node, ";")
    // fixer.remove(node)
    // fixer.removeRange([start, end])
    // fixer.replaceTextRange([start, end], "new text")
    // Multiple fixes: return [fixer.remove(a), fixer.insertTextAfter(b, "x")]
  },
});
```

### With Suggestions (Non-Auto-Applied IDE Quick-Fixes)

`meta.hasSuggestions` must be `true`.

```ts
context.report({
  messageId: "preferConst",
  node,
  suggest: [
    {
      messageId: "changeToConst",
      fix(fixer) {
        return fixer.replaceText(node, node.raw.replace("let", "const"));
      },
    },
  ],
});
```

### Reporting at a Custom Location

```ts
context.report({
  messageId: "something",
  loc: { line: 3, column: 5 },
  // Or a range:
  // loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
});
```

---

## Rule Options / Schema

Accessed via `context.options[0]`, `context.options[1]`, etc.

```ts
createOnce(context): VisitorWithHooks {
  const threshold: number = context.options[0]?.threshold ?? 5;
  let count: number;
  return {
    before() { count = 0; },
    CallExpression(node) {
      count += 1;
      if (count > threshold)
        context.report({ messageId: "exceeded", node });
    },
  };
},
meta: {
  type: "problem",
  docs: { description: "...", recommended: false },
  messages: { exceeded: "Exceeded threshold" },
  schema: [
    {
      type: "object",
      properties: { threshold: { type: "number", minimum: 1 } },
      additionalProperties: false,
    },
  ],
},
```

Config usage: `{ "small-rules/my-rule": ["error", { "threshold": 10 }] }`

---

## `SourceCode` APIs

```ts
create(context): Visitor {
  const { sourceCode } = context;
  return {
    Identifier(node) {
      const text = sourceCode.getText(node);
      const withContext = sourceCode.getText(node, 2, 2); // chars before/after
      const tokens = sourceCode.getTokens(node);
      const tokenBefore = sourceCode.getTokenBefore(node);
      const tokenAfter = sourceCode.getTokenAfter(node);
      const leadingComments = sourceCode.getCommentsBefore(node);
      const trailingComments = sourceCode.getCommentsAfter(node);
      const ancestors = sourceCode.getAncestors(node); // ESLint v9
      const fullSource = sourceCode.text;
    },
  };
},
```

---

## Scope Analysis

```ts
create(context): Visitor {
  return {
    "Program:exit"(node) {
      const scope = context.sourceCode.getScope(node);
      for (const variable of scope.variables) {
        for (const reference of variable.references) {
          if (reference.isWrite()) {
            context.report({ messageId: "noWrite", node: reference.identifier });
          }
        }
      }
    },
  };
},
```

---

## AST Traversal Patterns

### Exit Visitors

```ts
return {
  FunctionDeclaration(node) { /* enter */ },
  "FunctionDeclaration:exit"(node) { /* exit */ },
};
```

### ESLint Selectors

```ts
return {
  "Program > VariableDeclaration"(node) { ... },
  "CallExpression[callee.name='useEffect']"(node) { ... },
};
```

### `node.parent`

Always available, no API call needed.

```ts
CallExpression(node) {
  if (node.parent?.type === "ExpressionStatement") { ... }
},
```

---

## `RuleTester` (Test Harness)

Testing is required for every new rule and every ported rule. Use TDD: add the tests first, then implement the rule against those tests. Please use `vitest` for testing.

Do NOT recreate `new RuleTester()` like in the example below, you should be using the `rule-testers.ts` utilities from the project.

```ts
// tests/small-rules/my-rule.test.ts
import { RuleTester } from "eslint";
import { describe } from "vitest";
import myRule from "../my-rule";

describe("my-rule", () => {
  const tester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });

  tester.run("my-rule", myRule, {
    valid: [
      `const x = 1;`,
      { code: `const x = 1;`, options: [{ threshold: 20 }] },
    ],
    invalid: [
      {
        code: `badCall(); badCall(); badCall();`,
        errors: [{ messageId: "tooMany" }],
        // Assert output if the rule is fixable:
        // output: `/* fixed */`,
      },
    ],
  });
});
```

Run: `aube run test -- --project oxlint-rules --reporter agent tests/small-rules/my-rule.test.ts`

Do not place rule tests anywhere else.

---

## Porting an ESLint Rule to Oxlint

### Step 1 - Check for Native Coverage First

```sh
aube run oxc -- --rules | rg rule-name
```

If the rule exists natively in Oxlint, use it rather than duplicating it as a JS plugin.

### Step 2 - Wrap with `defineRule`, Convert to ESM

```ts
import { defineRule } from "oxlint-plugin-utilities";

const myRule = defineRule({
  create(context) { /* existing ESLint body, unchanged */ },
  meta: { ... },
});
export default myRule;
```

### Step 3 - Decide Whether to Upgrade To `createOnce`

Apply the same decision guide from above. If the ESLint rule initializes
per-file state at the top of `create`, that state is a natural candidate for
`createOnce` + `before`. If `create` has no per-file state, leave it as
`create`.

**Mechanical transformation for rules with per-file state:**

```ts
// Before (ESLint create)
create(context) {
  const seen = new Set<string>(); // per-file in ESLint, naturally
  return {
    Identifier(node) {
      if (seen.has(node.name)) context.report({ ... });
      seen.add(node.name);
    },
  };
},

// After (createOnce + before)
createOnce(context): VisitorWithHooks {
  let seen: Set<string>;
  return {
    before() { seen = new Set(); },
    Identifier(node) {
      if (seen.has(node.name)) context.report({ ... });
      seen.add(node.name);
    },
  };
},
```

Early-return patterns:

| ESLint `create`                      | `createOnce` equivalent                           |
|--------------------------------------|---------------------------------------------------|
| `if (condition) return {};`          | `before() { if (condition) return false; }`       |

### Step 4 - Replace Deprecated pre-V9 Context APIs

Oxlint does not implement APIs removed before ESLint V9.

| Deprecated (pre-V9)                 | ESLint V9 / Oxlint equivalent                |
|-------------------------------------|----------------------------------------------|
| `context.getScope()`                | `context.sourceCode.getScope(node)`          |
| `context.getAncestors()`            | `context.sourceCode.getAncestors(node)`      |
| `context.getDeclaredVariables(n)`   | `context.sourceCode.getDeclaredVariables(n)` |
| `context.getSourceCode()`           | `context.sourceCode`                         |
| `context.parserServices`            | `context.sourceCode.parserServices`          |

### Step 5 - Ensure `meta.schema` Is Present

Rules that omit `schema` need `schema: []` added explicitly.

### Step 6 - Port Tests and Register

Required.

Follow the `RuleTester` pattern above, then register in `index.ts` and enable
in config.
Write or port the tests first in `tests/small-rules/`, then
implement the rule, register it in `index.ts`, and enable it in config.

---

## Reference - Existing Rule Patterns in This Codebase

| Rule | Key pattern |
|------|------------|
| `no-cascading-set-state` | `walkAst` subtree walk; counting patterns |
| `no-giant-component` | Reporting on a child node (`nameNode`) not the root |
| `no-inline-property-on-memo-component` | Cross-visitor set state (`memoizedComponentNames`) |
| `no-use-memo-simple-expression` | Delegating detection to utility functions |
| `prefer-use-reducer` | Inline `message` string (no `messageId`) |
| `rerender-memo-with-default-value` | Multiple `messageId`s; helper function with `context` threaded in |

### Available Utility Modules

Please create new utility functions / modules to reduce duplicated code.

- `component-utilities` — `isComponentDeclaration`, `isMemoCall`, `isSimpleExpression`
- `lint-utilities` — `isHookCall`, `isComponentAssignment`
- `oxc-utilities` — `isNode` type guard
- `react-hook-utilities` — `getHookName`, `getEffectCallback`, `countSetStateCalls`, `walkAst`, `walkAstSlop`
- `string-utilities` — `isUppercaseName`

---

## Verification Checklist

- [ ] Rule file at `plugins/oxc/small-rules/rules/{rule-name}.ts`
- [ ] Tests at `tests/small-rules/{rule-name}.test.ts`
- [ ] Tests written first when creating a new rule
- [ ] `create` vs `createOnce` chosen deliberately per the decision guide
- [ ] Per-file state (if any) initialized in `before`, not at top of `createOnce`
- [ ] Registered in `plugins/oxc/small-rules/index.ts`
- [ ] Tests written and passing (`aube run test -- --project oxlint-rules --reporter agent`)
- [ ] `meta.fixable` set if the rule emits fixes
- [ ] `meta.hasSuggestions: true` if the rule emits suggestions
- [ ] `meta.schema` present (even as `[]`)
- [ ] `aube run lint plugins/oxc/small-rules` passes
- [ ] `aube run oxc src` passes AFTER adding the rule to `.oxlintrc.json`
- [ ] Rule enabled in `.oxlintrc.json` or `oxlint.config.ts`
