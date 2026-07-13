import { defineConfig, mergeCatalogRules } from "pncat";

const configuration = defineConfig({
	agent: "pnpm",
	catalogRules: mergeCatalogRules([
		{
			match: [/^ox/u, /^@oxlint/u, /^@oxc/u, /^@oxfmt/u],
			name: "oxc",
			priority: 20,
		},
	]),
	postRun: ['node --run oxfmt -- --write --no-error-on-unmatched-pattern "**/pnpm-workspace.yaml" "**/package.json"'],
	saveExact: true,
});

export default configuration;
