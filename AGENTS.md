# Repository Guidelines

## Project Structure & Module Organization
The plugin’s TypeScript sources live in `src/`, organized by feature: `api/` for model connectors, `processors/` for note parsing pipelines, `flashcard/` for the SM-2 review flow, and `views/` for custom Obsidian panes. Entry points such as `main.ts`, `settings.ts`, and `taskQueue.ts` wire these modules together. Built artifacts (`main.js`, `manifest.json`, `styles.css`) sit at repository root for distribution, while `scripts/`, `build-script.mjs`, and `esbuild.config.mjs` handle packaging.

## Build, Test, and Development Commands
- `npm run dev` — launch the esbuild watcher for rapid TypeScript rebuilds while iterating in Obsidian’s debug environment.
- `npm run build` — run strict type checking (`tsc -noEmit`) and produce an optimized bundle via the production esbuild script.
- `npm run build:zip` — create a distributable ZIP in `release/`; use before sharing builds.
- `npm run package` — regenerate `release/` contents without rechecking types; only use after a successful `npm run build`.

## Coding Style & Naming Conventions
Follow the existing TypeScript style: tabs for indentation, single quotes for strings, and semicolons enabled. All exported symbols use PascalCase for classes/types and camelCase for functions, helpers, and file-scoped constants. Honor the strict typing enforced in `tsconfig.json` (notably `noImplicitAny` and `strictNullChecks`). Keep plugin IDs, command IDs, and view types kebab-cased (e.g., `open-combine-notes-view`) to match Obsidian expectations.

## Testing Guidelines
There is no automated test suite yet; every change must at least pass `npm run build`. For UI or workflow tweaks, load the development vault, reload the plugin, and validate flashcard generation, note combination, and task queue updates manually. When touching AI provider code, test against a safe API key stored in Obsidian settings—never commit credentials.

## Commit & Pull Request Guidelines
Match the lightweight prefixes used in history (`add.`, `chg.`, `bug.`) followed by a concise description in sentence case. Commits should bundle related work and include necessary updates to `manifest.json` and `versions.json` when changing versions. Pull requests need a clear summary, reproduction steps or demo vault commands, and screenshots or GIFs for UI changes. Reference related issues and note any follow-up tasks so maintainers can triage quickly.

## Configuration & Security Tips
Obsidian API keys are persisted via the plugin settings tab; keep them out of `manifest.json`, `.env`, and version control. Update `versions.json` in lockstep with `manifest.json` to keep Obsidian’s updater in sync.
