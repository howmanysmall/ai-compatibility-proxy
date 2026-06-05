import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import { join } from "node:path";
import { cwd, env as processEnvironment } from "node:process";
import { setTimeout as delayAsync } from "node:timers/promises";
import { Command } from "@cliffy/command";
import { logger, parseLevel } from "@logging/logger";
import { createFetchHandler } from "@proxy/app";
import { loadConfiguration } from "@proxy/config";
import { html as renderHtml, raw, tag } from "@sander/html";
import { type } from "arktype";
import { Effect } from "effect";
import prettyBytes from "pretty-bytes";
import prettyMilliseconds from "pretty-ms";

import type { HtmlNode } from "@sander/html";

const RPS_BODY = [
	"How many HTTP requests the proxy finished per second on average across the run.",
	"The proxy is stateless, so this is a clean measure of CPU + I/O capacity on your machine.",
].join(" ");
const LATENCY_BODY = [
	"Response time for the request, including network, parsing, and upstream work.",
	"P95/P99 are the worst case for most/all users.",
	"Watch the P99, not the average.",
].join(" ");
const SUCCESS_BODY = [
	"Share of requests that came back with a 2xx status.",
	"The mock upstream always succeeds, so anything below 100% is the proxy refusing traffic, hitting a timeout, or erroring internally.",
].join(" ");
const CONCURRENCY_BODY = [
	"How many connections oha keeps open in parallel.",
	"Higher numbers stress the proxy's connection pool and event loop.",
	"The numbers are not directly comparable across machines.",
].join(" ");
const WARMUP_BODY = [
	"A handful of requests sent before the timer starts.",
	"These are discarded so the run measures steady-state, not first-request JIT, cache fill, or DNS.",
].join(" ");
const VERDICT_BODY = [
	"A simple score: of {throughput, avg latency, p95 latency}, count the wins (higher is better for the first, lower is better for the rest).",
	"2+ ⇒ better, 0 ⇒ worse, otherwise mixed.",
].join(" ");
const DELTA_BODY = [
	"Percent change between the current run and the snapshot you selected above.",
	"The throughput and latency color cues tell you which side of zero is good.",
].join(" ");

const GLOSSARY_ENTRIES = [
	{
		body: RPS_BODY,
		title: "Requests per second",
	} as const,
	{
		body: LATENCY_BODY,
		title: "Latency (Avg, P95, P99)",
	} as const,
	{
		body: SUCCESS_BODY,
		title: "Success rate",
	} as const,
	{
		body: CONCURRENCY_BODY,
		title: "Concurrency",
	} as const,
	{
		body: WARMUP_BODY,
		title: "Warmup",
	} as const,
	{
		body: VERDICT_BODY,
		title: "Verdict (better / mixed / worse)",
	} as const,
	{
		body: DELTA_BODY,
		title: "Delta vs baseline",
	} as const,
].map((entry) => tag("div", { class: "glossary-item" }, [tag("h4", entry.title), tag("p", entry.body)]));

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
	.parse(Bun.argv.slice(2));

async function runBenchmarkAsync(options: BenchmarkOptions): Promise<BenchmarkRunResult> {
	logger.level = parseLevel("fatal");

	const payloadPath = join(cwd(), options.payloadFile);
	const payloadText = await readFile(payloadPath, "utf8");
	const resultsRoot = join(cwd(), options.resultsDir);
	const resultDirectory = join(resultsRoot, `${createTimestamp()}-${sanitizeLabel(options.label)}`);
	const comparisonSnapshots = await readComparisonSnapshotsAsync(resultsRoot);
	const baselineSummary = comparisonSnapshots[0]?.summary;

	await mkdir(join(resultDirectory, "raw"), { recursive: true });

	const mockPort = await chooseListeningPortAsync(options.host, options.mockPort);
	const mockServer = Bun.serve({
		fetch: createMockUpstreamHandler(),
		hostname: options.host,
		port: mockPort,
	});
	const mockListeningPort = getListeningPort(mockServer, "mock upstream");
	const configuration = loadConfiguration({
		...Bun.env,
		LOG_LEVEL: "fatal",
		OPENCODE_MODELS_URL: `http://${options.host}:${mockListeningPort}/api.json`,
		UPSTREAM_BASE_URL: `http://${options.host}:${mockListeningPort}/v1`,
		UPSTREAM_PROTOCOL: "anthropic_messages",
	});
	const proxyPort = await chooseListeningPortAsync(options.host, options.port);
	const proxyServer = Bun.serve({
		fetch: createFetchHandler({ proxyConfiguration: configuration }),
		hostname: options.host,
		port: proxyPort,
	});
	const proxyListeningPort = getListeningPort(proxyServer, "proxy");

	const proxyBaseUrl = `http://${options.host}:${proxyListeningPort}`;

	try {
		await waitForHealthyAsync(`http://${options.host}:${mockListeningPort}/api.json`);
		await waitForHealthyAsync(`${proxyBaseUrl}/health`);
		await warmProxyAsync(proxyBaseUrl, payloadText, options.warmupRequests);

		printRunHeader(options, resultDirectory, proxyListeningPort, mockListeningPort);

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
		await proxyServer.stop();
		await mockServer.stop();
	}
}

async function persistArtifactsAsync(options: BenchmarkOptions, result: BenchmarkRunResult): Promise<void> {
	const rawDirectory = join(result.resultDirectory, "raw");
	await mkdir(rawDirectory, { recursive: true });
	await writeFile(join(rawDirectory, "health.json"), `${result.rawJsonByName.health}\n`);
	await writeFile(join(rawDirectory, "models.json"), `${result.rawJsonByName.models}\n`);
	await writeFile(join(rawDirectory, "chat.json"), `${result.rawJsonByName.chat}\n`);

	const summaryJson = `${JSON.stringify(result.summary, undefined, 2)}\n`;
	const summaryPath = join(result.resultDirectory, "summary.json");
	const reportPath = join(result.resultDirectory, "report.html");
	await writeFile(summaryPath, summaryJson);
	await writeFile(reportPath, result.reportHtml);

	const resultsRoot = join(cwd(), options.resultsDir);
	await writeFile(join(resultsRoot, RESULTS_LATEST_SUMMARY), summaryJson);
	await writeFile(join(resultsRoot, RESULTS_LATEST_REPORT), result.reportHtml);
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
			prettyMilliseconds(endpoint.averageMs),
			prettyMilliseconds(endpoint.p95Ms),
			prettyMilliseconds(endpoint.p99Ms),
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
	--bg: #08091a;
	--bg-2: #0d1027;
	--surface: #141a30;
	--surface-2: #1a2238;
	--surface-3: #232c48;
	--line: #2a3354;
	--line-strong: #3a4570;
	--text: #eef1ff;
	--text-dim: #a3accc;
	--text-faint: #6b749a;
	--accent: #818cf8;
	--accent-2: #22d3ee;
	--accent-glow: rgba(129, 140, 248, 0.35);
	--good: #34d399;
	--bad: #f87171;
	--warn: #fbbf24;
	--pink: #f472b6;
	--violet: #c084fc;
	--blue: #60a5fa;
	--cyan: #22d3ee;
	--emerald: #10b981;
	--rose: #fb7185;
	--amber: #f59e0b;
	--grad-accent: linear-gradient(135deg, #6366f1 0%, #22d3ee 100%);
	--grad-good: linear-gradient(135deg, #10b981 0%, #34d399 100%);
	--grad-bad: linear-gradient(135deg, #f43f5e 0%, #f87171 100%);
	--grad-warn: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
	--grad-text: linear-gradient(180deg, #ffffff 0%, #a3accc 100%);
	--grid-line: rgba(58, 69, 112, 0.45);
	--grid-line-strong: rgba(58, 69, 112, 0.8);
	--shadow-1: 0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 30px 80px -20px rgba(0, 0, 0, 0.5);
	--radius-sm: 10px;
	--radius: 16px;
	--radius-lg: 22px;
	--ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
	min-height: 100vh;
	background:
		radial-gradient(1200px 600px at 0% -10%, rgba(99, 102, 241, 0.18), transparent 60%),
		radial-gradient(900px 500px at 100% 0%, rgba(34, 211, 238, 0.12), transparent 60%),
		radial-gradient(800px 600px at 50% 100%, rgba(192, 132, 252, 0.08), transparent 60%),
		var(--bg);
	color: var(--text);
	font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
	font-feature-settings: "ss01", "cv11", "tnum";
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}
main { margin: 0 auto; max-width: 1180px; padding: 32px 24px 64px; }
a { color: inherit; }

/* ---------- Header ---------- */
.hero {
	display: grid;
	gap: 18px;
	margin-bottom: 28px;
}
.brand {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--text-dim);
	font-size: 0.72rem;
	letter-spacing: 0.18em;
	text-transform: uppercase;
}
.brand-mark {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 6px;
	background: var(--grad-accent);
	box-shadow: 0 0 24px var(--accent-glow);
	position: relative;
}
.brand-mark svg { width: 12px; height: 12px; color: #fff; }
.hero-title {
	font-size: clamp(2.4rem, 6vw, 4.4rem);
	line-height: 0.95;
	margin: 0;
	letter-spacing: -0.045em;
	font-weight: 800;
	background: var(--grad-text);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}
.hero-title .tag {
	display: inline-block;
	font-size: 0.32em;
	font-weight: 600;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--text-dim);
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: 999px;
	padding: 6px 10px;
	margin-left: 12px;
	vertical-align: middle;
	-webkit-text-fill-color: var(--text-dim);
}
.hero-sub {
	color: var(--text-dim);
	font-size: 0.95rem;
	max-width: 60ch;
	margin: 0;
}
.pill-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: 999px;
	color: var(--text-dim);
	font-size: 0.78rem;
	letter-spacing: 0.04em;
	padding: 6px 12px;
}
.pill strong { color: var(--text); font-weight: 600; }

/* ---------- Verdict banner ---------- */
.verdict {
	display: grid;
	grid-template-columns: auto 1fr auto;
	gap: 18px;
	align-items: center;
	padding: 20px 22px;
	border: 1px solid var(--line);
	border-radius: var(--radius-lg);
	background:
		linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)),
		var(--surface);
	box-shadow: var(--shadow-1);
	margin-bottom: 24px;
	position: relative;
	overflow: hidden;
}
.verdict::before {
	content: "";
	position: absolute;
	inset: 0;
	background: var(--verdict-strip, transparent);
	opacity: 0.18;
	pointer-events: none;
}
.verdict[data-state="better"] { --verdict-strip: var(--grad-good); border-color: rgba(52, 211, 153, 0.35); }
.verdict[data-state="mixed"]  { --verdict-strip: var(--grad-warn); border-color: rgba(251, 191, 36, 0.35); }
.verdict[data-state="worse"]  { --verdict-strip: var(--grad-bad);  border-color: rgba(248, 113, 113, 0.35); }
.verdict[data-state="solo"]   { --verdict-strip: var(--grad-accent); }
.verdict-icon {
	width: 52px;
	height: 52px;
	border-radius: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.6rem;
	font-weight: 700;
	color: #fff;
	background: var(--verdict-strip, var(--grad-accent));
	box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
	z-index: 1;
}
.verdict[data-state="better"] .verdict-icon { box-shadow: 0 8px 28px rgba(16, 185, 129, 0.4); }
.verdict[data-state="worse"]  .verdict-icon { box-shadow: 0 8px 28px rgba(244, 63, 94, 0.4); }
.verdict[data-state="mixed"]  .verdict-icon { box-shadow: 0 8px 28px rgba(245, 158, 11, 0.4); }
.verdict-body { z-index: 1; }
.verdict-title {
	font-size: 1.15rem;
	font-weight: 700;
	letter-spacing: -0.01em;
	margin: 0 0 4px;
}
.verdict-detail {
	font-size: 0.88rem;
	color: var(--text-dim);
	margin: 0;
}
.verdict-tag {
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	padding: 4px 10px;
	border-radius: 999px;
	background: rgba(0, 0, 0, 0.3);
	border: 1px solid var(--line-strong);
	color: var(--text);
	z-index: 1;
}

/* ---------- Quick stats grid ---------- */
.quick-stats {
	display: grid;
	gap: 14px;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	margin-bottom: 28px;
}
.qs {
	position: relative;
	padding: 18px;
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: var(--radius);
	overflow: hidden;
}
.qs::after {
	content: "";
	position: absolute;
	inset: 0;
	background: var(--qs-accent, transparent);
	opacity: 0.06;
	pointer-events: none;
}
.qs-label {
	font-size: 0.7rem;
	font-weight: 600;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--text-faint);
	margin: 0 0 8px;
}
.qs-value {
	font-size: 1.85rem;
	font-weight: 800;
	letter-spacing: -0.035em;
	font-variant-numeric: tabular-nums;
	margin: 0;
	line-height: 1.1;
}
.qs-sub {
	font-size: 0.78rem;
	color: var(--text-dim);
	margin: 6px 0 0;
}

/* ---------- Section wrapper ---------- */
.section {
	margin-top: 36px;
}
.section-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 14px;
}
.section-title {
	display: flex;
	align-items: center;
	gap: 12px;
	font-size: 0.78rem;
	font-weight: 700;
	letter-spacing: 0.16em;
	text-transform: uppercase;
	color: var(--text-dim);
	margin: 0;
}
.section-title::before {
	content: attr(data-num);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 22px;
	height: 22px;
	padding: 0 6px;
	font-size: 0.66rem;
	letter-spacing: 0.06em;
	color: var(--text);
	background: var(--surface-2);
	border: 1px solid var(--line);
	border-radius: 6px;
}
.section-sub {
	font-size: 0.8rem;
	color: var(--text-faint);
	max-width: 60ch;
	margin: 0;
}

/* ---------- Chart grid ---------- */
.chart-grid {
	display: grid;
	gap: 16px;
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.chart-card {
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: var(--radius-lg);
	padding: 20px 20px 14px;
	box-shadow: var(--shadow-1);
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.chart-card-head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
}
.chart-card h3 {
	margin: 0;
	font-size: 1rem;
	font-weight: 600;
	letter-spacing: -0.01em;
}
.chart-card p {
	margin: 2px 0 0;
	font-size: 0.8rem;
	color: var(--text-dim);
	line-height: 1.45;
}
.chart-card canvas {
	width: 100% !important;
	height: 100% !important;
	display: block;
}
.chart-area {
	position: relative;
	height: 260px;
	margin-top: 12px;
}
.chart-legend {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 12px;
	margin-top: 8px;
}
.legend-dot {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.74rem;
	color: var(--text-dim);
	letter-spacing: 0.02em;
}
.legend-dot::before {
	content: "";
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 2px;
	background: var(--swatch, var(--accent));
}
.legend-dot[data-swatch="cyan"]    { --swatch: #22d3ee; }
.legend-dot[data-swatch="violet"]  { --swatch: #c084fc; }
.legend-dot[data-swatch="pink"]    { --swatch: #f472b6; }
.legend-dot[data-swatch="emerald"] { --swatch: #34d399; }
.legend-dot[data-swatch="amber"]   { --swatch: #fbbf24; }
.legend-dot[data-swatch="rose"]    { --swatch: #f87171; }
.legend-dot[data-swatch="blue"]    { --swatch: #60a5fa; }
.legend-dot[data-swatch="slate"]   { --swatch: #64748b; }
.legend-dot[data-swatch="indigo"]  { --swatch: #818cf8; }

/* ---------- Comparison section ---------- */
.compare {
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-1);
	overflow: hidden;
}
.compare-head {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	justify-content: space-between;
	align-items: center;
	padding: 20px 22px;
	border-bottom: 1px solid var(--line);
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent);
}
.compare-head h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.compare-meta { display: flex; flex-direction: column; gap: 4px; }
.compare-meta .label-line {
	font-size: 0.7rem;
	color: var(--text-faint);
	letter-spacing: 0.12em;
	text-transform: uppercase;
}
.baseline-control { display: flex; align-items: center; gap: 10px; color: var(--text-dim); font-size: 0.85rem; }
select {
	background: var(--surface-2);
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	color: var(--text);
	font: inherit;
	font-size: 0.85rem;
	min-width: min(28rem, 75vw);
	padding: 8px 12px;
}
select:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
#baseline-details {
	margin: 0;
	padding: 14px 22px 4px;
	font-size: 0.85rem;
	color: var(--text-dim);
}
.compare-chart-wrap { padding: 8px 22px 22px; }

/* ---------- Comparison table ---------- */
.cmp-table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th, td {
	border-top: 1px solid var(--line);
	padding: 12px 22px;
	text-align: right;
	font-variant-numeric: tabular-nums;
}
th:first-child, td:first-child { text-align: left; }
th {
	color: var(--text-faint);
	font-size: 0.72rem;
	font-weight: 600;
	letter-spacing: 0.12em;
	text-transform: uppercase;
}
tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
.good, .better { color: var(--good); }
.bad, .worse { color: var(--bad); }
.mixed { color: var(--warn); }
.muted { color: var(--text-faint); }
.mono { font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace; }

/* ---------- Endpoint cards ---------- */
.endpoint-grid {
	display: grid;
	gap: 16px;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.ep {
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: var(--radius-lg);
	padding: 22px;
	box-shadow: var(--shadow-1);
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.ep-head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
}
.ep-path {
	font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
	font-size: 0.92rem;
	color: var(--text);
	word-break: break-all;
}
.ep-tag {
	font-size: 0.66rem;
	font-weight: 700;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	padding: 3px 8px;
	border-radius: 999px;
	background: var(--surface-2);
	border: 1px solid var(--line);
	color: var(--text-dim);
	white-space: nowrap;
}
.ep-rps {
	font-size: 2.4rem;
	font-weight: 800;
	letter-spacing: -0.045em;
	font-variant-numeric: tabular-nums;
	line-height: 1;
}
.ep-rps-sub {
	font-size: 0.74rem;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: var(--text-faint);
	margin-top: 2px;
}
.bar { background: var(--bg-2); border-radius: 999px; height: 10px; overflow: hidden; }
.bar > .fill {
	height: 100%;
	background: var(--grad-accent);
	border-radius: inherit;
	box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
}
.ep-stats {
	display: grid;
	gap: 10px;
	grid-template-columns: repeat(2, 1fr);
}
.ep-stat {
	background: var(--bg-2);
	border: 1px solid var(--line);
	border-radius: 12px;
	padding: 10px 12px;
}
.ep-stat .lbl {
	font-size: 0.68rem;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: var(--text-faint);
	display: flex;
	align-items: center;
	gap: 6px;
}
.ep-stat .val {
	font-size: 1.08rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	letter-spacing: -0.01em;
	display: block;
	margin-top: 2px;
}

/* ---------- Tooltip ---------- */
.tip {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 14px;
	height: 14px;
	border-radius: 999px;
	background: var(--surface-3);
	color: var(--text-dim);
	font-size: 0.6rem;
	font-weight: 700;
	cursor: help;
}
.tip::after {
	content: attr(data-tip);
	position: absolute;
	bottom: calc(100% + 8px);
	left: 50%;
	transform: translateX(-50%) translateY(4px);
	background: #0a0d18;
	color: var(--text);
	border: 1px solid var(--line-strong);
	border-radius: 8px;
	padding: 8px 10px;
	font-size: 0.72rem;
	font-weight: 500;
	letter-spacing: 0.01em;
	line-height: 1.4;
	width: max-content;
	max-width: 220px;
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.15s var(--ease), transform 0.15s var(--ease);
	z-index: 20;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.tip:hover::after, .tip:focus::after {
	opacity: 1;
	transform: translateX(-50%) translateY(0);
}

/* ---------- Glossary ---------- */
.glossary {
	margin-top: 40px;
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-1);
	overflow: hidden;
}
.glossary summary {
	list-style: none;
	cursor: pointer;
	padding: 18px 22px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	font-size: 0.95rem;
	font-weight: 600;
}
.glossary summary::-webkit-details-marker { display: none; }
.glossary summary::after {
	content: "+";
	font-size: 1.4rem;
	font-weight: 400;
	color: var(--text-dim);
	transition: transform 0.2s var(--ease);
}
.glossary[open] summary::after { content: "−"; }
.glossary-body {
	padding: 4px 22px 22px;
	display: grid;
	gap: 14px;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
.glossary-item h4 {
	font-size: 0.78rem;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: var(--text);
	margin: 0 0 6px;
	font-weight: 700;
}
.glossary-item p {
	margin: 0;
	font-size: 0.85rem;
	color: var(--text-dim);
	line-height: 1.5;
}

/* ---------- Sparkline ---------- */
.spark {
	margin: 18px 0 4px;
	padding: 16px 20px;
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: var(--radius);
	display: flex;
	align-items: center;
	gap: 18px;
}
.spark-label {
	font-size: 0.7rem;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--text-faint);
	font-weight: 600;
	white-space: nowrap;
}
.spark svg { flex: 1; height: 44px; min-width: 0; }
.spark svg path.line { fill: none; stroke: url(#sparkline-gradient); stroke-width: 2; stroke-linecap: round; }
.spark svg path.area { fill: url(#sparkline-area); stroke: none; }
.spark svg circle { fill: #22d3ee; stroke: var(--bg); stroke-width: 2; }
.spark svg text {
	fill: var(--text-dim);
	font-size: 10px;
	font-family: ui-monospace, SFMono-Regular, monospace;
}

/* ---------- Footer ---------- */
footer {
	color: var(--text-faint);
	font-size: 0.82rem;
	margin-top: 40px;
	padding-top: 20px;
	border-top: 1px dashed var(--line);
	display: flex;
	flex-wrap: wrap;
	gap: 12px 24px;
	justify-content: space-between;
}
footer a { color: var(--text-dim); text-decoration: none; border-bottom: 1px dashed var(--line-strong); }
footer a:hover { color: var(--text); }

/* ---------- Mobile ---------- */
@media (max-width: 720px) {
	main { padding: 24px 16px 48px; }
	.verdict { grid-template-columns: auto 1fr; padding: 16px; }
	.verdict-tag { grid-column: 1 / -1; justify-self: start; }
	.chart-area { height: 220px; }
	.ep-rps { font-size: 2rem; }
	.qs-value { font-size: 1.5rem; }
	th, td { padding: 10px 12px; }
	.compare-head { padding: 16px; }
	#baseline-details { padding: 12px 16px 4px; }
	.compare-chart-wrap { padding: 4px 16px 16px; }
	select { min-width: 0; width: 100%; }
	.baseline-control { flex-direction: column; align-items: stretch; width: 100%; }
	.ep-stats { grid-template-columns: 1fr 1fr; }
}
`;
}

function createHtmlReport(
	current: BenchmarkSummary,
	comparisonSnapshots: ReadonlyArray<BenchmarkSnapshot>,
	sparkline: string | undefined,
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
					createVerdictSection(current, comparisonSnapshots),
					createQuickStatsSection(current),
					sparkline ? createSparklineSection(current, sparkline) : raw(""),
					createSection(
						"Performance breakdown",
						"01",
						"Throughput, latency tail behavior, and reliability per endpoint. The delta chart updates with the selected baseline.",
						createChartsSection(),
					),
					createSection(
						"Endpoint deep dive",
						"02",
						"Per-endpoint metrics with relative throughput. Bars compare each endpoint to the fastest one in this run.",
						tag(
							"div",
							{ class: "endpoint-grid" },
							current.endpoints.map((endpoint) => createEndpointCard(endpoint, maxRequestsPerSecond)),
						),
					),
					createHtmlComparisonSection(comparisonSnapshots.length > 0),
					createGlossarySection(),
					tag("footer", [
						tag("div", [
							tag("strong", { class: "mono" }, "Artifacts"),
							" — raw oha JSON and a machine-readable summary.json are saved next to this report. Charts load via the Chart.js CDN.",
						]),
						tag("div", "Built with oha + Bun · threshold: ±0% for tie"),
					]),
				]),
				tag("script", { src: "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js" }),
				tag("script", raw(createReportScript(chartData))),
			]),
		]),
		{ doctype: "html" },
	);
}

function createSection(title: string, number: string, subtitle: string, children: HtmlNode): HtmlNode {
	return tag("section", { class: "section" }, [
		tag("div", { class: "section-head" }, [
			tag("h2", { class: "section-title", "data-num": number }, title),
			tag("p", { class: "section-sub" }, subtitle),
		]),
		children,
	]);
}

function createReportHeader(summary: BenchmarkSummary): HtmlNode {
	return tag("header", { class: "hero" }, [
		tag("div", { class: "brand" }, [
			tag("span", { "aria-hidden": "true", class: "brand-mark" }, [
				raw(
					`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>`,
				),
			]),
			tag("span", "HTTP benchmark · proxy throughput report"),
		]),
		tag("h1", { class: "hero-title" }, [summary.label, tag("span", { class: "tag" }, "snapshot")]),
		tag("p", { class: "hero-sub" }, [
			`Real load against three production endpoints of the proxy using `,
			tag("strong", "oha"),
			`. Warmup traffic is discarded so the numbers reflect steady-state behavior.`,
		]),
		tag("div", { class: "pill-row" }, [
			tag("span", { class: "pill" }, ["Generated ", tag("strong", formatReportDate(summary.generatedAt))]),
			tag("span", { class: "pill" }, ["Duration ", tag("strong", summary.duration)]),
			tag("span", { class: "pill" }, ["Concurrency ", tag("strong", String(summary.concurrency))]),
			tag("span", { class: "pill" }, ["Warmup ", tag("strong", `${summary.warmupRequests} req`)]),
			tag("span", { class: "pill" }, ["Endpoints ", tag("strong", String(summary.endpoints.length))]),
		]),
	]);
}

function createVerdictSection(
	current: BenchmarkSummary,
	comparisonSnapshots: ReadonlyArray<BenchmarkSnapshot>,
): HtmlNode {
	const baseline = comparisonSnapshots[0]?.summary;
	if (!baseline) {
		return tag("section", { "aria-label": "Verdict", class: "verdict", "data-state": "solo" }, [
			tag("div", { "aria-hidden": "true", class: "verdict-icon" }, "✦"),
			tag("div", { class: "verdict-body" }, [
				tag("h2", { class: "verdict-title" }, "Baseline snapshot"),
				tag(
					"p",
					{ class: "verdict-detail" },
					"This is the first run, so there is no prior baseline to compare against. Run the benchmark again and this card will summarize the deltas.",
				),
			]),
			tag("div", { class: "verdict-tag" }, "Solo"),
		]);
	}

	const verdicts = current.endpoints.map((endpoint) => {
		const baselineEndpoint = baseline.endpoints.find((value) => value.endpoint === endpoint.endpoint);
		if (!baselineEndpoint) return "worse" as const;
		return computeVerdict(baselineEndpoint, endpoint);
	});
	const tally = { better: 0, mixed: 0, worse: 0 };
	for (const verdict of verdicts) tally[verdict]++;
	let overall: VerdictTone;
	if (tally.better >= 2) overall = "better";
	else if (tally.worse >= 2) overall = "worse";
	else overall = "mixed";
	const titles: Record<VerdictTone, string> = {
		better: "Throughput improved overall",
		mixed: "Mixed results — see breakdown",
		worse: "Throughput regressed overall",
	};
	const details: Record<VerdictTone, string> = {
		better: `${tally.better} of ${verdicts.length} endpoints got faster or held steady on the metrics that matter.`,
		mixed: `${tally.better} better, ${tally.mixed} mixed, ${tally.worse} worse. Inspect the table below.`,
		worse: `${tally.worse} of ${verdicts.length} endpoints regressed. Re-run after a code change to validate.`,
	};
	let overallIcon = "■";
	if (overall === "better") overallIcon = "▲";
	else if (overall === "worse") overallIcon = "▼";
	return tag("section", { "aria-label": "Verdict", class: "verdict", "data-state": overall }, [
		tag("div", { "aria-hidden": "true", class: "verdict-icon" }, overallIcon),
		tag("div", { class: "verdict-body" }, [
			tag("h2", { class: "verdict-title" }, titles[overall]),
			tag("p", { class: "verdict-detail" }, details[overall]),
		]),
		tag("div", { class: "verdict-tag" }, overall),
	]);
}

function createQuickStatsSection(summary: BenchmarkSummary): HtmlNode {
	let totalRps = 0;
	let successTotal = 0;
	let totalData = 0;
	const [firstEndpoint] = summary.endpoints;
	let fastest: EndpointSummary | undefined = firstEndpoint;
	let slowest: EndpointSummary | undefined = firstEndpoint;
	for (const endpoint of summary.endpoints) {
		totalRps += endpoint.requestsPerSec;
		successTotal += endpoint.successRatePct;
		totalData += endpoint.totalDataBytes;
		if (fastest && endpoint.requestsPerSec > fastest.requestsPerSec) fastest = endpoint;
		if (slowest && endpoint.requestsPerSec < slowest.requestsPerSec) slowest = endpoint;
	}
	const successAvg = summary.endpoints.length > 0 ? successTotal / summary.endpoints.length : 0;
	const totalRequests = Math.round(totalRps * parseDurationToSeconds(summary.duration));

	return tag("section", { "aria-label": "Summary at a glance", class: "quick-stats" }, [
		createQuickStat(
			"Total throughput",
			`${formatNumber(totalRps)} req/s`,
			`~${formatNumber(totalRequests)} requests in ${summary.duration}`,
			"indigo",
		),
		createQuickStat(
			"Fastest endpoint",
			fastest?.endpoint ?? "—",
			`${formatNumber(fastest?.requestsPerSec ?? 0)} req/s · ${prettyMilliseconds(fastest?.p95Ms ?? 0)} p95`,
			"cyan",
		),
		createQuickStat(
			"Heaviest endpoint",
			slowest?.endpoint ?? "—",
			`${formatNumber(slowest?.requestsPerSec ?? 0)} req/s · ${prettyMilliseconds(slowest?.p99Ms ?? 0)} p99`,
			"violet",
		),
		createQuickStat(
			"Reliability",
			`${formatPercent(successAvg)}`,
			`avg across ${summary.endpoints.length} endpoints`,
			"emerald",
		),
		createQuickStat("Data moved", prettyBytes(totalData), "total response bytes observed", "blue"),
	]);
}

function createQuickStat(label: string, value: string, sub: string, accent: QuickStatAccent): HtmlNode {
	const accentColors: Record<QuickStatAccent, string> = {
		blue: "linear-gradient(135deg, #60a5fa 0%, #818cf8 100%)",
		cyan: "linear-gradient(135deg, #22d3ee 0%, #34d399 100%)",
		emerald: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
		indigo: "linear-gradient(135deg, #6366f1 0%, #22d3ee 100%)",
		violet: "linear-gradient(135deg, #c084fc 0%, #818cf8 100%)",
	};
	return tag("div", { class: "qs", style: `--qs-accent:${accentColors[accent]}` }, [
		tag("p", { class: "qs-label" }, label),
		tag("p", { class: "qs-value" }, value),
		tag("p", { class: "qs-sub" }, sub),
	]);
}

interface Point {
	readonly index: number;
	readonly value: number;
	readonly x: number;
	readonly y: number;
}

function evilTernary<TValue>(condition: boolean, trueValue: TValue, falseValue: TValue): TValue {
	return condition ? trueValue : falseValue;
}

function mapSparklineLabels(labels: ReadonlyArray<string>, points: ReadonlyArray<Point>, height: number): string {
	const heightY = (height - 0.5).toFixed(1);
	return labels
		.map((label, index) => {
			const point = points[index];
			if (!point) return "";
			let anchor = "middle";
			if (index === 0) anchor = "start";
			else if (index === points.length - 1) anchor = "end";
			return `<text x="${point.x.toFixed(1)}" y="${heightY}" text-anchor="${anchor}">${label}</text>`;
		})
		.join("");
}

function createSparklineSection(summary: BenchmarkSummary, sparkline: string): HtmlNode {
	const values = summary.endpoints.map((endpoint) => endpoint.requestsPerSec);
	const max = Math.max(...values);
	const min = Math.min(...values);
	const width = 600;
	const height = 44;
	const padding = 4;
	const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
	const points = values.map((value, index): Point => {
		const x = padding + step * index;
		const ratio = max === min ? 0.5 : (value - min) / (max - min);
		const y = height - padding - ratio * (height - padding * 2);
		return { index, value, x, y };
	});
	const linePath = points
		.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
		.join(" ");
	const areaPath = `M${points[0]?.x.toFixed(1) ?? 0},${height} L${linePath.slice(1)} L${
		points.at(-1)?.x.toFixed(1) ?? 0
	},${height} Z`;
	const labels = summary.endpoints.map((endpoint) => endpoint.endpoint);

	return tag("section", { "aria-label": "Throughput sparkline", class: "spark" }, [
		tag("div", { class: "spark-label" }, ["Throughput shape ", tag("span", { class: "mono" }, sparkline)]),
		raw(`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">
			<defs>
				<linearGradient id="sparkline-gradient" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stop-color="#22d3ee"/>
					<stop offset="100%" stop-color="#818cf8"/>
				</linearGradient>
				<linearGradient id="sparkline-area" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#22d3ee" stop-opacity="0.35"/>
					<stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
				</linearGradient>
			</defs>
			<path class="area" d="${areaPath}"/>
			<path class="line" d="${linePath}"/>
			${points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5"/>`).join("")}
			${mapSparklineLabels(labels, points, height)}
		</svg>`),
	]);
}

function createChartsSection(): HtmlNode {
	return tag("div", { class: "chart-grid" }, [
		createChartCard({
			ariaLabel: "Throughput by endpoint",
			canvasId: "throughput-chart",
			legend: [
				{ label: "Current req/s", swatch: "indigo" },
				{ label: "Baseline req/s", swatch: "slate" },
			],
			subtitle:
				"Requests per second. Higher is better. The bar height shows the absolute rate for the current run; when a baseline is selected, the muted bars are the previous run for comparison.",
			title: "Throughput",
		}),
		createChartCard({
			ariaLabel: "Latency percentiles by endpoint",
			canvasId: "latency-chart",
			legend: [
				{ label: "Avg", swatch: "cyan" },
				{ label: "P95", swatch: "violet" },
				{ label: "P99", swatch: "pink" },
			],
			subtitle:
				"Average, 95th, and 99th percentile response time per endpoint. P95 means 95% of requests finished at or below this number. Use the tail (P95/P99) to spot the worst case real users see.",
			title: "Latency distribution",
		}),
		createChartCard({
			ariaLabel: "Success rate by endpoint",
			canvasId: "success-chart",
			legend: [{ label: "Success %", swatch: "emerald" }],
			subtitle:
				"Share of requests that returned a 2xx response. Anything below 100% means some traffic hit rate limits, network errors, or upstream failures.",
			title: "Success rate",
		}),
		createChartCard({
			ariaLabel: "Delta versus selected baseline",
			canvasId: "delta-chart",
			legend: [
				{ label: "Req/s Δ", swatch: "cyan" },
				{ label: "Avg Δ", swatch: "amber" },
				{ label: "P95 Δ", swatch: "rose" },
			],
			subtitle:
				"Percent change for throughput, average latency, and P95 latency. Positive is good for throughput, negative is good for latency. The bar color reflects the direction.",
			title: "Delta vs selected baseline",
		}),
	]);
}

interface ChartLegendEntry {
	readonly label: string;
	readonly swatch: "cyan" | "violet" | "pink" | "emerald" | "amber" | "rose" | "blue" | "slate" | "indigo";
}

type QuickStatAccent = "indigo" | "cyan" | "violet" | "emerald" | "blue";
type VerdictTone = "better" | "mixed" | "worse";

function mapLegend(entry: ChartLegendEntry): HtmlNode {
	return tag("span", { class: "legend-dot", "data-swatch": entry.swatch }, entry.label);
}

function createChartCard(options: {
	readonly ariaLabel: string;
	readonly canvasId: string;
	readonly legend: ReadonlyArray<ChartLegendEntry>;
	readonly subtitle: string;
	readonly title: string;
}): HtmlNode {
	return tag("article", { class: "chart-card" }, [
		tag("div", { class: "chart-card-head" }, [tag("div", [tag("h3", options.title), tag("p", options.subtitle)])]),
		tag("div", { class: "chart-area" }, [tag("canvas", { "aria-label": options.ariaLabel, id: options.canvasId })]),
		tag("div", { class: "chart-legend" }, options.legend.map(mapLegend)),
	]);
}

function getEndpointReturned(endpoint: EndpointSummary): string {
	const bytes = prettyBytes(endpoint.totalDataBytes);
	return `${endpoint.errorCount} error${endpoint.errorCount === 1 ? "" : "s"} · ${bytes} returned`;
}

function createEndpointCard(endpoint: EndpointSummary, maxRequestsPerSecond: number): HtmlNode {
	const width = maxRequestsPerSecond > 0 ? Math.max(1, (endpoint.requestsPerSec / maxRequestsPerSecond) * 100) : 0;
	let endpointTag = "Health";
	if (endpoint.endpoint.startsWith("/v1/chat")) endpointTag = "Chat";
	else if (endpoint.endpoint.startsWith("/v1/models")) endpointTag = "Listing";
	return tag("article", { class: "ep" }, [
		tag("div", { class: "ep-head" }, [
			tag("div", { class: "ep-path" }, endpoint.endpoint),
			tag("span", { class: "ep-tag" }, endpointTag),
		]),
		tag("div", [
			tag("p", { class: "ep-rps" }, formatNumber(endpoint.requestsPerSec)),
			tag("p", { class: "ep-rps-sub" }, "requests / sec"),
		]),
		tag("div", { "aria-label": "Relative throughput", class: "bar" }, [
			raw(`<div class="fill" style="width: ${width.toFixed(2)}%"></div>`),
		]),
		tag("div", { class: "ep-stats" }, [
			createEndpointStat(
				"Avg",
				prettyMilliseconds(endpoint.averageMs),
				"Mean response time across all requests in this run.",
			),
			createEndpointStat(
				"P95",
				prettyMilliseconds(endpoint.p95Ms),
				"95% of requests finished at or below this latency. The realistic user experience.",
			),
			createEndpointStat(
				"P99",
				prettyMilliseconds(endpoint.p99Ms),
				"99% of requests finished at or below this latency. The slow tail.",
			),
			createEndpointStat("Success", formatPercent(endpoint.successRatePct), getEndpointReturned(endpoint)),
		]),
	]);
}

function createEndpointStat(label: string, value: string, tip: string): HtmlNode {
	return tag("div", { class: "ep-stat" }, [
		tag("p", { class: "lbl" }, [
			label,
			tag(
				"span",
				{
					"aria-label": tip,
					class: "tip",
					"data-tip": tip,
					role: "button",
					tabindex: "0",
				},
				"i",
			),
		]),
		tag("span", { class: "val" }, value),
	]);
}

function createHtmlComparisonSection(hasBaseline: boolean): HtmlNode {
	return tag("section", { class: "section" }, [
		tag("div", { class: "section-head" }, [
			tag("h2", { class: "section-title", "data-num": "03" }, "Baseline comparison"),
			tag(
				"p",
				{ class: "section-sub" },
				"Pick a saved snapshot to recompute the delta chart and table. The verdict is a heuristic: 2 of {throughput, avg, p95} wins ⇒ better.",
			),
		]),
		tag("div", { class: "compare" }, [
			tag("div", { class: "compare-head" }, [
				tag("div", { class: "compare-meta" }, [
					tag("h3", "Choose a baseline"),
					tag(
						"p",
						{ class: "muted", style: "margin: 0; font-size: 0.8rem;" },
						evilTernary(
							hasBaseline,
							"Snapshots are saved under benchmarks/results/<timestamp>-<label>/.",
							"No saved baseline yet. Run another benchmark to populate this list.",
						),
					),
				]),
				tag("label", { class: "baseline-control" }, [
					"Baseline",
					tag("select", { disabled: !hasBaseline, id: "baseline-select" }),
				]),
			]),
			tag(
				"p",
				{ id: "baseline-details" },
				evilTernary(
					hasBaseline,
					"Select a baseline to update the delta chart above and the table below.",
					"No saved baseline yet. Run another benchmark to compare.",
				),
			),
			tag("div", { class: "cmp-table-wrap" }, [
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
			]),
		]),
	]);
}

function createGlossarySection(): HtmlNode {
	return tag("section", { "aria-label": "Metric glossary", class: "glossary" }, [
		tag("details", [
			tag("summary", "What do these numbers actually mean?"),
			tag("div", { class: "glossary-body" }, GLOSSARY_ENTRIES),
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
const chartTextColor = "#eef1ff";
const chartGridColor = "rgba(58, 69, 112, 0.45)";
const chartLabelColor = "#a3accc";
const goodColor = "#34d399";
const badColor = "#f87171";
const neutralColor = "#6b749a";
const currentSummary = reportData.current;
const baselineSelect = document.getElementById("baseline-select");
const baselineDetails = document.getElementById("baseline-details");
const comparisonBody = document.getElementById("comparison-body");
const endpointLabels = currentSummary.endpoints.map((endpoint) => endpoint.endpoint);

Chart.defaults.color = chartTextColor;
Chart.defaults.borderColor = chartGridColor;
Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';
Chart.defaults.font.size = 11;

const tooltipStyle = {
	backgroundColor: "#0a0d18",
	borderColor: "#3a4570",
	borderWidth: 1,
	clip: false,
	cornerRadius: 10,
	padding: 10,
	titleColor: "#eef1ff",
	titleFont: { size: 12, weight: "600" },
	bodyColor: "#a3accc",
	bodyFont: { size: 12 },
	caretSize: 6,
	displayColors: true,
	boxPadding: 4,
};
const commonScales = {
	x: {
		grid: { color: "transparent", drawTicks: false },
		ticks: { color: chartLabelColor, padding: 6, font: { size: 11 } },
		border: { color: "rgba(58, 69, 112, 0.6)" },
	},
	y: {
		beginAtZero: true,
		grid: { color: chartGridColor, drawTicks: false },
		ticks: { color: chartLabelColor, padding: 8, font: { size: 11 } },
		border: { display: false },
	},
};
const divergingScale = {
	x: commonScales.x,
	y: { ...commonScales.y, beginAtZero: false, grid: { color: chartGridColor, drawTicks: false } },
};
const currentThroughputColors = ["#818cf8", "#22d3ee", "#c084fc"];

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

function signColor(value, higherIsBetter) {
	if (value === 0) return neutralColor;
	const isGood = higherIsBetter ? value > 0 : value < 0;
	return isGood ? goodColor : badColor;
}

function selectedBaseline() {
	return reportData.baselines.find((baseline) => baseline.id === baselineSelect.value);
}

function baselineLabel(baseline) {
	return baseline.summary.label + " · " + new Date(baseline.summary.generatedAt).toLocaleString() + " · " + baseline.id;
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
		borderRadius: 8,
		borderSkipped: false,
		data: valuesFor(currentSummary, "requestsPerSec"),
		label: "Current req/s",
		maxBarThickness: 64,
	}];
	if (baseline) {
		datasets.push({
			backgroundColor: "rgba(163, 172, 204, 0.25)",
			borderColor: "rgba(163, 172, 204, 0.5)",
			borderWidth: 1,
			borderRadius: 8,
			borderSkipped: false,
			data: valuesFor(baseline.summary, "requestsPerSec"),
			label: "Baseline req/s",
			maxBarThickness: 64,
		});
	}
	return datasets;
}

function deltaValues(baseline, key) {
	return endpointLabels.map((endpointName) => percentChange(
		endpointValue(baseline.summary, endpointName, key),
		endpointValue(currentSummary, endpointName, key),
	));
}

function deltaDatasets(baseline) {
	if (!baseline) return [];
	const higherIsBetter = [true, false, false];
	const colors = ["#22d3ee", "#fbbf24", "#f87171"];
	return [
		{
			backgroundColor: colors.map((color) => color + "cc"),
			borderRadius: 6,
			borderSkipped: false,
			data: deltaValues(baseline, "requestsPerSec"),
			label: "Req/s Δ %",
			higherIsBetter: true,
			maxBarThickness: 36,
		},
		{
			backgroundColor: colors.map((color) => color + "cc"),
			borderRadius: 6,
			borderSkipped: false,
			data: deltaValues(baseline, "averageMs"),
			label: "Avg Δ %",
			higherIsBetter: false,
			maxBarThickness: 36,
		},
		{
			backgroundColor: colors.map((color) => color + "cc"),
			borderRadius: 6,
			borderSkipped: false,
			data: deltaValues(baseline, "p95Ms"),
			label: "P95 Δ %",
			higherIsBetter: false,
			maxBarThickness: 36,
		},
	].map((dataset) => {
		const hib = dataset.higherIsBetter;
		return Object.assign({}, dataset, {
			backgroundColor: dataset.data.map((value) => signColor(value, hib)),
		});
	});
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

const commonOptions = {
	animation: { duration: 350, easing: "easeOutCubic" },
	maintainAspectRatio: false,
	plugins: {
		legend: { display: false },
		tooltip: tooltipStyle,
	},
};

populateBaselineSelect();

const throughputChart = new Chart(document.getElementById("throughput-chart"), {
	data: {
		datasets: throughputDatasets(selectedBaseline()),
		labels: endpointLabels,
	},
	options: Object.assign({}, commonOptions, { scales: commonScales }),
	type: "bar",
});

new Chart(document.getElementById("latency-chart"), {
	data: {
		datasets: [
			{ backgroundColor: "#22d3ee", borderRadius: 6, borderSkipped: false, data: valuesFor(currentSummary, "averageMs"), label: "Avg ms", maxBarThickness: 24 },
			{ backgroundColor: "#c084fc", borderRadius: 6, borderSkipped: false, data: valuesFor(currentSummary, "p95Ms"), label: "P95 ms", maxBarThickness: 24 },
			{ backgroundColor: "#f472b6", borderRadius: 6, borderSkipped: false, data: valuesFor(currentSummary, "p99Ms"), label: "P99 ms", maxBarThickness: 24 },
		],
		labels: endpointLabels,
	},
	options: Object.assign({}, commonOptions, { scales: commonScales }),
	type: "bar",
});

new Chart(document.getElementById("success-chart"), {
	data: {
		datasets: [{
			backgroundColor: valuesFor(currentSummary, "successRatePct").map((value) => value >= 99.9 ? "#34d399" : value >= 95 ? "#fbbf24" : "#f87171"),
			borderRadius: 8,
			borderSkipped: false,
			data: valuesFor(currentSummary, "successRatePct"),
			label: "Success %",
			maxBarThickness: 48,
		}],
		labels: endpointLabels,
	},
	options: Object.assign({}, commonOptions, {
		scales: {
			x: commonScales.x,
			y: { ...commonScales.y, max: 100, min: 0 },
		},
	}),
	type: "bar",
});

const deltaChart = new Chart(document.getElementById("delta-chart"), {
	data: {
		datasets: deltaDatasets(selectedBaseline()),
		labels: endpointLabels,
	},
	options: Object.assign({}, commonOptions, {
		scales: divergingScale,
		plugins: Object.assign({}, commonOptions.plugins, {
			tooltip: Object.assign({}, tooltipStyle, {
				callbacks: {
					label: (context) => context.dataset.label + ": " + formatDelta(context.parsed.y),
				},
			}),
		}),
	}),
	type: "bar",
});

function updateComparison() {
	const baseline = selectedBaseline();
	const throughputDatasetsResult = throughputDatasets(baseline);
	const deltaDatasetsResult = deltaDatasets(baseline);
	throughputChart.data.datasets = throughputDatasetsResult;
	deltaChart.data.datasets = deltaDatasetsResult;
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
	const resultsRoot = join(cwd(), options.resultsDir);
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

function getListeningPort(server: Bun.Server<undefined>, serviceName: string): number {
	const { port } = server;
	if (typeof port === "number" && port > 0) return port;
	const error = new Error(`Expected ${serviceName} to listen on a tcp port.`);
	Error.captureStackTrace(error, getListeningPort);
	throw error;
}

async function chooseListeningPortAsync(host: string, requestedPort: number): Promise<number> {
	if (requestedPort !== 0) return requestedPort;

	return await new Promise<number>((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.once("error", reject);
		server.listen({ host, port: 0 }, () => {
			const address = server.address();
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				if (typeof address === "object" && address !== null) {
					resolve(address.port);
					return;
				}
				reject(new Error("Failed to allocate an available benchmark port."));
			});
		});
	});
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

	const { code, stderr, stdout } = await runCommandAsync("oha", parameters, { NO_COLOR: "false" });
	if (code !== 0) {
		const error = new Error(`oha failed for ${options.name}: ${stderr}`);
		Error.captureStackTrace(error, runOhaAsync);
		throw error;
	}
	return stdout.trim();
}

async function runCommandAsync(
	command: string,
	args: ReadonlyArray<string>,
	env: Readonly<Record<string, string>>,
): Promise<{ readonly code: number; readonly stderr: string; readonly stdout: string }> {
	return await new Promise((resolve, reject) => {
		const childProcess = spawn(command, args, {
			env: { ...processEnvironment, ...env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		childProcess.stdout.setEncoding("utf8");
		childProcess.stderr.setEncoding("utf8");
		childProcess.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		childProcess.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		childProcess.on("error", reject);
		childProcess.on("close", (code) => {
			resolve({ code: code ?? 1, stderr, stdout });
		});
	});
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
	const executablePath = Bun.which(command);
	if (!executablePath) {
		const error = new Error(`${command} is required but was not found on PATH.`);
		Error.captureStackTrace(error, ensureDependencyAsync);
		throw error;
	}
}

async function readComparisonSnapshotsAsync(resultsRoot: string): Promise<ReadonlyArray<BenchmarkSnapshot>> {
	let directoryNames: Array<string>;
	try {
		const entries = await readdir(resultsRoot, { encoding: "utf8", withFileTypes: true });
		directoryNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch (error) {
		if (isNotFoundError(error)) return [];
		throw error;
	}

	const snapshots = await Promise.all(
		directoryNames.map(async (directoryName) => readSnapshotSummaryIfExistsAsync(resultsRoot, directoryName)),
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
				JSON.parse(await readFile(summaryPath, "utf8")),
				`saved summary at ${summaryPath}`,
			),
		};
	} catch (error) {
		if (isNotFoundError(error)) return undefined;
		throw error;
	}
}

function isNotFoundError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
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

function getWidths(rows: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<number> {
	const widths: Array<number> = [];
	let size = 0;
	const columnCount = rows[0]?.length ?? 0;

	for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
		let maxWidth = 0;

		for (const row of rows) {
			const width = visibleLength(row[columnIndex] ?? "");
			if (width > maxWidth) maxWidth = width;
		}

		widths[size++] = maxWidth;
	}

	return widths;
}

function printAlignedTable(rows: ReadonlyArray<ReadonlyArray<string>>): void {
	const widths = getWidths(rows);
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

function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`;
}

function formatReportDate(isoString: string): string {
	const date = new Date(isoString);
	if (Number.isNaN(date.valueOf())) return isoString;
	const datePart = date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
	const timePart = date.toLocaleTimeString("en-US", {
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		second: "2-digit",
	});
	return `${datePart} · ${timePart}`;
}

function parseDurationToSeconds(duration: string): number {
	const match = /^(\d+(?:\.\d+)?)([smh])?$/u.exec(duration.trim());
	if (!match) return 0;
	const value = Number(match[1]);
	const unit = match[2] ?? "s";
	if (unit === "m") return value * 60;
	if (unit === "h") return value * 3600;
	return value;
}

function computeVerdict(previous: EndpointSummary, current: EndpointSummary): "better" | "mixed" | "worse" {
	const rpsWon = getPercentChange(previous.requestsPerSec, current.requestsPerSec) > 0;
	const avgWon = getPercentChange(previous.averageMs, current.averageMs) < 0;
	const p95Won = getPercentChange(previous.p95Ms, current.p95Ms) < 0;
	const score = Number(rpsWon) + Number(avgWon) + Number(p95Won);
	if (score >= 2) return "better";
	if (score === 1) return "mixed";
	return "worse";
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

function getFirstTimestamp(date: Date): string {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("");
}
function getSecondTimestamp(date: Date): string {
	return [
		String(date.getHours()).padStart(2, "0"),
		String(date.getMinutes()).padStart(2, "0"),
		String(date.getSeconds()).padStart(2, "0"),
	].join("");
}

function createTimestamp(date = new Date()): string {
	return `${getFirstTimestamp(date)}-${getSecondTimestamp(date)}`;
}
