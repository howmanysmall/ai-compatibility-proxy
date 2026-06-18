# AI Compatibility Proxy

A self-hosted Bun proxy that exposes a small OpenAI-compatible API and translates or normalizes requests for upstream
providers that are not quite OpenAI-compatible.

The first supported path is OpenCode Go:

- Client: Warp or any OpenAI-compatible client
- Proxy endpoint: `POST /v1/chat/completions`
- Upstream protocols: Anthropic Messages or OpenAI-compatible chat completions
- Upstream URL: `https://opencode.ai/zen/go/v1`
- Default model: `minimax-m3`

## Endpoints

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`

## Quick Start: OpenCode Go MiniMax M3

```sh
cp .env.example .env
mise x -- aube install --frozen-lockfile
nr dev
```

Use your OpenCode Go API key as the client bearer token. In the default `client_bearer` mode, the proxy forwards that
token upstream and does not store a server-side provider key.

List models:

```sh
curl http://localhost:8000/v1/models \
	-H "Authorization: Bearer $OPENCODE_GO_API_KEY"
```

Chat completion:

```sh
curl http://localhost:8000/v1/chat/completions \
	-H "Authorization: Bearer $OPENCODE_GO_API_KEY" \
	-H "Content-Type: application/json" \
	-d '{
		"model": "minimax-m3",
		"messages": [
			{ "role": "system", "content": "Answer concisely." },
			{ "role": "user", "content": "Say hello." }
		],
		"max_completion_tokens": 256
	}'
```

Streaming is supported for Anthropic-compatible upstreams by translating Anthropic SSE events into OpenAI
`chat.completion.chunk` events.

OpenCode Go routing is metadata-driven. The proxy fetches `models.dev` metadata to decide whether a model should go to
`/messages` or `/chat/completions`. If metadata is unavailable or a model is unknown, the proxy degrades gracefully by
probing `/chat/completions` and falling back to `/messages` only for client-side incompatibility errors.

## Warp Setup

Configure Warp's custom OpenAI-compatible provider with:

- Base URL: `http://localhost:8000/v1`
- API key: your OpenCode Go API key
- Model: `minimax-m3`

For a hosted deployment, use your HTTPS origin instead of localhost, for example `https://ai-proxy.example.com/v1`.

## Configuration

| Variable                             | Default                         | Purpose                                                          |
| ------------------------------------ | ------------------------------- | ---------------------------------------------------------------- |
| `PORT`                               | `8000`                          | Local server port.                                               |
| `UPSTREAM_PROTOCOL`                  | `anthropic_messages`            | `anthropic_messages` or `cerebras_openai`.                       |
| `UPSTREAM_BASE_URL`                  | `https://opencode.ai/zen/go/v1` | Upstream API base URL without a trailing slash.                  |
| `UPSTREAM_AUTH_MODE`                 | `client_bearer`                 | `client_bearer` or `server_key`.                                 |
| `UPSTREAM_AUTH_HEADER`               | `x-api-key`                     | Header used for upstream authentication.                         |
| `UPSTREAM_API_KEY`                   | empty                           | Server-side upstream key for `server_key` mode.                  |
| `PROXY_API_KEY`                      | empty                           | Client-facing proxy key for `server_key` mode.                   |
| `DEFAULT_MODEL`                      | `minimax-m3`                    | Model used when the client omits `model`.                        |
| `DEFAULT_MAX_TOKENS`                 | `4096`                          | Anthropic `max_tokens` fallback.                                 |
| `REQUEST_TIMEOUT_MS`                 | `60000`                         | Upstream request timeout.                                        |
| `OPENCODE_MODELS_URL`                | `https://models.dev/api.json`   | Canonical metadata source for OpenCode model routing.            |
| `OPENCODE_MODELS_CACHE_TTL_MS`       | `300000`                        | In-memory metadata cache TTL in milliseconds.                    |
| `OPENCODE_MODELS_FETCH_TIMEOUT_MS`   | `2000`                          | Timeout for metadata fetches in milliseconds.                    |
| `CEREBRAS_STRICT_REQUEST_VALIDATION` | `true`                          | Reject unknown or risky Cerebras request fields.                 |
| `CEREBRAS_DROP_UNSUPPORTED_FIELDS`   | `true`                          | Drop unsupported fields only when strict validation is disabled. |

## Auth Modes

`client_bearer` is the default. The client sends `Authorization: Bearer <upstream key>` to the proxy, and the proxy
forwards that token upstream.

`server_key` uses `UPSTREAM_API_KEY` from the server environment. Clients must authenticate with
`Authorization: Bearer <PROXY_API_KEY>`. Do not expose `server_key` mode publicly without authentication and rate
limits; anyone with access can spend the server owner's upstream API credits.

## Translation Behavior

Anthropic mode maps OpenAI Chat Completions to Anthropic Messages when the selected OpenCode model is marked as
Anthropic-backed in metadata:

- `model` passes through, defaulting to `DEFAULT_MODEL`.
- `system` and `developer` messages become Anthropic top-level `system` text.
- `user` and `assistant` text messages become Anthropic messages.
- `max_completion_tokens` or `max_tokens` becomes Anthropic `max_tokens`.
- `stop` becomes `stop_sequences`.
- `temperature`, `top_p`, and `stream` pass through.

Anthropic text blocks are concatenated into `choices[0].message.content`. Usage includes cache token fields when the
upstream returns them. Finish reasons map to OpenAI-compatible values where possible.

OpenCode models whose metadata resolves to OpenAI-compatible providers are forwarded directly to
`/chat/completions` without Anthropic translation. New model releases do not require proxy redeploys as long as the
metadata source is updated.

## Cerebras Mode

Set:

```env
UPSTREAM_PROTOCOL=cerebras_openai
UPSTREAM_BASE_URL=https://api.cerebras.ai/v1
DEFAULT_MODEL=gpt-oss-120b
```

The proxy forwards to `/v1/chat/completions` and uses conservative request normalization. It converts `max_tokens` to
`max_completion_tokens`, preserves basic text chat fields, and rejects unsupported tool, multimodal, structured output,
and other risky fields by default.

## Known Limitations

- Text-only chat is the production-ready slice.
- Multimodal content, tools, function calls, structured outputs, and non-text Anthropic blocks are rejected or ignored
  rather than guessed.
- Anthropic streaming handles common text events: `message_start`, `content_block_start`, `content_block_delta`,
  `message_delta`, and `message_stop`.
- Cerebras streaming is passed through as OpenAI-compatible SSE from the upstream.

## Development

Run commands through mise:

```sh
nr test
nr type-check
nr lint
nr format:check
nr bench
```

## Docker

The Docker image uses Bun canary via `oven/bun:canary-debian`. Bun canary is a rolling build, so rebuild with `--pull`
when you want the latest canary image.

Build and run:

```sh
docker build --pull -t ai-compatibility-proxy .
docker run --rm -p 8000:8000 --env-file .env ai-compatibility-proxy
```

Docker Compose:

```sh
docker compose up --build
```

## Fly.io Deployment

The included [fly.toml](fly.toml) deploys the Dockerfile, so Fly runs Bun canary from `oven/bun:canary-debian`.

`mise` installs Bun and the Fly CLI for this repo. Bun canary is applied by the `postinstall` hook with
`bun upgrade --canary`; do not set `bun = "canary"` because mise's Bun backend resolves that to a nonexistent
`bun-vcanary` release URL.

The default `client_bearer` auth mode does not require Fly secrets. In that mode, your OpenAI-compatible client sends
the upstream API key in its `Authorization` header and the proxy forwards it.

```sh
mise install
mise x -- bun --revision
mise x -- flyctl auth login
mise x -- flyctl launch --no-deploy
mise x -- flyctl deploy
mise x -- flyctl status
mise x -- flyctl logs
```

If `ai-compatibility-proxy` is already taken as a Fly app name, choose another name during `fly launch` and let Fly update
the `app` value in `fly.toml`.

For a personal hosted proxy where Fly stores the upstream key, switch to `server_key` mode:

```sh
mise x -- flyctl secrets set \
	UPSTREAM_AUTH_MODE=server_key \
	UPSTREAM_API_KEY=... \
	PROXY_API_KEY=...
```

Then use `https://<app-name>.fly.dev/v1` as the base URL and `PROXY_API_KEY` as the client API key.

## VPS Deployment

A low-cost VPS is enough because the proxy is stateless and has no database. Install Docker or Bun, set the
environment variables, expose only HTTPS publicly, and put a reverse proxy in front.

Prefer Caddy for simple automatic HTTPS. Add reverse-proxy rate limiting when using `server_key` mode to reduce abuse
risk. The proxy itself is cheap to run; upstream model usage is the real cost driver.

## Direct `systemd` Deployment

See [deploy/ai-compatibility-proxy.service](deploy/ai-compatibility-proxy.service). Install Bun on the server,
upgrade it to canary with `bun upgrade --canary`, place environment variables in `/etc/ai-compatibility-proxy.env`, and
run the service behind Caddy or Nginx.

## Caddy

See [deploy/Caddyfile](deploy/Caddyfile) for a minimal HTTPS reverse proxy.

## Hosting Notes

Docker on a VPS or Fly.io is a good fit for this stateless proxy. Railway, Render, and Northflank can also work if their
timeout limits fit your client usage. Confirm SSE and timeout behavior before relying on any request-limited platform
for Warp. This project does not recommend Vercel.
