import { getProviderTargetDefaults } from "@providers/registry.ts";
import arkenv, { type } from "arkenv";

export type UpstreamProtocol = "anthropic_messages" | "cerebras_openai";
export type UpstreamAuthMode = "client_bearer" | "server_key";

export interface ProxyConfiguration {
	readonly port: number;
	readonly opencodeModelsCacheTtlMs: number;
	readonly opencodeModelsFetchTimeoutMs: number;
	readonly opencodeModelsUrl: string;
	readonly upstreamProtocol: UpstreamProtocol;
	readonly upstreamBaseUrl: string;
	readonly upstreamAuthMode: UpstreamAuthMode;
	readonly upstreamAuthHeader: string;
	readonly upstreamApiKey: string | undefined;
	readonly proxyApiKey: string | undefined;
	readonly defaultModel: string;
	readonly defaultMaxTokens: number;
	readonly requestTimeoutMs: number;
	readonly logLevel: string;
	readonly cerebrasStrictRequestValidation: boolean;
	readonly cerebrasDropUnsupportedFields: boolean;
}

const isProxyEnvironment = type({
	CEREBRAS_DROP_UNSUPPORTED_FIELDS: "boolean = true",
	CEREBRAS_STRICT_REQUEST_VALIDATION: "boolean = true",
	DEFAULT_MAX_TOKENS: "number.integer > 0 = 4096",
	DEFAULT_MODEL: "string = 'minimax-m3'",
	LOG_LEVEL: "string = 'info'",
	OPENCODE_MODELS_CACHE_TTL_MS: "number.integer > 0 = 300000",
	OPENCODE_MODELS_FETCH_TIMEOUT_MS: "number.integer > 0 = 2000",
	OPENCODE_MODELS_URL: "string = 'https://models.dev/api.json'",
	PORT: "number.integer > 0 = 8000",
	"PROXY_API_KEY?": "string",
	REQUEST_TIMEOUT_MS: "number.integer > 0 = 60000",
	"UPSTREAM_API_KEY?": "string",
	"UPSTREAM_AUTH_HEADER?": "string",
	UPSTREAM_AUTH_MODE: "'client_bearer' | 'server_key' = 'client_bearer'",
	UPSTREAM_BASE_URL: "string = 'https://opencode.ai/zen/go/v1'",
	UPSTREAM_PROTOCOL: "'anthropic_messages' | 'cerebras_openai' = 'anthropic_messages'",
}).readonly();

export function loadConfiguration(
	environment: Record<string, string | undefined> = Deno.env.toObject(),
): ProxyConfiguration {
	const normalizedEnvironment = removeEmptyValues(environment);
	const {
		CEREBRAS_DROP_UNSUPPORTED_FIELDS,
		CEREBRAS_STRICT_REQUEST_VALIDATION,
		DEFAULT_MAX_TOKENS,
		LOG_LEVEL,
		OPENCODE_MODELS_CACHE_TTL_MS,
		OPENCODE_MODELS_FETCH_TIMEOUT_MS,
		OPENCODE_MODELS_URL,
		PORT,
		PROXY_API_KEY,
		REQUEST_TIMEOUT_MS,
		UPSTREAM_API_KEY,
		UPSTREAM_AUTH_MODE,
		UPSTREAM_PROTOCOL,
	} = arkenv(isProxyEnvironment, {
		coerce: true,
		env: normalizedEnvironment,
		onUndeclaredKey: "delete",
	});
	const upstreamBaseUrl = normalizedEnvironment.UPSTREAM_BASE_URL ?? getDefaultBaseUrl(UPSTREAM_PROTOCOL);
	const upstreamAuthHeader = normalizedEnvironment.UPSTREAM_AUTH_HEADER ?? getDefaultAuthHeader(UPSTREAM_PROTOCOL);
	const defaultModel = normalizedEnvironment.DEFAULT_MODEL ?? getDefaultModel(UPSTREAM_PROTOCOL);

	return {
		cerebrasDropUnsupportedFields: CEREBRAS_DROP_UNSUPPORTED_FIELDS,
		cerebrasStrictRequestValidation: CEREBRAS_STRICT_REQUEST_VALIDATION,
		defaultMaxTokens: DEFAULT_MAX_TOKENS,
		defaultModel,
		logLevel: LOG_LEVEL,
		opencodeModelsCacheTtlMs: OPENCODE_MODELS_CACHE_TTL_MS,
		opencodeModelsFetchTimeoutMs: OPENCODE_MODELS_FETCH_TIMEOUT_MS,
		opencodeModelsUrl: stripTrailingSlash(OPENCODE_MODELS_URL),
		port: PORT,
		proxyApiKey: PROXY_API_KEY,
		requestTimeoutMs: REQUEST_TIMEOUT_MS,
		upstreamApiKey: UPSTREAM_API_KEY,
		upstreamAuthHeader,
		upstreamAuthMode: UPSTREAM_AUTH_MODE,
		upstreamBaseUrl: stripTrailingSlash(upstreamBaseUrl),
		upstreamProtocol: UPSTREAM_PROTOCOL,
	};
}

function getDefaultBaseUrl(upstreamProtocol: UpstreamProtocol): string {
	return getProviderTargetDefaults(upstreamProtocol).baseUrl;
}

function getDefaultAuthHeader(upstreamProtocol: UpstreamProtocol): string {
	return getProviderTargetDefaults(upstreamProtocol).authHeader;
}

function getDefaultModel(upstreamProtocol: UpstreamProtocol): string {
	return getProviderTargetDefaults(upstreamProtocol).model;
}

function removeEmptyValues(environment: Record<string, string | undefined>): Record<string, string | undefined> {
	const normalizedEnvironment: Record<string, string | undefined> = {};

	for (const [key, value] of Object.entries(environment)) {
		normalizedEnvironment[key] = value?.trim() || undefined;
	}

	return normalizedEnvironment;
}

function stripTrailingSlash(value: string): string {
	let endIndex = value.length;
	while (value.charAt(endIndex - 1) === "/") endIndex -= 1;
	return value.slice(0, endIndex);
}
