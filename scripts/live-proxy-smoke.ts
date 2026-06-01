#!/usr/bin/env -S deno run

import { setTimeout } from "node:timers/promises";
import { Command } from "@cliffy/command";
import { Predicate } from "effect";

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
		.description("Run repeatable live smoke tests for the OpenCode Go and Cerebras proxy paths.")
		.option("--live", "Actually call upstream providers. Without this flag, performs a dry run only.")
		.option("--provider <provider:string>", "Provider to test: all, opencode-go, or cerebras.", { default: "all" })
		.option("--port <port:number>", "Local temporary proxy port.", { default: DEFAULT_PORT })
		.option("--prompt <prompt:string>", "Prompt sent to each provider.", { default: DEFAULT_PROMPT })
		.example("Dry run", "mise run live-smoke")
		.example("Run both providers", "mise run live-smoke -- --live")
		.example("Run only OpenCode Go", "mise run live-smoke -- --live --provider opencode-go")
		.action(async (options) => {
			const smokeOptions = normalizeCommandOptions(options);
			const results = await runSmokeTestsAsync(smokeOptions);
			if (results.some((result) => !result.success)) Deno.exit(1);
		})
		.parse(Deno.args);
}

async function runSmokeTestsAsync(smokeOptions: SmokeOptions): Promise<ReadonlyArray<SmokeResult>> {
	const providerConfigurations = getProviderConfigurations(smokeOptions.provider);

	if (!smokeOptions.isLive) {
		await printDryRunAsync(providerConfigurations, smokeOptions);
		return [];
	}

	const results = await testProvidersAsync(providerConfigurations, smokeOptions);
	printSummary(results);
	return results;
}

async function printDryRunAsync(
	providerConfigurations: ReadonlyArray<ProviderConfiguration>,
	{ port, prompt }: SmokeOptions,
): Promise<void> {
	console.log("Live proxy smoke dry run");
	console.log("");
	console.log("No upstream requests were made. Pass --live to run exactly one chat completion per provider.");
	console.log(`Port: ${port}`);
	console.log(`Prompt: ${prompt}`);
	console.log("");

	const keyStatuses = await Promise.all(
		providerConfigurations.map((providerConfiguration) => getKeyStatusAsync(providerConfiguration)),
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
	console.log("  mise run live-smoke -- --live");
	console.log("  mise run live-smoke -- --live --provider opencode-go");
	console.log("  mise run live-smoke -- --live --provider cerebras");
}

async function testProvidersAsync(
	providerConfigurations: ReadonlyArray<ProviderConfiguration>,
	smokeOptions: SmokeOptions,
): Promise<ReadonlyArray<SmokeResult>> {
	const [providerConfiguration, ...remainingProviderConfigurations] = providerConfigurations;
	if (providerConfiguration === undefined) return [];

	const result = await testProviderAsync(providerConfiguration, smokeOptions);
	const remainingResults = await testProvidersAsync(remainingProviderConfigurations, smokeOptions);
	return [result, ...remainingResults];
}

async function testProviderAsync(
	providerConfiguration: ProviderConfiguration,
	{ port, prompt }: SmokeOptions,
): Promise<SmokeResult> {
	const apiKey = await readApiKeyAsync(providerConfiguration);
	const childProcess = startProxyProcess(providerConfiguration, port);

	try {
		await waitForHealthAsync(port, providerConfiguration.name);
		const result = await requestChatCompletionAsync(providerConfiguration, apiKey, port, prompt);
		printResult(result);
		return result;
	} finally {
		await stopProxyProcessAsync(childProcess);
	}
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

async function stopProxyProcessAsync(childProcess: Deno.ChildProcess): Promise<void> {
	try {
		childProcess.kill("SIGTERM");
	} catch {
		return;
	}

	await childProcess.status.catch(() => undefined);
}

async function requestChatCompletionAsync(
	providerConfiguration: ProviderConfiguration,
	apiKey: string,
	port: number,
	prompt: string,
): Promise<SmokeResult> {
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

async function waitForHealthAsync(port: number, providerName: ProviderName): Promise<void> {
	await waitForHealthAttemptAsync(port, providerName, 0);
}

async function waitForHealthAttemptAsync(port: number, providerName: ProviderName, attempt: number): Promise<void> {
	if (attempt >= 20) {
		const error = new Error(`Timed out waiting for ${providerName} proxy on port ${port}.`);
		Error.captureStackTrace(error, waitForHealthAttemptAsync);
		throw error;
	}

	if (await isHealthyAsync(port)) return;

	await setTimeout(100);
	await waitForHealthAttemptAsync(port, providerName, attempt + 1);
}

async function isHealthyAsync(port: number): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/health`);
		return response.ok;
	} catch {
		return false;
	}
}

async function readApiKeyAsync({ keyEnvironmentVariable, keyFilePath, name }: ProviderConfiguration): Promise<string> {
	const environmentValue = Deno.env.get(keyEnvironmentVariable)?.trim();
	if (environmentValue) return environmentValue;

	try {
		const fileContent = await Deno.readTextFile(keyFilePath);
		const fileValue = fileContent.trim();
		if (fileValue.length > 0) return fileValue;
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}

	const error = new Error(`Missing ${name} key. Set ${keyEnvironmentVariable} or create ${keyFilePath}.`);
	Error.captureStackTrace(error, readApiKeyAsync);
	throw error;
}

async function getKeyStatusAsync({ keyEnvironmentVariable, keyFilePath }: ProviderConfiguration): Promise<string> {
	if (Deno.env.get(keyEnvironmentVariable)?.trim()) return `${keyEnvironmentVariable} is set`;

	try {
		const fileInformation = await Deno.stat(keyFilePath);
		return fileInformation.isFile ? `${keyFilePath} exists` : `${keyFilePath} is not a file`;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return `${keyFilePath} missing`;
		return `${keyFilePath} could not be read`;
	}
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
	if (!Predicate.isRecord(message)) return "";
	return getString(message.content) ?? "";
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
	return typeof value === "string" ? value : undefined;
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
