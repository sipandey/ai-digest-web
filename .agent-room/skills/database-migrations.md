---
name: database-migrations
description: "Use when writing database schema changes, data migrations, creating indexes, or modifying existing tables in production-facing systems."
---

# Database Migrations

## Overview

Database migrations are the riskiest part of most releases. Unlike code,
a bad migration can't be reverted by redeploying the previous version —
the data has already changed. Every migration must be backward-compatible,
tested, and paired with a rollback plan.

## The iron law

```
EVERY MIGRATION MUST BE BACKWARD-COMPATIBLE WITH THE CURRENTLY DEPLOYED CODE
```

Deploy the migration first, then deploy the new code. If the migration
breaks the old code, you can't roll back the code deployment without also
rolling back the migration — and data migrations often can't be rolled back.

## Safe vs. unsafe operations

| Operation | Safe? | Notes |
| --- | --- | --- |
| Add a new table | ✅ Yes | No existing code references it |
| Add a nullable column | ✅ Yes | Old code ignores it |
| Add a column with a default | ✅ Yes* | *Check if your DB locks the table during ALTER |
| Add an index | ⚠️ Careful | Use CONCURRENTLY (Postgres) or equivalent |
| Rename a column | ❌ No | Old code uses the old name |
| Remove a column | ❌ No | Old code reads the old column |
| Change a column type | ❌ No | Old code expects the old type |
| Add a NOT NULL constraint | ❌ No | Existing rows may violate it |

## The multi-step pattern for unsafe changes

Unsafe operations must be split across multiple releases:

### Renaming a column (3 releases)

1. **Release 1:** Add the new column. Write to both old and new. Read
   from old.
2. **Release 2:** Backfill the new column from the old. Switch reads to
   the new column. Stop writing to old.
3. **Release 3:** Drop the old column.

### Removing a column (2 releases)

1. **Release 1:** Stop reading from the column in code. Stop writing to
   it. (The column still exists in the database.)
2. **Release 2:** Drop the column via migration.

### Adding a NOT NULL constraint (2 releases)

1. **Release 1:** Backfill all NULL values. Add application-level
   validation to prevent new NULLs.
2. **Release 2:** Add the database-level NOT NULL constraint.

## Index creation

Large indexes on production tables can lock writes for minutes or hours.

- **PostgreSQL:** Always use `CREATE INDEX CONCURRENTLY`. It takes longer
  but doesn't lock the table.
- **MySQL:** Use `ALTER TABLE ... ADD INDEX` with `ALGORITHM=INPLACE,
  LOCK=NONE` where supported.
- **Measure impact:** On large tables (>1M rows), test the index creation
  on a staging copy first. Note the time and lock behavior.
- **Don't create indexes speculatively.** Add an index when you have a
  slow query that needs it, not "in case someone queries this column
  later."

## Data backfill strategies

When migrating data between columns or formats:

1. **Batch, don't bulk.** Process 1,000-10,000 rows at a time, not the
   entire table in one statement. Bulk updates lock rows and can cause
   replication lag.
2. **Idempotent backfills.** The backfill script should be safe to run
   multiple times. Use `WHERE new_column IS NULL` to skip already-migrated
   rows.
3. **Monitor progress.** Log how many rows are processed, how many remain,
   and the estimated time to completion.
4. **Run during low-traffic windows** if the table is large and heavily
   written to.

## Migration testing

Before deploying a migration to production:

- [ ] Run the migration against a copy of production data (or a
  representative staging dataset).
- [ ] Verify the old code still works after the migration runs.
- [ ] Verify the new code works after the migration runs.
- [ ] Measure execution time. If it takes more than 30 seconds, consider
  breaking it into smaller steps.
- [ ] Write and test the reverse migration. If the migration is
  irreversible, document the manual recovery procedure.

## Rollback plan

Every migration must document its rollback before deployment:

- **Reversible migrations:** Include a `down` migration that undoes the
  change. Test it.
- **Irreversible migrations** (dropped columns, data transformations):
  Document what data is lost and the manual recovery procedure. Consider
  whether a backup should be taken before running.
- **If in doubt, take a table snapshot** before running destructive
  migrations. Storage is cheap; data loss is not.

## Red flags — stop and reassess

Migrations that take more than 5 minutes on staging · ALTER TABLE on a
table with active write traffic without testing lock behavior · backfills
that process the entire table in one transaction · migrations without a
tested reverse migration · dropping a column that's still referenced in
deployed code · adding a foreign key constraint to a large table without
validating existing data first.
