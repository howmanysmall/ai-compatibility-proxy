#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/** Reads skills-lock.json and adds every skill directory under .agents/skills/ to .gitignore (if not already present). */

import { type } from "arktype";

const GITIGNORE_PATH = ".gitignore";
const SKILLS_LOCK_PATH = "skills-lock.json";
const SKILLS_DIR = ".agents/skills";

const isLockFile = type({
	skills: "Record<string, unknown>",
	version: "1",
});

const lockfile = isLockFile.assert(JSON.parse(await Deno.readTextFile(SKILLS_LOCK_PATH)));

const skillNames = Object.keys(lockfile.skills);
const lines = skillNames.map((name) => `${SKILLS_DIR}/${name}/`);

let gitignore = await Deno.readTextFile(GITIGNORE_PATH);
const existingLines = new Set(gitignore.split("\n").map((line) => line.trim()));

let added = 0;
for (const line of lines) {
	if (!existingLines.has(line)) {
		gitignore += `${line}\n`;
		added += 1;
	}
}

const { consola } = await import("consola");
if (added > 0) {
	await Deno.writeTextFile(GITIGNORE_PATH, gitignore);
	consola.success(`Added ${added} skill(s) to .gitignore`);
} else consola.info("All skills already in .gitignore");
