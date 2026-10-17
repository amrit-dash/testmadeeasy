-- Enable Row Level Security for user-owned and shared question data.
-- Server-side API uses the postgres/service_role connection (bypasses RLS).
-- Direct PostgREST / supabase-js table access is scoped per authenticated user.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()::text
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- questions (My Questions library — per-user)
-- ---------------------------------------------------------------------------
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "questions_select_own" ON public.questions;
DROP POLICY IF EXISTS "questions_insert_own" ON public.questions;
DROP POLICY IF EXISTS "questions_update_own" ON public.questions;
DROP POLICY IF EXISTS "questions_delete_own" ON public.questions;
DROP POLICY IF EXISTS "Users can view own questions" ON public.questions;
DROP POLICY IF EXISTS "Users can insert own questions" ON public.questions;
DROP POLICY IF EXISTS "Users can update own questions" ON public.questions;
DROP POLICY IF EXISTS "Users can delete own questions" ON public.questions;

CREATE POLICY "questions_select_own"
  ON public.questions FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "questions_insert_own"
  ON public.questions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "questions_update_own"
  ON public.questions FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "questions_delete_own"
  ON public.questions FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- test_papers (per-user)
-- ---------------------------------------------------------------------------
ALTER TABLE public.test_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "test_papers_select_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_insert_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_update_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_delete_own" ON public.test_papers;

CREATE POLICY "test_papers_select_own"
  ON public.test_papers FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "test_papers_insert_own"
  ON public.test_papers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "test_papers_update_own"
  ON public.test_papers FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "test_papers_delete_own"
  ON public.test_papers FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- master_questions (shared public library — read-only for teachers)
-- ---------------------------------------------------------------------------
ALTER TABLE public.master_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_questions_select_authenticated" ON public.master_questions;
DROP POLICY IF EXISTS "master_questions_admin_all" ON public.master_questions;

CREATE POLICY "master_questions_select_authenticated"
  ON public.master_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "master_questions_admin_write"
  ON public.master_questions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- teacher_profiles (per-user)
-- ---------------------------------------------------------------------------
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_profiles_select_own" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles_insert_own" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles_update_own" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles_delete_own" ON public.teacher_profiles;

CREATE POLICY "teacher_profiles_select_own"
  ON public.teacher_profiles FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "teacher_profiles_insert_own"
  ON public.teacher_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "teacher_profiles_update_own"
  ON public.teacher_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "teacher_profiles_delete_own"
  ON public.teacher_profiles FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- jobs (per-user background tasks)
-- ---------------------------------------------------------------------------
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_select_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_own" ON public.jobs;

CREATE POLICY "jobs_select_own"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "jobs_insert_own"
  ON public.jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "jobs_update_own"
  ON public.jobs FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "jobs_delete_own"
  ON public.jobs FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- users (own profile row)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_self" ON public.users;

CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id OR public.is_admin());

CREATE POLICY "users_insert_self"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = id);

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id OR public.is_admin())
  WITH CHECK (auth.uid()::text = id OR public.is_admin());

-- ---------------------------------------------------------------------------
-- master_question_exceptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.master_question_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mqe_select_own_or_admin" ON public.master_question_exceptions;
DROP POLICY IF EXISTS "mqe_insert_own" ON public.master_question_exceptions;

CREATE POLICY "mqe_select_own_or_admin"
  ON public.master_question_exceptions FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id OR public.is_admin());

CREATE POLICY "mqe_insert_own"
  ON public.master_question_exceptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "mqe_admin_manage"
  ON public.master_question_exceptions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Revoke direct anon access to user data tables (auth + storage only for anon)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.questions FROM anon;
REVOKE ALL ON public.test_papers FROM anon;
REVOKE ALL ON public.master_questions FROM anon;
REVOKE ALL ON public.teacher_profiles FROM anon;
REVOKE ALL ON public.jobs FROM anon;
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.master_question_exceptions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_papers TO authenticated;
GRANT SELECT ON public.master_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.master_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT ON public.master_question_exceptions TO authenticated;
