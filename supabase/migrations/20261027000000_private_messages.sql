-- LogBook eQSL EXPRESS: private messages between registered community callsigns.
-- Safe additive migration: does not modify or delete existing community/eQSL data.
-- Run once in the Supabase SQL Editor for project dldbyqdrxprvwgbezixw.

CREATE TABLE IF NOT EXISTS public.community_private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_callsign text NOT NULL,
  recipient_callsign text NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT community_private_messages_not_self CHECK (upper(sender_callsign) <> upper(recipient_callsign))
);

CREATE INDEX IF NOT EXISTS community_private_messages_sender_created_idx
  ON public.community_private_messages (upper(sender_callsign), created_at DESC);
CREATE INDEX IF NOT EXISTS community_private_messages_recipient_created_idx
  ON public.community_private_messages (upper(recipient_callsign), created_at DESC);

ALTER TABLE public.community_private_messages ENABLE ROW LEVEL SECURITY;

-- Private message rows must never be readable/writable directly by public browser roles.
REVOKE ALL ON TABLE public.community_private_messages FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.community_private_conversations(
  p_callsign text,
  p_token uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := upper(btrim(coalesce(p_callsign, '')));
  v_result jsonb;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs s
    WHERE upper(btrim(s.callsign)) = v_actor AND s.identity_token = p_token
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'other_callsign', c.other_callsign,
        'last_body', c.last_body,
        'last_at', c.last_at,
        'unread_count', c.unread_count
      ) ORDER BY c.last_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      CASE
        WHEN upper(m.sender_callsign) = v_actor THEN upper(m.recipient_callsign)
        ELSE upper(m.sender_callsign)
      END AS other_callsign,
      (array_agg(m.body ORDER BY m.created_at DESC))[1] AS last_body,
      max(m.created_at) AS last_at,
      count(*) FILTER (
        WHERE upper(m.recipient_callsign) = v_actor AND m.read_at IS NULL
      ) AS unread_count
    FROM public.community_private_messages m
    WHERE upper(m.sender_callsign) = v_actor OR upper(m.recipient_callsign) = v_actor
    GROUP BY CASE
      WHEN upper(m.sender_callsign) = v_actor THEN upper(m.recipient_callsign)
      ELSE upper(m.sender_callsign)
    END
  ) c;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_private_messages(
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
  v_result jsonb;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.community_call_signs s
    WHERE upper(btrim(s.callsign)) = v_actor AND s.identity_token = p_token
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(v_other) < 3 OR v_other = v_actor THEN
    RAISE EXCEPTION 'invalid_recipient';
  END IF;

  UPDATE public.community_private_messages
  SET read_at = now()
  WHERE upper(recipient_callsign) = v_actor
    AND upper(sender_callsign) = v_other
    AND read_at IS NULL;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'sender_callsign', m.sender_callsign,
        'recipient_callsign', m.recipient_callsign,
        'body', m.body,
        'created_at', m.created_at,
        'read_at', m.read_at
      ) ORDER BY m.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT id, sender_callsign, recipient_callsign, body, created_at, read_at
    FROM public.community_private_messages
    WHERE (
      upper(sender_callsign) = v_actor AND upper(recipient_callsign) = v_other
    ) OR (
      upper(sender_callsign) = v_other AND upper(recipient_callsign) = v_actor
    )
    ORDER BY created_at DESC
    LIMIT 200
  ) m;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.send_community_private_message(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_private_conversations(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_private_messages(text, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_community_private_message(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_private_conversations(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_private_messages(text, uuid, text) TO anon, authenticated;
