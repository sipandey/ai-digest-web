# ai-digest-web

A multi-tenant SaaS web application where users connect their Notion workspace
and receive a personalised daily arXiv research digest.

## Structure

| Path | Description |
|------|-------------|
| `web/` | Next.js app (TypeScript + Tailwind + Clerk + Supabase) |
| `pipeline/` | Python pipeline: fetch → rank → deliver to Notion |
| `supabase/schema.sql` | Database schema |
| `.github/workflows/daily_pipeline.yml` | Daily cron trigger |

## Getting started

1. Copy `.env.example` → `.env` (pipeline) and `web/.env.local.example` → `web/.env.local`, fill in credentials.
2. Apply `supabase/schema.sql` to your Supabase project.
3. `cd web && npm install && npm run dev`

## Pipeline

```bash
python pipeline/pipeline.py            # all users
python pipeline/pipeline.py <user_id>  # single user
```
