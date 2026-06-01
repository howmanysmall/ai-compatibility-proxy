FROM denoland/deno:2.8.0

WORKDIR /app

COPY deno.json deno.lock ./
COPY src ./src

RUN deno cache src/index.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-sys=homedir", "src/index.ts"]
