-- Delete one private conversation for the authenticated callsign/token pair.
-- Removes both sent and received messages with the selected counterpart.
CREATE OR REPLACE FUNCTION public.delete_community_private_conversation(
  p_callsign text,
  p_token uuid,
  p_other_callsign text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := upper(btrim(coalesce(p_callsign, '')));
  v_other text := upper(btrim(coalesce(p_other_callsign, '')));
  v_deleted integer := 0;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs s
    WHERE upper(btrim(s.callsign)) = v_actor AND s.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF length(v_other) < 3 OR v_other = v_actor THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_recipient');
  END IF;

  DELETE FROM public.community_private_messages
  WHERE (upper(sender_callsign) = v_actor AND upper(recipient_callsign) = v_other)
     OR (upper(sender_callsign) = v_other AND upper(recipient_callsign) = v_actor);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted_count', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_community_private_conversation(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_community_private_conversation(text, uuid, text) TO anon, authenticated;
