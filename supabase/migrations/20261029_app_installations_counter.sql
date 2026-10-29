-- LogBook eQSL EXPRESS: permanent unique installation counter.
-- One UUID is stored per browser/app installation and is never decremented.
CREATE TABLE IF NOT EXISTS public.app_installations (
  install_id uuid PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_installations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_installations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_app_installation(p_install_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_install_id IS NULL THEN
    RAISE EXCEPTION 'install_id is required';
  END IF;

  INSERT INTO public.app_installations (install_id)
  VALUES (p_install_id)
  ON CONFLICT (install_id) DO NOTHING;

  RETURN (SELECT count(*) FROM public.app_installations);
END;
$$;

REVOKE ALL ON FUNCTION public.register_app_installation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_app_installation(uuid) TO anon, authenticated;
