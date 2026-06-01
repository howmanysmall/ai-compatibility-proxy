import { loadConfiguration } from "@proxy/config.ts";

import { assertEquals } from "../utilities/test-utilities.ts";

Deno.test("Arkenv config parses all env vars and preserves ProxyConfig field names", () => {
	const config = loadConfiguration({
		CEREBRAS_DROP_UNSUPPORTED_FIELDS: "false",
		CEREBRAS_STRICT_REQUEST_VALIDATION: "false",
		DEFAULT_MAX_TOKENS: "2048",
		DEFAULT_MODEL: "custom-model",
		LOG_LEVEL: "debug",
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

	assertEquals(config.cerebrasDropUnsupportedFields, false, "Expected CEREBRAS_DROP_UNSUPPORTED_FIELDS mapping.");
	assertEquals(config.cerebrasStrictRequestValidation, false, "Expected CEREBRAS_STRICT_REQUEST_VALIDATION mapping.");
	assertEquals(config.defaultMaxTokens, 2048, "Expected DEFAULT_MAX_TOKENS mapping.");
	assertEquals(config.defaultModel, "custom-model", "Expected DEFAULT_MODEL mapping.");
	assertEquals(config.logLevel, "debug", "Expected LOG_LEVEL mapping.");
	assertEquals(config.port, 9000, "Expected PORT mapping.");
	assertEquals(config.proxyApiKey, "proxy-key", "Expected PROXY_API_KEY mapping.");
	assertEquals(config.requestTimeoutMs, 1500, "Expected REQUEST_TIMEOUT_MS mapping.");
	assertEquals(config.upstreamApiKey, "upstream-key", "Expected UPSTREAM_API_KEY mapping.");
	assertEquals(config.upstreamAuthHeader, "X-Api-Key", "Expected UPSTREAM_AUTH_HEADER mapping.");
	assertEquals(config.upstreamAuthMode, "server_key", "Expected UPSTREAM_AUTH_MODE mapping.");
	assertEquals(config.upstreamBaseUrl, "https://example.test/v1", "Expected UPSTREAM_BASE_URL trimming.");
	assertEquals(config.upstreamProtocol, "cerebras_openai", "Expected UPSTREAM_PROTOCOL mapping.");
});

Deno.test("Arkenv config applies defaults for all optional env vars", () => {
	const config = loadConfiguration({});

	assertEquals(config.cerebrasDropUnsupportedFields, true, "Expected Cerebras drop default.");
	assertEquals(config.cerebrasStrictRequestValidation, true, "Expected Cerebras strict default.");
	assertEquals(config.defaultMaxTokens, 4096, "Expected token default.");
	assertEquals(config.defaultModel, "minimax-m3", "Expected model default.");
	assertEquals(config.logLevel, "info", "Expected log level default.");
	assertEquals(config.port, 8000, "Expected port default.");
	assertEquals(config.proxyApiKey, undefined, "Expected proxy key optional default.");
	assertEquals(config.requestTimeoutMs, 60_000, "Expected timeout default.");
	assertEquals(config.upstreamApiKey, undefined, "Expected upstream key optional default.");
	assertEquals(config.upstreamAuthHeader, "Authorization", "Expected auth header default.");
	assertEquals(config.upstreamAuthMode, "client_bearer", "Expected auth mode default.");
	assertEquals(config.upstreamBaseUrl, "https://opencode.ai/zen/go/v1", "Expected base URL default.");
	assertEquals(config.upstreamProtocol, "anthropic_messages", "Expected protocol default.");
});

Deno.test("Arkenv config preserves Cerebras protocol-specific defaults", () => {
	const config = loadConfiguration({ UPSTREAM_PROTOCOL: "cerebras_openai" });

	assertEquals(config.upstreamProtocol, "cerebras_openai", "Expected Cerebras protocol.");
	assertEquals(config.upstreamBaseUrl, "https://api.cerebras.ai/v1", "Expected Cerebras base URL default.");
	assertEquals(config.defaultModel, "gpt-oss-120b", "Expected Cerebras model default.");
});

Deno.test({
	fn: async () => {
		const { ensureLogDirectory, logger } = await import("@logging/logger.ts");

		assertEquals(ensureLogDirectory(), false, "Expected logger import to avoid crashing without write permission.");
		logger.info("log directory smoke test");
	},
	name: "logger module handles log directory setup before reporters are used",
});

Deno.test({
	fn: async () => {
		const { logger, parseLevel } = await import("@logging/logger.ts");

		logger.level = parseLevel("warn");

		assertEquals(logger.level, 2, "Expected warn to map to consola level 2.");
	},
	name: "LOG_LEVEL=warn maps to consola level mutation",
});
