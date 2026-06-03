import { setTimeout as delayAsync } from "node:timers/promises";
import { Command } from "@cliffy/command";
import $ from "@david/dax";
import { logger, parseLevel } from "@logging/logger.ts";
import { createApp } from "@proxy/app.ts";
import { loadConfiguration } from "@proxy/config.ts";
import { html as renderHtml, raw, tag } from "@sander/html";
import { join } from "@std/path";
import { type } from "arktype";
import { Effect } from "effect";

import type { HtmlNode } from "@sander/html";

const isOhaSummary = type({
	average: "number",
	requestsPerSec: "number",
	successRate: "number",
	totalData: "number >= 0",
}).readonly();

const isNumberRecord = type("Record<string, number>").readonly();
const isOhaResult = type({
	"errorDistribution?": isNumberRecord,
	latencyPercentiles: isNumberRecord,
	"statusCodeDistribution?": isNumberRecord,
	summary: isOhaSummary,
}).readonly();
type OhaResult = typeof isOhaResult.infer;

const isEndpointSummary = type({
	"+": "reject",
	averageMs: "number >= 0",
	endpoint: "string",
	errorCount: "number % 1 >= 0",
	p50Ms: "number >= 0",
	p95Ms: "number >= 0",
	p99Ms: "number >= 0",
	requestsPerSec: "number >= 0",
	successRatePct: "number >= 0",
	totalDataBytes: "number % 1 >= 0",
}).readonly();
type EndpointSummary = typeof isEndpointSummary.infer;

const isBenchmarkSummary = type({
	"+": "reject",
	concurrency: "number % 1 > 0",
	duration: "string",
	endpoints: isEndpointSummary.array().readonly(),
	generatedAt: "string",
	label: "string",
	warmupRequests: "number % 1 >= 0",
}).readonly();
type BenchmarkSummary = typeof isBenchmarkSummary.infer;

interface BenchmarkOptions {
	readonly concurrency: number;
	readonly duration: string;
	readonly host: string;
	readonly label: string;
	readonly mockPort: number;
	readonly payloadFile: string;
	readonly port: number;
	readonly resultsDir: string;
	readonly warmupRequests: number;
}

interface BenchmarkRawJsonByName {
	readonly chat: string;
	readonly health: string;
	readonly models: string;
}

interface BenchmarkSnapshot {
	readonly id: string;
	readonly summary: BenchmarkSummary;
}

interface BenchmarkRunResult {
	readonly baselineSummary: BenchmarkSummary | undefined;
	readonly comparisonSnapshots: ReadonlyArray<BenchmarkSnapshot>;
	readonly rawJsonByName: BenchmarkRawJsonByName;
	readonly reportHtml: string;
	readonly resultDirectory: string;
	readonly sparkline: string | undefined;
	readonly summary: BenchmarkSummary;
}

const RESULTS_LATEST_SUMMARY = "latest-summary.json";
const RESULTS_LATEST_REPORT = "latest-report.html";
const ANSI = {
	bold: "\u001B[1m",
	cyan: "\u001B[36m",
	dim: "\u001B[2m",
	green: "\u001B[32m",
	red: "\u001B[31m",
	reset: "\u001B[0m",
	yellow: "\u001B[33m",
} as const;
const ANSI_VALUES = new Set<string>(Object.values(ANSI));

await new Command()
	.name("http-bench")
	.description("Run real localhost HTTP benchmarks against the proxy using oha and save compare-ready snapshots.")
	.command(
		"run",
		new Command()
			.description("Run the benchmark suite and print a readable report.")
			.option("--duration <duration:string>", "Benchmark duration per endpoint.", { default: "10s" })
			.option("--concurrency <connections:number>", "Concurrent oha connections.", { default: 50 })
			.option("--warmup-requests <requests:number>", "Warmup POST requests before benchmarking.", { default: 5 })
			.option("--label <label:string>", "Label for this snapshot.", { default: "default" })
			.option("--host <host:string>", "Bind host for the local servers.", { default: "127.0.0.1" })
			.option("--port <port:number>", "Local port for the proxy under test. Use 0 to auto-pick a free port.", {
				default: 0,
			})
			.option(
				"--mock-port <port:number>",
				"Local port for the persistent mock upstream. Use 0 to auto-pick a free port.",
				{ default: 0 },
			)
			.option("--payload-file <file:string>", "JSON payload to post to /v1/chat/completions.", {
				default: "benchmarks/fixtures/chat-completions.json",
			})
			.option("--results-dir <dir:string>", "Directory where benchmark snapshots are saved.", {
				default: "benchmarks/results",
			})
			.action(async (options) => {
				await Effect.runPromise(
					Effect.gen(function* runBenchmarkProgram() {
						yield* Effect.promise(() => ensureDependencyAsync("oha"));
						const result = yield* Effect.promise(() => runBenchmarkAsync(options));
						yield* Effect.promise(() => persistArtifactsAsync(options, result));
						yield* Effect.sync(() => printArtifactSummary(options, result));
					}),
				);
			}),
	)
	.parse(Deno.args);

async function runBenchmarkAsync(options: BenchmarkOptions): Promise<BenchmarkRunResult> {
	logger.level = parseLevel("fatal");

	const payloadPath = join(Deno.cwd(), options.payloadFile);
	const payloadText = await Deno.readTextFile(payloadPath);
	const resultsRoot = join(Deno.cwd(), options.resultsDir);
	const resultDirectory = join(resultsRoot, `${createTimestamp()}-${sanitizeLabel(options.label)}`);
	const comparisonSnapshots = await readComparisonSnapshotsAsync(resultsRoot);
	const baselineSummary = comparisonSnapshots[0]?.summary;

	await Deno.mkdir(join(resultDirectory, "raw"), { recursive: true });

	const mockServer = Deno.serve({ hostname: options.host, port: options.mockPort }, createMockUpstreamHandler());
	const mockPort = getListeningPort(mockServer.addr, "mock upstream");
	const configuration = loadConfiguration({
		...Deno.env.toObject(),
		LOG_LEVEL: "fatal",
		OPENCODE_MODELS_URL: `http://${options.host}:${mockPort}/api.json`,
		UPSTREAM_BASE_URL: `http://${options.host}:${mockPort}/v1`,
		UPSTREAM_PROTOCOL: "anthropic_messages",
	});
	const proxyServer = Deno.serve(
		{ hostname: options.host, port: options.port },
		createApp({ proxyConfiguration: configuration }),
	);
	const proxyPort = getListeningPort(proxyServer.addr, "proxy");

	const proxyBaseUrl = `http://${options.host}:${proxyPort}`;

	try {
		await waitForHealthyAsync(`http://${options.host}:${mockPort}/api.json`);
		await waitForHealthyAsync(`${proxyBaseUrl}/health`);
		await warmProxyAsync(proxyBaseUrl, payloadText, options.warmupRequests);

		printRunHeader(options, resultDirectory, proxyPort, mockPort);

		const rawJsonByName: BenchmarkRawJsonByName = {
			chat: await runOhaAsync({
				bodyFile: payloadPath,
				concurrency: options.concurrency,
				duration: options.duration,
				headers: [
					["Authorization", "Bearer upstream-key"],
					["Content-Type", "application/json"],
				],
				method: "POST",
				name: "/v1/chat/completions",
				url: `${proxyBaseUrl}/v1/chat/completions`,
			}),
			health: await runOhaAsync({
				concurrency: options.concurrency,
				duration: options.duration,
				name: "/health",
				url: `${proxyBaseUrl}/health`,
			}),
			models: await runOhaAsync({
				concurrency: options.concurrency,
				duration: options.duration,
				headers: [["Authorization", "Bearer upstream-key"]],
				name: "/v1/models",
				url: `${proxyBaseUrl}/v1/models`,
			}),
		} as const;

		const summary = buildSummary(options, rawJsonByName);
		const sparkline = await createSparklineAsync(summary.endpoints.map((endpoint) => endpoint.requestsPerSec));
		printReadableReport(summary, baselineSummary, sparkline);
		const reportHtml = createHtmlReport(summary, comparisonSnapshots, sparkline);

		return {
			baselineSummary,
			comparisonSnapshots,
			rawJsonByName,
			reportHtml,
			resultDirectory,
			sparkline,
			summary,
		};
	} finally {
		await proxyServer.shutdown();
		await mockServer.shutdown();
	}
}

async function persistArtifactsAsync(options: BenchmarkOptions, result: BenchmarkRunResult): Promise<void> {
	const rawDirectory = join(result.resultDirectory, "raw");
	await Deno.mkdir(rawDirectory, { recursive: true });
	await Deno.writeTextFile(join(rawDirectory, "health.json"), `${result.rawJsonByName.health}\n`);
	await Deno.writeTextFile(join(rawDirectory, "models.json"), `${result.rawJsonByName.models}\n`);
	await Deno.writeTextFile(join(rawDirectory, "chat.json"), `${result.rawJsonByName.chat}\n`);

	const summaryJson = `${JSON.stringify(result.summary, undefined, 2)}\n`;
	const summaryPath = join(result.resultDirectory, "summary.json");
	const reportPath = join(result.resultDirectory, "report.html");
	await Deno.writeTextFile(summaryPath, summaryJson);
	await Deno.writeTextFile(reportPath, result.reportHtml);

	const resultsRoot = join(Deno.cwd(), options.resultsDir);
	await Deno.writeTextFile(join(resultsRoot, RESULTS_LATEST_SUMMARY), summaryJson);
	await Deno.writeTextFile(join(resultsRoot, RESULTS_LATEST_REPORT), result.reportHtml);
}

function buildSummary(options: BenchmarkOptions, rawJsonByName: BenchmarkRawJsonByName): BenchmarkSummary {
	const summary = {
		concurrency: options.concurrency,
		duration: options.duration,
		endpoints: [
			summarizeEndpoint("/health", rawJsonByName.health),
			summarizeEndpoint("/v1/models", rawJsonByName.models),
			summarizeEndpoint("/v1/chat/completions", rawJsonByName.chat),
		],
		generatedAt: new Date().toISOString(),
		label: options.label,
		warmupRequests: options.warmupRequests,
	};
	return parseBenchmarkSummary(summary, "generated benchmark summary");
}

function summarizeEndpoint(endpoint: string, rawJson: string): EndpointSummary {
	const result = parseOhaResult(JSON.parse(rawJson), `oha output for ${endpoint}`);
	return {
		averageMs: toMilliseconds(result.summary.average),
		endpoint,
		errorCount: sumValues(result.errorDistribution),
		p50Ms: toMilliseconds(result.latencyPercentiles.p50 ?? 0),
		p95Ms: toMilliseconds(result.latencyPercentiles.p95 ?? 0),
		p99Ms: toMilliseconds(result.latencyPercentiles.p99 ?? 0),
		requestsPerSec: result.summary.requestsPerSec,
		successRatePct: result.summary.successRate * 100,
		totalDataBytes: result.summary.totalData,
	};
}

function printRunHeader(options: BenchmarkOptions, resultDirectory: string, proxyPort: number, mockPort: number): void {
	console.log(`\n${ANSI.bold}${ANSI.cyan}HTTP benchmark${ANSI.reset} ${ANSI.dim}(${options.label})${ANSI.reset}`);
	console.log(
		`${ANSI.dim}Duration ${options.duration} • Concurrency ${options.concurrency} • Warmup ${options.warmupRequests}${ANSI.reset}`,
	);
	console.log(
		`${ANSI.dim}Proxy http://${options.host}:${proxyPort} • Mock http://${options.host}:${mockPort}${ANSI.reset}`,
	);
	console.log(`${ANSI.dim}Snapshot ${resultDirectory}${ANSI.reset}\n`);
}

function printReadableReport(
	current: BenchmarkSummary,
	previous: BenchmarkSummary | undefined,
	sparkline: string | undefined,
): void {
	printCurrentRunTable(current);
	if (previous) printComparisonTable(current, previous);
	if (sparkline) {
		console.log(`\n${ANSI.dim}Throughput sparkline ${sparkline}${ANSI.reset}`);
		console.log(`${ANSI.dim}/health → /v1/models → /v1/chat/completions${ANSI.reset}`);
	}
}

function printCurrentRunTable(summary: BenchmarkSummary): void {
	const maxRps = Math.max(...summary.endpoints.map((endpoint) => endpoint.requestsPerSec));
	const rows = [
		["Endpoint", "Req/s", "Avg", "P95", "P99", "Errors", "Success", "Relative throughput"],
		...summary.endpoints.map((endpoint) => [
			endpoint.endpoint,
			formatNumber(endpoint.requestsPerSec),
			formatMilliseconds(endpoint.averageMs),
			formatMilliseconds(endpoint.p95Ms),
			formatMilliseconds(endpoint.p99Ms),
			String(endpoint.errorCount),
			formatPercent(endpoint.successRatePct),
			renderBar(endpoint.requestsPerSec, maxRps, 24),
		]),
	];

	console.log(`${ANSI.bold}Current run${ANSI.reset}`);
	printAlignedTable(rows);
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
	console.log(`\n${ANSI.bold}Comparison vs latest previous snapshot${ANSI.reset}`);
	printAlignedTable(rows);
}

function getReportStyles(): string {
	return String.raw`
:root {
	color-scheme: dark;
	--bg: #0b1020;
	--panel: #111a2e;
	--panel-strong: #17233d;
	--text: #eef4ff;
	--muted: #95a3bd;
	--line: #263653;
	--green: #4ade80;
	--red: #fb7185;
	--yellow: #facc15;
	--cyan: #22d3ee;
	--violet: #a78bfa;
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: radial-gradient(circle at top left, #19335f 0, transparent 32rem), var(--bg);
	color: var(--text);
	font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
main { margin: 0 auto; max-width: 1120px; padding: 40px 24px 56px; }
header { display: grid; gap: 16px; margin-bottom: 28px; }
h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin: 0; letter-spacing: -0.05em; }
.meta { color: var(--muted); display: flex; flex-wrap: wrap; gap: 10px; }
.pill {
	background: rgb(255 255 255 / 0.07);
	border: 1px solid var(--line);
	border-radius: 999px;
	padding: 6px 10px;
}
.comparison-header {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	justify-content: space-between;
	padding: 18px 20px 8px;
}
.comparison-header h2 { margin: 0; padding: 0; }
.baseline-control {
	align-items: center;
	color: var(--muted);
	display: flex;
	gap: 8px;
}
select {
	background: var(--panel-strong);
	border: 1px solid var(--line);
	border-radius: 12px;
	color: var(--text);
	font: inherit;
	min-width: min(28rem, 80vw);
	padding: 8px 10px;
}
#baseline-details { margin: 0; padding: 0 20px 18px; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.chart-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); margin: 18px 0; }
.card, .section {
	background: linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.03));
	border: 1px solid var(--line);
	border-radius: 20px;
	box-shadow: 0 18px 60px rgb(0 0 0 / 0.28);
}
.card { padding: 18px; }
.chart-card { padding: 18px 18px 12px; }
.chart-card canvas { height: 300px !important; width: 100% !important; }
.endpoint { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.rps { font-size: 2.25rem; font-weight: 800; letter-spacing: -0.04em; margin: 6px 0; }
.label { color: var(--muted); font-size: 0.78rem; letter-spacing: 0.09em; text-transform: uppercase; }
.bar { background: #0a1020; border-radius: 999px; height: 12px; margin: 14px 0; overflow: hidden; }
.fill { background: linear-gradient(90deg, var(--cyan), var(--violet)); border-radius: inherit; height: 100%; }
.stats { display: grid; gap: 8px; grid-template-columns: repeat(2, 1fr); margin-top: 14px; }
.stat { background: rgb(0 0 0 / 0.18); border-radius: 14px; padding: 10px; }
.stat strong { display: block; font-size: 1.08rem; }
.section { margin-top: 18px; overflow: hidden; }
.chart-card h2 { margin: 0 0 14px; }
table { border-collapse: collapse; width: 100%; }
th, td { border-top: 1px solid var(--line); padding: 12px 20px; text-align: right; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-size: 0.78rem; letter-spacing: 0.09em; text-transform: uppercase; }
.good, .better { color: var(--green); }
.bad, .worse { color: var(--red); }
.mixed { color: var(--yellow); }
.muted { color: var(--muted); }
footer { color: var(--muted); margin-top: 24px; }
`;
}

function createHtmlReport(
	current: BenchmarkSummary,
	comparisonSnapshots: ReadonlyArray<BenchmarkSnapshot>,
	_sparkline: string | undefined,
): string {
	const maxRequestsPerSecond = Math.max(...current.endpoints.map((endpoint) => endpoint.requestsPerSec));
	const chartData = serializeReportChartData(current, comparisonSnapshots);
	return renderHtml(
		tag("html", { lang: "en" }, [
			tag("head", [
				tag("meta", { charset: "utf8" }),
				tag("meta", { content: "width=device-width, initial-scale=1", name: "viewport" }),
				tag("title", `HTTP benchmark: ${current.label}`),
				tag("style", raw(getReportStyles())),
			]),
			tag("body", [
				tag("main", [
					createReportHeader(current),
					createChartsSection(),
					createHtmlComparisonSection(comparisonSnapshots.length > 0),
					tag(
						"section",
						{ "aria-label": "Endpoint throughput cards", class: "grid" },
						current.endpoints.map((endpoint) => createEndpointCard(endpoint, maxRequestsPerSecond)),
					),
					tag(
						"footer",
						"Raw oha JSON and summary JSON are saved next to this report. Charts load via Chart.js CDN.",
					),
				]),
				tag("script", { src: "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js" }),
				tag("script", raw(createReportScript(chartData))),
			]),
		]),
		{ doctype: "html" },
	);
}

function createReportHeader(summary: BenchmarkSummary): HtmlNode {
	return tag("header", [
		tag("div", { class: "label" }, "HTTP benchmark"),
		tag("h1", summary.label),
		tag("div", { class: "meta" }, [
			tag("span", { class: "pill" }, `Generated ${summary.generatedAt}`),
			tag("span", { class: "pill" }, `Duration ${summary.duration}`),
			tag("span", { class: "pill" }, `Concurrency ${summary.concurrency}`),
			tag("span", { class: "pill" }, `Warmup ${summary.warmupRequests}`),
		]),
	]);
}

function createChartsSection(): HtmlNode {
	return tag("section", { "aria-label": "Charts", class: "chart-grid" }, [
		createChartCard("Throughput", "throughput-chart", "Requests per second by endpoint"),
		createChartCard("Latency", "latency-chart", "Latency percentiles by endpoint"),
		createChartCard("Success rate", "success-chart", "Success rate by endpoint"),
		createChartCard("Delta vs selected baseline", "delta-chart", "Percent change versus selected baseline"),
	]);
}

function createChartCard(title: string, canvasId: string, ariaLabel: string): HtmlNode {
	return tag("article", { class: "card chart-card" }, [
		tag("h2", title),
		tag("canvas", { "aria-label": ariaLabel, id: canvasId }),
	]);
}

function createEndpointCard(endpoint: EndpointSummary, maxRequestsPerSecond: number): HtmlNode {
	const width = maxRequestsPerSecond > 0 ? Math.max(1, (endpoint.requestsPerSec / maxRequestsPerSecond) * 100) : 0;
	return tag("article", { class: "card" }, [
		tag("div", { class: "endpoint" }, endpoint.endpoint),
		tag("div", { class: "rps" }, formatNumber(endpoint.requestsPerSec)),
		tag("div", { class: "label" }, "requests/sec"),
		tag(
			"div",
			{ "aria-label": "Relative throughput", class: "bar" },
			tag("div", { class: "fill", style: `width: ${width.toFixed(2)}%` }),
		),
		tag("div", { class: "stats" }, [
			createEndpointStat("Avg", formatMilliseconds(endpoint.averageMs)),
			createEndpointStat("P95", formatMilliseconds(endpoint.p95Ms)),
			createEndpointStat("P99", formatMilliseconds(endpoint.p99Ms)),
			createEndpointStat("Success", formatPercent(endpoint.successRatePct)),
		]),
	]);
}

function createEndpointStat(label: string, value: string): HtmlNode {
	return tag("div", { class: "stat" }, [tag("span", { class: "label" }, label), tag("strong", value)]);
}

function createHtmlComparisonSection(hasBaseline: boolean): HtmlNode {
	return tag("section", { "aria-label": "Comparison with selected baseline", class: "section" }, [
		tag("div", { class: "comparison-header" }, [
			tag("h2", "Comparison"),
			tag("label", { class: "baseline-control" }, [
				"Baseline",
				tag("select", { disabled: !hasBaseline, id: "baseline-select" }),
			]),
		]),
		tag(
			"p",
			{ class: "muted", id: "baseline-details" },
			hasBaseline
				? "Select a baseline to update the charts and table."
				: "No saved baseline yet. Run another benchmark to compare.",
		),
		tag("table", [
			tag(
				"thead",
				tag("tr", [
					tag("th", "Endpoint"),
					tag("th", "Req/s Δ"),
					tag("th", "Avg Δ"),
					tag("th", "P95 Δ"),
					tag("th", "Verdict"),
				]),
			),
			tag("tbody", { id: "comparison-body" }),
		]),
	]);
}

function serializeReportChartData(
	current: BenchmarkSummary,
	comparisonSnapshots: ReadonlyArray<BenchmarkSnapshot>,
): string {
	return JSON.stringify({
		baselines: comparisonSnapshots,
		current,
	}).replaceAll("<", String.raw`\u003c`);
}

function createReportScript(chartData: string): string {
	return String.raw`
const reportData = ${chartData};
const chartTextColor = "#eef4ff";
const chartGridColor = "rgba(149, 163, 189, 0.18)";
const chartLabelColor = "#95a3bd";
const currentSummary = reportData.current;
const baselineSelect = document.getElementById("baseline-select");
const baselineDetails = document.getElementById("baseline-details");
const comparisonBody = document.getElementById("comparison-body");
const endpointLabels = currentSummary.endpoints.map((endpoint) => endpoint.endpoint);

Chart.defaults.color = chartTextColor;
Chart.defaults.borderColor = chartGridColor;
Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const commonScales = {
	x: { ticks: { color: chartLabelColor }, grid: { color: chartGridColor } },
	y: { ticks: { color: chartLabelColor }, grid: { color: chartGridColor } },
};
const currentThroughputColors = ["#22d3ee", "#60a5fa", "#a78bfa"];

function endpointValue(summary, endpointName, key) {
	return summary.endpoints.find((endpoint) => endpoint.endpoint === endpointName)?.[key] ?? 0;
}

function valuesFor(summary, key) {
	return endpointLabels.map((endpointName) => endpointValue(summary, endpointName, key));
}

function percentChange(previous, current) {
	return previous === 0 ? 0 : ((current - previous) / previous) * 100;
}

function formatDelta(value) {
	return (value > 0 ? "+" : "") + value.toFixed(1) + "%";
}

function deltaClass(value, higherIsBetter) {
	const isGood = higherIsBetter ? value >= 0 : value <= 0;
	return isGood ? "good" : "bad";
}

function selectedBaseline() {
	return reportData.baselines.find((baseline) => baseline.id === baselineSelect.value);
}

function baselineLabel(baseline) {
	return baseline.summary.label + " • " + new Date(baseline.summary.generatedAt).toLocaleString() + " • " + baseline.id;
}

function populateBaselineSelect() {
	if (reportData.baselines.length === 0) {
		const option = document.createElement("option");
		option.textContent = "No saved baselines yet";
		baselineSelect.append(option);
		baselineSelect.disabled = true;
		return;
	}
	for (const baseline of reportData.baselines) {
		const option = document.createElement("option");
		option.value = baseline.id;
		option.textContent = baselineLabel(baseline);
		baselineSelect.append(option);
	}
}

function throughputDatasets(baseline) {
	const datasets = [{
		backgroundColor: currentThroughputColors,
		borderRadius: 10,
		data: valuesFor(currentSummary, "requestsPerSec"),
		label: "Current req/s",
	}];
	if (baseline) {
		datasets.push({
			backgroundColor: "rgba(149, 163, 189, 0.45)",
			borderRadius: 10,
			data: valuesFor(baseline.summary, "requestsPerSec"),
			label: "Baseline req/s",
		});
	}
	return datasets;
}

function deltaDatasets(baseline) {
	if (!baseline) return [];
	return [
		{
			backgroundColor: "#22d3ee",
			borderRadius: 8,
			data: endpointLabels.map((endpointName) => percentChange(
				endpointValue(baseline.summary, endpointName, "requestsPerSec"),
				endpointValue(currentSummary, endpointName, "requestsPerSec"),
			)),
			label: "Req/s Δ %",
		},
		{
			backgroundColor: "#fb7185",
			borderRadius: 8,
			data: endpointLabels.map((endpointName) => percentChange(
				endpointValue(baseline.summary, endpointName, "averageMs"),
				endpointValue(currentSummary, endpointName, "averageMs"),
			)),
			label: "Avg Δ %",
		},
		{
			backgroundColor: "#facc15",
			borderRadius: 8,
			data: endpointLabels.map((endpointName) => percentChange(
				endpointValue(baseline.summary, endpointName, "p95Ms"),
				endpointValue(currentSummary, endpointName, "p95Ms"),
			)),
			label: "P95 Δ %",
		},
	];
}

function verdictFor(baselineEndpoint, currentEndpoint) {
	const rpsWon = percentChange(baselineEndpoint.requestsPerSec, currentEndpoint.requestsPerSec) > 0;
	const avgWon = percentChange(baselineEndpoint.averageMs, currentEndpoint.averageMs) < 0;
	const p95Won = percentChange(baselineEndpoint.p95Ms, currentEndpoint.p95Ms) < 0;
	const score = Number(rpsWon) + Number(avgWon) + Number(p95Won);
	if (score >= 2) return "better";
	if (score === 1) return "mixed";
	return "worse";
}

function appendCell(row, text, className) {
	const cell = document.createElement("td");
	cell.textContent = text;
	if (className) cell.className = className;
	row.append(cell);
}

function renderComparisonTable(baseline) {
	comparisonBody.innerHTML = "";
	if (!baseline) {
		const row = document.createElement("tr");
		const cell = document.createElement("td");
		cell.colSpan = 5;
		cell.className = "muted";
		cell.textContent = "No saved baseline yet. Run another benchmark to compare.";
		row.append(cell);
		comparisonBody.append(row);
		return;
	}
	for (const currentEndpoint of currentSummary.endpoints) {
		const baselineEndpoint = baseline.summary.endpoints.find((endpoint) => endpoint.endpoint === currentEndpoint.endpoint);
		if (!baselineEndpoint) continue;
		const requestsPerSecondDelta = percentChange(baselineEndpoint.requestsPerSec, currentEndpoint.requestsPerSec);
		const averageDelta = percentChange(baselineEndpoint.averageMs, currentEndpoint.averageMs);
		const p95Delta = percentChange(baselineEndpoint.p95Ms, currentEndpoint.p95Ms);
		const verdict = verdictFor(baselineEndpoint, currentEndpoint);
		const row = document.createElement("tr");
		appendCell(row, currentEndpoint.endpoint);
		appendCell(row, formatDelta(requestsPerSecondDelta), deltaClass(requestsPerSecondDelta, true));
		appendCell(row, formatDelta(averageDelta), deltaClass(averageDelta, false));
		appendCell(row, formatDelta(p95Delta), deltaClass(p95Delta, false));
		appendCell(row, verdict, verdict);
		comparisonBody.append(row);
	}
}

function updateBaselineDetails(baseline) {
	if (!baseline) {
		baselineDetails.textContent = "No saved baseline selected.";
		return;
	}
	baselineDetails.textContent = "Comparing against " + baseline.summary.label + " from "
		+ new Date(baseline.summary.generatedAt).toLocaleString()
		+ " (" + baseline.summary.duration
		+ ", concurrency " + baseline.summary.concurrency
		+ ", warmup " + baseline.summary.warmupRequests + ").";
}

populateBaselineSelect();

const throughputChart = new Chart(document.getElementById("throughput-chart"), {
	data: {
		datasets: throughputDatasets(selectedBaseline()),
		labels: endpointLabels,
	},
	options: {
		maintainAspectRatio: false,
		scales: commonScales,
	},
	type: "bar",
});

new Chart(document.getElementById("latency-chart"), {
	data: {
		datasets: [
			{ backgroundColor: "#22d3ee", borderRadius: 8, data: valuesFor(currentSummary, "averageMs"), label: "Avg ms" },
			{ backgroundColor: "#a78bfa", borderRadius: 8, data: valuesFor(currentSummary, "p95Ms"), label: "P95 ms" },
			{ backgroundColor: "#f472b6", borderRadius: 8, data: valuesFor(currentSummary, "p99Ms"), label: "P99 ms" },
		],
		labels: endpointLabels,
	},
	options: {
		maintainAspectRatio: false,
		scales: commonScales,
	},
	type: "bar",
});

new Chart(document.getElementById("success-chart"), {
	data: {
		datasets: [{
			backgroundColor: "#4ade80",
			borderRadius: 10,
			data: valuesFor(currentSummary, "successRatePct"),
			label: "Success %",
		}],
		labels: endpointLabels,
	},
	options: {
		maintainAspectRatio: false,
		plugins: { legend: { display: false } },
		scales: {
			x: commonScales.x,
			y: { ...commonScales.y, max: 100, min: 0 },
		},
	},
	type: "bar",
});

const deltaChart = new Chart(document.getElementById("delta-chart"), {
	data: {
		datasets: deltaDatasets(selectedBaseline()),
		labels: endpointLabels,
	},
	options: {
		maintainAspectRatio: false,
		scales: commonScales,
	},
	type: "bar",
});

function updateComparison() {
	const baseline = selectedBaseline();
	throughputChart.data.datasets = throughputDatasets(baseline);
	deltaChart.data.datasets = deltaDatasets(baseline);
	throughputChart.update();
	deltaChart.update();
	renderComparisonTable(baseline);
	updateBaselineDetails(baseline);
}

baselineSelect.addEventListener("change", updateComparison);
updateComparison();
`;
}

function printArtifactSummary(options: BenchmarkOptions, result: BenchmarkRunResult): void {
	const resultsRoot = join(Deno.cwd(), options.resultsDir);
	console.log(`\n${ANSI.bold}Artifacts${ANSI.reset}`);
	console.log(`- Summary JSON: ${join(result.resultDirectory, "summary.json")}`);
	console.log(`- Visual report: ${join(result.resultDirectory, "report.html")}`);
	console.log(`- Latest summary: ${join(resultsRoot, RESULTS_LATEST_SUMMARY)}`);
	console.log(`- Latest visual report: ${join(resultsRoot, RESULTS_LATEST_REPORT)}`);
	if (result.baselineSummary) {
		console.log(`- Default comparison uses latest snapshot in ${resultsRoot}`);
	}
	if (result.comparisonSnapshots.length > 0) {
		console.log(`- HTML report can compare against ${result.comparisonSnapshots.length} saved snapshot(s)`);
	}
}

function getListeningPort(address: Deno.Addr, serviceName: string): number {
	if (address.transport === "tcp") return address.port;
	const error = new Error(`Expected a tcp address for ${serviceName}.`);
	Error.captureStackTrace(error, getListeningPort);
	throw error;
}

function createMockUpstreamHandler(): (request: Request) => Promise<Response> {
	return async (request) => {
		const url = new URL(request.url);
		if (request.method === "GET" && url.pathname === "/api.json") {
			return Response.json(getMetadataResponse(), { headers: { "cache-control": "no-store" } });
		}
		if (request.method === "GET" && url.pathname === "/v1/models") {
			return Response.json(getModelsResponse(), { headers: { "cache-control": "no-store" } });
		}
		if (request.method === "POST" && url.pathname === "/v1/messages") {
			await request.arrayBuffer();
			return Response.json(getAnthropicResponse(), { headers: { "cache-control": "no-store" } });
		}
		if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
			await request.arrayBuffer();
			return Response.json(getOpenAiResponse(), { headers: { "cache-control": "no-store" } });
		}
		return Response.json({ error: "not found" }, { headers: { "cache-control": "no-store" }, status: 404 });
	};
}

async function runOhaAsync(options: {
	readonly bodyFile?: string;
	readonly concurrency: number;
	readonly duration: string;
	readonly headers?: ReadonlyArray<readonly [string, string]>;
	readonly method?: string;
	readonly name: string;
	readonly url: string;
}): Promise<string> {
	console.log(`${ANSI.yellow}•${ANSI.reset} Running ${options.name} ...`);
	const parameters = [
		"--no-tui",
		"--wait-ongoing-requests-after-deadline",
		"--output-format",
		"json",
		"-z",
		options.duration,
		"-c",
		String(options.concurrency),
	];
	if (options.method) parameters.push("-m", options.method);
	for (const [name, value] of options.headers ?? []) {
		parameters.push("-H", `${name}: ${value}`);
	}
	if (options.bodyFile) parameters.push("-D", options.bodyFile);
	parameters.push(options.url);

	const { code, stderr, stdout } = await new Deno.Command("oha", {
		// oxlint-disable-next-line small-rules/prevent-abbreviations
		args: parameters,
		stderr: "piped",
		stdout: "piped",
	}).output();
	if (code !== 0) {
		const error = new Error(`oha failed for ${options.name}: ${new TextDecoder().decode(stderr)}`);
		Error.captureStackTrace(error, runOhaAsync);
		throw error;
	}
	return new TextDecoder().decode(stdout).trim();
}

async function warmProxyAsync(proxyBaseUrl: string, payloadText: string, warmupRequests: number): Promise<void> {
	await Promise.all(
		Array.from({ length: warmupRequests }, async () => {
			const response = await fetch(`${proxyBaseUrl}/v1/chat/completions`, {
				body: payloadText,
				headers: {
					Authorization: "Bearer upstream-key",
					"Content-Type": "application/json",
				},
				method: "POST",
			});
			if (!response.ok) {
				const error = new Error(`Warmup request failed with HTTP ${response.status}.`);
				Error.captureStackTrace(error, warmProxyAsync);
				throw error;
			}
			await response.arrayBuffer();
		}),
	);
}

async function waitForHealthyAsync(url: string, deadline = Date.now() + 10_000): Promise<void> {
	if (Date.now() >= deadline) {
		const error = new Error(`Timed out waiting for ${url}`);
		Error.captureStackTrace(error, waitForHealthyAsync);
		throw error;
	}

	try {
		const response = await fetch(url);
		if (response.ok) return;
	} catch {
		// retry
	}

	await delayAsync(100);
	return await waitForHealthyAsync(url, deadline);
}

async function createSparklineAsync(values: ReadonlyArray<number>): Promise<string | undefined> {
	if (values.length === 0) return undefined;

	const ticks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
	const minimum = Math.min(...values);
	const maximum = Math.max(...values);
	if (minimum === maximum) return ticks.at(-1)!.repeat(values.length);

	return values
		.map((value) => {
			const normalized = (value - minimum) / (maximum - minimum);
			const index = Math.min(ticks.length - 1, Math.max(0, Math.round(normalized * (ticks.length - 1))));
			return ticks[index] ?? ticks[0]!;
		})
		.join("");
}

async function ensureDependencyAsync(command: string): Promise<void> {
	const executablePath = await $.which(command);
	if (!executablePath) {
		const error = new Error(`${command} is required but was not found on PATH.`);
		Error.captureStackTrace(error, ensureDependencyAsync);
		throw error;
	}
}

async function readComparisonSnapshotsAsync(resultsRoot: string): Promise<ReadonlyArray<BenchmarkSnapshot>> {
	let entries: Array<Deno.DirEntry>;
	try {
		entries = await Array.fromAsync(Deno.readDir(resultsRoot));
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return [];
		throw error;
	}

	const snapshots = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory)
			.map(async (entry) => readSnapshotSummaryIfExistsAsync(resultsRoot, entry.name)),
	);
	return snapshots
		.filter(isDefined)
		.toSorted((left, right) => right.summary.generatedAt.localeCompare(left.summary.generatedAt));
}

async function readSnapshotSummaryIfExistsAsync(
	resultsRoot: string,
	directoryName: string,
): Promise<BenchmarkSnapshot | undefined> {
	const summaryPath = join(resultsRoot, directoryName, "summary.json");
	try {
		return {
			id: directoryName,
			summary: parseBenchmarkSummary(
				JSON.parse(await Deno.readTextFile(summaryPath)),
				`saved summary at ${summaryPath}`,
			),
		};
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

function isDefined<Value>(value: Value | undefined): value is Value {
	return value !== undefined;
}

function parseOhaResult(value: unknown, context: string): OhaResult {
	const result = isOhaResult(value);
	if (result instanceof type.errors) {
		const error = new TypeError(`${context}: ${result.summary}`);
		Error.captureStackTrace(error, parseOhaResult);
		throw error;
	}
	return result;
}

function parseBenchmarkSummary(value: unknown, context: string): BenchmarkSummary {
	const result = isBenchmarkSummary(value);
	if (result instanceof type.errors) {
		const error = new TypeError(`${context}: ${result.summary}`);
		Error.captureStackTrace(error, parseBenchmarkSummary);
		throw error;
	}
	return result;
}

function getMetadataResponse(): unknown {
	return {
		opencode: {
			models: {
				"minimax-m3": { provider: { npm: "@ai-sdk/anthropic" } },
			},
			npm: "@ai-sdk/openai-compatible",
		},
	};
}

function getModelsResponse(): unknown {
	return {
		data: [{ created: 0, id: "minimax-m3", object: "model", owned_by: "opencode" }],
		object: "list",
	};
}

function getAnthropicResponse(): unknown {
	return {
		content: [{ text: "pong", type: "text" }],
		id: "msg_bench",
		model: "minimax-m3",
		stop_reason: "end_turn",
		type: "message",
		usage: { input_tokens: 8, output_tokens: 4 },
	};
}

function getOpenAiResponse(): unknown {
	return {
		choices: [
			{
				finish_reason: "stop",
				index: 0,
				message: { content: "pong", role: "assistant" },
			},
		],
		created: 0,
		id: "chatcmpl_bench",
		model: "minimax-m3",
		object: "chat.completion",
	};
}

function printAlignedTable(rows: ReadonlyArray<ReadonlyArray<string>>): void {
	const widths = rows[0]!.map((_, columnIndex) =>
		Math.max(...rows.map((row) => visibleLength(row[columnIndex] ?? ""))),
	);
	const divider = widths.map((width) => "-".repeat(width)).join("-+-");
	for (const [index, row] of rows.entries()) {
		const line = row
			.map((cell, columnIndex) => {
				const width = widths[columnIndex] ?? 0;
				const padding = " ".repeat(Math.max(0, width - visibleLength(cell)));
				return columnIndex === 0 ? `${cell}${padding}` : `${padding}${cell}`;
			})
			.join(" | ");
		console.log(line);
		if (index === 0) console.log(divider);
	}
}

function renderBar(value: number, max: number, width: number): string {
	if (max <= 0) return "░".repeat(width);
	const filled = Math.max(1, Math.round((value / max) * width));
	return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

function visibleLength(value: string): number {
	return stripAnsi(value).length;
}

function stripAnsi(value: string): string {
	let strippedValue = value;
	for (const ansiValue of ANSI_VALUES) {
		strippedValue = strippedValue.replaceAll(ansiValue, "");
	}
	return strippedValue;
}

function toMilliseconds(seconds: number): number {
	return seconds * 1000;
}

function sumValues(record: Record<string, number> | undefined): number {
	if (!record) return 0;
	return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: value >= 1000 ? 0 : 1,
	}).format(value);
}

function formatMilliseconds(value: number): string {
	let decimals = 2;
	if (value >= 100) decimals = 0;
	else if (value >= 10) decimals = 1;
	return `${value.toFixed(decimals)} ms`;
}

function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`;
}

function formatDelta(value: number): string {
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(1)}%`;
}

function getPercentChange(previous: number, current: number): number {
	if (previous === 0) return 0;
	return ((current - previous) / previous) * 100;
}

function colorizeDelta(value: number, higherIsBetter: boolean): string {
	const isGood = higherIsBetter ? value >= 0 : value <= 0;
	const color = isGood ? ANSI.green : ANSI.red;
	return `${color}${formatDelta(value)}${ANSI.reset}`;
}

function getVerdict(previous: EndpointSummary, current: EndpointSummary): string {
	const rpsWon = getPercentChange(previous.requestsPerSec, current.requestsPerSec) > 0;
	const avgWon = getPercentChange(previous.averageMs, current.averageMs) < 0;
	const p95Won = getPercentChange(previous.p95Ms, current.p95Ms) < 0;
	const score = Number(rpsWon) + Number(avgWon) + Number(p95Won);
	if (score >= 2) return `${ANSI.green}better${ANSI.reset}`;
	if (score === 1) return `${ANSI.yellow}mixed${ANSI.reset}`;
	return `${ANSI.red}worse${ANSI.reset}`;
}

function sanitizeLabel(value: string): string {
	const trimmedValue = value.trim();
	let sanitizedValue = "";
	let lastWasSeparator = false;

	for (const character of trimmedValue) {
		const isAlphaNumeric = /[\dA-Za-z]/u.test(character);
		const isAllowedPunctuation = character === "." || character === "_" || character === "-";
		if (isAlphaNumeric || isAllowedPunctuation) {
			sanitizedValue += character;
			lastWasSeparator = false;
			continue;
		}
		if (!lastWasSeparator) {
			sanitizedValue += "-";
			lastWasSeparator = true;
		}
	}

	while (sanitizedValue.startsWith("-")) sanitizedValue = sanitizedValue.slice(1);
	while (sanitizedValue.endsWith("-")) sanitizedValue = sanitizedValue.slice(0, -1);

	return sanitizedValue || "default";
}

function createTimestamp(date = new Date()): string {
	return `${[
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("")}-${[
		String(date.getHours()).padStart(2, "0"),
		String(date.getMinutes()).padStart(2, "0"),
		String(date.getSeconds()).padStart(2, "0"),
	].join("")}`;
}
