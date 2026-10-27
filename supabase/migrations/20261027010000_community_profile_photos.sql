-- Shared community chat profile photos. Additive only; does not alter messages or eQSL data.
CREATE TABLE IF NOT EXISTS public.community_call_sign_profiles (
  callsign text PRIMARY KEY,
  photo_data_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_call_sign_profiles_photo_size CHECK (
    photo_data_url IS NULL OR char_length(photo_data_url) <= 300000
  )
);
ALTER TABLE public.community_call_sign_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_call_sign_profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_community_profile_photo(
  p_callsign text,
  p_token uuid,
  p_photo_data_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_callsign text := upper(btrim(coalesce(p_callsign, '')));
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs s
    WHERE upper(btrim(s.callsign)) = v_callsign AND s.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_photo_data_url IS NULL OR p_photo_data_url = '' THEN
    DELETE FROM public.community_call_sign_profiles WHERE callsign = v_callsign;
    RETURN jsonb_build_object('ok', true, 'removed', true);
  END IF;

  IF char_length(p_photo_data_url) > 300000
     OR p_photo_data_url !~ '^data:image/(jpeg|png|webp);base64,' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_photo');
  END IF;

  INSERT INTO public.community_call_sign_profiles(callsign, photo_data_url, updated_at)
  VALUES (v_callsign, p_photo_data_url, now())
  ON CONFLICT (callsign) DO UPDATE
    SET photo_data_url = EXCLUDED.photo_data_url, updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_profile_photos(p_callsigns text[])
RETURNS TABLE(callsign text, photo_data_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.callsign, p.photo_data_url
  FROM public.community_call_sign_profiles p
  WHERE upper(p.callsign) = ANY (
    SELECT upper(btrim(x)) FROM unnest(coalesce(p_callsigns, ARRAY[]::text[])) AS x
  )
    AND p.photo_data_url IS NOT NULL
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.save_community_profile_photo(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_profile_photos(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_community_profile_photo(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_profile_photos(text[]) TO anon, authenticated;
