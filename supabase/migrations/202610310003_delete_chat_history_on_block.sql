-- Permanently remove every public-chat message from a callsign when an admin blocks it.
-- Private conversations and eQSL records are intentionally untouched.
CREATE OR REPLACE FUNCTION public.community_moderation_action(
  p_callsign text, p_token uuid, p_action text,
  p_target_callsign text DEFAULT NULL, p_sanction_type text DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := upper(trim(coalesce(p_callsign, '')));
  v_target text := upper(trim(coalesce(p_target_callsign, '')));
  v_role text;
  v_sanction public.community_sanctions%ROWTYPE;
  v_deleted_count integer := 0;
BEGIN
  v_role := public.community_actor_role(v_actor, p_token);
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_action = 'appoint_moderator' AND v_role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_action IN ('silence', 'block') THEN
    IF p_sanction_type NOT IN ('silence', 'block') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF p_sanction_type = 'silence' AND p_duration_minutes NOT IN (5, 60, 10080) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_duration');
    END IF;
    IF v_target = '' OR v_target = v_actor
       OR NOT EXISTS (SELECT 1 FROM public.community_call_signs WHERE callsign = v_target) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_target');
    END IF;

    INSERT INTO public.community_sanctions(target_callsign, sanction_type, expires_at, reason, applied_by)
    VALUES (
      v_target,
      p_sanction_type,
      CASE WHEN p_sanction_type = 'block' THEN NULL ELSE now() + make_interval(mins => p_duration_minutes) END,
      nullif(trim(coalesce(p_reason, '')), ''),
      v_actor
    )
    RETURNING * INTO v_sanction;

    IF p_sanction_type = 'block' THEN
      DELETE FROM public.community_messages
      WHERE upper(btrim(callsign)) = v_target;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    END IF;

    INSERT INTO public.community_moderation_audit(actor_callsign, action, target_callsign, sanction_id, details)
    VALUES (
      v_actor, p_sanction_type, v_target, v_sanction.id,
      jsonb_build_object('duration_minutes', p_duration_minutes, 'reason', p_reason, 'deleted_public_messages', v_deleted_count)
    );

    RETURN jsonb_build_object('ok', true, 'sanction', to_jsonb(v_sanction), 'deleted_messages', v_deleted_count);

  ELSIF p_action = 'delete_message' THEN
    DELETE FROM public.community_messages WHERE id::text = p_reason;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    INSERT INTO public.community_moderation_audit(actor_callsign, action, target_callsign, details)
    VALUES (v_actor, p_action, v_target, jsonb_build_object('message_id', p_reason));
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'appoint_moderator' THEN
    IF v_target = '' OR NOT EXISTS (SELECT 1 FROM public.community_call_signs WHERE callsign = v_target) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_target');
    END IF;
    INSERT INTO public.community_moderation_roles(callsign, role, granted_by)
    VALUES (v_target, 'moderator', v_actor)
    ON CONFLICT (callsign) DO UPDATE
      SET role = 'moderator', granted_by = v_actor, created_at = now();
    INSERT INTO public.community_moderation_audit(actor_callsign, action, target_callsign)
    VALUES (v_actor, p_action, v_target);
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'reverse_sanction' THEN
    IF v_role <> 'admin' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
    UPDATE public.community_sanctions
    SET active = false, reversed_by = v_actor, reversed_at = now()
    WHERE id::text = p_reason AND active = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    INSERT INTO public.community_moderation_audit(actor_callsign, action, target_callsign, sanction_id)
    VALUES (v_actor, p_action, v_target, p_reason::uuid);
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'list_sanctions' THEN
    IF v_role <> 'admin' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
    RETURN jsonb_build_object('ok', true, 'sanctions',
      coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC) FROM public.community_sanctions s), '[]'::jsonb));

  ELSIF p_action = 'list_audit' THEN
    IF v_role <> 'admin' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
    RETURN jsonb_build_object('ok', true, 'audit',
      coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.community_moderation_audit a), '[]'::jsonb));
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'unknown_action');
END;
$$;

REVOKE ALL ON FUNCTION public.community_moderation_action(text, uuid, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_moderation_action(text, uuid, text, text, text, integer, text) TO anon, authenticated;
