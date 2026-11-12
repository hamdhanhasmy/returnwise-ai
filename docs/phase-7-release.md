# Phase 7 — final release and submission preparation

Client date: **12 November 2026, Asia/Colombo**. Status: materials prepared; **not submitted to Devpost**, no YouTube URL/team details supplied. Deadline: 12 November noon PST / 13 November 1:30 AM Sri Lanka. The application remains the verified Phase 7A/“Try demo” build; no product feature, payment, model request, infrastructure purchase or database migration is part of this release.

## Scope and targeted review

Reviewed engineering contract/blueprint, Phase 5 exact authorization and external proof, Phase 6 native Studio/custom runner, Phase 7A deployment/storage boundary, local setup, Prisma/runtime UTC handling and test isolation. Existing authentication, financial reservations, provider adapters and evidence privacy remain unchanged. No confirmed new high-severity product defect found in this bounded review; this is not an independent penetration test or formal `/review` sign-off.

Submission risks: public Studio activation still needs the sponsor's judging key/domain instructions; the current DB expires before judging ends; full hosted mutations/provider operations are deliberately not exposed. A valid submission must not describe read-only snapshots as an unrestricted hosted workflow. New local setups need their own private provider configuration for genuine external operations; seeded provider successes are never fabricated.

## Prepared deliverables

- Professional README with screenshots, architecture, verified-versus-modeled evidence, sponsor scope, security and preserved installation instructions.
- `devpost-submission.md`: all 20 requested sections; required public YouTube and actual-team placeholders.
- `demo-video-script.md`: 2:50 storyboard, complete narration, exact screen actions, truthful historical-result recording, title/description.
- `judge-setup.md`: no-login public exploration plus complete local source/database/auth/test/provider setup.
- `sponsor-evidence.md`: actual Studio/Agent Framework, APIMatic contribution and Render checks; sponsor inquiry prepared, not sent.
- `database-continuity.md`: reviewed $0 Neon candidate, private backup/restore rehearsal, UTC/role/tenant safeguards, approval-gated cutover and rollback; no provisioning/migration.
- `submission-checklist.md`: remaining human actions, deadline and judging availability.
- Four deliberately reviewed screenshots under `images/`; generated demo image provenance remains in `assets/demo/README.md`.
- `scripts/check-release-secrets.ts`: read-only current/reachable-history audit with no secret-value output.

## Final command results

Fresh final runs completed against the unchanged application and verified isolated local test database. No routine test contacted paid AI or created an external Sandbox operation.

| Check | Final result |
| --- | --- |
| TypeScript / ESLint / Prisma validation | Passed |
| Unit tests | 158 passed |
| PostgreSQL integration (verified separate test DB) | 107 passed |
| `npx.cmd vitest run --config vitest.integration.config.ts` | 107 passed |
| `npx.cmd prisma migrate status` | Eight migrations; local development schema up to date; no mutation |
| `npm.cmd run build` | Passed, production build |
| `npm.cmd run test:e2e` | 38 passed, desktop/mobile, exit 0 in 2.2 minutes |
| Current source / reachable Git history audit | Passed including staged release: 270 tracked files, 326 pre-release reachable blobs, 14 configured current/retired secret values plus selected patterns; no findings/forbidden tracked files |
| `scripts/check-client-secrets.ts` | 33 client assets; PayPal/DeepSeek/Supabase configured secrets absent |
| `scripts/smoke-hosted.ts --url=https://returnwise-ai-t6sv.onrender.com` | Public/home/case/image/health 200; unauth analytics 401; payments GET 405 and unauth POST 401 |
| `scripts/verify-hosted-ui.ts` (private operator environment) | Clean desktop/mobile filters, case navigation, generated image and stored assessment; secure merchant session, origin rejection and logout passed; no financial/AI operations |
| Private storage/access checks | Genuine Supabase bucket private, JPEG-only, 5 MiB; hosted merchant evidence request without session 401, customer request without capability 404. No image upload needed; prior genuine roundtrip/restart proof retained |
| Documentation validation | Nine release documents, 69 local links, none missing; nine video segments, 354 narration words / 170 seconds ≈ 125 words/minute; duration is a script target, not an exported video measurement |
| Public GitHub API | Repository public, default branch main, MIT detected |

The first integration/client-audit commands hit the established restricted-Windows `tsx` user-lookup error; approved reruns passed. An initial extra public smoke incorrectly expected missing customer capability to return 401; inspection confirmed the existing privacy-preserving 404 contract, and the corrected smoke passed without any product change. Non-failing Vite loader, pg driver deprecation and color-environment warnings remain. Remote CI is not asserted without checking its actual result. Genuine external DeepSeek/PayPal success remains the documented prior verification; no new provider verification is invented.

Commands for repetition are in [judge setup](judge-setup.md); the history audit is `node --import tsx scripts/check-release-secrets.ts`. It checks configured known values and selected key signatures, not every possible unknown secret, and it scans reachable local history rather than inaccessible remote/unreachable objects. No live credential file, dump, private test artifact or generated client is tracked; `.env.example` is the intentionally tracked placeholder template. Local scan reports remain ignored.

## Backup / continuity status

The reviewed four-case public artifact was copied to ignored `.local/backups/published-demo-20261112.json`; all source/schema/migrations/generated illustration remain versioned in Git. This preserves the published synthetic demonstration, not a hosted database restore. The bundled embedded PostgreSQL binaries contain `pg_ctl`/server, but not `pg_dump`/`pg_restore`, and no such tools were found on PATH. A full private hosted custom-format archive and restore rehearsal remain operator tasks using matching PostgreSQL 18 client tools; no archive/restore success is invented. No Neon resource or DB switch was made.

## Manual completion gates

1. Record the working local/public application with the exact disclosures in the script, export under three minutes, upload **Public** on YouTube and replace placeholders.
2. Add all actual team members/representative; paste links/content into the real Devpost form, verify current categories/eligibility, personally submit before deadline and retain confirmation.
3. Send sponsor inquiry through its official channel; keep public fallback until free hackathon key/domain activation is resolved. No paid licence is required by the cited hackathon judging guidance, but activation is not faked.
4. After submission and with approval, rehearse/cut over continuity before 12 December; no destructive restore, paid fallback or substantive project change. Keep access through 15 December.

No Devpost submission, video upload, sponsor message, key activation, database migration, new payment/refund or AI charge is claimed by this release.

## Exact release file changes

```text
README.md
docs/database-continuity.md
docs/decisions.md
docs/demo-video-script.md
docs/devpost-submission.md
docs/images/README.md
docs/images/ag-studio-agent-local.png
docs/images/ag-studio-local.png
docs/images/public-case.png
docs/images/public-home.png
docs/judge-setup.md
docs/phase-7-release.md
docs/phase-7a-deployment.md
docs/progress.md
docs/sponsor-evidence.md
docs/sponsor-integrations.md
docs/submission-checklist.md
scripts/check-release-secrets.ts
```

No application route, payment/AI service, Prisma model/migration or hosted runtime setting changed. User edits to `AGENTS.md` and `CODEX_PHASE_PROMPTS.md` remain outside this release. Private backup, smoke reports and generated test artifacts remain ignored. The deployed application commit remains `9c69e5f`; documentation publication alone does not redeploy because Render automatic deploys are off.
