import { fetchUpstreamGetAsync } from "./upstream.ts";

import type { ProxyConfig } from "./config.ts";
import type { OpenAIModel, OpenAIModelListResponse } from "./openai-types.ts";
import type { Fetcher } from "./upstream.ts";

export async function getModelsAsync(
	fetcher: Fetcher,
	headers: Headers,
	config: ProxyConfig,
): Promise<OpenAIModelListResponse> {
	const response = await fetchUpstreamGetAsync(fetcher, `${config.upstreamBaseUrl}/models`, headers, config);
	const body: unknown = await response.json();

	if (isRecord(body) && Array.isArray(body["data"])) {
		return {
			data: body["data"].flatMap((model) => normalizeModel(model, config)),
			object: "list",
		};
	}

	return {
		data: [
			{
				created: 0,
				id: config.defaultModel,
				object: "model",
				owned_by: getOwnedBy(config),
			},
		],
		object: "list",
	};
}

function normalizeModel(value: unknown, config: ProxyConfig): Array<OpenAIModel> {
	if (typeof value === "string") {
		return [
			{
				created: 0,
				id: value,
				object: "model",
				owned_by: getOwnedBy(config),
			},
		];
	}

	if (!isRecord(value)) return [];

	const model = value;
	const { id } = model;
	if (typeof id !== "string") return [];

	return [
		{
			created: typeof model["created"] === "number" ? model["created"] : 0,
			id,
			object: "model",
			owned_by: typeof model["owned_by"] === "string" ? model["owned_by"] : getOwnedBy(config),
		},
	];
}

function getOwnedBy(config: ProxyConfig): string {
	return config.upstreamProtocol === "cerebras_openai" ? "cerebras" : "anthropic-compatible-upstream";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && Boolean(value) && !Array.isArray(value);
}
