-- LogBook eQSL EXPRESS: grandfather valid registered station IDs,
-- permanently block only already-registered invalid IDs, and preserve DOGON1K.
-- This does not delete identity rows, private messages, or eQSL records.

BEGIN;

-- Permanent account blocks for existing identifiers that do not match either
-- supported station format. DOGON1K is the sole explicit exception.
-- Valid existing callsigns remain untouched and keep their identity tokens.
WITH candidates AS (
  SELECT
    upper(btrim(c.callsign)) AS callsign,
    CASE
      WHEN upper(btrim(c.callsign)) ~ '^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$'
        THEN substring(upper(btrim(c.callsign)) from '^([0-9]{1,3})')::integer BETWEEN 1 AND 99
      ELSE false
    END AS valid_11m,
    upper(btrim(c.callsign)) ~ '^[A-Z0-9]{1,3}[0-9][A-Z]{1,4}(/[A-Z0-9]{1,4})?$' AS valid_ham
  FROM public.community_call_signs c
  WHERE nullif(btrim(c.callsign), '') IS NOT NULL
),
invalid_accounts AS (
  SELECT callsign
  FROM candidates
  WHERE callsign <> 'DOGON1K'
    AND NOT (
      (length(callsign) BETWEEN 3 AND 24 AND valid_11m)
      OR
      (length(callsign) BETWEEN 3 AND 24 AND valid_ham)
    )
)
INSERT INTO public.community_sanctions
  (target_callsign, sanction_type, expires_at, active, reason, applied_by)
SELECT
  i.callsign,
  'block',
  NULL,
  true,
  'Bloqueo preventivo: la señal distintiva registrada no cumple los formatos admitidos. DOGON1K y los indicativos válidos quedan exceptuados.',
  'DOGON1K'
FROM invalid_accounts i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.community_sanctions s
  WHERE s.active = true
    AND s.sanction_type = 'block'
    AND upper(btrim(s.target_callsign)) = i.callsign
);

-- DOGON1K is explicitly grandfathered as the administrator account even
-- though its account label is not a standard radio callsign format.
CREATE OR REPLACE FUNCTION public.register_community_callsign(
  p_callsign text,
  p_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_callsign text := upper(trim(coalesce(p_callsign, '')));
  v_existing_token uuid;
  v_existing_callsign text;
  v_division integer;
  v_valid_11m boolean := false;
  v_valid_ham boolean := false;
BEGIN
  IF p_token IS NULL OR length(v_callsign) < 3 OR length(v_callsign) > 24 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_format');
  END IF;

  IF v_callsign ~ '^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$' THEN
    v_division := substring(v_callsign from '^([0-9]{1,3})')::integer;
    v_valid_11m := v_division BETWEEN 1 AND 99;
  END IF;

  v_valid_ham := v_callsign ~ '^[A-Z0-9]{1,3}[0-9][A-Z]{1,4}(/[A-Z0-9]{1,4})?$';

  IF v_callsign <> 'DOGON1K' AND NOT (v_valid_11m OR v_valid_ham) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_format');
  END IF;

  SELECT callsign INTO v_existing_callsign
  FROM public.community_call_signs
  WHERE identity_token = p_token
  LIMIT 1;

  IF v_existing_callsign IS NOT NULL THEN
    IF upper(v_existing_callsign) = v_callsign THEN
      RETURN jsonb_build_object('ok', true, 'callsign', v_callsign);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;

  SELECT identity_token INTO v_existing_token
  FROM public.community_call_signs
  WHERE upper(callsign) = v_callsign
  LIMIT 1;

  IF v_existing_token IS NOT NULL THEN
    IF v_existing_token = p_token THEN
      RETURN jsonb_build_object('ok', true, 'callsign', v_callsign);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  BEGIN
    INSERT INTO public.community_call_signs(callsign, identity_token)
    VALUES (v_callsign, p_token);
  EXCEPTION WHEN unique_violation THEN
    SELECT identity_token INTO v_existing_token
    FROM public.community_call_signs
    WHERE upper(callsign) = v_callsign
    LIMIT 1;
    IF v_existing_token = p_token THEN
      RETURN jsonb_build_object('ok', true, 'callsign', v_callsign);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END;

  RETURN jsonb_build_object('ok', true, 'callsign', v_callsign);
END;
$$;

REVOKE ALL ON FUNCTION public.register_community_callsign(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_community_callsign(text, uuid) TO anon, authenticated;

COMMIT;
