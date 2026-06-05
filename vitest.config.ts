import { availableParallelism } from "node:os";
import { argv } from "node:process";
import { defineConfig } from "vitest/config";

const isFocusedRun = argv.slice(2).some((argument) => argument.endsWith(".test.ts") || argument.startsWith("tests/"));

const cpuCount = availableParallelism();
const workerCount = Math.max(2, Math.min(cpuCount - 1, 12));

const configuration = defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		bail: 1,
		coverage: {
			clean: true,
			cleanOnRerun: false,
			enabled: !isFocusedRun,
			exclude: ["src/**/*.d.ts", "src/index.ts", "src/providers/provider-target.ts", "src/types/**/*.ts"],
			include: ["src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "html", "text-summary"],
			reportOnFailure: false,
			thresholds: {
				branches: 83,
				functions: 95,
				lines: 93,
				statements: 90,
			},
		},
		environment: "node",
		fileParallelism: true,
		globals: true,
		include: ["tests/**/*.test.ts"],
		isolate: false,
		maxConcurrency: 64,
		maxWorkers: workerCount,
		pool: "forks",
		testTimeout: 30_000,
		typecheck: {
			checker: "tsgo",
			enabled: true,
			include: ["tests/**/*.test.ts", "tests/**/*.test-d.ts"],
			tsconfig: "./tests/tsconfig.json",
		},
	},
});

export default configuration;
