import { type } from "arktype";
import prettyBytes from "pretty-bytes";
import prettyMilliseconds from "pretty-ms";

const isOhaSummary = type({
	average: "number",
	fastest: "number",
	requestsPerSec: "number",
	sizePerRequest: "number",
	sizePerSec: "number",
	slowest: "number",
	successRate: "number",
	total: "number",
	totalData: "number",
}).readonly();

const isOhaResult = type({
	"errorDistribution?": type("Record<string, number>").readonly(),
	latencyPercentiles: type("Record<string, number>").readonly(),
	"statusCodeDistribution?": type("Record<string, number>").readonly(),
	summary: isOhaSummary,
}).readonly();

const isEndpointSummary = type({
	averageMs: "number",
	endpoint: "string",
	errorCount: "number",
	p50Ms: "number",
	p95Ms: "number",
	p99Ms: "number",
	requestsPerSec: "number",
	successCount: "number",
	successRatePct: "number",
	totalDataBytes: "number",
}).readonly();
type EndpointSummary = typeof isEndpointSummary.infer;

const isBenchmarkSummary = type({
	concurrency: "number",
	duration: "string",
	endpoints: isEndpointSummary.array().readonly(),
	generatedAt: "string",
	label: "string",
	warmupRequests: "number",
}).readonly();
type BenchmarkSummary = typeof isBenchmarkSummary.infer;

const [resultDirectory, label, duration, concurrencyText, warmupText, previousSummaryPath = ""] = Deno.args;
if (!resultDirectory || !label || !duration || !concurrencyText || !warmupText) {
	throw new Error(
		"Usage: render-bench-report.ts <resultDir> <label> <duration> <concurrency> <warmup> [previousSummaryPath]",
	);
}

const concurrency = Number(concurrencyText);
const warmupRequests = Number(warmupText);
const endpointFiles = [
	{ endpoint: "/health", file: `${resultDirectory}/raw/health.json` },
	{ endpoint: "/v1/models", file: `${resultDirectory}/raw/models.json` },
	{ endpoint: "/v1/chat/completions", file: `${resultDirectory}/raw/chat.json` },
] as const;

const currentSummary: BenchmarkSummary = {
	concurrency,
	duration,
	endpoints: await Promise.all(
		endpointFiles.map(async ({ endpoint, file }) => summarizeEndpointAsync(endpoint, file)),
	),
	generatedAt: new Date().toISOString(),
	label,
	warmupRequests,
};

const previousSummary = previousSummaryPath ? await readSummaryIfExistsAsync(previousSummaryPath) : undefined;

const summaryPath = `${resultDirectory}/summary.json`;
const reportPath = `${resultDirectory}/report.md`;

await Deno.writeTextFile(summaryPath, `${JSON.stringify(currentSummary, undefined, 2)}\n`);
await Deno.writeTextFile(reportPath, createMarkdownReport(currentSummary, previousSummary));

printHeader(currentSummary, resultDirectory);
printOverviewTable(currentSummary);
if (previousSummary) printComparisonTable(currentSummary, previousSummary);
printFooter(summaryPath, reportPath, previousSummaryPath);

async function summarizeEndpointAsync(endpoint: string, path: string): Promise<EndpointSummary> {
	const result = isOhaResult.assert(JSON.parse(await Deno.readTextFile(path)));
	const successCount = sumRecordValues(result.statusCodeDistribution);
	const errorCount = sumRecordValues(result.errorDistribution);

	return {
		averageMs: toMilliseconds(result.summary.average),
		endpoint,
		errorCount,
		p50Ms: toMilliseconds(result.latencyPercentiles.p50 ?? 0),
		p95Ms: toMilliseconds(result.latencyPercentiles.p95 ?? 0),
		p99Ms: toMilliseconds(result.latencyPercentiles.p99 ?? 0),
		requestsPerSec: result.summary.requestsPerSec,
		successCount,
		successRatePct: result.summary.successRate * 100,
		totalDataBytes: result.summary.totalData,
	};
}

async function readSummaryIfExistsAsync(path: string): Promise<BenchmarkSummary | undefined> {
	try {
		return isBenchmarkSummary.assert(JSON.parse(await Deno.readTextFile(path)));
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

function createMarkdownReport(current: BenchmarkSummary, previous?: BenchmarkSummary): string {
	const lines = [
		`# HTTP benchmark report: ${current.label}`,
		"",
		`- Generated at: ${current.generatedAt}`,
		`- Duration: ${current.duration}`,
		`- Concurrency: ${current.concurrency}`,
		`- Warmup requests: ${current.warmupRequests}`,
		"",
		"## Current run",
		"",
		"| Endpoint | Req/s | Avg | P50 | P95 | P99 | Success | Errors | Data |",
		"| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
	];

	for (const endpoint of current.endpoints) {
		lines.push(
			`| ${endpoint.endpoint} | ${formatNumber(endpoint.requestsPerSec)} | ${
				prettyMilliseconds(
					endpoint.averageMs,
				)
			} | ${prettyMilliseconds(endpoint.p50Ms)} | ${prettyMilliseconds(endpoint.p95Ms)} | ${
				prettyMilliseconds(
					endpoint.p99Ms,
				)
			} | ${formatPercent(endpoint.successRatePct)} | ${endpoint.errorCount} | ${
				prettyBytes(
					endpoint.totalDataBytes,
				)
			} |`,
		);
	}

	if (previous) {
		lines.push("", "## Comparison vs previous snapshot", "");
		lines.push("| Endpoint | Req/s Δ | Avg Δ | P95 Δ | Verdict |", "| --- | ---: | ---: | ---: | --- |");
		for (const endpoint of current.endpoints) {
			const baseline = previous.endpoints.find((value) => value.endpoint === endpoint.endpoint);
			if (!baseline) continue;
			lines.push(
				`| ${endpoint.endpoint} | ${
					formatDelta(
						getPercentChange(baseline.requestsPerSec, endpoint.requestsPerSec),
					)
				} | ${formatDelta(getPercentChange(baseline.averageMs, endpoint.averageMs))} | ${
					formatDelta(
						getPercentChange(baseline.p95Ms, endpoint.p95Ms),
					)
				} | ${getVerdict(baseline, endpoint)} |`,
			);
		}
	}

	return `${lines.join("\n")}\n`;
}

function printHeader(summary: BenchmarkSummary, directory: string): void {
	console.log(`\nHTTP benchmark report — ${summary.label}`);
	console.log("=".repeat(72));
	console.log(
		`Duration: ${summary.duration}    Concurrency: ${summary.concurrency}    Warmup: ${summary.warmupRequests}`,
	);
	console.log(`Snapshot: ${directory}`);
}

function printOverviewTable(summary: BenchmarkSummary): void {
	const rows = [
		["Endpoint", "Req/s", "Avg", "P50", "P95", "P99", "Success", "Errors", "Data"],
		...summary.endpoints.map((endpoint) => [
			endpoint.endpoint,
			formatNumber(endpoint.requestsPerSec),
			prettyMilliseconds(endpoint.averageMs),
			prettyMilliseconds(endpoint.p50Ms),
			prettyMilliseconds(endpoint.p95Ms),
			prettyMilliseconds(endpoint.p99Ms),
			formatPercent(endpoint.successRatePct),
			String(endpoint.errorCount),
			prettyBytes(endpoint.totalDataBytes),
		]),
	];

	console.log("\nCurrent run");
	printTable(rows);
}

function printComparisonTable(current: BenchmarkSummary, previous: BenchmarkSummary): void {
	const rows = [["Endpoint", "Req/s Δ", "Avg Δ", "P95 Δ", "Verdict"]];

	for (const endpoint of current.endpoints) {
		const baseline = previous.endpoints.find((value) => value.endpoint === endpoint.endpoint);
		if (!baseline) continue;
		rows.push([
			endpoint.endpoint,
			colorizeDelta(getPercentChange(baseline.requestsPerSec, endpoint.requestsPerSec), true),
			colorizeDelta(getPercentChange(baseline.averageMs, endpoint.averageMs), false),
			colorizeDelta(getPercentChange(baseline.p95Ms, endpoint.p95Ms), false),
			getVerdict(baseline, endpoint),
		]);
	}

	console.log("\nComparison vs previous snapshot");
	printTable(rows, true);
}

function printFooter(summaryFilePath: string, reportFilePath: string, previousSummaryFilePath: string): void {
	console.log("\nArtifacts");
	console.log(`- Summary JSON: ${summaryFilePath}`);
	console.log(`- Markdown report: ${reportFilePath}`);
	if (previousSummaryFilePath) console.log(`- Compared against: ${previousSummaryFilePath}`);
}

function printTable(rows: ReadonlyArray<ReadonlyArray<string>>, containsAnsi = false): void {
	const widths = rows[0]!.map((_, columnIndex) =>
		Math.max(...rows.map((row) => visibleLength(row[columnIndex] ?? "")))
	);
	const divider = widths.map((width) => "-".repeat(width)).join("-+-");

	let rowIndex = 0;
	for (const row of rows) {
		const lineBuilder = new Array<string>(row.length);
		for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
			lineBuilder[columnIndex] = padCell(
				row[columnIndex]!,
				widths[columnIndex]!,
				columnIndex === 0 || (containsAnsi && rowIndex > 0) ? "left" : "right",
			);
		}

		const line = lineBuilder.join(" | ");
		console.log(line);
		if (rowIndex === 0) console.log(divider);
		rowIndex += 1;
	}
}

function padCell(value: string, width: number, side: "left" | "right"): string {
	const cellWidth = visibleLength(value);
	const padding = " ".repeat(Math.max(0, width - cellWidth));
	return side === "left" ? `${value}${padding}` : `${padding}${value}`;
}

const GIGA_COAL = /\u001B\[[0-9;]*m/gu;

function visibleLength(value: string): number {
	return value.replaceAll(GIGA_COAL, "").length;
}

function sumRecordValues(record: Record<string, number> | undefined): number {
	if (!record) return 0;
	return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function toMilliseconds(seconds: number): number {
	return seconds * 1000;
}

function formatNumber(value: number): string {
	return Intl.NumberFormat("en-US", { maximumFractionDigits: value >= 1000 ? 0 : 1 }).format(value);
}

function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`;
}

function getPercentChange(previous: number, current: number): number {
	if (previous === 0) return 0;
	return ((current - previous) / previous) * 100;
}

function formatDelta(value: number): string {
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(1)}%`;
}

function colorizeDelta(value: number, higherIsBetter: boolean): string {
	const good = higherIsBetter ? value >= 0 : value <= 0;
	const color = good ? "\u001B[32m" : "\u001B[31m";
	return `${color}${formatDelta(value)}\u001B[0m`;
}

function getVerdict(previous: EndpointSummary, current: EndpointSummary): string {
	const rpsDelta = getPercentChange(previous.requestsPerSec, current.requestsPerSec);
	const avgDelta = getPercentChange(previous.averageMs, current.averageMs);
	const p95Delta = getPercentChange(previous.p95Ms, current.p95Ms);
	const score = Number(rpsDelta > 0) + Number(avgDelta < 0) + Number(p95Delta < 0);
	if (score >= 2) return "better";
	if (score === 1) return "mixed";
	return "worse";
}
