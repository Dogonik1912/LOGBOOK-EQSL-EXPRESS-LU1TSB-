-- Persistent account-block check used before the app grants access.
-- This function reveals only a boolean and does not expose moderation records.
CREATE OR REPLACE FUNCTION public.community_is_blocked(p_callsign text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_sanctions s
    WHERE s.active = true
      AND s.sanction_type = 'block'
      AND upper(btrim(s.target_callsign)) = upper(btrim(coalesce(p_callsign, '')))
  );
$$;

REVOKE ALL ON FUNCTION public.community_is_blocked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_is_blocked(text) TO anon, authenticated;
