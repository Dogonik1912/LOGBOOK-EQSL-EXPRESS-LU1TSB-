-- Weekly cleanup of all community chat content.
-- Keeps account identities, public profiles, moderation records and eQSL data.
-- Runs Mondays at 00:05 UTC, alongside the existing weekly Live Spot rollover.

CREATE OR REPLACE FUNCTION public.cleanup_weekly_community_chat()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_private_deleted integer := 0;
  v_general_deleted integer := 0;
BEGIN
  DELETE FROM public.community_private_messages;
  GET DIAGNOSTICS v_private_deleted = ROW_COUNT;

  DELETE FROM public.community_messages;
  GET DIAGNOSTICS v_general_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'private_messages_deleted', v_private_deleted,
    'community_messages_deleted', v_general_deleted,
    'cleaned_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_weekly_community_chat() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_weekly_community_chat() FROM anon, authenticated;

SELECT cron.schedule(
  'logbook-weekly-chat-cleanup',
  '5 0 * * 1',
  'SELECT public.cleanup_weekly_community_chat();'
);
