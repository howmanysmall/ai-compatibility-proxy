import { anthropicTarget } from "./anthropic-target.ts";
import { cerebrasTarget } from "./cerebras-target.ts";

import type { UpstreamProtocol } from "@proxy/config.ts";

import type { ProviderTarget, ProviderTargetDefaults } from "./provider-target.ts";

export function getProviderTarget(upstreamProtocol: UpstreamProtocol): ProviderTarget {
	if (upstreamProtocol === "anthropic_messages") return anthropicTarget;
	return cerebrasTarget;
}

export function getProviderTargetDefaults(upstreamProtocol: UpstreamProtocol): ProviderTargetDefaults {
	return getProviderTarget(upstreamProtocol).defaults;
}
