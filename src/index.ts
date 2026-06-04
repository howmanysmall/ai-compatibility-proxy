import { logger, parseLevel } from "@logging/logger.ts";

import { createApp } from "./proxy/app.ts";
import { loadConfiguration } from "./proxy/config.ts";

if (import.meta.main) {
	const config = loadConfiguration();
	logger.level = parseLevel(config.logLevel);

	Deno.serve(
		{
			port: config.port,
		},
		createApp({ proxyConfiguration: config }).fetch,
	);
}

export { createApp } from "./proxy/app.ts";
export { loadConfiguration as loadConfig } from "./proxy/config.ts";
