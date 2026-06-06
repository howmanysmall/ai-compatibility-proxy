import type { ProxyConfiguration } from "@proxy/config";
import type { Fetcher } from "@proxy/upstream";

export type OpenCodeRoute = "chat_completions" | "messages" | "unknown";

export interface OpenCodeRouteDecision {
	readonly model: string;
	readonly route: OpenCodeRoute;
	readonly source: "metadata" | "stale_metadata" | "unknown";
}

interface OpenCodeModelsCacheEntry {
	expiresAt: number;
	inFlight: Promise<Record<string, string>> | undefined;
	metadataByModel: Record<string, string> | undefined;
}

interface OpenCodeMetadataResult {
	readonly metadataByModel: Record<string, string>;
	readonly source: OpenCodeRouteDecision["source"];
}

let cacheByFetcher = new WeakMap<Fetcher, Map<string, OpenCodeModelsCacheEntry>>();

export async function resolveOpenCodeModelRouteAsync(
	fetcher: Fetcher,
	proxyConfiguration: ProxyConfiguration,
	model: string,
): Promise<OpenCodeRouteDecision> {
	const metadataResult = await getOpenCodeMetadataByModelAsync(fetcher, proxyConfiguration);
	if (!metadataResult) return { model, route: "unknown", source: "unknown" };

	const npm = metadataResult.metadataByModel[model];
	if (typeof npm !== "string") {
		return { model, route: "unknown", source: metadataResult.source };
	}

	return {
		model,
		route: getRouteFromNpm(npm),
		source: metadataResult.source,
	};
}

export function clearOpenCodeModelRoutingCache(): void {
	cacheByFetcher = new WeakMap();
}

async function getOpenCodeMetadataByModelAsync(
	fetcher: Fetcher,
	{ opencodeModelsCacheTtlMs, opencodeModelsFetchTimeoutMs, opencodeModelsUrl }: ProxyConfiguration,
): Promise<OpenCodeMetadataResult | undefined> {
	const cacheEntry = getCacheEntry(fetcher, opencodeModelsUrl);
	const now = Date.now();

	if (cacheEntry.metadataByModel && cacheEntry.expiresAt > now) {
		return { metadataByModel: cacheEntry.metadataByModel, source: "metadata" };
	}
	if (cacheEntry.inFlight) {
		return await getMetadataWithStaleFallbackAsync(cacheEntry.inFlight, cacheEntry.metadataByModel);
	}

	cacheEntry.inFlight = fetchOpenCodeMetadataByModelAsync(fetcher, opencodeModelsUrl, opencodeModelsFetchTimeoutMs);

	try {
		const metadataByModel = await cacheEntry.inFlight;
		cacheEntry.metadataByModel = metadataByModel;
		cacheEntry.expiresAt = now + opencodeModelsCacheTtlMs;
		return { metadataByModel, source: "metadata" };
	} catch {
		if (cacheEntry.metadataByModel) {
			return { metadataByModel: cacheEntry.metadataByModel, source: "stale_metadata" };
		}
		return undefined;
	} finally {
		cacheEntry.inFlight = undefined;
	}
}

async function getMetadataWithStaleFallbackAsync(
	inFlight: Promise<Record<string, string>>,
	staleMetadataByModel: Record<string, string> | undefined,
): Promise<OpenCodeMetadataResult | undefined> {
	try {
		const metadataByModel = await inFlight;
		return { metadataByModel, source: "metadata" };
	} catch {
		if (staleMetadataByModel) return { metadataByModel: staleMetadataByModel, source: "stale_metadata" };
		return undefined;
	}
}

function getCacheEntry(fetcher: Fetcher, opencodeModelsUrl: string): OpenCodeModelsCacheEntry {
	let cacheByUrl = cacheByFetcher.get(fetcher);
	if (!cacheByUrl) {
		cacheByUrl = new Map();
		cacheByFetcher.set(fetcher, cacheByUrl);
	}

	let cacheEntry = cacheByUrl.get(opencodeModelsUrl);
	if (!cacheEntry) {
		cacheEntry = {
			expiresAt: 0,
			inFlight: undefined,
			metadataByModel: undefined,
		};
		cacheByUrl.set(opencodeModelsUrl, cacheEntry);
	}

	return cacheEntry;
}

async function fetchOpenCodeMetadataByModelAsync(
	fetcher: Fetcher,
	opencodeModelsUrl: string,
	timeoutMs: number,
): Promise<Record<string, string>> {
	const response = await fetcher(opencodeModelsUrl, {
		headers: new Headers({ accept: "application/json" }),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) throw new Error(`Metadata request failed with HTTP ${response.status}.`);

	const body = await response.json();
	return getOpenCodeMetadataByModel(body);
}

function getOpenCodeMetadataByModel(body: unknown): Record<string, string> {
	if (!isRecord(body)) throw new Error("Metadata payload must be an object.");

	const opencodeProvider = body.opencode;
	if (!isRecord(opencodeProvider)) throw new Error("Missing opencode metadata provider.");

	const { models, npm: providerDefaultNpm } = opencodeProvider;
	const defaultNpm = getString(providerDefaultNpm);
	if (!isRecord(models)) throw new Error("Missing opencode models metadata.");

	const metadataByModel: Record<string, string> = {};
	for (const [model, metadata] of Object.entries(models)) {
		if (!isRecord(metadata)) continue;
		const provider = isRecord(metadata.provider) ? metadata.provider : undefined;
		const providerNpm = provider ? getString(provider.npm) : undefined;
		const resolvedNpm = providerNpm ?? defaultNpm;
		if (typeof resolvedNpm === "string") metadataByModel[model] = resolvedNpm;
	}

	return metadataByModel;
}

function getRouteFromNpm(npm: string): OpenCodeRoute {
	return npm.includes("anthropic") ? "messages" : "chat_completions";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
