import { ProxyError } from "./errors.ts";

import type { ProxyConfig } from "./config.ts";

const BEARER_PREFIX = "bearer ";

export interface AuthContext {
	readonly upstreamHeaders: Headers;
}

export function createAuthContext(request: Request, config: ProxyConfig): AuthContext {
	const clientBearerToken = getBearerToken(request);
	const upstreamHeaders = new Headers({
		"content-type": "application/json",
	});

	if (config.upstreamAuthMode === "client_bearer") {
		if (!clientBearerToken) {
			throw new ProxyError("Missing bearer token.", {
				status: 401,
				type: "authentication_error",
			});
		}

		setUpstreamAuthHeader(upstreamHeaders, config.upstreamAuthHeader, clientBearerToken);
		return { upstreamHeaders };
	}

	if (!config.proxyApiKey) {
		throw new ProxyError("PROXY_API_KEY is required when UPSTREAM_AUTH_MODE=server_key.", {
			status: 500,
			type: "configuration_error",
		});
	}

	if (!config.upstreamApiKey) {
		throw new ProxyError("UPSTREAM_API_KEY is required when UPSTREAM_AUTH_MODE=server_key.", {
			status: 500,
			type: "configuration_error",
		});
	}

	if (!clientBearerToken || clientBearerToken !== config.proxyApiKey) {
		throw new ProxyError("Invalid proxy bearer token.", {
			status: 401,
			type: "authentication_error",
		});
	}

	setUpstreamAuthHeader(upstreamHeaders, config.upstreamAuthHeader, config.upstreamApiKey);
	return { upstreamHeaders };
}

function getBearerToken(request: Request): string | undefined {
	const authorization = request.headers.get("authorization");
	if (!authorization) return undefined;

	const trimmedAuthorization = authorization.trim();
	if (!trimmedAuthorization.toLowerCase().startsWith(BEARER_PREFIX)) return undefined;

	const token = trimmedAuthorization.slice(BEARER_PREFIX.length).trim();
	return token || undefined;
}

function setUpstreamAuthHeader(headers: Headers, headerName: string, token: string): void {
	if (headerName.toLowerCase() === "authorization") {
		headers.set(headerName, `Bearer ${token}`);
		return;
	}

	headers.set(headerName, token);
}
