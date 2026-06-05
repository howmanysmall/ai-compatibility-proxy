import { logger, parseLevel } from "@logging/logger";

import { createFetchHandler } from "./proxy/app";
import { loadConfiguration } from "./proxy/config.ts";

if (import.meta.main) {
	const config = loadConfiguration();
	logger.level = parseLevel(config.logLevel);

	Bun.serve({
		fetch: createFetchHandler({ proxyConfiguration: config }),
		port: config.port,
	});
}

export { createApp, createFetchHandler } from "./proxy/app.ts";
export { loadConfiguration as loadConfig } from "./proxy/config.ts";
