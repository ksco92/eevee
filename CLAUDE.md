# Project policies

These rules apply to every contribution to this repo, including those written
with AI assistance. The package lives in `packages/core`; run commands from
there unless noted.

## Version bumping

Every PR merged to `main` must bump the `version` field per semver. The two
publishable packages — `packages/core/package.json` (npm) and
`packages/python/setup.py` (PyPI) — share one version and bump together:

- **patch** — bug fixes, doc-only changes, internal refactors that don't change
  the public API.
- **minor** — additive features that don't break the existing API.
- **major** — breaking changes after the package reaches `1.0.0`. While the
  package is pre-1.0 (the current state), a *minor* bump may carry breaking
  changes; reserve the `0.x` → `1.0.0` jump for the "graduate to stable" step.

The publish workflow only publishes when the version on `main` is newer than the
registry. A PR that forgets to bump is a no-op on merge, but the policy is
"always bump" — reviewers reject PRs missing a version change.

## No AI authorship signals

This is a human-authored project. AI assistance is allowed; AI attribution in
artifacts that survive merge is not.

- Commit messages must NOT contain `Co-Authored-By: Claude` (or any other
  AI-attribution) trailers.
- Commit and PR bodies must NOT contain the `🤖 Generated with Claude Code`
  footer or equivalents.
- Branch names must NOT contain `claude`, `ai`, `bot`, `gpt`, `copilot`, or
  similar.
- Code, docs, and prose must not read as AI-generated. Avoid this banned-word
  list: `delve`, `tapestry`, `landscape`, `testament`, `vibrant`, `pivotal`,
  `nuanced`, `seamless`, `comprehensive and`, `robust and`, `leverage` (unless
  followed by `the existing`).
- Strip present-tense narration comments ("Increment counter by 1", "Loop
  through items", "Check if X") before commit — they are chat-transcript
  artifacts.

If a contribution was written with AI assistance, the human contributor is the
sole credited author.

## Workflow

The dev loop for every change:

1. Add the feature (code + tests + doc sync — see "Documentation sync" below).
2. Open a PR.
3. Run **both** reviewers on it:
   - **pr-reviewer** (the agent) — adversarial check of correctness, acceptance
     criteria, and test coverage on the diff.
   - **oss-reviewer** (the skill in `~/.claude/skills/oss-reviewer`) —
     OSS-readiness: fresh-clone bootstrap, the banned-word list above, AI-code
     tells, license detectability, README quick-start accuracy, and that nothing
     secret or machine-specific is committed.
4. Merge **only if both reviewers pass**. A FAIL from either blocks the merge —
   fix the findings and re-run before merging.

Branch protection requires green CI plus both reviews. This gate is
human-enforced until wired into required status checks.

## Documentation sync

**Binding.** Before completing any task that changes code, dependencies,
conventions, scripts, schema, or workflows, re-read this file end-to-end and
`README.md`, and update any section that has gone stale. The next reader assumes
they are current; a PR that changes behavior without syncing the docs is
incomplete. Ask, in order:

- Does it change a command, path, script, or the quick-start? → update `README.md`.
- Does it change a convention, policy, the review workflow, or the coverage rule?
  → update `CLAUDE.md`.
- Does it add, rename, or remove a `tableType`, rule code, field, or violation?
  → update `spec/README.md` and the JSON Schema, and add fixtures.

Reviewers reject PRs whose behavior and docs have drifted apart.

## Testing and coverage

- `npm test` runs every suite under `packages/core/test` and prints coverage.
- Coverage is gated at 95% statements / branches / functions / lines on
  `src/**/*.ts` via `jest.config.js`, excluding only: the CLI entry (`src/cli.ts`),
  the public-API barrel (`src/index.ts`), and the thin WASM render wrapper
  (`src/diagram/render.ts`, exercised by the CI diagram-render step instead). A
  failing gate fails the suite, so docs do not paste coverage transcripts that
  would drift after the next change — run the command for live numbers.
- Each new rule lands with its own fixture(s): one root that triggers exactly
  that rule's code, plus the JSON Schema update if the change is structural.

## Self-validation

The validator must accept its own example dataset. `node dist/src/cli.js
validate ../../examples` runs in CI (`.github/workflows/ci.yml`) and must exit 0.

## Style

ESLint 9 flat config (`eslint.config.js`): 4-space indent, single quotes,
trailing commas, one item per line in multiline arrays/objects, no unused vars
(`_`-prefixed exempt). TypeScript strict. JSDoc on exported symbols.

## Spec evolution

The standard and the validator evolve together; see the "Spec evolution"
section of `README.md`. Automated proposals (new rules, type-registry entries,
example or schema updates) are welcome but land only through the normal PR +
review gates, never directly on `main`.

## Python wrapper

`packages/python` is the `fdd` PyPI package: a thin client that shells out to the
CLI and returns typed results. It follows the maintainer's Python coding guide and
mirrors the `pikachu` repo's tooling (kept self-contained here rather than via a
machine-specific `@import`, since this repo is public):

- **Layout:** `setup.py` + `setup.cfg`, `src/` layout, `tests/` mirroring `src/`,
  a `conftest.py` that blocks real sockets.
- **Python 3.14.** Native types (`dict`, `list`, `str | None`), `Self` from
  `typing_extensions`, Sphinx docstrings (`:param:` / `:return:` / `:raises:`).
- **Lint:** `black`, `isort` (profile black), `flake8` with `flake8-annotations`,
  `flake8-docstrings`, `flake8-rst-docstrings`; line length 130; `__init__.py`
  exempt from `D104` / `F401`. Run `scripts/lint.sh`.
- **Test:** `pytest` + `pytest-cov` + `pytest-socket`, **95% coverage gate**, mocks
  via `with patch(...)` context managers (never decorators). Run `scripts/test.sh`.

## Distribution and release

- The CLI compiles to a standalone, dependency-free binary with
  `bun build src/cli.ts --compile` (the wasm Graphviz renderer is bundled in). One
  bun host cross-compiles every target (linux x64/arm64, macOS x64/arm64, windows x64).
- `.github/workflows/release.yml` runs on a `v*` tag: it builds the binaries and
  attaches them to the GitHub release, publishes the npm package, and builds one
  PyPI wheel per platform (each bundling its binary, via
  `packages/python/scripts/build_wheels.sh`) plus a pure sdist.
- Non-core languages consume the CLI; the Python client resolves `FDD_BINARY` or a
  bundled binary. Validation logic is never reimplemented per language.

## Planning notes

`TODO.md` is an intentionally uncommitted working plan (git-ignored). Do not
commit it.
