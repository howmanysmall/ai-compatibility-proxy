import { vitiatePlugin } from "@vitiate/core";
import { defineConfig, mergeConfig } from "vitest/config";

import baseConfiguration from "./vitest.config.ts";

export default mergeConfig(
	baseConfiguration,
	defineConfig({
		plugins: [vitiatePlugin()],
		test: {
			coverage: {
				enabled: false,
			},
			include: ["tests/**/*.fuzz.ts"],
			typecheck: {
				enabled: false,
			},
		},
	}),
);
