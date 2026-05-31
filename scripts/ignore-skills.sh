#!/usr/bin/env bash
set -euo pipefail

# Reads skills-lock.json and adds every skill directory under .agents/skills/
# to .gitignore if it is not already present.

GITIGNORE_PATH=".gitignore"
SKILLS_LOCK_PATH="skills-lock.json"
SKILLS_DIR=".agents/skills"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

jq -e '.version == "1" and (.skills | type == "object")' "$SKILLS_LOCK_PATH" > /dev/null

mapfile -t skill_names < <(jq -r '.skills | keys[]' "$SKILLS_LOCK_PATH")

if [[ ! -f "$GITIGNORE_PATH" ]]; then
	touch "$GITIGNORE_PATH"
fi

cp "$GITIGNORE_PATH" "$tmp_file"

added=0
for name in "${skill_names[@]}"; do
	line="${SKILLS_DIR}/${name}/"
	if ! grep -Fxq "$line" "$tmp_file"; then
		printf '%s\n' "$line" >> "$tmp_file"
		added=$((added + 1))
	fi
done

if [[ "$added" -gt 0 ]]; then
	mv "$tmp_file" "$GITIGNORE_PATH"
	trap - EXIT
	rm -f "$tmp_file"
	printf 'Added %s skill(s) to .gitignore\n' "$added"
else
	printf 'All skills already in .gitignore\n'
fi
