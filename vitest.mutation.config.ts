import { defineConfig, mergeConfig } from "vitest/config";

import baseConfiguration from "./vitest.config.ts";

export default mergeConfig(
	baseConfiguration,
	defineConfig({
		test: {
			coverage: {
				enabled: false,
			},
			typecheck: {
				enabled: false,
			},
		},
	}),
);
