#!/usr/bin/env -S deno run

import { setTimeout } from "node:timers/promises";
import { Command } from "@cliffy/command";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { Effect, Predicate } from "effect";

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
	readonly port: number;
	readonly provider: ProviderSelection;
	readonly prompt: string;
}

interface SmokeResult {
	readonly content: string;
	readonly finishReason: string | undefined;
	readonly httpStatus: number;
	readonly model: string;
	readonly provider: ProviderName;
	readonly success: boolean;
}

interface LiveSmokeCommandOptions {
	readonly dryRun?: boolean | undefined;
	readonly interactive?: boolean | undefined;
	readonly live?: boolean | undefined;
	readonly port?: number | undefined;
	readonly prompt?: string | undefined;
	readonly provider?: string | undefined;
}

type ProviderName = "opencode-go" | "cerebras";
type ProviderSelection = ProviderName | "all";

const DEFAULT_PORT = 9876;
const DEFAULT_PROMPT = "Reply with only the single word: pong";
const KEY_DIRECTORY = `${getHomeDirectory()}/.config/ai-compatibility-proxy`;
const PROVIDERS: ReadonlyArray<ProviderConfiguration> = [
	{
		keyEnvironmentVariable: "OPENCODE_GO_API_KEY",
		keyFilePath: `${KEY_DIRECTORY}/opencode-go.key`,
		maxTokens: 1024,
		model: "minimax-m2.5",
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
		.option("--provider <provider:string>", "Provider to test: all, opencode-go, or cerebras.")
		.option("--port <port:number>", "Local temporary proxy port.")
		.option("--prompt <prompt:string>", "Prompt sent to each provider.")
		.example("Guided", "mise run live-smoke")
		.example("Dry run", "mise run live-smoke -- --dry-run")
		.example("Run both providers", "mise run live-smoke -- --live")
		.example("Run only OpenCode Go", "mise run live-smoke -- --live --provider opencode-go")
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

function shouldPrompt({ dryRun, live, port, prompt, provider }: LiveSmokeCommandOptions): boolean {
	return (
		dryRun !== true &&
		live !== true &&
		port === undefined &&
		prompt === undefined &&
		provider === undefined &&
		Deno.stdin.isTerminal() &&
		Deno.stdout.isTerminal()
	);
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
				port: parsePort(Number(portText)),
				prompt,
				provider: parseProvider(providerText),
			};
		},
	});
}

function runSmokeTestsEffect(smokeOptions: SmokeOptions): Effect.Effect<ReadonlyArray<SmokeResult>, Error> {
	return Effect.gen(function* runSmokeTestsGenerator() {
		const providerConfigurations = getProviderConfigurations(smokeOptions.provider);

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
		console.log("Live proxy smoke dry run");
		console.log("");
		console.log("No upstream requests were made. Pass --live to run exactly one chat completion per provider.");
		console.log(`Port: ${port}`);
		console.log(`Prompt: ${prompt}`);
		console.log("");

		const keyStatuses = yield* Effect.all(
			providerConfigurations.map((providerConfiguration) => getKeyStatusEffect(providerConfiguration)),
		);
		for (const [index, providerConfiguration] of providerConfigurations.entries()) {
			const keyStatus = keyStatuses[index] ?? "unknown";
			console.log(`${providerConfiguration.name}:`);
			console.log(`  protocol: ${providerConfiguration.upstreamProtocol}`);
			console.log(`  base URL: ${providerConfiguration.upstreamBaseUrl}`);
			console.log(`  model: ${providerConfiguration.model}`);
			console.log(`  max tokens: ${providerConfiguration.maxTokens}`);
			console.log(`  key: ${keyStatus}`);
		}
		console.log("");
		console.log("Examples:");
		console.log("  mise run live-smoke");
		console.log("  mise run live-smoke -- --dry-run");
		console.log("  mise run live-smoke -- --live");
		console.log("  mise run live-smoke -- --live --provider opencode-go");
		console.log("  mise run live-smoke -- --live --provider cerebras");
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
			const result = yield* requestChatCompletionEffect(providerConfiguration, apiKey, port, prompt);
			printResult(result);
			return result;
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
			const model = getString(body.model) ?? providerConfiguration.model;
			return {
				content,
				finishReason,
				httpStatus: response.status,
				model,
				provider: providerConfiguration.name,
				success: response.ok && content.length > 0,
			};
		},
	});
}

function createFailedResult(
	providerConfiguration: ProviderConfiguration,
	httpStatus: number,
	content: string,
): SmokeResult {
	return {
		content,
		finishReason: undefined,
		httpStatus,
		model: providerConfiguration.model,
		provider: providerConfiguration.name,
		success: false,
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

function normalizeCommandOptions({ live, port, prompt, provider }: LiveSmokeCommandOptions): SmokeOptions {
	return {
		isLive: live === true,
		port: parsePort(port ?? DEFAULT_PORT),
		prompt: prompt ?? DEFAULT_PROMPT,
		provider: parseProvider(provider ?? "all"),
	};
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

function getProviderConfigurations(provider: ProviderSelection): ReadonlyArray<ProviderConfiguration> {
	if (provider === "all") return PROVIDERS;
	return PROVIDERS.filter((providerConfiguration) => providerConfiguration.name === provider);
}

function getFirstChoiceMessageContent(body: Readonly<Record<string, unknown>>): string {
	const firstChoice = getFirstChoice(body);
	if (!firstChoice) return "";

	const { message } = firstChoice;
	return Predicate.isRecord(message) ? (getString(message.content) ?? "") : "";
}

function getFirstChoiceFinishReason(body: Readonly<Record<string, unknown>>): string | undefined {
	const firstChoice = getFirstChoice(body);
	if (!firstChoice) return undefined;
	return getString(firstChoice.finish_reason);
}

function getFirstChoice(body: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | undefined {
	const { choices } = body;
	if (!Array.isArray(choices)) return undefined;

	const [firstChoice] = choices;
	return Predicate.isRecord(firstChoice) ? firstChoice : undefined;
}

function getString(value: unknown): string | undefined {
	return Predicate.isString(value) ? value : undefined;
}

function printResult({ content, finishReason, httpStatus, model, provider, success }: SmokeResult): void {
	const state = success ? "PASS" : "FAIL";
	console.log(
		`${state} ${provider}: HTTP ${httpStatus}, model=${model}, finish_reason=${finishReason ?? "undefined"}`,
	);
	console.log(`  content: ${JSON.stringify(content)}`);
}

function printSummary(results: ReadonlyArray<SmokeResult>): void {
	const passed = results.filter((result) => result.success).length;
	console.log("");
	console.log(`Summary: ${passed}/${results.length} providers passed.`);
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
