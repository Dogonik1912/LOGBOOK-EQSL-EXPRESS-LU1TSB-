-- LogBook eQSL EXPRESS: Grid Locator para DX SEMANAL.
-- Los usuarios solo pueden consultar locators; el guardado valida indicativo + token.

CREATE TABLE IF NOT EXISTS public.live_spot_grid_locators (
  callsign text PRIMARY KEY,
  identity_token uuid NOT NULL,
  grid_locator text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_spot_grid_locator_format CHECK (
    grid_locator ~ '^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$'
  )
);

ALTER TABLE public.live_spot_grid_locators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read live spot grid locators"
  ON public.live_spot_grid_locators;
CREATE POLICY "Public can read live spot grid locators"
  ON public.live_spot_grid_locators FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON TABLE public.live_spot_grid_locators FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.live_spot_grid_locators TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_live_spot_grid_locator(
  p_callsign text,
  p_token uuid,
  p_grid_locator text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  station text := upper(trim(coalesce(p_callsign, '')));
  locator text := upper(trim(coalesce(p_grid_locator, '')));
BEGIN
  IF p_token IS NULL OR char_length(station) NOT BETWEEN 3 AND 24
     OR station !~ '^[A-Z0-9/.-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_identity');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_call_signs c
     WHERE upper(trim(c.callsign)) = station
       AND c.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'identity_not_verified');
  END IF;

  IF locator !~ '^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_grid_locator');
  END IF;

  INSERT INTO public.live_spot_grid_locators (callsign, identity_token, grid_locator, updated_at)
  VALUES (station, p_token, locator, now())
  ON CONFLICT (callsign) DO UPDATE
    SET identity_token = EXCLUDED.identity_token,
        grid_locator = EXCLUDED.grid_locator,
        updated_at = now()
    WHERE public.live_spot_grid_locators.identity_token = p_token;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_spot_grid_locators
     WHERE callsign = station AND identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'identity_mismatch');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_live_spot_grid_locator(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_live_spot_grid_locator(text, uuid, text) TO anon, authenticated;
