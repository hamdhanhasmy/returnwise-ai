# $0 database continuity through judging

**Plan only: no Neon resource, database migration, configuration cutover or deletion is authorized/performed by this document.** Current Render Free PostgreSQL expires **12 December 2026**; judging continues through **15 December**. Keep the public hostname unchanged. Complete a tested continuity action before expiry, preferably **8 December**, with the team's explicit approval. Do not delay submission for it.

## Chosen candidate and costs

[Neon Free](https://neon.com/docs/introduction/plans) currently lists $0/month, 1 GB/project storage, 100 CU-hours/project and 5 GB included public transfer, with idle scale-to-zero. It is a candidate, not provisioned/verified infrastructure. Recheck limits at signup; choose **Free**, no payment method/top-up/paid branch/upgrade. Stop if payment is required. Free quotas/cold starts can still suspend availability; no SLA or unconditional uptime is promised.

Neon documents [Prisma 7 compatibility](https://neon.com/docs/guides/prisma) and [Render migration](https://neon.com/docs/import/migrate-from-render). ReturnWise already uses PostgreSQL via `@prisma/adapter-pg`; retain the pinned adapter initially and test a **direct TLS PostgreSQL connection**, rather than changing drivers or assuming pooled startup-option compatibility. Use PostgreSQL 18 on the destination if available. A different server version requires a reviewed restore test.

## What must be preserved

- Git-tracked schema, all eight migrations/checks/triggers and `_prisma_migrations` history.
- Merchant ownership, policy/decision snapshots, exact acceptance/authorization, audit history, financial operation/request IDs and existing ledger data, if any exists at cutover. Never copy local provider successes into the hosted ledger as fixtures.
- Supabase evidence objects and matching Prisma references; the same private bucket/keys remain in place. A Postgres dump does **not** back up Supabase objects.
- UTC session options in both `src/lib/db/client.ts` and `scripts/database.ts`; do not blanket-shift old timestamps. Unknown historical instants remain excluded from time-dependent decisions.
- Non-owner `returnwise_runtime` role and existing limited grants. Owner/migration credentials never enter the web service.
- `src/lib/demo/published.json` and committed generated image: the four allowlisted public snapshots are already in Git, independent of hosted rows. Preserve a private local archive as well. This does not preserve authenticated functionality by itself: an expired DB can make Render's health check fail.

## Backup now; do not restore or cut over yet

Use PostgreSQL **18** `pg_dump` for the current PG18 source; never use an older dump client against a newer server. Save a custom-format archive under ignored `.local/backups/` with a SHA-256 and archive table-of-contents verification. Use libpq environment variables/privately configured passfile so credentials are not command arguments or logs. Treat the archive as private: it can contain sessions, hashed capabilities and personal information. Restrict local access and keep a protected second offline copy; never commit/upload it to the public repository.

The final release report states whether a real dump was available and completed. The exact safe backup flags are:

```powershell
# PGHOST/PGPORT/PGDATABASE/PGUSER and private authentication must already target Render.
# PGSSLMODE=verify-full; PGOPTIONS='-c timezone=UTC'; credentials stay private.
pg_dump --format=custom --no-owner --no-acl --file=.local/backups/returnwise-render.dump
pg_restore --list .local/backups/returnwise-render.dump
Get-FileHash -Algorithm SHA256 .local/backups/returnwise-render.dump
```

Do not paste connection URLs/passwords into these commands. Check all exit codes. `--list` inspects the archive without restoring. These documented [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) / [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html) modes do not reset the source. A valid archive/list is not proof of a successful restore.

## Approved post-submission rehearsal

1. Before provisioning, confirm organizer policy for maintenance after submission; freeze the submitted source commit. No new product features or substantive submission edits after deadline.
2. With approval, create a separate Free Neon project/database and privately save direct **owner** and future **runtime** connections in ignored operator files. Leave `.env`, Render and current owner credentials unchanged. Do not configure `TEST_DATABASE_URL` to either hosted database.
3. Review the archive manifest/SQL, verify destination is empty and different from source, and confirm database identity via read-only probes. Restore **only into the new empty destination** using `pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname=...` with a private environment/passfile. No `--clean`, `--create`, `DROP`, reset or overwrite of an existing DB. Stop on any failed trigger/constraint/function restore.
4. Roles/grants are not restored by the chosen archive flags. Recreate a dedicated `returnwise_runtime` login privately and apply the reviewed grants from `scripts/initialize-render.ts` without rerunning its merchant bootstrap or weakening privileges. Do not reuse Neon owner credentials as runtime. Verify denies for schema/table CREATE, payment DELETE/TRUNCATE, audit UPDATE and migration-table SELECT.
5. Validate restored `_prisma_migrations` with the pinned Prisma CLI and direct owner connection; inspect status before any additive deploy. `scripts/migrate-render.ts` deliberately accepts only the original Render target: **do not force a Neon URL through it**. A reviewed target-specific operator command must confirm the new identity first. Never run seed/test/reset/db-push against either hosted database.
6. Compare per-table counts, tenant foreign keys, key financial totals/reservations/provider IDs, append-only triggers, policy snapshots and public artifact hash. Check `SHOW TIMEZONE`, round-trip a UTC instant in a rollback-only/private rehearsal check and preserve untrusted historical provenance.
7. Run the existing production build locally against the destination using the direct restricted connection and Supabase settings; test health, exact-origin auth/logout, tenant boundaries, published demo, and existing private evidence retrieval. No PayPal/AI operation, provider fixture insertion or automatic refund reconciliation is needed. Use a separate dedicated local `_test` database for ordinary tests.

## Approved cutover and rollback

- Freeze merchant mutations briefly, confirm no unknown in-flight financial operation, and take a **new final source backup**. Repeat the proven restore into an approved empty final destination; compare fingerprints again. Never silently discard writes made after the rehearsal.
- In the **existing Free Render web service**, change only `DATABASE_URL` to the validated TLS **runtime** Neon connection, retaining the username `returnwise_runtime`. Keep the Render URL, origin, cookies, provider secrets, Supabase bucket, AI cap, licence gate and no-owner-runtime rule unchanged. No DNS/domain purchase or new service is needed.
- Deploy/restart only after approval. Re-run HTTPS/public desktop-mobile/auth/private-read smoke, verify actual destination identity and UTC, and compare ledger state. Do not use `/api/health` alone as proof of correct DB identity.
- Keep the source Render database untouched until its expiry. If cutover fails **before new writes**, restore the original runtime URL and verify. If writes occurred, freeze mutations and reconcile datasets before rollback; do not create split ledgers or lose financial reservations.
- Monitor manually through **15 December**; avoid automated keep-alive traffic that consumes Free quotas. Preserve the public read-only artifact and video/local setup as complementary evidence, not a promise that database failure is harmless.

This plan has not tested Neon connectivity, roles, restoration or hosting in this project. Those are explicit post-submission gates; the current source and safeguards remain unchanged.
