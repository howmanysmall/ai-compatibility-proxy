#!/usr/bin/env -S deno run

import { setTimeout } from "node:timers/promises";
import { Command } from "@cliffy/command";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { bgGreen, bgRed, bold, cyan, dim, green, magenta, red, yellow } from "@std/fmt/colors";
import { Effect, Predicate } from "effect";

import type { ReadonlyRecord } from "effect/Record";

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
	readonly opencodeGoModel: OpenCodeGoModel;
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

type OpenCodeGoModel = (typeof OPENCODE_GO_MODELS)[number];
type ProviderName = "opencode-go" | "cerebras";
type ProviderSelection = ProviderName | "all";

const DEFAULT_PORT = 9876;
const DEFAULT_PROMPT = "Reply with only the single word: pong";
const OPENCODE_GO_MODELS = ["minimax-m3", "minimax-m2.7", "minimax-m2.5", "qwen3.7-max", "qwen3.6-plus"] as const;
const DEFAULT_OPENCODE_GO_MODEL = "minimax-m3" satisfies OpenCodeGoModel;
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
			if (exitCode !== 0) Deno.exit(exitCode);
		})
		.parse(Deno.args);
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
		Deno.stdin.isTerminal() &&
		Deno.stdout.isTerminal()
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
			const providerText = await Select.prompt({
				message: "Provider to test",
				options: [
					{ name: "All providers", value: "all" },
					{ name: "OpenCode Go", value: "opencode-go" },
					{ name: "Cerebras", value: "cerebras" },
				],
			});
			const provider = parseProvider(providerText);

			const opencodeGoModel = await ternaryAsync(
				shouldAskForOpenCodeGoModel(provider),
				async () => await promptForOpenCodeGoModelAsync(),
				async () => parseOpenCodeGoModel(commandOptions.opencodeModel ?? DEFAULT_OPENCODE_GO_MODEL),
			);

			const isLive = await Confirm.prompt({
				default: commandOptions.live === true,
				message: "Make live upstream requests?",
			});
			const portText = await Input.prompt({
				default: String(commandOptions.port ?? DEFAULT_PORT),
				message: "Local proxy port",
			});
			const prompt = await Input.prompt({
				default: commandOptions.prompt ?? DEFAULT_PROMPT,
				message: "Prompt",
			});

			return {
				isLive,
				opencodeGoModel,
				port: parsePort(Number(portText)),
				prompt,
				provider,
			};
		},
	});
}

async function promptForOpenCodeGoModelAsync(): Promise<OpenCodeGoModel> {
	const selectedModel = await Select.prompt({
		message: "OpenCode Go model",
		options: OPENCODE_GO_MODELS.map((availableModel) => ({ name: availableModel, value: availableModel })),
	});
	return parseOpenCodeGoModel(selectedModel);
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
		console.log(bold("Live proxy smoke dry run"));
		console.log("");
		console.log(
			dim("No upstream requests were made. Pass --live to run exactly one chat completion per provider."),
		);
		console.log(`${bold("Port:")} ${cyan(String(port))}`);
		console.log(`${bold("Prompt:")} ${cyan(prompt)}`);
		console.log("");

		const keyStatuses = yield* Effect.all(providerConfigurations.map(getKeyStatusEffect));
		for (const [index, providerConfiguration] of providerConfigurations.entries()) {
			const keyStatus = keyStatuses[index] ?? "unknown";

			let formattedKeyStatus: string;
			if (keyStatus.endsWith("is set") || keyStatus.endsWith("exists")) {
				formattedKeyStatus = green(keyStatus);
			} else if (keyStatus.endsWith("missing")) formattedKeyStatus = yellow(keyStatus);
			else formattedKeyStatus = red(keyStatus);

			console.log(`${bold(providerConfiguration.name)}:`);
			console.log(`│  ${dim("protocol:")} ${cyan(providerConfiguration.upstreamProtocol)}`);
			console.log(`│  ${dim("base URL:")} ${cyan(providerConfiguration.upstreamBaseUrl)}`);
			console.log(`│  ${dim("model:")} ${cyan(providerConfiguration.model)}`);
			console.log(`│  ${dim("max tokens:")} ${cyan(String(providerConfiguration.maxTokens))}`);
			console.log(`│  ${dim("key:")} ${formattedKeyStatus}`);
			console.log("");
		}

		console.log(bold("Examples:"));
		console.log(dim("  mise run live-smoke"));
		console.log(dim("  mise run live-smoke -- --dry-run"));
		console.log(dim("  mise run live-smoke -- --live"));
		console.log(dim("  mise run live-smoke -- --live --provider opencode-go"));
		console.log(dim("  mise run live-smoke -- --live --provider cerebras"));
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

function startProxyProcess(providerConfiguration: ProviderConfiguration, port: number): Deno.ChildProcess {
	const commandOptions = createCommandOptions(
		["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-sys=homedir", "src/index.ts"],
		{
			DEFAULT_MODEL: providerConfiguration.model,
			LOG_LEVEL: "warn",
			PORT: String(port),
			UPSTREAM_BASE_URL: providerConfiguration.upstreamBaseUrl,
			UPSTREAM_PROTOCOL: providerConfiguration.upstreamProtocol,
		},
	);
	return new Deno.Command(Deno.execPath(), commandOptions).spawn();
}

function createCommandOptions(
	parameters: ReadonlyArray<string>,
	environment: Record<string, string>,
): Deno.CommandOptions {
	const commandOptions: Deno.CommandOptions = {
		env: environment,
		stderr: "null",
		stdout: "null",
	};
	Object.defineProperty(commandOptions, "args", {
		enumerable: true,
		value: parameters,
	});
	return commandOptions;
}

function stopProxyProcessEffect(childProcess: Deno.ChildProcess): Effect.Effect<void, Error> {
	return Effect.tryPromise({
		catch: toError,
		try: async () => {
			try {
				childProcess.kill("SIGTERM");
			} catch {
				return;
			}

			await childProcess.status.catch(() => undefined);
		},
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

		yield* Effect.promise(() => setTimeout(100));
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
			const environmentValue = Deno.env.get(keyEnvironmentVariable)?.trim();
			if (environmentValue) return environmentValue;

			try {
				const fileContent = await Deno.readTextFile(keyFilePath);
				const fileValue = fileContent.trim();
				if (fileValue.length > 0) return fileValue;
			} catch (error) {
				if (!(error instanceof Deno.errors.NotFound)) throw error;
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
			if (Deno.env.get(keyEnvironmentVariable)?.trim()) return `${keyEnvironmentVariable} is set`;

			try {
				const fileInformation = await Deno.stat(keyFilePath);
				return fileInformation.isFile ? `${keyFilePath} exists` : `${keyFilePath} is not a file`;
			} catch (error) {
				if (error instanceof Deno.errors.NotFound) return `${keyFilePath} missing`;
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

function parseOpenCodeGoModel(value: string): OpenCodeGoModel {
	for (const model of OPENCODE_GO_MODELS) {
		if (value === model) return model;
	}

	const error = new Error(`Unknown OpenCode Go model: ${value}. Expected ${OPENCODE_GO_MODELS.join(", ")}.`);
	Error.captureStackTrace(error, parseOpenCodeGoModel);
	throw error;
}

function parseProvider(value: string): ProviderSelection {
	if (value === "all" || value === "opencode-go" || value === "cerebras") return value;

	const error = new Error(`Unknown provider: ${value}. Expected all, opencode-go, or cerebras.`);
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
	model: OpenCodeGoModel,
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
	if (!firstChoice) return undefined;
	return getString(firstChoice.finish_reason);
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

const DOT = dim("•");
const DIM_FINISH_REASON = dim("finish_reason");
const DURATION = dim("duration");
const HTTP = dim("HTTP");

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
	const state = success ? bgGreen(bold(" PASS ")) : bgRed(bold(" FAIL "));
	const statusColor = httpStatus >= 200 && httpStatus < 300 ? green(String(httpStatus)) : red(String(httpStatus));
	const modelMatches = requestedModel === upstreamModel;
	const modelColor = modelMatches ? cyan : yellow;
	const durationText = magenta(formatDuration(durationMs));
	const yellowFinish = yellow(finishReason ?? "undefined");

	console.log(`${state} ${bold(provider)}`);
	console.log(
		`  ${HTTP} ${statusColor}  ${DOT}  ${DURATION} ${durationText}  ${DOT}  ${DIM_FINISH_REASON} ${yellowFinish}`,
	);
	console.log(`  ${dim("requested_model")}  ${modelColor(requestedModel)}`);
	console.log(
		`  ${dim("upstream_model")}   ${modelColor(upstreamModel)}${modelMatches ? "" : yellow("  ⚠ differs")}`,
	);
	console.log("");
	printContentBlock(content, success);
	console.log(dim("─".repeat(80)));
}

function formatDuration(durationMs: number): string {
	if (!Number.isFinite(durationMs) || durationMs < 0) return "?";
	if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
	const seconds = durationMs / 1000;
	return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
}

function printContentBlock(content: string, success: boolean): void {
	const headerColor = success ? green : red;
	const header = success ? "┌─ response" : "┌─ response (failed)";
	console.log(`  ${headerColor(header)}`);

	if (content.length === 0) console.log(`  ${dim("│")} ${dim("(empty)")}`);
	else {
		const lines = content.split("\n");
		for (const line of lines) console.log(`  ${dim("│")} ${line}`);
	}
	console.log(`  ${dim("└─")}`);
}

function printSummary(results: ReadonlyArray<SmokeResult>): void {
	const passed = results.filter((result) => result.success).length;
	const total = results.length;

	let countColor = red;
	if (passed === total) countColor = green;
	else if (passed > 0) countColor = yellow;

	const countText = countColor(`${passed}/${total} providers passed.`);
	console.log("");
	console.log(`${bold("Summary:")} ${countText}`);
}

function getHomeDirectory(): string {
	const homeDirectory = Deno.env.get("HOME")?.trim();
	if (homeDirectory) return homeDirectory;

	const error = new Error("HOME is required to locate default key files.");
	Error.captureStackTrace(error, getHomeDirectory);
	throw error;
}

function toError(error: unknown): Error {
	return Predicate.isError(error) ? error : new Error(String(error));
}
