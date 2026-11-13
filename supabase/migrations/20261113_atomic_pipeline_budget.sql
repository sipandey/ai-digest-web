-- One shared, fail-closed attempt budget for web-triggered and scheduled work.
CREATE TABLE IF NOT EXISTS public.pipeline_budget_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  daily_attempt_limit integer NOT NULL DEFAULT 50 CHECK (daily_attempt_limit > 0),
  manual_attempt_limit integer NOT NULL DEFAULT 1 CHECK (manual_attempt_limit > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pipeline_budget_settings (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pipeline_run_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('manual', 'scheduled')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'running', 'complete', 'empty', 'failed', 'skipped')),
  error_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.pipeline_run_attempts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'reserved',
  ADD COLUMN IF NOT EXISTS error_class text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipeline_run_attempts_status_check'
      AND conrelid = 'public.pipeline_run_attempts'::regclass
  ) THEN
    ALTER TABLE public.pipeline_run_attempts
      ADD CONSTRAINT pipeline_run_attempts_status_check
      CHECK (status IN ('reserved', 'running', 'complete', 'empty', 'failed', 'skipped'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS pipeline_run_attempts_date_idx
  ON public.pipeline_run_attempts (run_date);
CREATE INDEX IF NOT EXISTS pipeline_run_attempts_user_date_idx
  ON public.pipeline_run_attempts (user_id, run_date, source);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_run_attempts_one_schedule_per_user_day
  ON public.pipeline_run_attempts (user_id, run_date)
  WHERE source = 'scheduled';

ALTER TABLE public.pipeline_budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_run_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pipeline_budget_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pipeline_run_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_budget_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_run_attempts TO service_role;

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN (
    'onboarding_completed', 'digest_opened', 'paper_expanded',
    'paper_saved', 'paper_feedback', 'schedule_paused'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_events_user_created_idx
  ON public.product_events (user_id, created_at DESC);
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.product_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_pipeline_run_attempt(
  p_user_id uuid,
  p_run_date date,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_daily_limit integer;
  v_manual_limit integer;
  v_daily_count integer;
  v_manual_count integer;
  v_inserted integer;
BEGIN
  IF p_source NOT IN ('manual', 'scheduled') THEN
    RAISE EXCEPTION 'Invalid pipeline attempt source';
  END IF;

  -- Serialize every source for a given UTC date so concurrent Vercel and
  -- GitHub Actions requests cannot both spend the final slot.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('pipeline_daily_budget'),
    pg_catalog.hashtext(p_run_date::text)
  );

  SELECT daily_attempt_limit, manual_attempt_limit
    INTO v_daily_limit, v_manual_limit
    FROM public.pipeline_budget_settings
    WHERE singleton = true;
  IF v_daily_limit IS NULL OR v_manual_limit IS NULL THEN
    RAISE EXCEPTION 'Pipeline budget settings are unavailable';
  END IF;

  SELECT count(*)::integer INTO v_daily_count
    FROM public.pipeline_run_attempts WHERE run_date = p_run_date;
  SELECT count(*)::integer INTO v_manual_count
    FROM public.pipeline_run_attempts
    WHERE user_id = p_user_id AND run_date = p_run_date AND source = 'manual';

  IF p_source = 'scheduled' AND EXISTS (
    SELECT 1 FROM public.pipeline_run_attempts
    WHERE user_id = p_user_id AND run_date = p_run_date AND source = 'scheduled'
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_scheduled',
      'daily_count', v_daily_count, 'daily_limit', v_daily_limit);
  END IF;
  IF p_source = 'manual' AND v_manual_count >= v_manual_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_limit',
      'manual_count', v_manual_count, 'manual_limit', v_manual_limit,
      'daily_count', v_daily_count, 'daily_limit', v_daily_limit);
  END IF;
  IF v_daily_count >= v_daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit',
      'daily_count', v_daily_count, 'daily_limit', v_daily_limit);
  END IF;

  INSERT INTO public.pipeline_run_attempts (user_id, run_date, source)
  VALUES (p_user_id, p_run_date, p_source)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_scheduled',
      'daily_count', v_daily_count, 'daily_limit', v_daily_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', null,
    'daily_count', v_daily_count + 1, 'daily_limit', v_daily_limit,
    'manual_count', CASE WHEN p_source = 'manual' THEN v_manual_count + 1 ELSE v_manual_count END,
    'manual_limit', v_manual_limit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pipeline_run_attempt(uuid, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pipeline_run_attempt(uuid, date, text)
  TO service_role;
