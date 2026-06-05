FROM oven/bun:1.4.0

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/
COPY plugins/ ./plugins/
COPY scripts/ ./scripts/
COPY benchmarks/ ./benchmarks/
COPY src ./src

RUN pnpm install --prod --frozen-lockfile

EXPOSE 8000

CMD ["bun", "src/index.ts"]
