FROM oven/bun:1.4.0

WORKDIR /app

RUN corepack enable

COPY --chown=bun:bun package.json aube-lock.yaml aube-workspace.yaml ./
COPY --chown=bun:bun patches/ ./patches/
COPY --chown=bun:bun plugins/ ./plugins/
COPY --chown=bun:bun scripts/ ./scripts/
COPY --chown=bun:bun benchmarks/ ./benchmarks/
COPY --chown=bun:bun src ./src

RUN aube install --prod --frozen-lockfile

EXPOSE 8000

USER bun

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun run scripts/healthcheck.ts

CMD ["bun", "run", "--bun", "src/index.ts"]
