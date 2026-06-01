import nodeProcess from "node:process";

import { createDailyFileRotateReporter } from "./reports/daily-file-rotate-reporter.ts";

import type { ConsolaInstance, ConsolaReporter } from "consola";

type LogContext = Readonly<Record<string, unknown>>;
type LogProperties = Readonly<Record<string, unknown>>;

interface ContextualLogger {
	readonly error: (message: string, properties?: LogProperties) => void;
	readonly info: (message: string, properties?: LogProperties) => void;
}

interface StructuredLogger extends ConsolaInstance {
	readonly withContext: (context: LogContext) => ContextualLogger;
}

const termPermission = await Deno.permissions.query({ name: "env", variable: "TERM" });
if (termPermission.state !== "granted") {
	Object.defineProperty(nodeProcess, "env", {
		configurable: true,
		value: { TERM: "dumb" },
	});
}

const { createConsola } = await import("consola");
const applicationLogPath = await getApplicationLogPathAsync();
const canUseFileReporters = ensureLogDirectory();

export function parseLevel(value: string): number {
	const normalizedValue = value.trim().toLowerCase();
	if (normalizedValue === "0" || normalizedValue === "fatal") return 0;
	if (normalizedValue === "1" || normalizedValue === "error") return 1;
	if (normalizedValue === "2" || normalizedValue === "warn") return 2;
	if (normalizedValue === "4" || normalizedValue === "debug") return 4;
	if (normalizedValue === "5" || normalizedValue === "trace") return 5;
	return 3;
}

const fileReporters = createFileReporters(canUseFileReporters);

const baseLogger: ConsolaInstance = createConsola({
	formatOptions: {
		colors: Deno.stdout.isTerminal(),
		compact: false,
		date: true,
		errorLevel: 10,
	},
	throttle: 25,
	throttleMin: 1000,
});

for (const reporter of fileReporters) {
	baseLogger.addReporter(reporter);
}

export function ensureLogDirectory(): boolean {
	if (applicationLogPath === undefined) return false;

	try {
		Deno.mkdirSync(applicationLogPath, { recursive: true });
		return true;
	} catch (error) {
		if (error instanceof Deno.errors.NotCapable) return false;
		throw error;
	}
}

function createFileReporters(shouldUseFileReporters: boolean): Array<ConsolaReporter> {
	if (!shouldUseFileReporters || applicationLogPath === undefined) return [];

	return [
		createDailyFileRotateReporter({
			directory: applicationLogPath,
			filename: "error.log",
			levelFilter: (level) => level <= 1,
		}),
		createDailyFileRotateReporter({
			directory: applicationLogPath,
			filename: "combined.log",
		}),
	];
}

async function getApplicationLogPathAsync(): Promise<string | undefined> {
	try {
		const { applicationPaths } = await import("@constants/application-paths.ts");
		return applicationPaths.log;
	} catch (error) {
		if (error instanceof Deno.errors.NotCapable) return undefined;
		throw error;
	}
}

function createContextualLogger(context: LogContext): ContextualLogger {
	return {
		error: (message, properties = {}) => baseLogger.error({ ...properties, context, message }),
		info: (message, properties = {}) => baseLogger.info({ ...properties, context, message }),
	};
}

export const logger: StructuredLogger = Object.assign(baseLogger, {
	withContext: createContextualLogger,
});
