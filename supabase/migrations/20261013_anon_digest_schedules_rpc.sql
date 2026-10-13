-- Expose active digest schedules without granting anon direct access to
-- user_configs. The previous column GRANT did not remove Supabase's existing
-- table-level SELECT grant, so anon could also select user_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_active_digest_schedules()
RETURNS TABLE (digest_hour integer, timezone_offset double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT config.digest_hour, config.timezone_offset
  FROM public.user_configs AS config
  WHERE config.active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_digest_schedules()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_digest_schedules() TO anon;

-- Revoke both table- and column-level SELECT. PostgreSQL keeps column grants
-- after a table-level REVOKE, including the older scheduling grant.
REVOKE SELECT ON TABLE public.user_configs FROM PUBLIC, anon;
DO $$
DECLARE
  columns_to_revoke text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
  INTO columns_to_revoke
  FROM pg_attribute
  WHERE attrelid = 'public.user_configs'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  EXECUTE format(
    'REVOKE SELECT (%s) ON TABLE public.user_configs FROM PUBLIC, anon',
    columns_to_revoke
  );
END;
$$;

DROP POLICY IF EXISTS user_configs_anon_scheduling_read ON public.user_configs;

-- Fail the migration instead of leaving an inherited or unexpected grant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.user_configs'::regclass
      AND attnum > 0
      AND NOT attisdropped
      AND has_column_privilege('anon', 'public.user_configs', attname, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'anon retains SELECT access to user_configs';
  END IF;
END;
$$;

COMMIT;
