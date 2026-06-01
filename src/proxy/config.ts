import { ProxyError } from "./errors.ts";

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

export function loadConfig(environment: Record<string, string | undefined> = Deno.env.toObject()): ProxyConfig {
	const upstreamProtocol = getProtocol(environment["UPSTREAM_PROTOCOL"] ?? "anthropic_messages");
	const upstreamAuthMode = getAuthMode(environment["UPSTREAM_AUTH_MODE"] ?? "client_bearer");
	const upstreamBaseUrl = getString(
		environment["UPSTREAM_BASE_URL"],
		upstreamProtocol === "anthropic_messages" ? "https://opencode.ai/zen/go/v1" : "https://api.cerebras.ai/v1",
	);
	const defaultModel = getString(
		environment["DEFAULT_MODEL"],
		upstreamProtocol === "anthropic_messages" ? "minimax-m3" : "gpt-oss-120b",
	);

	return {
		cerebrasDropUnsupportedFields: getBoolean(environment["CEREBRAS_DROP_UNSUPPORTED_FIELDS"], true),
		cerebrasStrictRequestValidation: getBoolean(environment["CEREBRAS_STRICT_REQUEST_VALIDATION"], true),
		defaultMaxTokens: getInteger(environment["DEFAULT_MAX_TOKENS"], 4096, "DEFAULT_MAX_TOKENS"),
		defaultModel,
		logLevel: getString(environment["LOG_LEVEL"], "info"),
		port: getInteger(environment["PORT"], 8000, "PORT"),
		proxyApiKey: getOptionalString(environment["PROXY_API_KEY"]),
		requestTimeoutMs: getInteger(environment["REQUEST_TIMEOUT_MS"], 60_000, "REQUEST_TIMEOUT_MS"),
		upstreamApiKey: getOptionalString(environment["UPSTREAM_API_KEY"]),
		upstreamAuthHeader: getString(environment["UPSTREAM_AUTH_HEADER"], "Authorization"),
		upstreamAuthMode,
		upstreamBaseUrl: stripTrailingSlash(upstreamBaseUrl),
		upstreamProtocol,
	};
}

function getProtocol(value: string): UpstreamProtocol {
	if (value === "anthropic_messages" || value === "cerebras_openai") return value;
	throw new ProxyError(`Unsupported UPSTREAM_PROTOCOL "${value}".`, { status: 500, type: "configuration_error" });
}

function getAuthMode(value: string): UpstreamAuthMode {
	if (value === "client_bearer" || value === "server_key") return value;
	throw new ProxyError(`Unsupported UPSTREAM_AUTH_MODE "${value}".`, { status: 500, type: "configuration_error" });
}

function getString(value: string | undefined, fallback: string): string {
	const trimmedValue = value?.trim();
	return trimmedValue || fallback;
}

function getOptionalString(value: string | undefined): string | undefined {
	const trimmedValue = value?.trim();
	return trimmedValue || undefined;
}

function getInteger(value: string | undefined, fallback: number, name: string): number {
	if (value === undefined || value.trim() === "") return fallback;

	const parsedValue = Number.parseInt(value, 10);
	if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
		throw new ProxyError(`${name} must be a positive integer.`, { status: 500, type: "configuration_error" });
	}

	return parsedValue;
}

function getBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value.trim() === "") return fallback;

	const normalizedValue = value.trim().toLowerCase();
	if (normalizedValue === "true") return true;
	if (normalizedValue === "false") return false;
	return fallback;
}

function stripTrailingSlash(value: string): string {
	let endIndex = value.length;
	while (value.charAt(endIndex - 1) === "/") endIndex -= 1;
	return value.slice(0, endIndex);
}
