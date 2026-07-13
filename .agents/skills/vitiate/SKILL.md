---
name: vitiate
description: Use when setting up, writing, running, debugging, or maintaining Vitiate coverage-guided fuzz tests for JavaScript or TypeScript projects using Vitest, Vite, fuzz(), FuzzedDataProvider, corpus artifacts, dictionaries, detectors, or vitiate CLI commands.
---

# Vitiate

Vitiate is coverage-guided fuzzing for JavaScript and TypeScript, built as a Vitest plugin. Use it when code processes untrusted input: parsers, validators, serializers, protocol handlers, API handlers, routers, file paths, URLs, regex-heavy logic, or security-sensitive transforms.

## Fit Check

Use Vitiate when the project has or can use:

- Node.js 18+, Vite 6+, and Vitest 3.1+
- Test targets that can be called repeatedly with generated `Buffer` inputs
- Fast, deterministic code paths with expected errors separated from real bugs

Do not assume Bun-native coverage-guided fuzzing. Vitiate is a Vitest plugin with a native Node.js addon (`@vitiate/engine`). For Bun projects, run Vitiate through the project’s Node/Vitest toolchain unless verified otherwise.

## Install

Install the wrapper package when CLI commands are needed:

```sh
npm install --save-dev vitiate
```

Install only the plugin/API package when the standalone CLI is not needed:

```sh
npm install --save-dev @vitiate/core
```

Install structured input helpers when the target needs typed values instead of raw bytes:

```sh
npm install --save-dev @vitiate/fuzzed-data-provider
```

In repos using `@antfu/ni`, translate installs and one-off commands through `ni`/`nlx`/`nr` and any project wrapper such as `mise x --`.

## Vitest Configuration

Add `vitiatePlugin()` and split unit and fuzz tests into separate Vitest projects:

```ts
import { defineConfig } from "vitest/config";
import { vitiatePlugin } from "@vitiate/core/plugin";

export default defineConfig({
	plugins: [vitiatePlugin()],
	test: {
		projects: [
			{ extends: true, test: { name: "unit", include: ["test/**/*.test.ts"] } },
			{ extends: true, test: { name: "fuzz", include: ["test/**/*.fuzz.ts"] } },
		],
	},
});
```

The plugin instruments JS/TS during Vite module transforms with SWC, adds edge coverage and comparison tracing, and automatically injects `@vitiate/core/setup` into Vitest setup files.

### Plugin Options

```ts
vitiatePlugin({
	instrument: {
		include: ["src/**/*.ts"],
		exclude: ["**/*.test.ts"],
		packages: ["specific-lib"],
	},
	fuzz: {
		maxLen: 8192,
		timeoutMs: 5000,
	},
	dataDir: ".vitiate",
	coverageMapSize: 65536,
});
```

- `instrument.include` / `exclude` apply to user code only.
- `node_modules` is always excluded unless specific dependencies are listed in `instrument.packages`.
- Instrument only the dependency packages you are actively investigating; large packages slow startup and can saturate the coverage map.
- Increase `coverageMapSize` when edge count nears the map size or coverage plateaus unexpectedly.

## Write Fuzz Tests

Use `fuzz()` from `@vitiate/core`. The target receives a `Buffer`; expected rejection errors should be caught and ignored, while unexpected errors must propagate.

```ts
import { fuzz } from "@vitiate/core";
import { parse, ParseError } from "../src/parser.js";

fuzz("parse does not crash", (data: Buffer) => {
	try {
		parse(data.toString("utf-8"));
	} catch (error) {
		if (!(error instanceof ParseError)) {
			throw error;
		}
	}
});
```

`fuzz()` signature:

```ts
function fuzz(
	name: string,
	target: (data: Buffer) => void | Promise<void>,
	options?: FuzzOptions,
): void;
```

Modifiers: `fuzz.skip(name, target, options?)`, `fuzz.only(name, target, options?)`, and `fuzz.todo(name)`.

Per-test options include `maxLen`, `seed`, `timeoutMs`, `fuzzTimeMs`, `fuzzExecs`, `stopOnCrash`, `maxCrashes`, `grimoire`, `unicode`, `redqueen`, `minimizeBudget`, `minimizeTimeLimitMs`, `banner`, `quiet`, and `detectors`.

## Structured Inputs

Use raw bytes for parsers that accept strings or buffers. Use `FuzzedDataProvider` when the target needs typed arguments or objects.

```ts
import { fuzz } from "@vitiate/core";
import { FuzzedDataProvider } from "@vitiate/fuzzed-data-provider";

fuzz("handle request", (data: Buffer) => {
	const fdp = new FuzzedDataProvider(data);

	const request = {
		method: fdp.pickValue(["GET", "POST", "PUT"]),
		path: "/" + fdp.consumeString(200, { printable: true }),
		body: fdp.consumeRemainingAsString(),
	};

	handleRequest(request);
});
```

Common `FuzzedDataProvider` methods:

| Need | Methods |
| --- | --- |
| Booleans | `consumeBoolean()`, `consumeBooleans(maxLength)` |
| Integers | `consumeIntegral(maxBytes, isSigned?)`, `consumeIntegralInRange(min, max)`, `consumeIntegrals(maxLength, bytes, isSigned?)` |
| BigInts | `consumeBigIntegral(...)`, `consumeBigIntegralInRange(min, max)` |
| Floats | `consumeNumber()`, `consumeNumberInRange(min, max)`, `consumeFloat()`, `consumeProbabilityFloat()` |
| Bytes | `consumeBytes(maxLength)`, `consumeRemainingAsBytes()` |
| Strings | `consumeString(maxLength, options?)`, `consumeRemainingAsString(options?)`, `consumeStringArray(...)` |
| Enums | `pickValue(array)`, `pickValues(array, numValues)` |

When empty, consume methods return zero-values instead of throwing. Use `remainingBytes` to loop until input is exhausted.

## Run Modes and CLI

| Workflow | Command | Notes |
| --- | --- | --- |
| Fuzz all fuzz tests | `npx vitiate fuzz` | Sets `VITIATE_FUZZ=1`; runs `*.fuzz.*` through Vitest with coverage-guided mutation. |
| Fuzz with limits | `npx vitiate fuzz --fuzz-time 300 --max-crashes 3` | Limits by seconds, exec count, or crash count. |
| Regression replay | `npx vitiate regression` | Replays seed, crash, timeout, and cached corpus entries without mutation. |
| Normal Vitest regression | `npx vitest run` | `fuzz()` runs in regression mode when `VITIATE_FUZZ` is unset. |
| Initialize seeds | `npx vitiate init` | Creates `.vitiate/testdata/<hashdir>/seeds/` and updates `.gitignore` for `.vitiate/corpus/`. |
| Optimize corpus | `npx vitiate optimize` | Minimizes cached corpus by set cover. |
| libFuzzer-compatible | `npx vitiate libfuzzer test/parser.fuzz.ts` | Single-file mode with libFuzzer-style flags for platform integration. |

Unrecognized `vitiate fuzz`, `regression`, and `optimize` flags forward to Vitest. Use `--` for clarity.

### Environment Variables

| Variable | Meaning |
| --- | --- |
| `VITIATE_FUZZ=1` | Enable fuzzing mode. |
| `VITIATE_OPTIMIZE=1` | Enable corpus minimization mode. |
| `VITIATE_FUZZ_TIME` | Total fuzzing time in seconds. |
| `VITIATE_FUZZ_EXECS` | Maximum fuzzing iterations. |
| `VITIATE_MAX_CRASHES` | Maximum crashes before stopping. |
| `VITIATE_DEBUG=1` | Verbose diagnostics: mode, coverage map, instrumented modules, engine state. |

For `fuzz`/`regression`/`optimize`, precedence is CLI flags, environment variables, per-test options, plugin `fuzz` defaults, built-ins. For `libfuzzer`, environment variables take precedence over CLI flags.

## Corpus, Seeds, Crashes, and Git

Vitiate uses a hash directory name per fuzz test: `.vitiate/testdata/<hashdir>/` and `.vitiate/corpus/<hashdir>/`.

| Path | Commit? | Purpose |
| --- | --- | --- |
| `.vitiate/testdata/<hashdir>/seeds/` | Yes | Manual seed inputs. |
| `.vitiate/testdata/<hashdir>/crashes/` | Yes | Minimized crash artifacts, permanent regression tests. |
| `.vitiate/testdata/<hashdir>/timeouts/` | Yes | Timeout artifacts. |
| `.vitiate/corpus/<hashdir>/` | No | Generated cached corpus; can grow large and is regenerated. |
| `.swc/` | No | Platform-specific compiled SWC WASM artifacts. |

Add to `.gitignore`:

```gitignore
.vitiate/corpus/
.swc/
```

Periodically run `npx vitiate optimize`. After long sessions, checkpoint useful cached entries by optimizing, copying survivors from `.vitiate/corpus/<hashdir>/` into `.vitiate/testdata/<hashdir>/seeds/`, and committing the new seeds.

## Dictionaries

Dictionaries use AFL/libFuzzer syntax: one token per line, quoted; optional `name=` prefix; `#` comments; `\xHH` binary escapes.

```text
# URL dictionary
protocol_http="http"
protocol_https="https"
"://"
"?"
"&"
"="
"%2e%2e"
"localhost"
"127.0.0.1"
```

Place dictionary files directly in `.vitiate/testdata/<hashdir>/` for automatic discovery, or pass `-dict` in `libfuzzer` mode:

```sh
npx vitiate libfuzzer test/parser.fuzz.ts -dict ./tokens.dict
```

Prefer 10-50 short, target-specific tokens. Include valid and invalid syntax tokens, delimiters, encoding variants, and null bytes when relevant. Active detectors contribute their own vulnerability tokens automatically.

## Vulnerability Detectors

Tier 1 detectors are enabled by default:

| Detector | Finds |
| --- | --- |
| `commandInjection` | Fuzzer-controlled strings reaching `child_process` execution APIs. |
| `pathTraversal` | File access outside allowed directories via filesystem APIs. On Windows, this is Tier 2 due to false-positive risk. |
| `unsafeEval` | Fuzzer-controlled strings reaching `eval`, `Function`, or string timers. |

Tier 2 detectors are opt-in:

| Detector | Finds |
| --- | --- |
| `prototypePollution` | Added, changed, or deleted built-in prototype properties. |
| `redos` | Regex calls exceeding a threshold. |
| `ssrf` | HTTP/fetch targets hitting private or internal hosts. |

Per-test configuration:

```ts
fuzz("HTTP handler security", handler, {
	detectors: {
		prototypePollution: true,
		commandInjection: true,
		pathTraversal: {
			allowedPaths: ["/app/uploads"],
			deniedPaths: ["/etc/passwd", "/etc/shadow"],
		},
		redos: { thresholdMs: 200 },
		ssrf: {
			blockedHosts: ["10.0.0.0/8"],
			allowedHosts: ["api.example.com"],
		},
	},
});
```

CLI detector selection turns off defaults and enables only the listed detectors:

```sh
npx vitiate fuzz --detectors prototypePollution,pathTraversal
npx vitiate fuzz --detectors pathTraversal.deniedPaths=/etc/passwd:/etc/shadow
npx vitiate fuzz --detectors ""
```

## CI Pattern

Run deterministic regression on every PR. Add a short fuzz session after regression if CI budget allows. Run long fuzzing on a schedule.

| CI context | Command | Purpose |
| --- | --- | --- |
| Every push/PR | `npx vitiate regression` | Fast replay of committed seeds and crash artifacts. |
| PR after regression | `npx vitiate fuzz --fuzz-time 300` | Short shallow-bug search. |
| Nightly on main | `npx vitiate fuzz --fuzz-time 3600` | Deeper coverage exploration. |
| After nightly | `npx vitiate optimize` + checkpoint | Feed coverage gains back into versioned seeds. |

Cache `.vitiate/corpus` in scheduled CI to build on previous coverage. Upload `.vitiate/testdata/**/crashes/crash-*` on failure.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Edge count near coverage map size; coverage stalls | Increase `coverageMapSize`, e.g. `131072`. |
| Slow startup | Reduce `instrument.packages`; instrument only dependencies under investigation. |
| Fuzzer finds nothing; coverage flat | Add seeds, add a dictionary, verify instrumentation with `VITIATE_DEBUG=1`, use `FuzzedDataProvider` for typed targets. |
| Cached corpus huge | Run `npx vitiate optimize`; do not commit `.vitiate/corpus/`. |
| Need diagnostics | Run `VITIATE_DEBUG=1 npx vitiate fuzz`. |

## Migration from Jazzer.js

- Remove `@jazzer.js/core`, `@jazzer.js/jest-runner`, Jest-only fuzz config, and `it.fuzz` globals.
- Install `vitiate` and optionally `@vitiate/fuzzed-data-provider`.
- Convert `it.fuzz("name", (data) => ...)` to top-level `fuzz("name", (data) => ...)`.
- Replace `import { FuzzedDataProvider } from "@jazzer.js/core"` with `@vitiate/fuzzed-data-provider`.
- Map detector names from kebab-case to camelCase: `command-injection` → `commandInjection`, `path-traversal` → `pathTraversal`, `prototype-pollution` → `prototypePollution`.
- Run `npx vitiate init`, copy old crashes/seeds into the matching `.vitiate/testdata/<hashdir>/` directories, update `.gitignore`, and verify with `npx vitiate regression` plus a short `npx vitiate fuzz --fuzz-time 30`.

## Good Target Design

- Target narrow code paths; split separate formats into separate fuzz tests.
- Keep targets fast and deterministic; avoid unbounded logging, network calls, uncontrolled timers, and global state that is not reset between iterations.
- Catch only expected domain errors; unexpected errors are findings.
- Add semantic assertions once crash-free parsing is stable.
- Use seeds for representative valid, invalid, empty, long, and edge-case inputs.
- Add dictionaries when magic values, delimiters, encodings, or format tokens gate deeper code.

## Docs Coverage

This skill was built from the complete first-party Vitiate sitemap plus the linked project README. See `references/docs-coverage.md` for the crawled URL list.
