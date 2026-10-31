-- Enforce community blocks on private messaging in both directions.
-- Existing messages are preserved; this only prevents new private messages involving a blocked callsign.
CREATE OR REPLACE FUNCTION public.send_community_private_message(
  p_callsign text,
  p_token uuid,
  p_recipient_callsign text,
  p_body text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender text := upper(btrim(coalesce(p_callsign, '')));
  v_recipient text := upper(btrim(coalesce(p_recipient_callsign, '')));
  v_body text := btrim(coalesce(p_body, ''));
  v_message public.community_private_messages%ROWTYPE;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs s
    WHERE upper(btrim(s.callsign)) = v_sender AND s.identity_token = p_token
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF length(v_sender) < 3 OR length(v_recipient) < 3 OR v_sender = v_recipient THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_recipient');
  END IF;
  IF length(v_body) < 1 OR length(v_body) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_body');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_call_signs s
    WHERE upper(btrim(s.callsign)) = v_recipient
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'recipient_not_found');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_sanctions s
    WHERE s.active = true
      AND s.sanction_type = 'block'
      AND upper(btrim(s.target_callsign)) IN (v_sender, v_recipient)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'blocked');
  END IF;
  INSERT INTO public.community_private_messages (sender_callsign, recipient_callsign, body)
  VALUES (v_sender, v_recipient, v_body)
  RETURNING * INTO v_message;
  RETURN jsonb_build_object(
    'ok', true,
    'message', jsonb_build_object(
      'id', v_message.id,
      'sender_callsign', v_message.sender_callsign,
      'recipient_callsign', v_message.recipient_callsign,
      'body', v_message.body,
      'created_at', v_message.created_at,
      'read_at', v_message.read_at
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.send_community_private_message(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_community_private_message(text, uuid, text, text) TO anon, authenticated;
