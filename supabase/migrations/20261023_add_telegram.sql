-- Ejecutar una sola vez en el SQL Editor de Supabase del proyecto de LogBook eQSL Express.
-- Añade soporte para guardar alias de Telegram en el directorio comunitario.
ALTER TABLE public.eqsl_directory
  ADD COLUMN IF NOT EXISTS telegram text;
