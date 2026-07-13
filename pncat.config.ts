import { defineConfig, mergeCatalogRules } from "pncat";

const configuration = defineConfig({
	agent: "pnpm",
	catalogRules: mergeCatalogRules([]),
	postRun: ['node --run oxfmt -- --write --no-error-on-unmatched-pattern "**/pnpm-workspace.yaml" "**/package.json"'],
	saveExact: true,
});

export default configuration;
