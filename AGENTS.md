# Agents Guide

This file provides guidance to agents when working with code in this repository.

## Project

A self-hosted Bun proxy that exposes an OpenAI-compatible API (`/v1/chat/completions`, `/v1/models`, `/health`) and translates requests to upstream providers that are not natively OpenAI-compatible. Two upstream protocols are supported: Anthropic Messages (default, via OpenCode Go) and Cerebras OpenAI-compatible.

## Rules

- Do NOT ever revert changes YOU do not own.

## Commands

`nr` (from `@antfu/ni`, installed via `package.json`) is a shorthand for `pnpm run`. If a command depends on something from mise.toml, run it through `mise x` with the exception of anything from `@antfu/ni`. The `@antfu/ni` package provides several shorthands.

```sh
nr test:agent                             # run all tests (coverage, parallel, fail-fast)
nr test:agent tests/proxy/proxy.test.ts   # run a single test file
nr type-check:agent                       # type-check the whole project
nr lint:agent                             # lint: oxlint + biome
nr lint:agent src/proxy/app.ts            # lint specific files/paths
nr format:check                           # check formatting (biome + oxfmt)
nr format                                 # auto-fix formatting
nr dev                                    # run the server locally
nr bench                                  # run HTTP benchmarks locally
hk run check                              # run all pre-push checks manually
```

Tests use Vitest. Tests live in `tests/` mirroring `src/` structure. Test utilities in `tests/utilities/test-utilities.ts`.

Git hooks are managed by `hk` (configured in `hk.pkl`). Install with `hk install`.

### `@antfu/ni` Commands

You have a skill for this.

## Architecture

### Request Flow

```text
src/index.ts → Bun.serve() → createFetchHandler() → createApp() (Elysia) → registerRoutes()
```

Routes dispatch to a `ProviderTarget` resolved from `src/providers/registry.ts` by `upstreamProtocol`:

1. `GET /health` — returns JSON status with the active protocol
2. `GET /v1/models` — authenticates, calls `providerTarget.listModelsAsync()` which fetches upstream `/models` and normalizes response
3. `POST /v1/chat/completions` — authenticates, validates body with `arktype`, calls `providerTarget.createChatCompletionAsync()`

### Provider Target Pattern (`src/providers/`)

The `ProviderTarget` interface (`provider-target.ts`) is the central abstraction. Each upstream protocol implements it with `createChatCompletionAsync()` and `listModelsAsync()`:

- **`anthropic-target.ts`** — For OpenCode Go upstream. Uses OpenCode model metadata (fetched from `https://models.dev/api.json`) to decide routing: models backed by Anthropic packages get translated to Anthropic Messages format and sent to `/messages`; models backed by OpenAI-compatible packages get forwarded directly to `/chat/completions`. Unknown model names probe `/chat/completions` first and fall back to `/messages` translation on 4xx errors. Metadata is cached in-memory per `Fetcher` instance with stale-while-revalidate fallback (configurable TTL via `OPENCODE_MODELS_CACHE_TTL_MS`). See `opencode-model-routing.ts`.
- **`cerebras-target.ts`** — For Cerebras upstream. Normalizes requests via `normalizeCerebrasRequest()` then forwards to `/chat/completions`. Streaming passes through raw upstream SSE.

### Proxy Pipeline (`src/proxy/`)

- **`config.ts`** — loads config from environment via `arkenv` with `arktype` schemas. All env vars have defaults; no `.env` file required. Defaults vary by upstream protocol (e.g. `x-api-key` vs `Authorization` auth header). Empty env var values are treated as undefined.
- **`app.ts`** — Elysia-based request handler (`createApp()`). `createFetchHandler()` wraps the Elysia app with per-request logging (method, path, requestId, latency).
- **`routes.ts`** — Elysia route registration. Extracts auth context, validates JSON body with `arktype` type guards from `openai-types.ts`, dispatches to provider target. 404s return OpenAI-compatible error JSON.
- **`auth.ts`** — two modes: `client_bearer` (forwards client token upstream via configured header) and `server_key` (uses server-side `UPSTREAM_API_KEY`, validates client against `PROXY_API_KEY` with timing-safe SHA-256 comparison via Node crypto).
- **`anthropic-translator.ts`** — bidirectional translation: `translateOpenAiToAnthropic()` merges system/developer messages into Anthropic top-level `system`, maps roles, converts stop sequences. `translateAnthropicToOpenAi()` concatenates Anthropic text blocks, maps finish reasons (max_tokens→length, tool_use→tool_calls, refusal→content_filter), sums cache tokens into prompt tokens. Rejects tools, multimodal, structured output, function calls, n>1.
- **`cerebras-translator.ts`** — normalizes OpenAI requests for Cerebras. Converts `max_tokens` to `max_completion_tokens`. Field-level strict/loose validation controlled by `CEREBRAS_STRICT_REQUEST_VALIDATION` and `CEREBRAS_DROP_UNSUPPORTED_FIELDS`.
- **`sse.ts`** — transforms Anthropic SSE into OpenAI `chat.completion.chunk` events using `TransformStream`. Handles `message_start`, `content_block_start`, `content_block_delta`, `message_delta`, `message_stop`. Maintains stream-level state (id, created, model) across events.
- **`upstream.ts`** — Effect-based HTTP client with `Effect.fn`, retry (up to 2 retries for 5xx/network errors with 500ms delay), configurable timeout via `Effect.timeoutFail`. `fetchUpstreamJsonAsync()` (POST) and `fetchUpstreamGetAsync()` (GET) wrap the Effect pipeline. Internal error types: `UpstreamNetworkError` (network failures), `UpstreamHttpError` (5xx upstream), `UpstreamTimeoutError`.
- **`errors.ts`** — `ProxyError` class extending `Error` with OpenAI-compatible shape (`status`, `type`, `param`, `code`). `createErrorResponse()` serializes to `{ error: { message, type, param, code } }`. `createUpstreamErrorAsync()` extracts upstream error messages from JSON or text bodies.
- **`upstream-errors.ts`** — Effect `Data.TaggedError` types: `UpstreamHttpError` (body, contentType, status, url), `UpstreamTimeoutError` (timeoutMs, url).
- **`models.ts`** — fetches upstream `/models`, normalizes response to OpenAI `OpenAiModelListResponse` format. Handles both string model IDs and object model entries. Falls back to `defaultModel` on parse failure.
- **`openai-types.ts`** — all OpenAI schema types defined as `arktype` type guards with inferred TypeScript types (`OpenAiChatCompletionRequest`, `OpenAiChatCompletionResponse`, `OpenAiChatCompletionChunk`, `OpenAiModelListResponse`, `OpenAiErrorBody`). Uses `readonly()` on all types.
- **`anthropic-types.ts`** — Anthropic Messages schema types (`AnthropicMessagesRequest`, `AnthropicMessagesResponse`, `AnthropicUsage`). Uses `"+": "reject"` to reject unknown fields.
- **`openai-constants.ts`** — exports `OPENAI_NULL` (explicit `null` for OpenAI wire format).

### Logging (`src/logging/`)

Uses `consola` with daily rotating file reporters (error.log + combined.log) written to a platform-appropriate log directory. `logger.withContext()` creates per-request contextual loggers (method, path, requestId). Log level controlled by `LOG_LEVEL` env var (fatal=0, error=1, warn=2, info=3, debug=4, trace=5).

### Path Aliases

Defined in `tsconfig.json`, `tsconfig.scripts.json`, and `vitest.config.ts`. Key aliases: `~proxy/` → `src/proxy/`, `~logging/` → `src/logging/`, `~constants/` → `src/constants/`, `~utilities/` → `src/utilities/`, `~providers/` → `src/providers/`, `~validators/` → `src/validators/`, `~ts-types/` → `src/types/`. Import paths end with `.ts` extension.

### Plugins (`plugins/`)

Custom Oxlint JS rules live under `plugins/oxc/small-rules/`. Built via `nr build:oxc`.

### Git Hooks (`hk.pkl`)

hk manages pre-commit, commit-msg, pre-push, and post-merge hooks:

- **pre-commit**: trailing-whitespace, newlines, check-merge-conflict, oxlint, biome, oxfmt, rumdl (markdown), tombi (TOML). All have fix support enabled with git stash.
- **commit-msg**: commitlint with conventional commits config (`commitlint.config.ts`).
- **pre-push**: lint + type-check (silent via `scripts/quiet-on-success.sh`).
- **post-merge**: auto-install packages via `pullhook`.
- Custom hooks: `hk run check` (all checks), `hk run fix` (all auto-fixes).

## Conventions

- **Runtime**: Bun (managed by `mise.toml`). TypeScript with strict mode and `verbatimModuleSyntax`. Dependencies use `package.json` and `pnpm-lock.yaml`; do not use `bun install`.
- **Formatting**: tabs (width 4), 120 char line width, double quotes, trailing commas only in multiline. `oxfmt` owns TypeScript/JavaScript formatting. Biome owns JSON, JSONC, CSS, HTML, and lint-only checks for TS/JS.
- **Linting**: `oxlint` (primary, JS/TS) + `biome` (supplementary: a11y, security, performance, CSS/JSON/HTML). Both must pass.
- **Validation**: `arktype` for runtime schema validation with `type.errors` checking. `arkenv` for env var parsing with auto-coercion.
- **Error handling**: `ProxyError` for client-facing errors (always OpenAI-compatible JSON). Effect `Data.TaggedError` for internal upstream failures.
- **File naming**: kebab-case enforced by biome `useFilenamingConvention`.
- **Commits**: Conventional commits (`feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`) via commitlint. Header max length: 72.
- **Tool management**: `mise` manages Bun, pnpm, hk, and other CLI tools. JS/TS deps use `package.json` and `pnpm-lock.yaml`.
- **Oxlint disable comments**: Use `// oxlint-disable <rule-name>` syntax (not eslint-style). Custom rule names from `plugins/`.

## Bun

You have `bun-docs` as an MCP.
