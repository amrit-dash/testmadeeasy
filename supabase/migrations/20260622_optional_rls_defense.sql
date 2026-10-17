-- Optional defense-in-depth ONLY if public.questions / public.test_papers are exposed
-- via Supabase PostgREST (supabase-js .from()).
--
-- The app API uses Express + Drizzle over a direct postgres connection and bypasses RLS.
-- Do NOT apply this migration unless you intentionally expose these tables through the Data API.

-- questions (My Questions)
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "questions_select_own" ON public.questions;
DROP POLICY IF EXISTS "questions_insert_own" ON public.questions;
DROP POLICY IF EXISTS "questions_update_own" ON public.questions;
DROP POLICY IF EXISTS "questions_delete_own" ON public.questions;

CREATE POLICY "questions_select_own"
  ON public.questions FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "questions_insert_own"
  ON public.questions FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "questions_update_own"
  ON public.questions FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "questions_delete_own"
  ON public.questions FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

-- test_papers
ALTER TABLE public.test_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "test_papers_select_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_insert_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_update_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_delete_own" ON public.test_papers;

CREATE POLICY "test_papers_select_own"
  ON public.test_papers FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "test_papers_insert_own"
  ON public.test_papers FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "test_papers_update_own"
  ON public.test_papers FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "test_papers_delete_own"
  ON public.test_papers FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

REVOKE ALL ON public.questions FROM anon;
REVOKE ALL ON public.test_papers FROM anon;
