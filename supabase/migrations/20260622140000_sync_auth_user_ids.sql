-- Align public.users.id with auth.users.id so RLS policies using auth.uid() work.
-- Legacy users were created with gen_random_uuid() before Supabase Auth was wired up.

CREATE OR REPLACE FUNCTION public.sync_user_id_to_auth(p_old_id text, p_new_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_old_id IS NULL OR p_new_id IS NULL OR p_old_id = p_new_id THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id::text = p_new_id) THEN
    RAISE EXCEPTION 'Auth user % does not exist', p_new_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_old_id) THEN
    RETURN;
  END IF;

  UPDATE public.questions SET user_id = p_new_id WHERE user_id = p_old_id;
  UPDATE public.questions SET submitted_by = p_new_id WHERE submitted_by = p_old_id;
  UPDATE public.test_papers SET user_id = p_new_id WHERE user_id = p_old_id;
  UPDATE public.jobs SET user_id = p_new_id WHERE user_id = p_old_id;
  UPDATE public.teacher_profiles SET user_id = p_new_id WHERE user_id = p_old_id;
  UPDATE public.master_question_exceptions SET user_id = p_new_id WHERE user_id = p_old_id;
  UPDATE public.master_questions SET added_by = p_new_id WHERE added_by = p_old_id;
  UPDATE public.master_questions SET submitted_by = p_new_id WHERE submitted_by = p_old_id;

  IF to_regclass('public.institution_members') IS NOT NULL THEN
    EXECUTE 'UPDATE public.institution_members SET user_id = $1 WHERE user_id = $2'
      USING p_new_id, p_old_id;
  END IF;

  UPDATE public.users SET id = p_new_id WHERE id = p_old_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_id_to_auth(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_user_id_to_auth(text, text) TO service_role;

-- One-time backfill for existing mismatches (email-linked accounts).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT u.id AS old_id, au.id::text AS new_id
    FROM public.users u
    INNER JOIN auth.users au ON lower(u.email) = lower(au.email)
    WHERE u.id::text <> au.id::text
  LOOP
    PERFORM public.sync_user_id_to_auth(r.old_id, r.new_id);
  END LOOP;

  FOR r IN
    SELECT u.id AS old_id, au.id::text AS new_id
    FROM public.users u
    INNER JOIN auth.users au ON u.phone IS NOT NULL AND u.phone = au.phone
    WHERE u.id::text <> au.id::text
  LOOP
    PERFORM public.sync_user_id_to_auth(r.old_id, r.new_id);
  END LOOP;
END $$;
