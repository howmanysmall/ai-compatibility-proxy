import { getProviderTargetDefaults } from "$providers/registry";
import arkenv, { type } from "arkenv";

export type UpstreamProtocol = "anthropic_messages" | "cerebras_openai";
export type UpstreamAuthMode = "client_bearer" | "server_key";

export interface ProxyConfiguration {
	readonly allowedUpstreamHosts: ReadonlyArray<string>;
	readonly cerebrasDropUnsupportedFields: boolean;
	readonly cerebrasStrictRequestValidation: boolean;
	readonly defaultMaxTokens: number;
	readonly defaultModel: string;
	readonly logLevel: string;
	readonly maxRequestBodySizeBytes: number;
	readonly opencodeModelsCacheTtlMs: number;
	readonly opencodeModelsFetchTimeoutMs: number;
	readonly opencodeModelsUrl: string;
	readonly port: number;
	readonly proxyApiKey: string | undefined;
	readonly requestTimeoutMs: number;
	readonly upstreamApiKey: string | undefined;
	readonly upstreamAuthHeader: string;
	readonly upstreamAuthMode: UpstreamAuthMode;
	readonly upstreamBaseUrl: string;
	readonly upstreamErrorTransparency: boolean;
	readonly upstreamProtocol: UpstreamProtocol;
}

const isProxyEnvironment = type({
	"ALLOWED_UPSTREAM_HOSTS?": "string",
	CEREBRAS_DROP_UNSUPPORTED_FIELDS: "boolean = true",
	CEREBRAS_STRICT_REQUEST_VALIDATION: "boolean = true",
	DEFAULT_MAX_TOKENS: "number.integer > 0 = 4096",
	DEFAULT_MODEL: "string = 'minimax-m3'",
	LOG_LEVEL: "string = 'info'",
	MAX_REQUEST_BODY_SIZE_BYTES: "number.integer > 0 = 1048576",
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
	"UPSTREAM_ERROR_TRANSPARENCY?": "boolean",
	UPSTREAM_PROTOCOL: "'anthropic_messages' | 'cerebras_openai' = 'anthropic_messages'",
}).readonly();

export function loadConfiguration(environment: Record<string, string | undefined> = Bun.env): ProxyConfiguration {
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
		MAX_REQUEST_BODY_SIZE_BYTES,
		ALLOWED_UPSTREAM_HOSTS,
		UPSTREAM_ERROR_TRANSPARENCY,
	} = arkenv(isProxyEnvironment, {
		coerce: true,
		env: normalizedEnvironment,
		onUndeclaredKey: "delete",
	});

	const isDevelopmentOrTest =
		normalizedEnvironment.NODE_ENV === "development" || normalizedEnvironment.NODE_ENV === "test";

	const allowedHosts = ALLOWED_UPSTREAM_HOSTS?.split(",").map((value) => value.trim().toLowerCase()) ?? [];

	const upstreamBaseUrl = normalizedEnvironment.UPSTREAM_BASE_URL ?? getDefaultBaseUrl(UPSTREAM_PROTOCOL);
	const upstreamAuthHeader = normalizedEnvironment.UPSTREAM_AUTH_HEADER ?? getDefaultAuthHeader(UPSTREAM_PROTOCOL);
	const defaultModel = normalizedEnvironment.DEFAULT_MODEL ?? getDefaultModel(UPSTREAM_PROTOCOL);

	validateOutboundUrl(OPENCODE_MODELS_URL, allowedHosts, isDevelopmentOrTest);
	validateOutboundUrl(upstreamBaseUrl, allowedHosts, isDevelopmentOrTest);

	const upstreamErrorTransparency = UPSTREAM_ERROR_TRANSPARENCY ?? UPSTREAM_AUTH_MODE === "client_bearer";

	return {
		allowedUpstreamHosts: allowedHosts,
		cerebrasDropUnsupportedFields: CEREBRAS_DROP_UNSUPPORTED_FIELDS,
		cerebrasStrictRequestValidation: CEREBRAS_STRICT_REQUEST_VALIDATION,
		defaultMaxTokens: DEFAULT_MAX_TOKENS,
		defaultModel,
		logLevel: LOG_LEVEL,
		maxRequestBodySizeBytes: MAX_REQUEST_BODY_SIZE_BYTES,
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
		upstreamErrorTransparency,
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
		const trimmedValue = value?.trim();
		if (trimmedValue !== undefined && trimmedValue.length > 0) normalizedEnvironment[key] = trimmedValue;
	}

	return normalizedEnvironment;
}

function stripTrailingSlash(value: string): string {
	let endIndex = value.length;
	while (value.charAt(endIndex - 1) === "/") endIndex -= 1;
	return value.slice(0, endIndex);
}

function validateOutboundUrl(
	urlString: string,
	allowedHosts: ReadonlyArray<string>,
	isDevelopmentOrTest: boolean,
): void {
	let url: URL;
	try {
		url = new URL(urlString);
	} catch (error) {
		const exception = new Error(`Invalid URL: ${urlString}`, { cause: error });
		Error.captureStackTrace(exception, validateOutboundUrl);
		throw exception;
	}

	const { protocol } = url;
	const { hostname } = url;

	if (protocol !== "https:") {
		const isAllowedHttp =
			isDevelopmentOrTest &&
			(hostname === "localhost" ||
				hostname === "127.0.0.1" ||
				hostname.endsWith(".test") ||
				hostname.endsWith(".local"));
		if (!isAllowedHttp) {
			const error = new Error(`Outbound URL must use HTTPS protocol: ${urlString}`);
			Error.captureStackTrace(error, validateOutboundUrl);
			throw error;
		}
	}

	if (allowedHosts.length > 0) {
		const isHostAllowed = allowedHosts.some((allowedHost) => {
			if (allowedHost === "*") return true;
			if (allowedHost.startsWith("*.")) {
				const suffix = allowedHost.slice(1);
				return hostname.endsWith(suffix) || hostname === allowedHost.slice(2);
			}
			return hostname === allowedHost;
		});
		if (!isHostAllowed) {
			const error = new Error(`Host '${hostname}' is not in the allowed host list.`);
			Error.captureStackTrace(error, validateOutboundUrl);
			throw error;
		}
	}
}
