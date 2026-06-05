FROM oven/bun:1.4.0

WORKDIR /app

RUN corepack enable

COPY package.json aube-lock.yaml aube-workspace.yaml ./
COPY patches/ ./patches/
COPY plugins/ ./plugins/
COPY scripts/ ./scripts/
COPY benchmarks/ ./benchmarks/
COPY src ./src

RUN aube install --prod --frozen-lockfile

EXPOSE 8000

CMD ["bun", "run", "--bun", "src/index.ts"]
