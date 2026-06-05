import { getNumber } from "@utilities/default-utilities";
import { Predicate } from "effect";

import { fetchUpstreamGetAsync } from "./upstream.ts";

import type { ProxyConfiguration } from "./config.ts";
import type { OpenAiModel, OpenAiModelListResponse } from "./openai-types.ts";
import type { Fetcher } from "./upstream.ts";

export async function getModelsAsync(
	fetcher: Fetcher,
	headers: Headers,
	proxyConfiguration: ProxyConfiguration,
	ownedBy: string,
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
			data: body.data.flatMap((model) => normalizeModel(model, ownedBy)),
			object: "list",
		};
	}

	return {
		data: [
			{
				created: 0,
				id: proxyConfiguration.defaultModel,
				object: "model",
				owned_by: ownedBy,
			},
		],
		object: "list",
	};
}

function normalizeModel(value: unknown, ownedBy: string): Array<OpenAiModel> {
	if (typeof value === "string") {
		return [
			{
				created: 0,
				id: value,
				object: "model",
				owned_by: ownedBy,
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
			owned_by: typeof value.owned_by === "string" ? value.owned_by : ownedBy,
		},
	];
}
