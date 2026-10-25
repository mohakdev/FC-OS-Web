---
name: verify-build
description: "Pre-ship gate for FC OS: proves the change builds and boots exactly the way Coolify will run it (amd64 Docker build of the repo Dockerfile from committed HEAD, then a container smoke test), plus lint on changed files and bun test. Use before any push/deploy/ship, when the user asks to verify the build, check it builds on Coolify, run a ship check, or after finishing a change they plan to push."
---

# /verify-build

One command that answers "will this deploy cleanly?" — run it before every push.

```bash
bash .claude/skills/verify-build/scripts/verify-build.sh            # committed HEAD (default)
bash .claude/skills/verify-build/scripts/verify-build.sh --working  # working tree as-is
bash .claude/skills/verify-build/scripts/verify-build.sh --keep     # keep fc-os-web:verify image
```

Takes ~1–2 min (the amd64 build runs under Rosetta). Needs OrbStack running.

## Why it works this way

- **Coolify builds the repo `Dockerfile` from git** — branch `feat/local-self-hosting` — on
  claw, which is **x86_64**. This Mac is arm64, so the script builds `--platform linux/amd64`.
- **Coolify only sees committed + pushed code.** Default mode `git archive`s `HEAD` into a temp
  dir and builds that, so uncommitted files can't make a broken deploy look green. The script
  lists what's uncommitted and how many commits aren't pushed yet.
- **Lint gates only changed files** (vs `origin/<branch>`, plus working changes in
  `--working`). Repo-wide `biome check` has pre-existing debt unrelated to any one ship.
- **No standalone `tsc`**: it only fails on `bun:test` types in `*.test.ts`. `next build`
  (inside the Docker build) is the type gate.
- **Smoke run** starts the image with Coolify's runtime env shape and probes:
  `/` < 400 (same as the Dockerfile `HEALTHCHECK`), `/login` 200, and anonymous
  `/dashboard/opus` → 307 `/login` (the `proxy.ts` gate). These routes don't touch the DB.

## Modes

| Situation | Run |
|---|---|
| About to push / ship | default (committed HEAD) |
| Quick check before committing | `--working` |
| Want to poke at the image afterwards | add `--keep` (`docker run -p 3999:3000 fc-os-web:verify`) |

## Reading failures

| Step | Usual cause → next move |
|---|---|
| preflight | Docker down → open OrbStack, wait for `docker info` |
| lint (changed files) | Diagnostics on files this ship touched. `FIXABLE` ones: `bunx biome check --write <file>`. Fix only files in this change. |
| bun test | Regression in `src/lib/auth/*.test.ts` (permission grid / lockout guards). Read the failing case before touching code. |
| docker build | `next build` type/compile error → log tail is printed; full log at `$TMPDIR/fc-os-verify-build.log`. "X must be set" at import → a new required env var needs a build-time placeholder in the `Dockerfile` `RUN … bun run build` line **and** a Coolify runtime var. `bun install --frozen-lockfile` failure → `bun.lock` out of sync; run `bun install` and commit the lockfile. |
| smoke run | Container logs are printed. Non-200 `/login` or missing 307 → runtime crash or `proxy.ts` regression. |

Expected noise, not failures: Better Auth "Base URL is not set" warnings during the build
(the build gets placeholder env only; `BETTER_AUTH_URL` is a Coolify runtime var).

## Rules

- Never commit or push as part of this skill. Report the verdict; offer to commit/push.
- Report faithfully: quote the failing step and the log path. Don't call it ready on a FAIL.
- Don't fix pre-existing repo-wide lint debt or the user's unrelated uncommitted files unless
  asked.
- The script cleans up its container, temp export, and (unless `--keep`) the image.

## Keep in sync

Update `scripts/verify-build.sh` when any of these change: the `Dockerfile` (build env,
healthcheck), the Coolify deploy branch (`DEPLOY_BRANCH`), the target arch, or the
`proxy.ts` matcher (smoke routes). Ops context: `docs/production-runbook.md`.
