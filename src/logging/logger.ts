import { mkdirSync } from "node:fs";
import nodeProcess from "node:process";

import { createDailyFileRotateReporter } from "./reports/daily-file-rotate-reporter";

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
		colors: nodeProcess.stdout.isTTY,
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
	/* v8 ignore next -- undefined application log path only occurs if startup path import is denied. */
	if (applicationLogPath === undefined) return false;

	try {
		mkdirSync(applicationLogPath, { recursive: true });
		return true;
		/* v8 ignore start -- filesystem permission failures are deployment/platform defensive paths. */
	} catch (error) {
		if (isPermissionDeniedError(error)) return false;
		throw error;
	}
	/* v8 ignore stop */
}

function createFileReporters(shouldUseFileReporters: boolean): Array<ConsolaReporter> {
	/* v8 ignore next -- false branch is determined at module initialization from platform log directory availability. */
	if (!shouldUseFileReporters || applicationLogPath === undefined) return [];

	return [
		createDailyFileRotateReporter({
			directory: applicationLogPath,
			filename: "error.log",
			levelFilter: (level: number) => level <= 1,
		}),
		createDailyFileRotateReporter({
			directory: applicationLogPath,
			filename: "combined.log",
		}),
	];
}

async function getApplicationLogPathAsync(): Promise<string | undefined> {
	try {
		const { applicationPaths } = await import("$constants/application-paths.ts");
		return applicationPaths.log;
		/* v8 ignore start -- dynamic import permission failures are startup defensive paths. */
	} catch (error) {
		if (isPermissionDeniedError(error)) return undefined;
		throw error;
	}
	/* v8 ignore stop */
}

/* v8 ignore next -- exercised only by platform/import failure branches ignored above. */
function isPermissionDeniedError(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error.code === "EACCES" || error.code === "EPERM");
}

function createContextualLogger(context: LogContext): ContextualLogger {
	return {
		error: (message: string, properties = {}) => baseLogger.error({ ...properties, context, message }),
		info: (message: string, properties = {}) => baseLogger.info({ ...properties, context, message }),
	};
}

export const logger: StructuredLogger = Object.assign(baseLogger, {
	withContext: createContextualLogger,
});
