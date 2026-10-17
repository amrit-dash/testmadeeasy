-- Enable RLS on user-facing tables (defense in depth for Supabase Data API / client access).
-- The Express app uses Drizzle with a direct DB connection (bypasses RLS).

-- questions
ALTER TABLE IF EXISTS public.questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "questions_select_own" ON public.questions;
DROP POLICY IF EXISTS "questions_insert_own" ON public.questions;
DROP POLICY IF EXISTS "questions_update_own" ON public.questions;
DROP POLICY IF EXISTS "questions_delete_own" ON public.questions;
CREATE POLICY "questions_select_own" ON public.questions FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);
CREATE POLICY "questions_insert_own" ON public.questions FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "questions_update_own" ON public.questions FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "questions_delete_own" ON public.questions FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

-- test_papers
ALTER TABLE IF EXISTS public.test_papers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "test_papers_select_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_insert_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_update_own" ON public.test_papers;
DROP POLICY IF EXISTS "test_papers_delete_own" ON public.test_papers;
CREATE POLICY "test_papers_select_own" ON public.test_papers FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);
CREATE POLICY "test_papers_insert_own" ON public.test_papers FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "test_papers_update_own" ON public.test_papers FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "test_papers_delete_own" ON public.test_papers FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

-- jobs
ALTER TABLE IF EXISTS public.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs_select_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_own" ON public.jobs;
CREATE POLICY "jobs_select_own" ON public.jobs FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);
CREATE POLICY "jobs_insert_own" ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "jobs_update_own" ON public.jobs FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "jobs_delete_own" ON public.jobs FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

-- teacher_profiles
ALTER TABLE IF EXISTS public.teacher_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teacher_profiles_select_own" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles_insert_own" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles_update_own" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles_delete_own" ON public.teacher_profiles;
CREATE POLICY "teacher_profiles_select_own" ON public.teacher_profiles FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);
CREATE POLICY "teacher_profiles_insert_own" ON public.teacher_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "teacher_profiles_update_own" ON public.teacher_profiles FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "teacher_profiles_delete_own" ON public.teacher_profiles FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

-- master_question_exceptions (user-submitted)
ALTER TABLE IF EXISTS public.master_question_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mqe_select_own" ON public.master_question_exceptions;
DROP POLICY IF EXISTS "mqe_insert_own" ON public.master_question_exceptions;
CREATE POLICY "mqe_select_own" ON public.master_question_exceptions FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);
CREATE POLICY "mqe_insert_own" ON public.master_question_exceptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

-- Read-only reference data for authenticated users
ALTER TABLE IF EXISTS public.master_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "master_questions_read_authenticated" ON public.master_questions;
CREATE POLICY "master_questions_read_authenticated" ON public.master_questions FOR SELECT TO authenticated
  USING (true);

ALTER TABLE IF EXISTS public.ai_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_pricing_read_authenticated" ON public.ai_pricing;
CREATE POLICY "ai_pricing_read_authenticated" ON public.ai_pricing FOR SELECT TO authenticated
  USING (true);

ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_settings_read_authenticated" ON public.system_settings;
CREATE POLICY "system_settings_read_authenticated" ON public.system_settings FOR SELECT TO authenticated
  USING (true);
