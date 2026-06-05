---
name: ni
description: Use when the user mentions `@antfu/ni`, `ni`, `nr`, `nlx`, `nun`, `nci`, `na`, `nd`, or wants package-manager-agnostic install/run/remove commands in a JavaScript or TypeScript repo. Also use when you need to inspect or preserve the repo's actual package manager before suggesting `npm`, `pnpm`, `yarn`, `bun`, or `deno` commands.
---

# `@antfu/ni`

Use `@antfu/ni` to avoid guessing whether a repo expects `npm`, `pnpm`, `yarn`, `bun`, or `deno`. The point is not shorter commands. The point is preserving the repo's real package-manager contract.

## First Checks

Before suggesting or running commands, inspect the repo instead of assuming:

1. Read `package.json` for the `packageManager` field and scripts.
2. Read repo instructions such as `AGENTS.md`, `README`, or `CONTRIBUTING`.
3. Check whether the repo expects tool wrappers such as `mise x -- nr ...`.
4. If exact behavior matters, verify the local binary:

```sh
ni --help
ni --agent
```

If `ni` is not available on `PATH`, prefer one of these:

```sh
ni --help
nr lint
mise x -- ni --help
mise x -- nr lint
```

Do not install `@antfu/ni` just to answer a question unless the user asked for that.

## Command Selection

Pick the smallest command that matches the task:

| Task | Command | Notes |
| --- | --- | --- |
| Install dependencies | `ni` | Add packages or install from manifest |
| Run a package script | `nr` | Equivalent to `npm run`, `pnpm run`, etc. |
| Execute a package binary temporarily | `nlx` | Equivalent to `npx`, `pnpm dlx`, `bunx` |
| Remove dependencies | `nun` | Uninstall packages |
| Clean, lockfile-based install | `nci` | Good default for CI/reproducible reinstalls |
| Pass through to detected package manager | `na` | Use when `ni` shorthands do not cover the command |
| Deduplicate dependencies | `nd` | Use only when dedupe is actually wanted |
| Upgrade dependencies | `nup` | Use when the task is explicitly to update deps |

## Core Usage

### Install

```sh
ni
ni zod
ni vitest -D
ni --frozen
ni -P
ni -g eslint
```

Use:

- `ni` to install from the existing manifest
- `ni <pkg>` to add a dependency
- `ni <pkg> -D` for dev dependencies
- `ni --frozen` when the lockfile must be respected
- `ni -P` for production-only installs

### Run Scripts

```sh
nr dev
nr lint
nr test --if-present
nr build --watch
nr -
```

Use `nr` for anything defined in `package.json` scripts. Pass extra arguments after the script name.

`nr -` reruns the last executed command.

### Execute Binaries

```sh
nlx vitest
nlx esbuild --version
nlx create-vite my-app
```

Use `nlx` when you want a package binary without adding it permanently to dependencies.

### Remove Packages

```sh
nun zod
nun eslint @types/node
nun -g eslint
```

### Clean Install

```sh
nci
```

Use `nci` for lockfile-respecting clean installs, especially in CI or when reproducing dependency state.

### Agent Alias

```sh
na
na run lint
na info vitest
```

Use `na` when you need the detected package manager directly and the `ni` shorthands are not enough.

## Dry Runs And Detection

When correctness matters, inspect what `ni` resolved before running something disruptive:

```sh
ni ?
ni vitest ?
ni --agent
ni -v
```

Use:

- `ni ?` to print the resolved command without executing it
- `ni --agent` to print the detected package manager name for scripting or verification
- `ni -v` to show the used agent

Prefer these checks before changing dependencies, lockfiles, or CI commands.

## Repo-Specific Rule for This Workspace

In this repo, prefer `mise x -- nr ...` for project scripts that depend on the repo's managed toolchain. That is the documented contract in `AGENTS.md`.

Examples:

```sh
mise x -- nr lint
mise x -- nr format:check
mise x -- nr type-check
mise x -- nr bench
```

Do not rewrite those as raw `pnpm run ...` unless the user explicitly asks for the underlying package-manager command.

## Safety Rules

- Do not guess the package manager when the repo can tell you.
- Do not replace repo-documented commands with a different package manager just because they are equivalent on your machine.
- Do not hand-edit lockfiles or regenerate them casually. Use the repo's normal dependency command if the task requires dependency changes.
- Use `nci` or `ni --frozen` when the task is reproducibility-sensitive.
- Use `nlx` for one-off binaries instead of adding transient tools to `devDependencies` unless the user wants them installed.
- Use `nr` only for scripts. If the command is not a script, use `nlx`, `na`, or the underlying tool directly as appropriate.

## Decision Guide

- User asks to run an existing script: use `nr`.
- User asks to add or install packages: use `ni`.
- User asks to remove packages: use `nun`.
- User asks to run a package binary without installing it: use `nlx`.
- User asks for a reproducible reinstall or CI install: use `nci`.
- User asks for a package-manager-specific subcommand not covered by a shorthand: use `na`.

## Examples

## Example 1

Input: "Run the lint script in this repo."

Output:

```sh
mise x -- nr lint
```

## Example 2

Input: "Add `vitest` as a dev dependency, but make sure we respect the repo's package manager."

Output:

```sh
ni vitest -D
```

## Example 3

Input: "Try the latest `create-vite` without adding it to package.json."

Output:

```sh
nlx create-vite
```

## Example 4

Input: "Show me what package manager this repo resolves to before we touch dependencies."

Output:

```sh
ni --agent
```

## Validation

When documenting or changing commands, verify against the local tool and repo instructions:

```sh
ni --help
ni --agent
sed -n '1,120p' AGENTS.md
sed -n '1,160p' package.json
sed -n '1,120p' mise.toml
```
