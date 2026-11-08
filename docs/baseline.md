# Repository and tooling baseline

Inspected 2026-11-08 in `D:\returnwise-ai`, Windows PowerShell. No application code, dependencies, migrations, environment files or provider integrations were created.

## Observed state

| Check | Result |
| --- | --- |
| `git log -1 --format="%h %s"` | `2576e84 Initial commit` |
| `git ls-files` before documentation | `.gitignore`, `LICENSE`, `README.md` |
| `git status --short` before documentation | Existing untracked `AGENTS.md`, `CODEX_PHASE_PROMPTS.md`, `PROJECT_BLUEPRINT.md`; left untouched |
| README/license | Two-line project description; existing MIT license, copyright 2026 Hamdhan Hasmy |
| `Test-Path package.json`, `Test-Path node_modules` | Both `False` |
| `node --version` | `v24.16.0` |
| `npm.cmd --version` | `11.13.0` |
| `git --version` | `2.53.0.windows.1` |
| `rg --version` | `15.2.0` |
| `npm.cmd list --global --depth=0` | Only `@opencode/cli@2.0.27` listed |
| `Get-Command` lookup | node/npm/git/docker found; psql, pg_isready, pnpm and context-plugins not found on PATH |
| `docker --version` | CLI `29.2.1`, build `a5c7197`; config access warning |
| `docker info --format '{{.ServerVersion}}'` | Failed: Docker engine named pipe unavailable; additionally `.docker/config.json` access denied in execution environment |
| `Get-Service -Name com.docker.service` | `Stopped`; not started by this task |
| PostgreSQL service lookup | No matching service reported; no DB connection attempted, so database availability is not established |
| `git diff --check` | Passed for tracked diff; untracked new docs require separate inspection |

Node meets the documented Next.js and Prisma v7 runtime prerequisites; no installed application dependencies exist to assess. See [provider notes](provider-notes.md). A Docker CLI version is not evidence of a running database.

The combined PowerShell inventory probes for optional missing paths/commands can return nonzero; this does not indicate application test failure. The Docker daemon probe did fail and remains unresolved. No npm test/lint/typecheck/build scripts exist to run. Prisma validation and Playwright are unavailable. They are **not run / not applicable yet**, not passing.

## Read-only commands usable now

Run from the repository in PowerShell. These do not install packages, read secrets or contact provider accounts.

```powershell
Set-Location D:\returnwise-ai
Get-Content AGENTS.md -Encoding UTF8
Get-Content PROJECT_BLUEPRINT.md -Encoding UTF8
rg --files --hidden -g '!node_modules' -g '!.git' -g '!.env*'
git status --short
git log -1 --format="%h %s"
git ls-files
git diff --check
node --version
npm.cmd --version
git --version
rg --version
npm.cmd list --global --depth=0
Test-Path package.json
Test-Path node_modules
Get-Command node,npm.cmd,git,docker,psql,pg_isready,pnpm,context-plugins -ErrorAction SilentlyContinue
docker --version
docker info --format '{{.ServerVersion}}'
Get-Service -Name com.docker.service -ErrorAction SilentlyContinue
```

## Proposed M1 package scripts

These names are a specification for the future package manifest, not commands verified against existing scripts. Use project-pinned local binaries through npm scripts; avoid `npx` downloading arbitrary missing packages during a baseline test.

| Command | Intended implementation |
| --- | --- |
| `npm.cmd run typecheck` | `tsc --noEmit` |
| `npm.cmd run lint` | `eslint .` |
| `npm.cmd test` | `vitest run` with unit suite configuration |
| `npm.cmd run test:integration` | Vitest integration configuration using dedicated TEST_DATABASE_URL and real PostgreSQL |
| `npm.cmd run db:validate` | `prisma validate` |
| `npm.cmd run db:generate` | `prisma generate` |
| `npm.cmd run db:migrate` | `prisma migrate deploy` against explicitly selected development DB, using committed migrations |
| `npm.cmd run db:migrate:test` | Guarded migration runner selecting TEST_DATABASE_URL; fail if database identity overlaps runtime |
| `npm.cmd run db:seed` | Explicit, idempotent seed command configured for pinned Prisma version; no implicit production seed |
| `npm.cmd run build` | `next build` |
| `npm.cmd run dev` | `next dev` |
| `npm.cmd run start` | `next start` |
| `npm.cmd run test:e2e:install` | Pinned `playwright install chromium`; network download/setup, run once when needed |
| `npm.cmd run test:e2e` | `playwright test` with isolated fixtures and configured app webServer |

Version-specific Prisma configuration and migration-role handling must be implemented and validated in M1; don't mix Prisma major-version examples. Read the checked-in migration before applying it. A reset or destructive migration needs separate approval; do not use `prisma migrate reset` as a routine baseline check.

## Future fresh-setup verification sequence

Prerequisites: completed M1 manifest/lockfile/scripts, explicitly configured dev/test PostgreSQL, ignored local environment settings, and reviewed committed migrations. The following **has not been executed**:

```powershell
npm.cmd ci
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:migrate:test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
npm.cmd run test:e2e:install
npm.cmd run test:e2e
git diff --check
git status --short
```

Stop on a failure and record its actual output; do not treat the last command's exit code as proof the whole sequence passed. Dependency installation/database setup are implementation work, intentionally deferred from Phase 0.

Payment unit/integration/browser suites use a controlled fake adapter and fixtures. Separately run the user-authorized PayPal sandbox runbook in M2/M5; record actual IDs/status/verification timestamps. Never include live-money calls or shared provider secrets in ordinary CI. Real sandbox smoke tests are opt-in and cannot be inferred from fixture tests.
