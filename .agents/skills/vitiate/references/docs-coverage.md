# Vitiate Documentation Coverage

Read on 2026-06-05. HTML pages were fetched through `markdown.new`; XML/text pages were fetched directly.

## First-Party Sitemap

The site exposes `/sitemap-index.xml`, which points to `/sitemap-0.xml`. The sitemap listed these 20 first-party pages, all read:

- <https://vitiate.js.org/>
- <https://vitiate.js.org/concepts/corpus/>
- <https://vitiate.js.org/concepts/fuzzing-primer/>
- <https://vitiate.js.org/concepts/how-it-works/>
- <https://vitiate.js.org/getting-started/introduction/>
- <https://vitiate.js.org/getting-started/quickstart/>
- <https://vitiate.js.org/getting-started/tutorial/>
- <https://vitiate.js.org/guides/ci-fuzzing/>
- <https://vitiate.js.org/guides/cli/>
- <https://vitiate.js.org/guides/detectors/>
- <https://vitiate.js.org/guides/dictionaries-and-seeds/>
- <https://vitiate.js.org/guides/migrating-from-jazzerjs/>
- <https://vitiate.js.org/guides/structure-aware-fuzzing/>
- <https://vitiate.js.org/guides/troubleshooting/>
- <https://vitiate.js.org/reference/cli-flags/>
- <https://vitiate.js.org/reference/detectors/>
- <https://vitiate.js.org/reference/environment-variables/>
- <https://vitiate.js.org/reference/fuzz-api/>
- <https://vitiate.js.org/reference/fuzzed-data-provider/>
- <https://vitiate.js.org/reference/plugin-options/>

## Project Source Page

- <https://github.com/mjkoo/vitiate>

## External References Spot-Checked

These were linked from the Vitiate docs and read for supporting context, but they are not first-party Vitiate documentation:

- <https://lcamtuf.coredump.cx/afl/technical_details.txt>
- <https://github.com/google/fuzzing/blob/master/docs/structure-aware-fuzzing.md>
- <https://llvm.org/docs/LibFuzzer.html#fuzzed-data-provider>

## Notes

- `/sitemap.xml` returned 404; `/sitemap-index.xml` was the correct sitemap entry point.
- The first-party docs use `npx` examples. In this repository, prefer the project package-manager wrappers documented in AGENTS.md when executing commands.
