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
			include: ["src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "html", "text-summary"],
			reportOnFailure: false,
			thresholds: {
				branches: 95,
				functions: 95,
				lines: 95,
				statements: 95,
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
			enabled: false,
			include: ["tests/**/*.test-d.ts"],
			tsconfig: "./tests/tsconfig.json",
		},
	},
});

export default configuration;
