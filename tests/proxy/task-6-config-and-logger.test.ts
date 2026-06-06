import { expect, test } from "vitest";
import { loadConfiguration } from "@proxy/config";

test("Arkenv config parses all env vars and preserves ProxyConfig field names", () => {
	expect.hasAssertions();
	const config = loadConfiguration({
		CEREBRAS_DROP_UNSUPPORTED_FIELDS: "false",
		CEREBRAS_STRICT_REQUEST_VALIDATION: "false",
		DEFAULT_MAX_TOKENS: "2048",
		DEFAULT_MODEL: "custom-model",
		LOG_LEVEL: "debug",
		OPENCODE_MODELS_CACHE_TTL_MS: "12345",
		OPENCODE_MODELS_FETCH_TIMEOUT_MS: "3456",
		OPENCODE_MODELS_URL: "https://models.dev/api.json/",
		PATH: "/usr/bin",
		PORT: "9000",
		PROXY_API_KEY: "proxy-key",
		REQUEST_TIMEOUT_MS: "1500",
		UPSTREAM_API_KEY: "upstream-key",
		UPSTREAM_AUTH_HEADER: "X-Api-Key",
		UPSTREAM_AUTH_MODE: "server_key",
		UPSTREAM_BASE_URL: "https://example.test/v1/",
		UPSTREAM_PROTOCOL: "cerebras_openai",
	});

	expect(config.cerebrasDropUnsupportedFields, "Expected CEREBRAS_DROP_UNSUPPORTED_FIELDS mapping.").toBe(false);
	expect(config.cerebrasStrictRequestValidation, "Expected CEREBRAS_STRICT_REQUEST_VALIDATION mapping.").toBe(false);
	expect(config.defaultMaxTokens, "Expected DEFAULT_MAX_TOKENS mapping.").toBe(2048);
	expect(config.defaultModel, "Expected DEFAULT_MODEL mapping.").toBe("custom-model");
	expect(config.logLevel, "Expected LOG_LEVEL mapping.").toBe("debug");
	expect(config.opencodeModelsCacheTtlMs, "Expected OPENCODE_MODELS_CACHE_TTL_MS mapping.").toBe(12_345);
	expect(config.opencodeModelsFetchTimeoutMs, "Expected OPENCODE_MODELS_FETCH_TIMEOUT_MS mapping.").toBe(3456);
	expect(config.opencodeModelsUrl, "Expected OPENCODE_MODELS_URL trimming.").toBe("https://models.dev/api.json");
	expect(config.port, "Expected PORT mapping.").toBe(9000);
	expect(config.proxyApiKey, "Expected PROXY_API_KEY mapping.").toBe("proxy-key");
	expect(config.requestTimeoutMs, "Expected REQUEST_TIMEOUT_MS mapping.").toBe(1500);
	expect(config.upstreamApiKey, "Expected UPSTREAM_API_KEY mapping.").toBe("upstream-key");
	expect(config.upstreamAuthHeader, "Expected UPSTREAM_AUTH_HEADER mapping.").toBe("X-Api-Key");
	expect(config.upstreamAuthMode, "Expected UPSTREAM_AUTH_MODE mapping.").toBe("server_key");
	expect(config.upstreamBaseUrl, "Expected UPSTREAM_BASE_URL trimming.").toBe("https://example.test/v1");
	expect(config.upstreamProtocol, "Expected UPSTREAM_PROTOCOL mapping.").toBe("cerebras_openai");
});

test("Arkenv config applies defaults for all optional env vars", () => {
	expect.hasAssertions();
	const config = loadConfiguration({});

	expect(config.cerebrasDropUnsupportedFields, "Expected Cerebras drop default.").toBe(true);
	expect(config.cerebrasStrictRequestValidation, "Expected Cerebras strict default.").toBe(true);
	expect(config.defaultMaxTokens, "Expected token default.").toBe(4096);
	expect(config.defaultModel, "Expected model default.").toBe("minimax-m3");
	expect(config.logLevel, "Expected log level default.").toBe("info");
	expect(config.opencodeModelsCacheTtlMs, "Expected metadata cache TTL default.").toBe(300_000);
	expect(config.opencodeModelsFetchTimeoutMs, "Expected metadata fetch timeout default.").toBe(2000);
	expect(config.opencodeModelsUrl, "Expected metadata URL default.").toBe("https://models.dev/api.json");
	expect(config.port, "Expected port default.").toBe(8000);
	expect(config.proxyApiKey, "Expected proxy key optional default.").toBe(undefined);
	expect(config.requestTimeoutMs, "Expected timeout default.").toBe(60_000);
	expect(config.upstreamApiKey, "Expected upstream key optional default.").toBe(undefined);
	expect(config.upstreamAuthHeader, "Expected OpenCode Go auth header default.").toBe("x-api-key");
	expect(config.upstreamAuthMode, "Expected auth mode default.").toBe("client_bearer");
	expect(config.upstreamBaseUrl, "Expected base URL default.").toBe("https://opencode.ai/zen/go/v1");
	expect(config.upstreamProtocol, "Expected protocol default.").toBe("anthropic_messages");
});

test("Arkenv config preserves Cerebras protocol-specific defaults", () => {
	expect.hasAssertions();
	const config = loadConfiguration({ UPSTREAM_PROTOCOL: "cerebras_openai" });

	expect(config.upstreamProtocol, "Expected Cerebras protocol.").toBe("cerebras_openai");
	expect(config.upstreamBaseUrl, "Expected Cerebras base URL default.").toBe("https://api.cerebras.ai/v1");
	expect(config.upstreamAuthHeader, "Expected Cerebras auth header default.").toBe("Authorization");
	expect(config.defaultModel, "Expected Cerebras model default.").toBe("gpt-oss-120b");
});

test("Arkenv config treats blank env values as undefined before applying defaults", () => {
	expect.hasAssertions();
	const config = loadConfiguration({
		DEFAULT_MODEL: "   ",
		PROXY_API_KEY: "",
		UPSTREAM_AUTH_HEADER: "\t",
	});

	expect(config.defaultModel, "Expected blank model env to fall back to default.").toBe("minimax-m3");
	expect(config.proxyApiKey, "Expected blank proxy key env to become undefined.").toBeUndefined();
	expect(config.upstreamAuthHeader, "Expected blank auth header env to fall back to default.").toBe("x-api-key");
});

test("logger module handles log directory availability before reporters are used", async () => {
	expect.hasAssertions();
	const { ensureLogDirectory, logger } = await import("@logging/logger.ts");

	expect(ensureLogDirectory()).toBeTypeOf("boolean");
	logger.info("log directory smoke test");
	logger.withContext({ requestId: "logger-context-smoke" }).info("contextual logger smoke test");
	logger.withContext({ requestId: "logger-context-error-smoke" }).error("contextual logger error smoke test");
});

test("LOG_LEVEL=warn maps to consola level mutation", async () => {
	expect.hasAssertions();
	const { logger, parseLevel } = await import("@logging/logger.ts");

	logger.level = parseLevel("warn");

	expect(logger.level, "Expected warn to map to consola level 2.").toBe(2);
});

test("parseLevel maps numeric and named consola levels", async () => {
	expect.hasAssertions();
	const { parseLevel } = await import("@logging/logger.ts");

	expect(parseLevel("0"), "Expected fatal numeric level.").toBe(0);
	expect(parseLevel(" fatal "), "Expected fatal named level.").toBe(0);
	expect(parseLevel("1"), "Expected error numeric level.").toBe(1);
	expect(parseLevel("ERROR"), "Expected case-insensitive error named level.").toBe(1);
	expect(parseLevel("2"), "Expected warn numeric level.").toBe(2);
	expect(parseLevel("warn"), "Expected warn named level.").toBe(2);
	expect(parseLevel("3"), "Expected info numeric fallback level.").toBe(3);
	expect(parseLevel("info"), "Expected info named fallback level.").toBe(3);
	expect(parseLevel("4"), "Expected debug numeric level.").toBe(4);
	expect(parseLevel("debug"), "Expected debug named level.").toBe(4);
	expect(parseLevel("5"), "Expected trace numeric level.").toBe(5);
	expect(parseLevel("trace"), "Expected trace named level.").toBe(5);
	expect(parseLevel("not-a-level"), "Expected unknown level to default to info.").toBe(3);
});
