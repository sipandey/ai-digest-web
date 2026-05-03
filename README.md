# AI Digest Web

Personalized daily digest delivered to your Notion — powered by a Next.js frontend, Python pipeline, and Supabase.

## Structure

| Path | Description |
|------|-------------|
| `web/` | Next.js 15 app (TypeScript + Tailwind) |
| `pipeline/` | Python pipeline: fetch → rank → deliver |
| `supabase/schema.sql` | Database schema |
| `.github/workflows/daily_pipeline.yml` | Runs pipeline daily at 06:00 UTC |

## Getting started

1. Copy `.env.example` to `.env.local` (web) and `.env` (pipeline) and fill in credentials.
2. Apply `supabase/schema.sql` to your Supabase project.
3. `cd web && npm install && npm run dev`

## Pipeline

Run manually: `python pipeline/pipeline.py`  
Run for one user: `python pipeline/pipeline.py <user_id>`
