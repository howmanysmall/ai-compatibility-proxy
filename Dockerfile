FROM oven/bun:canary-debian

ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_CONFIG_DIR="/mise"
ENV MISE_DATA_DIR="/mise"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV PATH="/mise/shims:$PATH"

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl git \
	&& rm -rf /var/lib/apt/lists/*

RUN curl https://mise.run | sh

COPY --chown=bun:bun .npmrc mise.toml mise.lock package.json aube-lock.yaml aube-workspace.yaml ./
COPY --chown=bun:bun patches/ ./patches/
COPY --chown=bun:bun scripts/ ./scripts/
COPY --chown=bun:bun benchmarks/ ./benchmarks/
COPY --chown=bun:bun src ./src

RUN mise trust -a \
	&& mise install aube \
	&& aube install --prod --no-frozen-lockfile

EXPOSE 8000

USER bun

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun run scripts/healthcheck.ts

CMD ["bun", "run", "--bun", "src/index.ts"]
