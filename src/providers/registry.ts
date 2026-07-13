import { anthropicTarget } from "./anthropic-target";
import { cerebrasTarget } from "./cerebras-target";

import type { UpstreamProtocol } from "$proxy/config";

import type { ProviderTarget, ProviderTargetDefaults } from "./provider-target";

export function getProviderTarget(upstreamProtocol: UpstreamProtocol): ProviderTarget {
	if (upstreamProtocol === "anthropic_messages") return anthropicTarget;
	return cerebrasTarget;
}

export function getProviderTargetDefaults(upstreamProtocol: UpstreamProtocol): ProviderTargetDefaults {
	return getProviderTarget(upstreamProtocol).defaults;
}
