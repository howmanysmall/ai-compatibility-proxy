# Agents Guide

This file provides guidance to agents when working with code in this repository.

## Project Overview

A self-hosted Deno 2.8.x API proxy that translates between OpenAI-compatible Chat Completions API and upstream provider APIs (Anthropic Messages API, Cerebras OpenAI-compatible API). The proxy exposes standard OpenAI-compatible endpoints (`/health`, `/v1/models`, `/v1/chat/completions`) and translates requests/responses for the configured upstream provider. It is not Warp-specific — any OpenAI-compatible client can use it.

The main proxy application in `src/` is not yet implemented (placeholder). The `plugins/` directory contains a mature Oxlint plugin ("small-rules") with ~40 lint rules for React/TypeScript.

## Commands

All commands should be run through `mise x --` to ensure correct tool versions. The `deno task` commands use bash wrappers (`scripts/get-defaults.sh`) that default to `.` when no file arguments are given.

**Lint (runs all three linters):**

```sh
deno task lint [paths...]       # oxlint + biome check + deno lint
deno task lint:safe [paths...]  # same but won't error on no matches
```

**Format (runs all three formatters):**

```sh
deno task format [paths...]        # biome --fix + oxfmt + deno fmt
deno task format:check [paths...]  # check only, no writes
deno task format:safe [paths...]   # won't error on no matches
```

**Individual linters/formatters:**

```sh
deno task oxlint [paths...]
deno task biome [args...]
deno task oxfmt [args...]
```

**Type checking:**

```sh
deno check             # full project
deno check plugins/    # plugins workspace only
```

**Tests:**

```sh
deno test                                  # all tests (matches tests/**/*.test.ts)
deno test tests/logging/some.test.ts       # single test file
deno test --filter "test name pattern"      # by test name
```

**Build the Oxlint plugin:**

```sh
deno task build:oxc                  # default build
deno task build:oxc --minify      # minified
deno task build:oxc --verbose     # detailed output
deno task build:oxc --sourcemap   # with sourcemap
```

**Git hooks:**

```sh
deno task hooks:install    # install lefthook hooks
deno task hooks:validate   # validate lefthook config
```

**Commit messages** must follow conventional commits: type must be one of `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`. Header max 72 chars, no trailing period. Scope and subject are lowercase.

## Architecture

### Deno Workspace

The project is a Deno workspace (`deno.json` → `workspace: ["./plugins", "./scripts/"]`) with three members:

1. **Root** (`deno.json`): Main application source in `src/`, tests in `tests/`. Path aliases like `@constants/*`, `@utilities/*`, `@logging/*` map into `src/`.
2. **Plugins** (`plugins/deno.jsonc`): Oxlint plugin. Aliases `@oxlint-rules/*`, `@oxlint-types/*`, `@oxlint-utilities/*` map into `plugins/oxc/small-rules/`.
3. **Scripts** (`scripts/deno.jsonc`): Build tooling. Aliases `@build-plugins/*`, `@build-utilities/*` map into `scripts/`.

### Oxlint Plugin (`plugins/oxc/small-rules/`)

An Oxlint JS plugin with ~40 custom lint rules. Architecture:

- `index.ts`: Plugin entry point, registers all rules via `definePlugin` from `oxlint-plugin-utilities`
- `rules/`: Individual rule implementations (one file per rule)
- `types/`: Shared TypeScript types for the plugin
- `utilities/`: Shared helpers used across rules
- Build uses `tsdown` via `scripts/build-small-rules.ts` → outputs `plugins/oxc/small-rules.js`

When adding a new rule: implement it in `rules/`, import and register it in `index.ts`, then rebuild with `deno task build:oxc`.

### Tooling Stack

Three linters run in sequence: **oxlint** → **biome check** → **deno lint**. Three formatters: **biome** → **oxfmt** → **deno fmt**. All share tab indentation (width 4), line width 120, LF line endings, double quotes (biome/js). Additional formatters for TOML (`tombi`), Markdown (`rumdl`), and shell (`shfmt`).

Pre-commit hooks (lefthook) run linting and formatting on staged files in parallel. Pre-push hooks run full `deno task lint` and `deno check` in parallel.

### Path Aliases

The root workspace uses `@`-prefixed aliases (e.g., `@constants/application-paths.ts`, `@logging/logger.ts`). Import these directly — they are configured in both `deno.json` paths and `imports`.

### Upstream Proxy Design (Planned)

The proxy will support two upstream protocols via `UPSTREAM_PROTOCOL` env var:

- `anthropic_messages`: Translate OpenAI Chat Completions ↔ Anthropic Messages
- `cerebras_openai`: Normalize OpenAI requests for Cerebras' partially compatible API

Auth modes: `client_bearer` (client's token forwarded upstream) and `server_key` (server-side `UPSTREAM_API_KEY`). See `PROMPT.md` for the full specification.
