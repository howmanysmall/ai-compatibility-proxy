# Agents Guide

This file provides guidance to agents when working with code in this repository.

## Project

A self-hosted Deno proxy that exposes an OpenAI-compatible API (`/v1/chat/completions`, `/v1/models`, `/health`) and translates requests to upstream providers that are not natively OpenAI-compatible. Two upstream protocols are supported: Anthropic Messages (default, via OpenCode Go) and Cerebras OpenAI-compatible.

## Commands

All commands run through `mise`:

```sh
mise x -- deno test                              # run all tests
mise x -- deno test tests/proxy/proxy.test.ts    # run a single test file
mise x -- deno check                              # type-check
mise x -- deno task lint                          # lint (oxlint + biome + deno lint)
mise x -- deno task lint src/proxy/app.ts         # lint specific files
mise x -- deno task format:check                  # check formatting (biome + oxfmt + deno fmt)
mise x -- deno task format                        # auto-fix formatting
mise x -- deno run --allow-net --allow-env src/index.ts  # run the server locally
```

Tests use `Deno.test()` with manual assertions (no test framework). Tests live in `tests/` mirroring `src/` structure.

## Architecture

### Request Flow

`src/index.ts` → `Deno.serve()` → `createApp()` from `src/proxy/app.ts` → routes by method+path:

1. `GET /health` — returns JSON status
2. `GET /v1/models` — authenticates, fetches upstream model list
3. `POST /v1/chat/completions` — authenticates, translates, proxies upstream

### Proxy Pipeline (`src/proxy/`)

- **`config.ts`** — loads config from environment via `arkenv` with `arktype` schemas. All env vars have defaults; no `.env` file required for development.
- **`app.ts`** — Hono-less request handler. Validates request body with `arktype`, dispatches to the correct translator by `upstreamProtocol`.
- **`auth.ts`** — two modes: `client_bearer` (forwards client token upstream) and `server_key` (uses server-side `UPSTREAM_API_KEY`, validates client against `PROXY_API_KEY` with timing-safe comparison).
- **`anthropic-translator.ts`** — bidirectional translation between OpenAI Chat Completions and Anthropic Messages formats. Rejects unsupported fields (tools, multimodal, structured output).
- **`cerebras-translator.ts`** — normalizes OpenAI requests for Cerebras with strict/loose field validation modes.
- **`sse.ts`** — transforms Anthropic SSE events into OpenAI `chat.completion.chunk` SSE using `TransformStream`.
- **`upstream.ts`** — Effect-based HTTP client with retry (up to 2 retries for 5xx/network errors), timeout, and structured error mapping. Uses `Effect.fn`, `Effect.gen`, `Data.TaggedError`.
- **`errors.ts`** — `ProxyError` class that formats OpenAI-compatible error responses.
- **`upstream-errors.ts`** — Effect `TaggedError` types (`UpstreamHttpError`, `UpstreamTimeoutError`).

### Logging (`src/logging/`)

Uses `consola` with daily rotating file reporters. `logger.withContext()` creates per-request contextual loggers. Log level controlled by `LOG_LEVEL` env var.

### Path Aliases

Defined in `deno.json` `compilerOptions.paths` and `imports`. Key aliases: `@proxy/` → `src/proxy/`, `@logging/` → `src/logging/`, `@constants/` → `src/constants/`, `@utilities/` → `src/utilities/`. Import paths end with `.ts` extension (Deno style).

### Plugins (`plugins/`)

A Deno workspace member containing Oxlint custom rules under `plugins/oxc/small-rules/`. Built via `deno task build:oxc`.

## Conventions

- **Runtime**: Deno 2.x (pinned in `mise.toml`). TypeScript with strict mode and `verbatimModuleSyntax`.
- **Formatting**: tabs (width 4), 120 char line width, double quotes, trailing commas only in multiline. Enforced by biome + `oxfmt` + `deno fmt`.
- **Linting**: `oxlint` (primary) + `biome` (supplementary: a11y, security, performance rules) + `deno lint`. No ESLint in the main project.
- **Validation**: `arktype` for runtime schema validation, `arkenv` for environment parsing.
- **Error handling**: `ProxyError` for client-facing errors, Effect `TaggedError` for upstream failures. Errors always return OpenAI-compatible JSON.
- **File naming**: kebab-case enforced by biome `useFilenamingConvention`.
- **Commits**: Conventional commits enforced by `commitlint` with `@commitlint/config-conventional`.
- **Tool management**: `mise` manages Deno, `lefthook`, and other CLI tools. Deno manages JS/TS dependencies via `deno.json` imports with `nodeModulesDir: "auto"`.
