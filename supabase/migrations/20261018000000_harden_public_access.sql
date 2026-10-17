-- The browser only talks to Supabase Auth. Every table read/write goes through the
-- Express server, which connects as the `postgres` role (BYPASSRLS). These rules close
-- the paths that the public anon key could otherwise reach through the REST API.

-- Users must not be able to rewrite their own role, plan or usage counters.
DROP POLICY IF EXISTS users_update_own ON public.users;
DROP POLICY IF EXISTS users_insert_self ON public.users;

-- SECURITY DEFINER helper that re-keys a user's rows; server-only.
REVOKE EXECUTE ON FUNCTION public.sync_user_id_to_auth(text, text) FROM PUBLIC, anon, authenticated;

-- Server-only tables: RLS on with no policies = no access for anon/authenticated.
ALTER TABLE IF EXISTS public.ai_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.institution_members ENABLE ROW LEVEL SECURITY;

-- Image uploads: the server forwards the caller's JWT, so signed-in users need insert
-- on the public question-image bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('paprrr-images', 'paprrr-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON storage.objects;
CREATE POLICY "Enable insert for authenticated users only" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'paprrr-images');
