# syntax=docker/dockerfile:1

FROM oven/bun:canary-debian AS dependencies

ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_CONFIG_DIR="/mise"
ENV MISE_DATA_DIR="/mise"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV MISE_VERSION="2026.7.5"
ENV PATH="/mise/shims:$PATH"

WORKDIR /app

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl \
	&& rm -rf /var/lib/apt/lists/*

RUN curl --proto "=https" --tlsv1.2 --fail --silent --show-error https://mise.run | sh

COPY mise.toml mise.lock ./

RUN mise trust -a \
	&& mise install --locked pnpm

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/

RUN mise exec -- pnpm install --frozen-lockfile --prod --config.enable-global-virtual-store=false

FROM oven/bun:canary-debian AS runtime

ENV NODE_ENV="production"

WORKDIR /app

COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json tsconfig.json tsconfig.base.json ./
COPY --chown=bun:bun src/ ./src/

EXPOSE 8000

USER bun

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
	CMD ["bun", "-e", "const response = await fetch(`http://127.0.0.1:${Bun.env.PORT ?? '8000'}/health`); if (!response.ok) process.exit(1);"]

CMD ["bun", "run", "--bun", "src/index.ts"]
