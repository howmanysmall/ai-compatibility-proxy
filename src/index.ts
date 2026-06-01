import { createApp } from "./proxy/app.ts";
import { loadConfig } from "./proxy/config.ts";

if (import.meta.main) {
	const config = loadConfig();

	Deno.serve(
		{
			port: config.port,
		},
		createApp({ config }),
	);
}

export { createApp } from "./proxy/app.ts";
export { loadConfig } from "./proxy/config.ts";
