import { textEncoder } from "@constants/constant-classes.ts";
import { crypto, timingSafeEqual } from "@std/crypto";

import { ProxyError } from "./errors.ts";

import type { ProxyConfiguration } from "./config.ts";

const BEARER_PREFIX = "bearer ";

export interface AuthContext {
	readonly upstreamHeaders: Headers;
}

export function createAuthContext(request: Request, proxyConfiguration: ProxyConfiguration): AuthContext {
	const clientBearerToken = getBearerToken(request);
	const upstreamHeaders = new Headers({
		"content-type": "application/json",
	});

	if (proxyConfiguration.upstreamAuthMode === "client_bearer") {
		if (!clientBearerToken) {
			const error = new ProxyError("Missing bearer token.", {
				status: 401,
				type: "authentication_error",
			});
			Error.captureStackTrace(error, createAuthContext);
			throw error;
		}

		setUpstreamAuthHeader(upstreamHeaders, proxyConfiguration.upstreamAuthHeader, clientBearerToken);
		return { upstreamHeaders };
	}

	if (!proxyConfiguration.proxyApiKey) {
		const error = new ProxyError("PROXY_API_KEY is required when UPSTREAM_AUTH_MODE=server_key.", {
			status: 500,
			type: "configuration_error",
		});
		Error.captureStackTrace(error, createAuthContext);
		throw error;
	}

	if (!proxyConfiguration.upstreamApiKey) {
		const error = new ProxyError("UPSTREAM_API_KEY is required when UPSTREAM_AUTH_MODE=server_key.", {
			status: 500,
			type: "configuration_error",
		});
		Error.captureStackTrace(error, createAuthContext);
		throw error;
	}

	if (!clientBearerToken) {
		const error = new ProxyError("Invalid proxy bearer token.", {
			status: 401,
			type: "authentication_error",
		});
		Error.captureStackTrace(error, createAuthContext);
		throw error;
	}

	if (!hasSameToken(clientBearerToken, proxyConfiguration.proxyApiKey)) {
		const error = new ProxyError("Invalid proxy bearer token.", {
			status: 401,
			type: "authentication_error",
		});
		Error.captureStackTrace(error, createAuthContext);
		throw error;
	}

	setUpstreamAuthHeader(upstreamHeaders, proxyConfiguration.upstreamAuthHeader, proxyConfiguration.upstreamApiKey);
	return { upstreamHeaders };
}

function getBearerToken(request: Request): string | undefined {
	const authorization = request.headers.get("authorization");
	if (authorization === null || authorization.length === 0) return undefined;

	const trimmedAuthorization = authorization.trim();
	if (!trimmedAuthorization.toLowerCase().startsWith(BEARER_PREFIX)) return undefined;

	const token = trimmedAuthorization.slice(BEARER_PREFIX.length).trim();
	return token.length === 0 ? undefined : token;
}

function setUpstreamAuthHeader(headers: Headers, headerName: string, token: string): void {
	if (headerName.toLowerCase() === "authorization") {
		headers.set(headerName, `Bearer ${token}`);
		return;
	}

	headers.set(headerName, token);
}

function hasSameToken(clientBearerToken: string, expectedToken: string): boolean {
	const clientHash = crypto.subtle.digestSync("SHA-256", textEncoder.encode(clientBearerToken));
	const expectedHash = crypto.subtle.digestSync("SHA-256", textEncoder.encode(expectedToken));
	return timingSafeEqual(clientHash, expectedHash);
}
