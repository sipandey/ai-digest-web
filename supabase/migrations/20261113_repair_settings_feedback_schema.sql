-- Restore settings and feedback objects missing from the production schema.
-- This is safe to apply when some or all of the objects already exist.

ALTER TABLE public.user_configs
  ADD COLUMN IF NOT EXISTS digest_lens text NOT NULL DEFAULT 'builder',
  ADD COLUMN IF NOT EXISTS email_digest_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_email text,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_platform text NOT NULL DEFAULT 'slack';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_configs_digest_lens_check'
      AND conrelid = 'public.user_configs'::regclass
  ) THEN
    ALTER TABLE public.user_configs
      ADD CONSTRAINT user_configs_digest_lens_check
      CHECK (digest_lens IN ('founder', 'builder', 'researcher'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_configs_webhook_platform_check'
      AND conrelid = 'public.user_configs'::regclass
  ) THEN
    ALTER TABLE public.user_configs
      ADD CONSTRAINT user_configs_webhook_platform_check
      CHECK (webhook_platform IN ('slack', 'discord', 'generic'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.user_configs.digest_lens IS
  'Active scoring and summary lens: builder (engineering takeaways), founder (opportunity scouting), researcher (deep tech).';

CREATE TABLE IF NOT EXISTS public.paper_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  arxiv_id text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('more', 'less')),
  paper_title text,
  paper_categories text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paper_feedback_user_arxiv_unique UNIQUE (user_id, arxiv_id)
);

CREATE INDEX IF NOT EXISTS paper_feedback_user_id_idx
  ON public.paper_feedback (user_id);
CREATE INDEX IF NOT EXISTS paper_feedback_arxiv_id_idx
  ON public.paper_feedback (arxiv_id);

DROP TRIGGER IF EXISTS paper_feedback_set_updated_at ON public.paper_feedback;
CREATE TRIGGER paper_feedback_set_updated_at
  BEFORE UPDATE ON public.paper_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.paper_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paper_feedback_service_role_all ON public.paper_feedback;
CREATE POLICY paper_feedback_service_role_all
  ON public.paper_feedback
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS paper_feedback_select_own ON public.paper_feedback;
DROP POLICY IF EXISTS paper_feedback_authenticated_select ON public.paper_feedback;
CREATE POLICY paper_feedback_select_own
  ON public.paper_feedback
  FOR SELECT USING (
    user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS paper_feedback_insert_own ON public.paper_feedback;
DROP POLICY IF EXISTS paper_feedback_authenticated_insert ON public.paper_feedback;
CREATE POLICY paper_feedback_insert_own
  ON public.paper_feedback
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS paper_feedback_update_own ON public.paper_feedback;
DROP POLICY IF EXISTS paper_feedback_authenticated_update ON public.paper_feedback;
CREATE POLICY paper_feedback_update_own
  ON public.paper_feedback
  FOR UPDATE USING (
    user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
  ) WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS paper_feedback_delete_own ON public.paper_feedback;
DROP POLICY IF EXISTS paper_feedback_authenticated_delete ON public.paper_feedback;
CREATE POLICY paper_feedback_delete_own
  ON public.paper_feedback
  FOR DELETE USING (
    user_id IN (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub')
  );

NOTIFY pgrst, 'reload schema';
