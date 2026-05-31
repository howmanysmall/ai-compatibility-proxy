import { textEncoder } from "@constants/constant-classes.ts";
import { normalizeLogEntry } from "@logging/log-entry.ts";
import { createStream } from "rotating-file-stream";

import type { ConsolaReporter, LogObject } from "consola";
import type { FileSize, Interval } from "rotating-file-stream";

function alwaysTrue(): boolean {
	return true;
}

async function writeFileLoggingWarningAsync(error: Error): Promise<void> {
	await Deno.stderr.write(textEncoder.encode(`[logging] ${error.message}\n`));
}

export interface DailyFileRotateReporterOptions {
	readonly directory: string;
	readonly filename: string;
	readonly interval?: Interval;
	readonly levelFilter?: (level: number) => boolean;
	readonly maxFiles?: number;
	readonly size?: FileSize;
}

export function createDailyFileRotateReporter({
	directory,
	filename,
	interval = "1d",
	levelFilter = alwaysTrue,
	maxFiles = 14,
	size = "20M",
}: DailyFileRotateReporterOptions): ConsolaReporter {
	const stream = createStream(filename, {
		compress: "gzip",
		initialRotation: true,
		interval,
		intervalBoundary: true,
		maxFiles,
		path: directory,
		size,
	});
	stream.on("error", function onFileStreamError(error): void {
		void writeFileLoggingWarningAsync(error);
	});
	stream.on("warning", function onFileStreamWarning(error): void {
		void writeFileLoggingWarningAsync(error);
	});

	return {
		log: ({ level, ...logObject }: LogObject): void => {
			if (!levelFilter(level)) return;
			const normalizedEntry = normalizeLogEntry({ ...logObject, level });
			stream.write(`${JSON.stringify(normalizedEntry)}\n`);
		},
	};
}
