import packageJson from "../../package.json" with { type: "json" };

export const { name } = packageJson;
export const version = getPackageVersion(packageJson);

function getPackageVersion(value: { readonly name: string; readonly version?: unknown }): string {
	return typeof value.version === "string" ? value.version : "0.0.0";
}
