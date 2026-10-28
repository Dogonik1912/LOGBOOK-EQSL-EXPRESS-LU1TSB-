-- LogBook eQSL EXPRESS: inicio automático de DX semanal al alcanzar 100 identidades compartidas.
-- Migración aditiva: no borra QSO, spots, votos, eQSL ni mensajes.
-- Requiere que community_call_signs sea el registro compartido canónico.

ALTER TABLE public.live_qso_spot_contest_settings
  ALTER COLUMN contest_started_at DROP NOT NULL;

UPDATE public.live_qso_spot_contest_settings
   SET required_users = 100,
       contest_started_at = CASE
         WHEN (SELECT count(DISTINCT upper(trim(callsign))) FROM public.community_call_signs) >= 100
           THEN COALESCE(contest_started_at, now())
         ELSE NULL
       END,
       updated_at = now()
 WHERE singleton = true;

CREATE OR REPLACE FUNCTION public._ensure_live_qso_spot_contest_started()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_started_at timestamptz;
  v_users integer;
BEGIN
  SELECT contest_started_at INTO v_started_at
    FROM public.live_qso_spot_contest_settings
   WHERE singleton = true
   FOR UPDATE;

  IF v_started_at IS NOT NULL THEN
    RETURN v_started_at;
  END IF;

  SELECT count(DISTINCT upper(trim(callsign)))::integer
    INTO v_users
    FROM public.community_call_signs
   WHERE nullif(trim(callsign), '') IS NOT NULL;

  IF v_users < 100 THEN
    RETURN NULL;
  END IF;

  UPDATE public.live_qso_spot_contest_settings
     SET contest_started_at = now(),
         required_users = 100,
         updated_at = now()
   WHERE singleton = true
   RETURNING contest_started_at INTO v_started_at;

  RETURN v_started_at;
END;
$$;

-- Activar en el mismo momento en que se registra la identidad número 100.
CREATE OR REPLACE FUNCTION public._activate_dx_weekly_when_100_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users integer;
BEGIN
  SELECT count(DISTINCT upper(trim(callsign)))::integer
    INTO v_users
    FROM public.community_call_signs
   WHERE nullif(trim(callsign), '') IS NOT NULL;

  IF v_users >= 100 THEN
    UPDATE public.live_qso_spot_contest_settings
       SET contest_started_at = COALESCE(contest_started_at, now()),
           required_users = 100,
           updated_at = now()
     WHERE singleton = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activate_dx_weekly_at_100_users ON public.community_call_signs;
CREATE TRIGGER activate_dx_weekly_at_100_users
AFTER INSERT OR UPDATE OF callsign ON public.community_call_signs
FOR EACH STATEMENT
EXECUTE FUNCTION public._activate_dx_weekly_when_100_users();

REVOKE ALL ON FUNCTION public._activate_dx_weekly_when_100_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ensure_live_qso_spot_contest_started() FROM PUBLIC, anon, authenticated;

-- Comprobación informativa para ejecutar tras la migración:
-- SELECT count(DISTINCT upper(trim(callsign))) AS usuarios_registrados FROM public.community_call_signs;
-- SELECT contest_started_at, required_users FROM public.live_qso_spot_contest_settings WHERE singleton = true;
