# Project policies

These rules apply to every contribution to this repo, including those written
with AI assistance. The package lives in `packages/core`; run commands from
there unless noted.

## Version bumping

Every PR merged to `main` must bump the `version` field in
`packages/core/package.json` per semver:

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

Before opening a PR, re-read this file and `README.md` and update them if the
change touches anything they document. The change is not complete until the docs
match it. Ask, in order:

- Does it change a command, path, script, or the quick-start? → update `README.md`.
- Does it change a convention, policy, the review workflow, or the coverage rule?
  → update `CLAUDE.md`.
- Does it add, rename, or remove a `tableType`, rule code, field, or violation?
  → update `spec/README.md` and the JSON Schema, and add fixtures.

Reviewers reject PRs whose behavior and docs have drifted apart.

## Testing and coverage

- `npm test` runs every suite under `packages/core/test` and prints coverage.
- Coverage is gated at 95% statements / branches / functions / lines on
  `src/**/*.ts` (minus the CLI entry and the barrel) via `jest.config.js`. A
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

## Planning notes

`TODO.md` is an intentionally uncommitted working plan (git-ignored). Do not
commit it.
