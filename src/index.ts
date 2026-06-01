import { logger, parseLevel } from "@logging/logger.ts";

import { createApp } from "./proxy/app.ts";
import { loadConfig } from "./proxy/config.ts";

if (import.meta.main) {
	const config = loadConfig();
	logger.level = parseLevel(config.logLevel);

	Deno.serve(
		{
			port: config.port,
		},
		createApp({ config }),
	);
}

export { createApp } from "./proxy/app.ts";
export { loadConfig } from "./proxy/config.ts";
