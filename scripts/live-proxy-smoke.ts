#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { env as processEnvironment, execPath, exit, stdin, stdout } from "node:process";
import { Command } from "@cliffy/command";
// oxlint-disable-next-line import/no-namespace -- Number conflicts with Number
import * as Prompt from "@cliffy/prompt";
import { argv } from "bun";
import { bgGreen, bgRed, black, bold, cyan, dim, green, magenta, red, yellow } from "colorette";
import { Effect, Predicate } from "effect";
import prettyMilliseconds from "pretty-ms";

import type { ReadonlyRecord } from "effect/Record";
import type { ChildProcess } from "node:child_process";

// oxlint-disable-next-line prefer-regex-literals
const CLEAN_REGEXP = new RegExp(String.raw`\x1b\[[0-9;]*m`, "gu");

interface ProviderConfiguration {
	readonly keyEnvironmentVariable: string;
	readonly keyFilePath: string;
	readonly maxTokens: number;
	readonly model: string;
	readonly name: ProviderName;
	readonly upstreamBaseUrl: string;
	readonly upstreamProtocol: "anthropic_messages" | "cerebras_openai";
}

interface SmokeOptions {
	readonly isLive: boolean;
	readonly opencodeGoModel: string;
	readonly port: number;
	readonly provider: ProviderSelection;
	readonly prompt: string;
}

interface SmokeResult {
	readonly content: string;
	readonly durationMs: number;
	readonly finishReason: string | undefined;
	readonly httpStatus: number;
	readonly provider: ProviderName;
	readonly requestedModel: string;
	readonly success: boolean;
	readonly upstreamModel: string;
}

interface LiveSmokeCommandOptions {
	readonly dryRun?: boolean | undefined;
	readonly interactive?: boolean | undefined;
	readonly live?: boolean | undefined;
	readonly opencodeModel?: string | undefined;
	readonly port?: number | undefined;
	readonly prompt?: string | undefined;
	readonly provider?: string | undefined;
}

type ProviderName = "opencode-go" | "cerebras" | "kimi-for-coding";
type ProviderSelection = ProviderName | "all";

const DEFAULT_PORT = 9876;
const DEFAULT_PROMPT = "Reply with only the single word: pong";
const DEFAULT_OPENCODE_GO_MODEL = "minimax-m3";
const KEY_DIRECTORY = `${getHomeDirectory()}/.config/ai-compatibility-proxy`;

const PROVIDERS: ReadonlyArray<ProviderConfiguration> = [
	{
		keyEnvironmentVariable: "OPENCODE_GO_API_KEY",
		keyFilePath: `${KEY_DIRECTORY}/opencode-go.key`,
		maxTokens: 1024,
		model: DEFAULT_OPENCODE_GO_MODEL,
		name: "opencode-go",
		upstreamBaseUrl: "https://opencode.ai/zen/go/v1",
		upstreamProtocol: "anthropic_messages",
	},
	{
		keyEnvironmentVariable: "CEREBRAS_API_KEY",
		keyFilePath: `${KEY_DIRECTORY}/cerebras.key`,
		maxTokens: 512,
		model: "gpt-oss-120b",
		name: "cerebras",
		upstreamBaseUrl: "https://api.cerebras.ai/v1",
		upstreamProtocol: "cerebras_openai",
	},
	{
		keyEnvironmentVariable: "KIMI_API_KEY",
		keyFilePath: `${KEY_DIRECTORY}/kimi-coding.key`,
		maxTokens: 1024,
		model: "kimi-k2-thinking",
		name: "kimi-for-coding",
		upstreamBaseUrl: "https://api.kimi.com/coding/v1",
		upstreamProtocol: "anthropic_messages",
	},
];

if (import.meta.main) {
	await new Command()
		.name("live-proxy-smoke")
		.description("Run repeatable smoke tests for the OpenCode Go and Cerebras proxy paths.")
		.option("-i, --interactive", "Prompt for provider, live mode, port, and prompt, even when flags are present.")
		.option("--dry-run", "Print the planned smoke tests without prompts or upstream requests.")
		.option("--live", "Actually call upstream providers. Without this flag, performs a dry run only.")
		.option("--opencode-model <model:string>", "OpenCode Go model to test.")
		.option("--provider <provider:string>", "Provider to test: all, opencode-go, or cerebras.")
		.option("--port <port:number>", "Local temporary proxy port.")
		.option("--prompt <prompt:string>", "Prompt sent to each provider.")
		.example("Guided", "mise run live-smoke")
		.example("Dry run", "mise run live-smoke -- --dry-run")
		.example("Run both providers", "mise run live-smoke -- --live")
		.example(
			"Run OpenCode model",
			"mise run live-smoke -- --live --provider opencode-go --opencode-model qwen3.7-max",
		)
		.action(async (options) => {
			const exitCode = await Effect.runPromise(runCommandEffect(options));
			if (exitCode !== 0) exit(exitCode);
		})
		.parse(argv.slice(2));
}

function runCommandEffect(commandOptions: LiveSmokeCommandOptions): Effect.Effect<number, Error> {
	return Effect.gen(function* runCommandGenerator() {
		const smokeOptions = yield* resolveSmokeOptionsEffect(commandOptions);
		const results = yield* runSmokeTestsEffect(smokeOptions);
		return results.some((result) => !result.success) ? 1 : 0;
	});
}

function resolveSmokeOptionsEffect(commandOptions: LiveSmokeCommandOptions): Effect.Effect<SmokeOptions, Error> {
	if (commandOptions.interactive === true || shouldPrompt(commandOptions)) {
		return promptForSmokeOptionsEffect(commandOptions);
	}
	return Effect.sync(() => normalizeCommandOptions(commandOptions));
}

function shouldPrompt({ dryRun, live, opencodeModel, port, prompt, provider }: LiveSmokeCommandOptions): boolean {
	return (
		dryRun !== true &&
		live !== true &&
		opencodeModel === undefined &&
		port === undefined &&
		prompt === undefined &&
		provider === undefined &&
		stdin.isTTY &&
		stdout.isTTY
	);
}

async function ternaryAsync<TValue>(
	condition: boolean,
	getTrueAsync: () => Promise<TValue>,
	getFalseAsync: () => Promise<TValue>,
): Promise<TValue> {
	return condition ? getTrueAsync() : getFalseAsync();
}

function promptForSmokeOptionsEffect(commandOptions: LiveSmokeCommandOptions): Effect.Effect<SmokeOptions, Error> {
	return Effect.tryPromise({
		catch: toError,
		try: async () => {
			printHeader("AI Compatibility Proxy - Interactive Smoke Test", "🚀");
			console.log("");
			const providerText = await Prompt.Select.prompt({
				message: "Provider to test",
				options: [
					{ name: "All providers", value: "all" },
					{ name: "OpenCode Go", value: "opencode-go" },
					{ name: "Cerebras", value: "cerebras" },
					{ name: "Kimi For Coding", value: "kimi-for-coding" },
				],
			});
			const provider = parseProvider(providerText);

			const opencodeGoModel = await ternaryAsync(
				shouldAskForOpenCodeGoModel(provider),
				async () => await promptForOpenCodeGoModelAsync(),
				async () => parseOpenCodeGoModel(commandOptions.opencodeModel ?? DEFAULT_OPENCODE_GO_MODEL),
			);

			const isLive = await Prompt.Confirm.prompt({
				default: commandOptions.live === true,
				message: "Make live upstream requests?",
			});
			const portText = await Prompt.Number.prompt({
				default: commandOptions.port ?? DEFAULT_PORT,
				float: false,
				max: 65535,
				message: "Local proxy port",
				min: 1,
			});
			const prompt = await Prompt.Input.prompt({
				default: commandOptions.prompt ?? DEFAULT_PROMPT,
				message: "Prompt",
			});

			return {
				isLive,
				opencodeGoModel,
				port: parsePort(portText),
				prompt,
				provider,
			};
		},
	});
}

async function promptForOpenCodeGoModelAsync(): Promise<string> {
	return parseOpenCodeGoModel(
		await Prompt.Input.prompt({
			default: DEFAULT_OPENCODE_GO_MODEL,
			message: "OpenCode Go model",
		}),
	);
}

function shouldAskForOpenCodeGoModel(provider: ProviderSelection): boolean {
	return provider === "all" || provider === "opencode-go";
}

function runSmokeTestsEffect(smokeOptions: SmokeOptions): Effect.Effect<ReadonlyArray<SmokeResult>, Error> {
	return Effect.gen(function* runSmokeTestsGenerator() {
		const providerConfigurations = getProviderConfigurations(smokeOptions);

		if (!smokeOptions.isLive) {
			yield* printDryRunEffect(providerConfigurations, smokeOptions);
			return [];
		}

		printHeader("Running Live Proxy Smoke Tests", "⚡");
		console.log("");
		console.log(`  ${bold("Port:")}   ${cyan(String(smokeOptions.port))}`);
		console.log(`  ${bold("Prompt:")} ${cyan(smokeOptions.prompt)}`);
		console.log("");

		const results = yield* testProvidersEffect(providerConfigurations, smokeOptions);
		printSummary(results);
		return results;
	});
}

function printDryRunEffect(
	providerConfigurations: ReadonlyArray<ProviderConfiguration>,
	{ port, prompt }: SmokeOptions,
): Effect.Effect<void, Error> {
	return Effect.gen(function* printDryRunGenerator() {
		printHeader("Live Proxy Smoke Dry Run", "🔍");
		console.log("");
		console.log(
			`  ${dim("No upstream requests were made. Pass --live to run exactly one completion per provider.")}`,
		);
		console.log("");
		console.log(`  ${bold("⚙️  Configuration:")}`);
		console.log(`  ${dim("├─")} ${bold("Port:")}   ${cyan(String(port))}`);
		console.log(`  ${dim("└─")} ${bold("Prompt:")} ${cyan(prompt)}`);
		console.log("");
		console.log(`  ${bold("📦 Providers to test:")}`);
		console.log("");

		const keyStatuses = yield* Effect.all(providerConfigurations.map(getKeyStatusEffect));
		for (const [index, providerConfiguration] of providerConfigurations.entries()) {
			const keyStatus = keyStatuses[index] ?? "unknown";

			let formattedKeyStatus: string;
			if (keyStatus.endsWith("is set") || keyStatus.endsWith("exists")) {
				formattedKeyStatus = green(keyStatus);
			} else if (keyStatus.endsWith("missing")) formattedKeyStatus = yellow(keyStatus);
			else formattedKeyStatus = red(keyStatus);

			const borderStyle = cyan;
			printBoxTop(bold(providerConfiguration.name), 80, borderStyle);
			printBoxRow(`${dim("Protocol:")}   ${cyan(providerConfiguration.upstreamProtocol)}`, 80, borderStyle);
			printBoxRow(`${dim("Base URL:")}   ${cyan(providerConfiguration.upstreamBaseUrl)}`, 80, borderStyle);
			printBoxRow(`${dim("Model:")}      ${cyan(providerConfiguration.model)}`, 80, borderStyle);
			printBoxRow(`${dim("Max Tokens:")} ${cyan(String(providerConfiguration.maxTokens))}`, 80, borderStyle);
			printBoxRow(`${dim("API Key:")}    ${formattedKeyStatus}`, 80, borderStyle);
			printBoxBottom(80, borderStyle);
			console.log("");
		}
		console.log(`  ${bold("💡 Examples:")}`);
		console.log(`  ${dim("  mise run live-smoke")}`);
		console.log(`  ${dim("  mise run live-smoke -- --dry-run")}`);
		console.log(`  ${dim("  mise run live-smoke -- --live")}`);
		console.log(`  ${dim("  mise run live-smoke -- --live --provider opencode-go")}`);
		console.log(`  ${dim("  mise run live-smoke -- --live --provider cerebras")}`);
		console.log(`  ${dim("  mise run live-smoke -- --live --provider kimi-for-coding")}`);
		console.log("");
	});
}

function testProvidersEffect(
	providerConfigurations: ReadonlyArray<ProviderConfiguration>,
	smokeOptions: SmokeOptions,
): Effect.Effect<ReadonlyArray<SmokeResult>, Error> {
	const [providerConfiguration, ...remainingProviderConfigurations] = providerConfigurations;
	if (providerConfiguration === undefined) return Effect.succeed([]);

	return Effect.gen(function* testProvidersGenerator() {
		const result = yield* testProviderEffect(providerConfiguration, smokeOptions);
		const remainingResults = yield* testProvidersEffect(remainingProviderConfigurations, smokeOptions);
		return [result, ...remainingResults];
	});
}

function testProviderEffect(
	providerConfiguration: ProviderConfiguration,
	{ port, prompt }: SmokeOptions,
): Effect.Effect<SmokeResult, Error> {
	return Effect.gen(function* testProviderGenerator() {
		const apiKey = yield* readApiKeyEffect(providerConfiguration);
		const childProcess = startProxyProcess(providerConfiguration, port);

		try {
			yield* waitForHealthEffect(port, providerConfiguration.name);
			const startTime = performance.now();
			const result = yield* requestChatCompletionEffect(providerConfiguration, apiKey, port, prompt);
			const durationMs = performance.now() - startTime;
			const resultWithDuration: SmokeResult = { ...result, durationMs };
			printResult(resultWithDuration);
			return resultWithDuration;
		} finally {
			yield* stopProxyProcessEffect(childProcess);
		}
	});
}

function startProxyProcess(providerConfiguration: ProviderConfiguration, port: number): ChildProcess {
	return spawn(execPath, ["src/index.ts"], {
		env: {
			...processEnvironment,
			DEFAULT_MODEL: providerConfiguration.model,
			LOG_LEVEL: "warn",
			PORT: String(port),
			UPSTREAM_BASE_URL: providerConfiguration.upstreamBaseUrl,
			UPSTREAM_PROTOCOL: providerConfiguration.upstreamProtocol,
		},
		stdio: "ignore",
	});
}

function stopProxyProcessEffect(childProcess: ChildProcess): Effect.Effect<void, Error> {
	return Effect.tryPromise({
		catch: toError,
		try: async () => {
			try {
				childProcess.kill("SIGTERM");
			} catch {
				return;
			}

			await waitForChildExitAsync(childProcess);
		},
	});
}

async function waitForChildExitAsync(childProcess: ChildProcess): Promise<void> {
	if (childProcess.exitCode !== null) return;

	await new Promise<void>((resolve) => {
		childProcess.once("close", () => resolve());
	});
}

function requestChatCompletionEffect(
	providerConfiguration: ProviderConfiguration,
	apiKey: string,
	port: number,
	prompt: string,
): Effect.Effect<SmokeResult, Error> {
	return Effect.tryPromise({
		catch: toError,
		try: async () => {
			const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
				body: JSON.stringify({
					max_tokens: providerConfiguration.maxTokens,
					messages: [{ content: prompt, role: "user" }],
					model: providerConfiguration.model,
					temperature: 0,
				}),
				headers: {
					authorization: `Bearer ${apiKey}`,
					"content-type": "application/json",
				},
				method: "POST",
			});
			const body = await response.json();
			if (!Predicate.isRecord(body)) {
				return createFailedResult(providerConfiguration, response.status, "non-object response");
			}

			const content = getFirstChoiceMessageContent(body);
			const finishReason = getFirstChoiceFinishReason(body);
			const upstreamModel = getString(body.model) ?? providerConfiguration.model;
			return {
				content,
				finishReason,
				httpStatus: response.status,
				provider: providerConfiguration.name,
				requestedModel: providerConfiguration.model,
				success: response.ok && content.length > 0,
				upstreamModel,
			} as SmokeResult;
		},
	});
}

function createFailedResult(
	providerConfiguration: ProviderConfiguration,
	httpStatus: number,
	content: string,
	durationMs = 0,
): SmokeResult {
	return {
		content,
		durationMs,
		finishReason: undefined,
		httpStatus,
		provider: providerConfiguration.name,
		requestedModel: providerConfiguration.model,
		success: false,
		upstreamModel: providerConfiguration.model,
	};
}

function waitForHealthEffect(port: number, providerName: ProviderName): Effect.Effect<void, Error> {
	return waitForHealthAttemptEffect(port, providerName, 0);
}

function waitForHealthAttemptEffect(
	port: number,
	providerName: ProviderName,
	attempt: number,
): Effect.Effect<void, Error> {
	if (attempt >= 20) {
		const error = new Error(`Timed out waiting for ${providerName} proxy on port ${port}.`);
		Error.captureStackTrace(error, waitForHealthAttemptEffect);
		return Effect.fail(error);
	}

	return Effect.gen(function* waitForHealthAttemptGenerator() {
		const isHealthy = yield* isHealthyEffect(port);
		if (isHealthy) return;

		yield* Effect.sleep("100 millis");
		yield* waitForHealthAttemptEffect(port, providerName, attempt + 1);
	});
}

function isHealthyEffect(port: number): Effect.Effect<boolean, never> {
	return Effect.promise(async () => {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`);
			return response.ok;
		} catch {
			return false;
		}
	});
}

function readApiKeyEffect({
	keyEnvironmentVariable,
	keyFilePath,
	name,
}: ProviderConfiguration): Effect.Effect<string, Error> {
	return Effect.tryPromise({
		catch: toError,
		try: async () => {
			const environmentValue = processEnvironment[keyEnvironmentVariable]?.trim();
			if (environmentValue) return environmentValue;

			try {
				const fileContent = await readFile(keyFilePath, "utf8");
				const fileValue = fileContent.trim();
				if (fileValue.length > 0) return fileValue;
			} catch (error) {
				if (!isNotFoundError(error)) throw error;
			}

			throw new Error(`Missing ${name} key. Set ${keyEnvironmentVariable} or create ${keyFilePath}.`);
		},
	});
}

function getKeyStatusEffect({
	keyEnvironmentVariable,
	keyFilePath,
}: ProviderConfiguration): Effect.Effect<string, Error> {
	return Effect.tryPromise({
		catch: toError,
		try: async () => {
			if (processEnvironment[keyEnvironmentVariable]?.trim()) return `${keyEnvironmentVariable} is set`;

			try {
				const fileInformation = await stat(keyFilePath);
				return fileInformation.isFile() ? `${keyFilePath} exists` : `${keyFilePath} is not a file`;
			} catch (error) {
				if (isNotFoundError(error)) return `${keyFilePath} missing`;
				return `${keyFilePath} could not be read`;
			}
		},
	});
}

function normalizeCommandOptions({
	live,
	opencodeModel,
	port,
	prompt,
	provider,
}: LiveSmokeCommandOptions): SmokeOptions {
	return {
		isLive: live === true,
		opencodeGoModel: parseOpenCodeGoModel(opencodeModel ?? DEFAULT_OPENCODE_GO_MODEL),
		port: parsePort(port ?? DEFAULT_PORT),
		prompt: prompt ?? DEFAULT_PROMPT,
		provider: parseProvider(provider ?? "all"),
	};
}

function parseOpenCodeGoModel(value: string): string {
	const normalizedValue = value.trim();
	if (normalizedValue.length > 0) return normalizedValue;

	const error = new Error("OpenCode Go model must be a non-empty string.");
	Error.captureStackTrace(error, parseOpenCodeGoModel);
	throw error;
}

function parseProvider(value: string): ProviderSelection {
	if (value === "all" || value === "opencode-go" || value === "cerebras" || value === "kimi-for-coding") return value;

	const error = new Error(`Unknown provider: ${value}. Expected all, opencode-go, cerebras, or kimi-for-coding.`);
	Error.captureStackTrace(error, parseProvider);
	throw error;
}

function parsePort(value: number): number {
	if (Number.isInteger(value) && value > 0 && value <= 65_535) return value;

	const error = new Error(`Invalid port: ${value}`);
	Error.captureStackTrace(error, parsePort);
	throw error;
}

function getProviderConfigurations({ opencodeGoModel, provider }: SmokeOptions): ReadonlyArray<ProviderConfiguration> {
	const providerConfigurations = PROVIDERS.map((providerConfiguration) => {
		if (providerConfiguration.name !== "opencode-go") return providerConfiguration;
		return createProviderConfiguration(providerConfiguration, opencodeGoModel);
	});

	if (provider === "all") return providerConfigurations;
	return providerConfigurations.filter((providerConfiguration) => providerConfiguration.name === provider);
}

function createProviderConfiguration(
	providerConfiguration: ProviderConfiguration,
	model: string,
): ProviderConfiguration {
	return {
		keyEnvironmentVariable: providerConfiguration.keyEnvironmentVariable,
		keyFilePath: providerConfiguration.keyFilePath,
		maxTokens: providerConfiguration.maxTokens,
		model,
		name: providerConfiguration.name,
		upstreamBaseUrl: providerConfiguration.upstreamBaseUrl,
		upstreamProtocol: providerConfiguration.upstreamProtocol,
	};
}

function getFirstChoiceMessageContent(body: ReadonlyRecord<string, unknown>): string {
	const firstChoice = getFirstChoice(body);
	if (!firstChoice) return "";

	const { message } = firstChoice;
	return Predicate.isRecord(message) ? (getString(message.content) ?? "") : "";
}

function getFirstChoiceFinishReason(body: ReadonlyRecord<string, unknown>): string | undefined {
	const firstChoice = getFirstChoice(body);
	return firstChoice ? getString(firstChoice.finish_reason) : undefined;
}

function getFirstChoice(body: ReadonlyRecord<string, unknown>): ReadonlyRecord<string, unknown> | undefined {
	const { choices } = body;
	if (!Array.isArray(choices)) return undefined;

	const [firstChoice] = choices;
	return Predicate.isRecord(firstChoice) ? firstChoice : undefined;
}

function getString(value: unknown): string | undefined {
	return Predicate.isString(value) ? value : undefined;
}

function printResult({
	content,
	durationMs,
	finishReason,
	httpStatus,
	provider,
	requestedModel,
	success,
	upstreamModel,
}: SmokeResult): void {
	const borderStyle = success ? green : red;
	const stateLabel = success ? bgGreen(bold(black(" PASS "))) : bgRed(bold(black(" FAIL ")));
	const title = `${stateLabel}  ${bold(provider)}`;

	const statusColor = httpStatus >= 200 && httpStatus < 300 ? green(String(httpStatus)) : red(String(httpStatus));
	const modelMatches = requestedModel === upstreamModel;
	const modelColor = modelMatches ? cyan : yellow;
	const durationText = magenta(prettyMilliseconds(durationMs));
	const yellowFinish = yellow(finishReason ?? "undefined");

	printBoxTop(title, 80, borderStyle);
	printBoxRow(`${dim(bold("HTTP Status:"))}      ${statusColor}`, 80, borderStyle);
	printBoxRow(`${dim(bold("Duration:"))}         ${durationText}`, 80, borderStyle);
	printBoxRow(`${dim(bold("Finish Reason:"))}    ${yellowFinish}`, 80, borderStyle);
	printBoxRow(`${dim(bold("Requested Model:"))}  ${modelColor(requestedModel)}`, 80, borderStyle);
	const modelWarning = modelMatches ? "" : yellow("  ⚠ differs");
	printBoxRow(`${dim(bold("Upstream Model:"))}   ${modelColor(upstreamModel)}${modelWarning}`, 80, borderStyle);

	printBoxDivider(80, borderStyle);

	const responseHeader = success ? "Response" : "Response (failed)";
	printBoxRow(bold(responseHeader), 80, borderStyle);

	if (content.length === 0) printBoxRow(dim("(empty)"), 80, borderStyle);
	else {
		const maxContentWidth = 80 - 8;
		const lines = content.split("\n");
		for (const line of lines) {
			if (line.length === 0) {
				printBoxRow("", 80, borderStyle);
				continue;
			}
			let remaining = line;
			while (remaining.length > maxContentWidth) {
				const chunk = remaining.slice(0, maxContentWidth);
				printBoxRow(`  ${chunk}`, 80, borderStyle);
				remaining = remaining.slice(maxContentWidth);
			}
			printBoxRow(`  ${remaining}`, 80, borderStyle);
		}
	}
	printBoxBottom(80, borderStyle);
}

function printSummary(results: ReadonlyArray<SmokeResult>): void {
	const total = results.length;
	if (total === 0) return;

	const passed = results.filter((result) => result.success).length;
	const failed = total - passed;

	let statusIcon = "🟢";
	let summaryText = green(`${passed}/${total} passed`);

	if (passed === 0) {
		statusIcon = "🔴";
		summaryText = red(`${passed}/${total} passed`);
	} else if (failed > 0) {
		statusIcon = "🟡";
		summaryText = yellow(`${passed}/${total} passed`);
	}

	const failedDetail = failed > 0 ? red(` (${failed} failed)`) : "";

	console.log("");
	console.log(`  ${statusIcon}  ${bold("Summary:")} ${summaryText}${failedDetail}`);
	console.log("");
}

function getHomeDirectory(): string {
	const homeDirectory = processEnvironment.HOME?.trim();
	if (homeDirectory) return homeDirectory;

	const error = new Error("HOME is required to locate default key files.");
	Error.captureStackTrace(error, getHomeDirectory);
	throw error;
}

function toError(error: unknown): Error {
	return Predicate.isError(error) ? error : new Error(String(error));
}

function isNotFoundError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function visualLength(value: string): number {
	const clean = value.replaceAll(CLEAN_REGEXP, "");
	let length = 0;
	let index = 0;
	while (index < clean.length) {
		const character = clean[index];
		if (character === undefined) break;

		const codePoint = clean.codePointAt(index);
		if (!codePoint) {
			index += 1;
			continue;
		}

		const nextCharacter = clean[index + 1];
		const nextNextCharacter = clean[index + 2];

		const isDigit = (codePoint >= 0x30 && codePoint <= 0x39) || character === "#" || character === "*";
		if (isDigit) {
			if (nextCharacter === "\u20E3") {
				length += 1;
				index += 2;
				continue;
			}
			if (nextCharacter === "\uFE0F" && nextNextCharacter === "\u20E3") {
				length += 1;
				index += 3;
				continue;
			}
		}

		if (codePoint > 0xffff || (codePoint >= 0x2600 && codePoint <= 0x27bf)) {
			length += 2;
			index += codePoint > 0xffff ? 2 : 1;
		} else {
			length += 1;
			index += 1;
		}
	}
	return length;
}

function printHeader(title: string, icon = "🚀"): void {
	const titleText = `${icon}  ${title}`;
	const contentWidth = visualLength(titleText);
	const totalWidth = Math.max(60, contentWidth + 6);
	const paddingLength = totalWidth - contentWidth - 6;
	const padRight = " ".repeat(paddingLength);
	console.log(cyan(`┌${"─".repeat(totalWidth - 2)}┐`));
	console.log(`${cyan("│")}  ${bold(titleText)}${padRight}  ${cyan("│")}`);
	console.log(cyan(`└${"─".repeat(totalWidth - 2)}┘`));
}

function printBoxTop(title: string, width = 80, borderStyle = cyan): void {
	const titleLength = visualLength(title);
	const top = borderStyle(`┌─ ${title} ${"─".repeat(Math.max(0, width - 5 - titleLength))}┐`);
	console.log(`  ${top}`);
}

function printBoxRow(content: string, width = 80, borderStyle = cyan): void {
	const padLength = Math.max(0, width - 6 - visualLength(content));
	console.log(`  ${borderStyle("│")}  ${content}${" ".repeat(padLength)}  ${borderStyle("│")}`);
}

function printBoxDivider(width = 80, borderStyle = cyan): void {
	const middle = borderStyle(`├${"─".repeat(width - 2)}┤`);
	console.log(`  ${middle}`);
}

function printBoxBottom(width = 80, borderStyle = cyan): void {
	const bottom = borderStyle(`└${"─".repeat(width - 2)}┘`);
	console.log(`  ${bottom}`);
}
