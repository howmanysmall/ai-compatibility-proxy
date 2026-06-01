import { getNumber } from "@utilities/default-utilities.ts";
import { Predicate } from "effect";

import { fetchUpstreamGetAsync } from "./upstream.ts";

import type { ProxyConfiguration } from "./config.ts";
import type { OpenAiModel, OpenAiModelListResponse } from "./openai-types.ts";
import type { Fetcher } from "./upstream.ts";

export async function getModelsAsync(
	fetcher: Fetcher,
	headers: Headers,
	proxyConfiguration: ProxyConfiguration,
): Promise<OpenAiModelListResponse> {
	const response = await fetchUpstreamGetAsync(
		fetcher,
		`${proxyConfiguration.upstreamBaseUrl}/models`,
		headers,
		proxyConfiguration,
	);
	const body = await response.json();

	if (Predicate.isRecord(body) && Array.isArray(body.data)) {
		return {
			data: body.data.flatMap((model) => normalizeModel(model, proxyConfiguration)),
			object: "list",
		};
	}

	return {
		data: [
			{
				created: 0,
				id: proxyConfiguration.defaultModel,
				object: "model",
				owned_by: getOwnedBy(proxyConfiguration),
			},
		],
		object: "list",
	};
}

function normalizeModel(value: unknown, proxyConfiguration: ProxyConfiguration): Array<OpenAiModel> {
	if (typeof value === "string") {
		return [
			{
				created: 0,
				id: value,
				object: "model",
				owned_by: getOwnedBy(proxyConfiguration),
			},
		];
	}

	if (!Predicate.isRecord(value)) return [];

	const { id } = value;
	if (typeof id !== "string") return [];

	return [
		{
			created: getNumber(value.created),
			id,
			object: "model",
			owned_by: typeof value.owned_by === "string" ? value.owned_by : getOwnedBy(proxyConfiguration),
		},
	];
}

function getOwnedBy(proxyConfiguration: ProxyConfiguration): string {
	return proxyConfiguration.upstreamProtocol === "cerebras_openai" ? "cerebras" : "anthropic-compatible-upstream";
}
