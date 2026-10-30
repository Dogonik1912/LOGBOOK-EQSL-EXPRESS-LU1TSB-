-- Delete a single private message sent by the authenticated callsign/device.
-- Does not delete the conversation or any message belonging to the other participant.
CREATE OR REPLACE FUNCTION public.delete_community_private_message(
  p_callsign text,
  p_token uuid,
  p_message_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := upper(btrim(coalesce(p_callsign, '')));
  v_deleted integer := 0;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs s
    WHERE upper(btrim(s.callsign)) = v_actor AND s.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  DELETE FROM public.community_private_messages
  WHERE id = p_message_id
    AND upper(sender_callsign) = v_actor;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', v_deleted = 1, 'deleted_count', v_deleted,
    'reason', CASE WHEN v_deleted = 1 THEN NULL ELSE 'not_found_or_not_owner' END);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_community_private_message(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_community_private_message(text, uuid, uuid) TO anon, authenticated;
