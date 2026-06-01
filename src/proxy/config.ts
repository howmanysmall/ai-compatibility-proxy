import arkenv, { type } from "arkenv";

export type UpstreamProtocol = "anthropic_messages" | "cerebras_openai";
export type UpstreamAuthMode = "client_bearer" | "server_key";

export interface ProxyConfig {
	readonly port: number;
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

const ProxyEnvironment = type({
	CEREBRAS_DROP_UNSUPPORTED_FIELDS: "boolean = true",
	CEREBRAS_STRICT_REQUEST_VALIDATION: "boolean = true",
	DEFAULT_MAX_TOKENS: "number.integer > 0 = 4096",
	DEFAULT_MODEL: "string = 'minimax-m3'",
	LOG_LEVEL: "string = 'info'",
	PORT: "number.integer > 0 = 8000",
	"PROXY_API_KEY?": "string",
	REQUEST_TIMEOUT_MS: "number.integer > 0 = 60000",
	"UPSTREAM_API_KEY?": "string",
	UPSTREAM_AUTH_HEADER: "string = 'Authorization'",
	UPSTREAM_AUTH_MODE: "'client_bearer' | 'server_key' = 'client_bearer'",
	UPSTREAM_BASE_URL: "string = 'https://opencode.ai/zen/go/v1'",
	UPSTREAM_PROTOCOL: "'anthropic_messages' | 'cerebras_openai' = 'anthropic_messages'",
});

export function loadConfig(environment: Record<string, string | undefined> = Deno.env.toObject()): ProxyConfig {
	const normalizedEnvironment = removeEmptyValues(environment);
	const {
		CEREBRAS_DROP_UNSUPPORTED_FIELDS,
		CEREBRAS_STRICT_REQUEST_VALIDATION,
		DEFAULT_MAX_TOKENS,
		LOG_LEVEL,
		PORT,
		PROXY_API_KEY,
		REQUEST_TIMEOUT_MS,
		UPSTREAM_API_KEY,
		UPSTREAM_AUTH_HEADER,
		UPSTREAM_AUTH_MODE,
		UPSTREAM_PROTOCOL,
	} = arkenv(ProxyEnvironment, {
		coerce: true,
		env: normalizedEnvironment,
		onUndeclaredKey: "delete",
	});
	const upstreamBaseUrl = normalizedEnvironment["UPSTREAM_BASE_URL"] ?? getDefaultBaseUrl(UPSTREAM_PROTOCOL);
	const defaultModel = normalizedEnvironment["DEFAULT_MODEL"] ?? getDefaultModel(UPSTREAM_PROTOCOL);

	return {
		cerebrasDropUnsupportedFields: CEREBRAS_DROP_UNSUPPORTED_FIELDS,
		cerebrasStrictRequestValidation: CEREBRAS_STRICT_REQUEST_VALIDATION,
		defaultMaxTokens: DEFAULT_MAX_TOKENS,
		defaultModel,
		logLevel: LOG_LEVEL,
		port: PORT,
		proxyApiKey: PROXY_API_KEY,
		requestTimeoutMs: REQUEST_TIMEOUT_MS,
		upstreamApiKey: UPSTREAM_API_KEY,
		upstreamAuthHeader: UPSTREAM_AUTH_HEADER,
		upstreamAuthMode: UPSTREAM_AUTH_MODE,
		upstreamBaseUrl: stripTrailingSlash(upstreamBaseUrl),
		upstreamProtocol: UPSTREAM_PROTOCOL,
	};
}

function getDefaultBaseUrl(upstreamProtocol: UpstreamProtocol): string {
	return upstreamProtocol === "anthropic_messages" ? "https://opencode.ai/zen/go/v1" : "https://api.cerebras.ai/v1";
}

function getDefaultModel(upstreamProtocol: UpstreamProtocol): string {
	return upstreamProtocol === "anthropic_messages" ? "minimax-m3" : "gpt-oss-120b";
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
