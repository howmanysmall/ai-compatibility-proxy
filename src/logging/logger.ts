import { applicationPaths } from "@constants/application-paths.ts";
import { createConsola } from "consola";

import { createDailyFileRotateReporter } from "./reports/daily-file-rotate-reporter.ts";

const errorReporter = createDailyFileRotateReporter({
	directory: applicationPaths.log,
	filename: "error.log",
	levelFilter: (level) => level <= 1,
});

const combinedReporter = createDailyFileRotateReporter({
	directory: applicationPaths.log,
	filename: "combined.log",
});

export const logger = createConsola({
	formatOptions: {
		colors: Deno.stdout.isTerminal(),
		compact: false,
		date: true,
		errorLevel: 10,
	},
	throttle: 25,
	throttleMin: 1000,
})
	.addReporter(errorReporter)
	.addReporter(combinedReporter);
